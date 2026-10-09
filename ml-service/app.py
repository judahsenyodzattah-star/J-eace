"""Internal FastAPI service for a locally fine-tuned human-vs-AI text classifier.

This service deliberately does not download a model at runtime. Provide MODEL_PATH
for an exported checkpoint produced by train.py before enabling inference.
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from transformers import AutoModelForSequenceClassification, AutoTokenizer

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("jeace.ml")
MODEL_PATH = Path(os.getenv("MODEL_PATH", "artifacts/j-eace-detector-v1"))
MODEL_VERSION = os.getenv("MODEL_VERSION", "1.0.0")
MAX_LENGTH = int(os.getenv("MAX_SEQUENCE_LENGTH", "512"))
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

state: dict[str, Any] = {"model": None, "tokenizer": None, "loaded": False}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if MODEL_PATH.is_dir() and (MODEL_PATH / "config.json").exists():
        try:
            state["tokenizer"] = AutoTokenizer.from_pretrained(str(MODEL_PATH), local_files_only=True)
            state["model"] = AutoModelForSequenceClassification.from_pretrained(str(MODEL_PATH), local_files_only=True)
            state["model"].to(DEVICE)
            state["model"].eval()
            state["loaded"] = True
            logger.info("Loaded local detector checkpoint at %s on %s", MODEL_PATH, DEVICE)
        except Exception as exc:  # do not log request content or credentials
            logger.exception("Could not load detector checkpoint (%s)", type(exc).__name__)
    else:
        logger.warning("No trained checkpoint at %s; /internal/predict will return 503", MODEL_PATH)
    yield
    state["model"] = None
    state["tokenizer"] = None
    state["loaded"] = False


app = FastAPI(title="J’eace ML Inference", version=MODEL_VERSION, docs_url=None, redoc_url=None, lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, _exc: RequestValidationError) -> JSONResponse:
    # Never echo invalid request values (which may contain submitted text) in API errors.
    return JSONResponse(status_code=422, content={"error": {"code": "INVALID_REQUEST", "message": "The prediction request is invalid."}})


class PredictRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    locale: str | None = Field(default=None, max_length=35)


class PredictResponse(BaseModel):
    score: float
    confidence: float
    classification: str
    model: str
    model_version: str
    latency_ms: int


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok" if state["loaded"] else "degraded",
        "model_loaded": state["loaded"],
        "model_version": MODEL_VERSION if state["loaded"] else None,
        "device": str(DEVICE),
        "detail": None if state["loaded"] else "A fine-tuned checkpoint is not configured.",
    }


@app.post("/internal/predict", response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Text must not be empty.")
    if not state["loaded"]:
        raise HTTPException(status_code=503, detail="A trained detector checkpoint is not loaded.")

    started = time.perf_counter()
    try:
        tokenizer = state["tokenizer"]
        model = state["model"]
        encoded = tokenizer(text, truncation=True, max_length=MAX_LENGTH, return_tensors="pt")
        encoded = {key: value.to(DEVICE) for key, value in encoded.items()}
        with torch.inference_mode():
            logits = model(**encoded).logits
            probabilities = torch.softmax(logits, dim=-1)[0]
        # Training contract: class 0 = human-written, class 1 = AI-generated.
        score = float(probabilities[1].item())
        confidence = float(probabilities.max().item())
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        return PredictResponse(
            score=round(score, 6),
            confidence=round(confidence, 6),
            classification="AI_LIKELY" if score >= 0.5 else "HUMAN_LIKELY",
            model="j-eace-transformer",
            model_version=MODEL_VERSION,
            latency_ms=elapsed_ms,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Model inference failed (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Inference could not be completed.") from exc
