"""FastAPI service for compatibility scoring and stable marketplace matching."""

from __future__ import annotations

from contextlib import asynccontextmanager
import hmac
import math
import os
from pathlib import Path
from typing import Annotated, Literal

import joblib
import pandas as pd
from fastapi import FastAPI, Header, HTTPException
from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from engine.gale_shapley import match_farmers_to_buyers
from ml.train_model import (
    FEATURE_NAMES,
    MODEL_FILENAME,
    PIPELINE_FILENAME,
    TARGET_NAMES,
    add_engineered_features,
    predict_pair_scores,
)

Crop = Literal["Rice", "Wheat", "Potato", "Tomato", "Onion"]
Grade = Literal["A", "B", "C"]
Identifier = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80, strict=True)
]
MAX_PAIR_COUNT = 10_000


def _json_number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("must be a JSON number")
    try:
        number = float(value)
    except (OverflowError, ValueError) as exc:
        raise ValueError("must be a finite JSON number") from exc
    if not math.isfinite(number):
        raise ValueError("must be a finite JSON number")
    return number


JsonNumber = Annotated[float, BeforeValidator(_json_number)]


class Farmer(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    farmer_id: Identifier
    latitude: Annotated[JsonNumber, Field(ge=-90, le=90)]
    longitude: Annotated[JsonNumber, Field(ge=-180, le=180)]
    crop_type: Crop
    quantity_tons: Annotated[JsonNumber, Field(gt=0)]
    expected_price_per_ton: Annotated[JsonNumber, Field(gt=0)]
    perishability_days: Annotated[int, Field(ge=2, le=30, strict=True)]
    quality_grade: Grade


class Buyer(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    buyer_id: Identifier
    latitude: Annotated[JsonNumber, Field(ge=-90, le=90)]
    longitude: Annotated[JsonNumber, Field(ge=-180, le=180)]
    desired_crop: Crop
    max_capacity_tons: Annotated[JsonNumber, Field(gt=0)]
    offered_price_per_ton: Annotated[JsonNumber, Field(gt=0)]
    has_cold_storage: bool
    min_acceptable_grade: Grade


class MatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    farmers: Annotated[list[Farmer], Field(max_length=500)]
    buyers: Annotated[list[Buyer], Field(max_length=200)]

    @model_validator(mode="after")
    def validate_request(self) -> "MatchRequest":
        farmer_ids = [farmer.farmer_id for farmer in self.farmers]
        buyer_ids = [buyer.buyer_id for buyer in self.buyers]
        if len(set(farmer_ids)) != len(farmer_ids):
            raise ValueError("farmer_id values must be unique")
        if len(set(buyer_ids)) != len(buyer_ids):
            raise ValueError("buyer_id values must be unique")
        if len(self.farmers) * len(self.buyers) > MAX_PAIR_COUNT:
            raise ValueError(f"farmers × buyers must not exceed {MAX_PAIR_COUNT} pairs")
        return self


def _pair_table(farmers: list[dict], buyers: list[dict]) -> pd.DataFrame:
    rows = []
    for farmer in farmers:
        for buyer in buyers:
            rows.append(
                {
                    "farmer_latitude": farmer["latitude"],
                    "farmer_longitude": farmer["longitude"],
                    "buyer_latitude": buyer["latitude"],
                    "buyer_longitude": buyer["longitude"],
                    "farmer_id": farmer["farmer_id"],
                    "buyer_id": buyer["buyer_id"],
                    "crop_type": farmer["crop_type"],
                    "quantity_tons": farmer["quantity_tons"],
                    "expected_price_per_ton": farmer["expected_price_per_ton"],
                    "perishability_days": farmer["perishability_days"],
                    "quality_grade": farmer["quality_grade"],
                    "desired_crop": buyer["desired_crop"],
                    "max_capacity_tons": buyer["max_capacity_tons"],
                    "offered_price_per_ton": buyer["offered_price_per_ton"],
                    "has_cold_storage": buyer["has_cold_storage"],
                    "min_acceptable_grade": buyer["min_acceptable_grade"],
                }
            )
    return pd.DataFrame(rows)


def _load_artifacts(model_dir: Path) -> tuple[dict, dict]:
    models_path = model_dir / MODEL_FILENAME
    pipeline_path = model_dir / PIPELINE_FILENAME
    missing = [str(path) for path in (models_path, pipeline_path) if not path.is_file()]
    if missing:
        raise RuntimeError(
            f"Matching model artifacts are missing: {', '.join(missing)}. "
            "Generate data and run `python ml/train_model.py` first."
        )
    models = joblib.load(models_path)
    pipeline = joblib.load(pipeline_path)
    if (
        not isinstance(models, dict)
        or set(TARGET_NAMES) - set(models)
        or any(not callable(getattr(models.get(target), "predict", None)) for target in TARGET_NAMES)
    ):
        raise RuntimeError(f"Invalid or incomplete model bundle at {models_path}")
    if (
        not isinstance(pipeline, dict)
        or pipeline.get("version") != 1
        or pipeline.get("feature_names") != list(FEATURE_NAMES)
    ):
        raise RuntimeError(f"Invalid or incompatible feature pipeline at {pipeline_path}")
    max_distance = pipeline.get("max_distance_km")
    if (
        isinstance(max_distance, bool)
        or not isinstance(max_distance, (int, float))
        or not math.isfinite(max_distance)
        or max_distance <= 0
    ):
        raise RuntimeError(f"Invalid max_distance_km in feature pipeline at {pipeline_path}")
    return models, pipeline


def create_app(
    model_dir: str | Path | None = None,
    api_key: str | None = None,
) -> FastAPI:
    """Create the API app; artifacts are loaded during application startup."""
    artifact_directory = Path(model_dir) if model_dir else Path(__file__).resolve().parents[1] / "ml" / "saved_models"
    configured_api_key = api_key if api_key is not None else os.getenv("MATCH_API_KEY")
    state: dict[str, dict] = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        models, pipeline = _load_artifacts(artifact_directory)
        state["models"] = models
        state["pipeline"] = pipeline
        state["max_distance_km"] = float(pipeline["max_distance_km"])
        yield
        state.clear()

    app = FastAPI(
        title="Agricultural Logistics Matching Engine",
        description=(
            "LightGBM compatibility scoring followed by capacity-aware "
            "farmer-proposing deferred acceptance."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    @app.get("/")
    async def root() -> dict[str, str]:
        return {
            "service": "agricultural-logistics-matching",
            "health": "/health",
            "docs": "/docs",
        }

    def scored_records(payload: MatchRequest) -> tuple[list[dict], pd.DataFrame]:
        if not payload.farmers or not payload.buyers:
            return [], pd.DataFrame()
        pair_table = _pair_table(
            [farmer.model_dump() for farmer in payload.farmers],
            [buyer.model_dump() for buyer in payload.buyers],
        )
        engineered = add_engineered_features(pair_table)
        scored = predict_pair_scores(engineered, state["models"])
        return scored.to_dict(orient="records"), engineered

    @app.get("/health")
    async def health() -> dict[str, str]:
        loaded = bool(state.get("models"))
        return {
            "status": "ok" if loaded else "not_ready",
            "models": "loaded" if loaded else "not_loaded",
        }

    def authorize(api_key_header: str | None) -> None:
        if configured_api_key and (
            api_key_header is None
            or not hmac.compare_digest(api_key_header, configured_api_key)
        ):
            raise HTTPException(status_code=401, detail="Invalid or missing API key")

    @app.post("/score")
    async def score_pairs(
        payload: MatchRequest,
        x_api_key: Annotated[str | None, Header()] = None,
    ) -> dict:
        authorize(x_api_key)
        if not state.get("models"):
            raise HTTPException(status_code=503, detail="Matching models are not loaded")
        if not payload.farmers or not payload.buyers:
            return {"scored_pairs": []}
        records, _ = scored_records(payload)
        return {
            "scored_pairs": [
                {
                    "farmer_id": row["farmer_id"],
                    "buyer_id": row["buyer_id"],
                    "distance_km": round(float(row["distance_km"]), 2),
                    "compatibility_score": float(row["compatibility_score"]),
                    "farmer_preference_score": float(row["farmer_preference_score"]),
                    "buyer_preference_score": float(row["buyer_preference_score"]),
                }
                for row in records
            ]
        }

    @app.post("/match")
    async def match(
        payload: MatchRequest,
        x_api_key: Annotated[str | None, Header()] = None,
    ) -> dict:
        authorize(x_api_key)
        if not state.get("models"):
            raise HTTPException(status_code=503, detail="Matching models are not loaded")
        if not payload.farmers or not payload.buyers:
            return match_farmers_to_buyers(
                [farmer.model_dump() for farmer in payload.farmers],
                [buyer.model_dump() for buyer in payload.buyers],
                [],
            )
        records, _ = scored_records(payload)
        try:
            result = match_farmers_to_buyers(
                [farmer.model_dump() for farmer in payload.farmers],
                [buyer.model_dump() for buyer in payload.buyers],
                records,
                max_distance_km=state["max_distance_km"],
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        result.pop("buyer_metrics")
        return result

    return app


app = create_app()
