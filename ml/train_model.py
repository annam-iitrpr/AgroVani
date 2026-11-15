"""Feature engineering, LightGBM training, and pair scoring utilities."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.model_selection import train_test_split

FEATURE_NAMES = (
    "distance_km",
    "price_difference",
    "quantity_fill_ratio",
    "crop_exact_match",
    "cold_storage_needed_and_available",
    "grade_gap",
    "perishability_days",
    "has_cold_storage",
)
GRADE_RANK = {"A": 0, "B": 1, "C": 2}
TARGET_NAMES = (
    "compatibility_score",
    "farmer_preference_score",
    "buyer_preference_score",
)
PIPELINE_FILENAME = "feature_pipeline.joblib"
MODEL_FILENAME = "match_models.joblib"
MAX_DISTANCE_KM = 300.0
PERISHABLE_WITHIN_DAYS = 7


def haversine_distance(
    latitude_1: Any,
    longitude_1: Any,
    latitude_2: Any,
    longitude_2: Any,
) -> float | np.ndarray:
    """Return great-circle distance in kilometers, supporting NumPy arrays."""
    lat1, lon1, lat2, lon2 = np.broadcast_arrays(
        np.radians(np.asarray(latitude_1, dtype=float)),
        np.radians(np.asarray(longitude_1, dtype=float)),
        np.radians(np.asarray(latitude_2, dtype=float)),
        np.radians(np.asarray(longitude_2, dtype=float)),
    )
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    haversine = (
        np.sin(delta_lat / 2) ** 2
        + np.cos(lat1) * np.cos(lat2) * np.sin(delta_lon / 2) ** 2
    )
    distance = 6_371.0088 * 2 * np.arcsin(np.sqrt(np.clip(haversine, 0, 1)))
    if distance.ndim == 0:
        return float(distance)
    return distance


def add_engineered_features(pairs: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of pair records with the engineered model input features."""
    required = {
        "farmer_latitude",
        "farmer_longitude",
        "buyer_latitude",
        "buyer_longitude",
        "quantity_tons",
        "expected_price_per_ton",
        "perishability_days",
        "quality_grade",
        "desired_crop",
        "max_capacity_tons",
        "offered_price_per_ton",
        "has_cold_storage",
        "min_acceptable_grade",
        "crop_type",
    }
    missing = required.difference(pairs.columns)
    if missing:
        raise ValueError(f"Pair records are missing required columns: {sorted(missing)}")
    coordinate_columns = (
        "farmer_latitude",
        "farmer_longitude",
        "buyer_latitude",
        "buyer_longitude",
    )
    coordinates = pairs.loc[:, coordinate_columns].astype(float)
    if not np.isfinite(coordinates.to_numpy()).all():
        raise ValueError("Farmer and buyer coordinates must be finite numbers")
    if (
        coordinates["farmer_latitude"].abs().gt(90).any()
        or coordinates["buyer_latitude"].abs().gt(90).any()
        or coordinates["farmer_longitude"].abs().gt(180).any()
        or coordinates["buyer_longitude"].abs().gt(180).any()
    ):
        raise ValueError("Coordinates must use valid latitude and longitude ranges")
    if (pairs["max_capacity_tons"] <= 0).any():
        raise ValueError("max_capacity_tons must be positive")

    result = pairs.copy()
    result["distance_km"] = haversine_distance(
        result["farmer_latitude"],
        result["farmer_longitude"],
        result["buyer_latitude"],
        result["buyer_longitude"],
    )
    result["price_difference"] = (
        result["offered_price_per_ton"] - result["expected_price_per_ton"]
    )
    result["quantity_fill_ratio"] = (
        result["quantity_tons"] / result["max_capacity_tons"]
    ).clip(0, 1)
    result["crop_exact_match"] = result["crop_type"].eq(
        result["desired_crop"]
    ).astype(float)
    needs_cold_storage = result["perishability_days"].le(PERISHABLE_WITHIN_DAYS)
    result["cold_storage_needed_and_available"] = (
        needs_cold_storage & result["has_cold_storage"].astype(bool)
    ).astype(float)
    result["has_cold_storage"] = result["has_cold_storage"].astype(float)
    farmer_grade = result["quality_grade"].map(GRADE_RANK)
    buyer_grade = result["min_acceptable_grade"].map(GRADE_RANK)
    if farmer_grade.isna().any() or buyer_grade.isna().any():
        raise ValueError("quality_grade and min_acceptable_grade must be A, B, or C")
    result["grade_gap"] = farmer_grade - buyer_grade
    return result


