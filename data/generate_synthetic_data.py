"""Generate reproducible synthetic Indian agricultural marketplace datasets."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

CROPS = ("Rice", "Wheat", "Potato", "Tomato", "Onion")
GRADES = ("A", "B", "C")
GRADE_RANK = {"A": 0, "B": 1, "C": 2}
CROP_BASE_PRICES = {
    "Rice": 24_000,
    "Wheat": 22_000,
    "Potato": 16_000,
    "Tomato": 28_000,
    "Onion": 20_000,
}

# Representative agricultural regions; jitter keeps the generated locations
# geographically plausible without tying records to real farms.
REGIONS = (
    (30.73, 76.78),  # Punjab / Haryana
    (26.85, 80.95),  # Uttar Pradesh
    (19.08, 72.88),  # Maharashtra
    (15.32, 75.71),  # Karnataka
    (22.57, 88.36),  # West Bengal
)


def _location(rng: np.random.Generator) -> tuple[float, float]:
    latitude, longitude = REGIONS[int(rng.integers(0, len(REGIONS)))]
    return (
        float(np.clip(rng.normal(latitude, 0.65), 8.0, 35.0)),
        float(np.clip(rng.normal(longitude, 0.7), 68.0, 97.0)),
    )


def _farmer_records(rng: np.random.Generator, count: int) -> list[dict[str, object]]:
    farmers = []
    for index in range(count):
        crop = str(rng.choice(CROPS, p=(0.28, 0.24, 0.16, 0.16, 0.16)))
        latitude, longitude = _location(rng)
        base_price = CROP_BASE_PRICES[crop]
        farmers.append(
            {
                "farmer_id": f"F{index + 1:04d}",
                "latitude": latitude,
                "longitude": longitude,
                "crop_type": crop,
                "quantity_tons": round(float(rng.uniform(1, 20)), 2),
                "expected_price_per_ton": round(
                    float(base_price * rng.uniform(0.82, 1.16)), 2
                ),
                "perishability_days": int(rng.integers(2, 31)),
                "quality_grade": str(rng.choice(GRADES, p=(0.34, 0.44, 0.22))),
            }
        )
    return farmers


def _buyer_records(rng: np.random.Generator, count: int) -> list[dict[str, object]]:
    buyers = []
    for index in range(count):
        crop = str(rng.choice(CROPS))
        latitude, longitude = _location(rng)
        base_price = CROP_BASE_PRICES[crop]
        buyers.append(
            {
                "buyer_id": f"B{index + 1:04d}",
                "latitude": latitude,
                "longitude": longitude,
                "desired_crop": crop,
                "max_capacity_tons": round(float(rng.uniform(15, 100)), 2),
                "offered_price_per_ton": round(
                    float(base_price * rng.uniform(0.88, 1.22)), 2
                ),
                "has_cold_storage": bool(rng.integers(0, 2)),
                "min_acceptable_grade": str(rng.choice(GRADES, p=(0.2, 0.5, 0.3))),
            }
        )
    return buyers


def _historical_targets(
    pairs: pd.DataFrame, rng: np.random.Generator
) -> pd.DataFrame:
    """Build noisy compatibility and directional preference labels."""
    grade_gap = (
        pairs["quality_grade"].map(GRADE_RANK)
        - pairs["min_acceptable_grade"].map(GRADE_RANK)
    )
    crop_match = pairs["crop_type"].eq(pairs["desired_crop"]).astype(float)
    distance_fit = np.clip(1 - pairs["distance_km"] / 500, 0, 1)
    price_difference = (
        pairs["offered_price_per_ton"] - pairs["expected_price_per_ton"]
    )
    price_fit_for_farmer = np.clip((price_difference + 5_000) / 10_000, 0, 1)
    price_fit_for_buyer = np.clip((5_000 - price_difference) / 10_000, 0, 1)
    storage_needed = pairs["perishability_days"].le(7)
    storage_fit = (~storage_needed | pairs["has_cold_storage"]).astype(float)
    grade_fit = np.clip(1 - 0.45 * grade_gap.clip(lower=0), 0, 1)
    quantity_fill = np.clip(
        pairs["quantity_tons"] / pairs["max_capacity_tons"], 0, 1
    )

    compatibility = (
        38 * crop_match
        + 22 * np.clip((price_difference + 2_500) / 7_500, 0, 1)
        + 17 * distance_fit
        + 12 * storage_fit
        + 11 * grade_fit
    )
    farmer_preference = (
        38 * price_fit_for_farmer
        + 30 * distance_fit
        + 20 * storage_fit
        + 12 * crop_match
    )
    buyer_preference = (
        35 * grade_fit
        + 25 * price_fit_for_buyer
        + 25 * quantity_fill
        + 15 * distance_fit
    )

    targets = pd.DataFrame(
        {
            "compatibility_score": np.clip(
                compatibility + rng.normal(0, 2.5, len(pairs)), 0, 100
            ),
            "farmer_preference_score": np.clip(
                farmer_preference + rng.normal(0, 2.0, len(pairs)), 0, 100
            ),
            "buyer_preference_score": np.clip(
                buyer_preference + rng.normal(0, 2.0, len(pairs)), 0, 100
            ),
        },
        index=pairs.index,
    )
    return targets.round(2)


def generate_datasets(
    output_dir: str | Path = Path(__file__).resolve().parent,
    farmer_count: int = 100,
    buyer_count: int = 25,
    historical_pair_count: int = 2_000,
    seed: int = 42,
) -> dict[str, Path]:
    """Write farmer, buyer, and historical pair CSVs and return their paths."""
    if farmer_count < 1 or buyer_count < 1 or historical_pair_count < 1:
        raise ValueError("farmer_count, buyer_count, and historical_pair_count must be positive")

    rng = np.random.default_rng(seed)
    farmers = pd.DataFrame(_farmer_records(rng, farmer_count))
    buyers = pd.DataFrame(_buyer_records(rng, buyer_count))

    farmer_indices = rng.integers(0, len(farmers), historical_pair_count)
    buyer_indices = rng.integers(0, len(buyers), historical_pair_count)
    farmer_columns = (
        farmers.iloc[farmer_indices]
        .reset_index(drop=True)
        .rename(
            columns={
                "latitude": "farmer_latitude",
                "longitude": "farmer_longitude",
            }
        )
    )
    buyer_columns = (
        buyers.iloc[buyer_indices]
        .reset_index(drop=True)
        .rename(
            columns={
                "latitude": "buyer_latitude",
                "longitude": "buyer_longitude",
            }
        )
    )
    pairs = pd.concat([farmer_columns, buyer_columns], axis=1)

    from ml.train_model import add_engineered_features

    pairs = add_engineered_features(pairs)
    pairs = pd.concat([pairs, _historical_targets(pairs, rng)], axis=1)

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    paths = {
        "farmers": destination / "farmers.csv",
        "buyers": destination / "buyers.csv",
        "historical_matches": destination / "historical_matches.csv",
    }
    farmers.to_csv(paths["farmers"], index=False)
    buyers.to_csv(paths["buyers"], index=False)
    pairs.to_csv(paths["historical_matches"], index=False)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    paths = generate_datasets(output_dir=args.output_dir, seed=args.seed)
    for name, path in paths.items():
        print(f"{name}: {path}")


if __name__ == "__main__":
    main()
