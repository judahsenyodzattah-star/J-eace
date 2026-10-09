"""CPU-light unit tests for dataset splitting and held-out metric calculations."""
from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

import numpy as np

from data_utils import describe_splits, load_dataset, split_indices
from metrics import binary_metrics


class DatasetSplitTests(unittest.TestCase):
    def make_csv(self, path: Path, groups_per_class: int = 20) -> None:
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=["text", "label", "group_id"])
            writer.writeheader()
            for label, prefix in ((0, "human"), (1, "ai")):
                for index in range(groups_per_class):
                    writer.writerow({"text": f"{prefix} authored example number {index} with distinct words", "label": label, "group_id": f"{prefix}-source-{index}"})

    def test_grouped_splits_are_disjoint_and_contain_both_classes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "data.csv"
            self.make_csv(path)
            frame = load_dataset(path)
            splits = split_indices(frame, seed=21)
            details = describe_splits(frame, splits)
            groups = frame["_group"].to_numpy()
            sets = [set(groups[indexes]) for indexes in splits]
            self.assertFalse(sets[0] & sets[1])
            self.assertFalse(sets[0] & sets[2])
            self.assertFalse(sets[1] & sets[2])
            for name in ("train", "validation", "test"):
                self.assertEqual(details[name]["human"] > 0, True)
                self.assertEqual(details[name]["ai"] > 0, True)

    def test_data_contract_rejects_missing_class(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "human_only.csv"
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["text", "label"])
                writer.writeheader()
                for index in range(40):
                    writer.writerow({"text": f"human example {index}", "label": "human"})
            with self.assertRaisesRegex(ValueError, "both human"):
                load_dataset(path)


class MetricTests(unittest.TestCase):
    def test_binary_metrics_include_confusion_and_error_rates(self) -> None:
        report = binary_metrics(np.array([0, 0, 1, 1]), np.array([0.1, 0.8, 0.7, 0.9]))
        self.assertEqual(report["confusion_matrix"]["matrix"], [[1, 1], [0, 2]])
        self.assertAlmostEqual(report["false_positive_rate"], 0.5)
        self.assertAlmostEqual(report["false_negative_rate"], 0.0)
        self.assertAlmostEqual(report["precision"], 2 / 3)
        self.assertAlmostEqual(report["recall"], 1.0)
        self.assertGreaterEqual(report["roc_auc"], 0.0)


if __name__ == "__main__":
    unittest.main()