def feature_matrix(pairs: pd.DataFrame) -> pd.DataFrame:
    """Create the ordered, finite numeric matrix expected by the models."""
    engineered = add_engineered_features(pairs)
    features = engineered.loc[:, FEATURE_NAMES].astype(float)
    if not np.isfinite(features.to_numpy()).all():
        raise ValueError("Engineered features must all be finite numbers")
    return features


def predict_pair_scores(
    pairs: pd.DataFrame, models: dict[str, LGBMRegressor]
) -> pd.DataFrame:
    """Return pair records annotated with compatibility and both preferences."""
    features = feature_matrix(pairs)
    result = pairs.copy()
    for target in TARGET_NAMES:
        if target not in models:
            raise ValueError(f"Model bundle is missing {target!r}")
        values = np.asarray(models[target].predict(features), dtype=float).reshape(-1)
        result[target] = np.clip(values, 0, 100).round(2)
    return result


def train_models(
    historical_matches_path: str | Path,
    output_dir: str | Path = Path(__file__).resolve().parent / "saved_models",
    random_state: int = 42,
) -> dict[str, Any]:
    """Train three LightGBM regressors and persist models plus feature metadata."""
    history = pd.read_csv(historical_matches_path)
    missing_targets = set(TARGET_NAMES).difference(history.columns)
    if missing_targets:
        raise ValueError(f"Training data is missing targets: {sorted(missing_targets)}")
    features = feature_matrix(history)
    if len(history) < 10:
        raise ValueError("At least 10 historical pairs are required to train the models")
    for target in TARGET_NAMES:
        target_values = history[target].to_numpy(dtype=float)
        if (
            not np.isfinite(target_values).all()
            or ((target_values < 0) | (target_values > 100)).any()
        ):
            raise ValueError(f"{target} values must be finite and between 0 and 100")

    indices = np.arange(len(history))
    train_indices, test_indices = train_test_split(
        indices, test_size=0.2, random_state=random_state
    )
    models: dict[str, LGBMRegressor] = {}
    metrics: dict[str, dict[str, float]] = {}
    for target in TARGET_NAMES:
        model = LGBMRegressor(
            objective="regression",
            n_estimators=120,
            learning_rate=0.05,
            num_leaves=15,
            max_depth=5,
            min_child_samples=10,
            reg_lambda=1.0,
            random_state=random_state,
            verbosity=-1,
            n_jobs=1,
        )
        values = history[target].astype(float)
        model.fit(features.iloc[train_indices], values.iloc[train_indices])
        predicted = np.clip(
            np.asarray(model.predict(features.iloc[test_indices]), dtype=float),
            0,
            100,
        )
        actual = values.iloc[test_indices].to_numpy(dtype=float)
        metrics[target] = {
            "mae": round(float(np.mean(np.abs(actual - predicted))), 3),
            "rmse": round(float(np.sqrt(np.mean((actual - predicted) ** 2))), 3),
        }
        models[target] = model

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    joblib.dump(models, destination / MODEL_FILENAME)
    pipeline = {
        "version": 1,
        "feature_names": list(FEATURE_NAMES),
        "grade_rank": dict(GRADE_RANK),
        "perishable_within_days": PERISHABLE_WITHIN_DAYS,
        "max_distance_km": MAX_DISTANCE_KM,
        "model_targets": list(TARGET_NAMES),
    }
    joblib.dump(pipeline, destination / PIPELINE_FILENAME)
    return {
        "models_path": destination / MODEL_FILENAME,
        "pipeline_path": destination / PIPELINE_FILENAME,
        "metrics": metrics,
        "training_rows": len(train_indices),
        "validation_rows": len(test_indices),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "data"
        / "historical_matches.csv",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "saved_models",
    )
    args = parser.parse_args()
    report = train_models(args.data, args.output_dir)
    print(f"Saved models: {report['models_path']}")
    print(f"Saved feature pipeline: {report['pipeline_path']}")
    print(f"Validation metrics: {report['metrics']}")


if __name__ == "__main__":
    main()
