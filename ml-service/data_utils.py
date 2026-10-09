"""Dataset validation and leakage-resistant grouped train/validation/test split."""
from __future__ import annotations

import hashlib
import re
import warnings
from pathlib import Path

import pandas as pd
from sklearn.model_selection import GroupShuffleSplit, StratifiedGroupKFold

HUMAN_LABELS = {"0", "human", "human_written", "human-written", "humanwritten"}
AI_LABELS = {"1", "ai", "ai_generated", "ai-generated", "machine", "synthetic"}


def _normalise_label(value: object) -> int:
    label = str(value).strip().lower()
    if label in HUMAN_LABELS:
        return 0
    if label in AI_LABELS:
        return 1
    raise ValueError(f"Unsupported label {value!r}; use 0/human or 1/ai.")


def load_dataset(path: str | Path, text_column: str = "text", label_column: str = "label", group_column: str = "group_id") -> pd.DataFrame:
    frame = pd.read_csv(path)
    missing = {text_column, label_column} - set(frame.columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}.")
    frame = frame[[column for column in frame.columns if column in {text_column, label_column, group_column, "source", "generator"}]].copy()
    frame = frame.rename(columns={text_column: "text", label_column: "label"})
    frame["text"] = frame["text"].fillna("").astype(str).str.strip()
    frame["label"] = frame["label"].map(_normalise_label)
    frame = frame[frame["text"].str.len() > 0].reset_index(drop=True)
    if frame["label"].nunique() != 2:
        raise ValueError("The dataset must contain both human (0) and AI (1) examples.")
    if len(frame) < 30:
        raise ValueError("At least 30 labeled examples are required for a minimal three-way split; more are strongly recommended.")

    if group_column in frame.columns:
        groups = frame[group_column].fillna("").astype(str).str.strip()
        blank = groups.eq("")
        frame["_group"] = groups
        # Missing group IDs are grouped by normalized text hash so exact duplicates never cross splits.
        frame.loc[blank, "_group"] = frame.loc[blank, "text"].map(_fingerprint)
    else:
        warnings.warn(
            "No group_id column supplied. Exact normalized duplicates will be kept together, "
            "but source/model leakage cannot be ruled out. Add a source-level group_id for research use.",
            stacklevel=2,
        )
        frame["_group"] = frame["text"].map(_fingerprint)
    return frame.reset_index(drop=True)


def _fingerprint(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text.lower()).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def split_indices(frame: pd.DataFrame, seed: int = 42) -> tuple[list[int], list[int], list[int]]:
    """Return row indices while keeping groups disjoint across all splits."""
    labels = frame["label"].to_numpy()
    groups = frame["_group"].to_numpy()
    class_group_counts = frame.groupby("label")["_group"].nunique()

    # Prefer stratified group splits, not random row splits. This avoids near-duplicate and
    # source-family leakage while approximately preserving both class distributions.
    if int(class_group_counts.min()) >= 5:
        outer = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=seed)
        train_val, test = next(outer.split(frame["text"], labels, groups))
        inner = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=seed + 1)
        train_rel, validation_rel = next(inner.split(frame.iloc[train_val]["text"], labels[train_val], groups[train_val]))
        train = train_val[train_rel]
        validation = train_val[validation_rel]
        splits = (train, validation, test)
        if all(set(labels[indexes]) == {0, 1} for indexes in splits):
            _assert_disjoint(groups, splits)
            return tuple(indexes.tolist() for indexes in splits)  # type: ignore[return-value]

    # Small datasets can have too few distinct groups per class for stratified k-fold. Keep
    # group boundaries intact and search deterministic group-shuffle seeds for both labels.
    for offset in range(40):
        outer = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=seed + offset)
        train_val, test = next(outer.split(frame["text"], labels, groups))
        inner = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=seed + 100 + offset)
        train_rel, validation_rel = next(inner.split(frame.iloc[train_val]["text"], labels[train_val], groups[train_val]))
        train = train_val[train_rel]
        validation = train_val[validation_rel]
        splits = (train, validation, test)
        if all(set(labels[indexes]) == {0, 1} for indexes in splits):
            _assert_disjoint(groups, splits)
            return tuple(indexes.tolist() for indexes in splits)  # type: ignore[return-value]
    raise ValueError("Could not create train/validation/test group splits containing both classes. Add more independent groups per class.")


def _assert_disjoint(groups: object, splits: tuple[object, object, object]) -> None:
    group_array = pd.Series(groups)
    seen: set[str] = set()
    for indexes in splits:
        current = set(group_array.iloc[indexes].astype(str))
        if seen & current:
            raise RuntimeError("Data leakage detected: a group appears in more than one split.")
        seen |= current


def describe_splits(frame: pd.DataFrame, splits: tuple[list[int], list[int], list[int]]) -> dict[str, object]:
    results: dict[str, object] = {}
    for name, indexes in zip(("train", "validation", "test"), splits, strict=True):
        subset = frame.iloc[indexes]
        results[name] = {
            "samples": int(len(subset)),
            "human": int((subset["label"] == 0).sum()),
            "ai": int((subset["label"] == 1).sum()),
            "independent_groups": int(subset["_group"].nunique()),
        }
    return results
