"""End-to-end tests for synthetic data, model scoring, and stable matching."""

from __future__ import annotations

import joblib
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from api.main import Buyer, Farmer, MatchRequest, create_app
from data.generate_synthetic_data import generate_datasets
from engine.gale_shapley import match_farmers_to_buyers
from ml.train_model import (
    FEATURE_NAMES,
    MODEL_FILENAME,
    PIPELINE_FILENAME,
    add_engineered_features,
    haversine_distance,
    predict_pair_scores,
    train_models,
)


def test_haversine_vectorizes_and_returns_known_distance():
    distance = haversine_distance(0, 0, 0, 1)
    assert 111 < distance < 112
    vector = haversine_distance([0, 0], [0, 0], [0, 0], [1, 2])
    assert len(vector) == 2
    assert vector[0] < vector[1]


def test_data_training_scoring_and_stable_matching_pipeline(tmp_path):
    data_dir = tmp_path / "data"
    artifacts_dir = tmp_path / "models"
    paths = generate_datasets(output_dir=data_dir, seed=7)
    assert len(pd.read_csv(paths["farmers"])) == 100
    assert len(pd.read_csv(paths["buyers"])) == 25
    history = pd.read_csv(paths["historical_matches"])
    assert len(history) == 2_000
    assert history["compatibility_score"].between(0, 100).all()

    report = train_models(paths["historical_matches"], artifacts_dir)
    assert report["training_rows"] + report["validation_rows"] == 2_000
    models = joblib.load(artifacts_dir / MODEL_FILENAME)
    pipeline = joblib.load(artifacts_dir / PIPELINE_FILENAME)
    assert pipeline["feature_names"] == list(FEATURE_NAMES)

    farmers = pd.read_csv(paths["farmers"]).head(12).to_dict(orient="records")
    buyers = pd.read_csv(paths["buyers"]).head(5).to_dict(orient="records")
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
    pairs = add_engineered_features(pd.DataFrame(rows))
    scored = predict_pair_scores(pairs, models)
    assert scored["compatibility_score"].between(0, 100).all()
    assert scored["farmer_preference_score"].between(0, 100).all()
    assert scored["buyer_preference_score"].between(0, 100).all()

    result = match_farmers_to_buyers(farmers, buyers, scored.to_dict(orient="records"))
    assert result["summary_metrics"]["matched_farmer_count"] == len(
        result["matched_pairs"]
    )
    assert len(result["unmatched_farmers"]) + len(result["matched_pairs"]) == len(
        farmers
    )
    for buyer in buyers:
        assigned = [
            pair for pair in result["matched_pairs"] if pair["buyer_id"] == buyer["buyer_id"]
        ]
        assert sum(pair["quantity_tons"] for pair in assigned) <= buyer["max_capacity_tons"]


def test_api_serves_scoring_and_matching_endpoints(tmp_path):
    paths = generate_datasets(output_dir=tmp_path / "data", seed=9)
    artifacts_dir = tmp_path / "models"
    train_models(paths["historical_matches"], artifacts_dir)
    farmers = pd.read_csv(paths["farmers"]).head(2).to_dict(orient="records")
    buyers = pd.read_csv(paths["buyers"]).head(2).to_dict(orient="records")
    app = create_app(artifacts_dir, api_key="test-secret")

    with TestClient(app) as client:
        assert client.get("/health").json()["models"] == "loaded"
        assert client.post(
            "/score", json={"farmers": farmers, "buyers": buyers}
        ).status_code == 401
        score_response = client.post(
            "/score",
            json={"farmers": farmers, "buyers": buyers},
            headers={"X-API-Key": "test-secret"},
        )
        assert score_response.status_code == 200
        assert len(score_response.json()["scored_pairs"]) == 4
        match_response = client.post(
            "/match",
            json={"farmers": farmers, "buyers": buyers},
            headers={"X-API-Key": "test-secret"},
        )
        assert match_response.status_code == 200
        assert set(match_response.json()) == {
            "matched_pairs",
            "unmatched_farmers",
            "summary_metrics",
        }


def test_request_validation_accepts_integer_measurements_and_limits_pair_count():
    farmer = Farmer(
        farmer_id="F1",
        latitude=30,
        longitude=76,
        crop_type="Rice",
        quantity_tons=5,
        expected_price_per_ton=20_000,
        perishability_days=4,
        quality_grade="A",
    )
    buyer = Buyer(
        buyer_id="B1",
        latitude=30,
        longitude=76,
        desired_crop="Rice",
        max_capacity_tons=20,
        offered_price_per_ton=22_000,
        has_cold_storage=True,
        min_acceptable_grade="B",
    )
    assert MatchRequest(farmers=[farmer], buyers=[buyer])
    farmers = [
        farmer.model_copy(update={"farmer_id": f"F{index}"})
        for index in range(101)
    ]
    buyers = [
        buyer.model_copy(update={"buyer_id": f"B{index}"})
        for index in range(100)
    ]
    with pytest.raises(ValueError, match="must not exceed 10000"):
        MatchRequest(farmers=farmers, buyers=buyers)


def test_engine_filters_crop_distance_and_over_capacity_pairs():
    farmers = [
        {
            "farmer_id": "F1",
            "crop_type": "Rice",
            "quantity_tons": 12,
            "expected_price_per_ton": 20_000,
        },
        {
            "farmer_id": "F2",
            "crop_type": "Wheat",
            "quantity_tons": 10,
            "expected_price_per_ton": 20_000,
        },
        {
            "farmer_id": "F3",
            "crop_type": "Rice",
            "quantity_tons": 20,
            "expected_price_per_ton": 20_000,
        },
    ]
    buyers = [
        {
            "buyer_id": "B1",
            "desired_crop": "Rice",
            "max_capacity_tons": 15,
            "offered_price_per_ton": 22_000,
        }
    ]
    pairs = [
        {
            "farmer_id": "F1",
            "buyer_id": "B1",
            "distance_km": 10,
            "farmer_preference_score": 80,
            "buyer_preference_score": 80,
        },
        {
            "farmer_id": "F2",
            "buyer_id": "B1",
            "distance_km": 10,
            "farmer_preference_score": 99,
            "buyer_preference_score": 99,
        },
        {
            "farmer_id": "F3",
            "buyer_id": "B1",
            "distance_km": 10,
            "farmer_preference_score": 99,
            "buyer_preference_score": 99,
        },
    ]
    result = match_farmers_to_buyers(farmers, buyers, pairs)
    assert [pair["farmer_id"] for pair in result["matched_pairs"]] == ["F1"]
    assert result["unmatched_farmers"] == ["F2", "F3"]


def test_engine_rejects_non_finite_scores_and_invalid_limits():
    farmers = [
        {
            "farmer_id": "F1",
            "crop_type": "Rice",
            "quantity_tons": 5,
            "expected_price_per_ton": 20_000,
        }
    ]
    buyers = [
        {
            "buyer_id": "B1",
            "desired_crop": "Rice",
            "max_capacity_tons": 10,
            "offered_price_per_ton": 22_000,
        }
    ]
    pair = {
        "farmer_id": "F1",
        "buyer_id": "B1",
        "distance_km": float("nan"),
        "farmer_preference_score": 80,
        "buyer_preference_score": 80,
    }
    with pytest.raises(ValueError, match="distance_km must be a finite number"):
        match_farmers_to_buyers(farmers, buyers, [pair])
    with pytest.raises(ValueError, match="max_distance_km must be a finite number"):
        match_farmers_to_buyers(farmers, buyers, [], max_distance_km=float("nan"))


def test_weighted_capacity_reconsiders_rejected_farmers_after_roster_changes():
    farmers = [
        {
            "farmer_id": farmer_id,
            "crop_type": "Rice",
            "quantity_tons": quantity,
            "expected_price_per_ton": 20_000,
        }
        for farmer_id, quantity in (("A", 4), ("B", 6), ("C", 7), ("D", 4))
    ]
    buyers = [
        {
            "buyer_id": "X",
            "desired_crop": "Rice",
            "max_capacity_tons": 10,
            "offered_price_per_ton": 22_000,
        }
    ]
    buyer_scores = {"A": 97, "B": 96, "C": 98, "D": 100}
    pairs = [
        {
            "farmer_id": farmer["farmer_id"],
            "buyer_id": "X",
            "distance_km": 10,
            "farmer_preference_score": 80,
            "buyer_preference_score": buyer_scores[farmer["farmer_id"]],
        }
        for farmer in farmers
    ]

    result = match_farmers_to_buyers(farmers, buyers, pairs)

    assert {pair["farmer_id"] for pair in result["matched_pairs"]} == {"A", "D"}
    assert sum(pair["quantity_tons"] for pair in result["matched_pairs"]) == 8
    assert set(result["unmatched_farmers"]) == {"B", "C"}


def test_weighted_multi_buyer_matching_resolves_blocking_farmer_pair():
    quantities = {"F0": 10, "F1": 5, "F2": 7, "F3": 8, "F4": 7}
    farmer_scores = {
        "F0": {"B0": 13, "B1": 70, "B2": 91},
        "F1": {"B0": 31, "B1": 27, "B2": 39},
        "F2": {"B0": 79, "B1": 21, "B2": 80},
        "F3": {"B0": 98, "B1": 28, "B2": 8},
        "F4": {"B0": 72, "B1": 81, "B2": 93},
    }
    buyer_scores = {
        "F0": {"B0": 88, "B1": 88, "B2": 47},
        "F1": {"B0": 12, "B1": 37, "B2": 34},
        "F2": {"B0": 9, "B1": 9, "B2": 52},
        "F3": {"B0": 23, "B1": 83, "B2": 72},
        "F4": {"B0": 80, "B1": 69, "B2": 52},
    }
    farmers = [
        {
            "farmer_id": farmer_id,
            "crop_type": "Rice",
            "quantity_tons": quantity,
            "expected_price_per_ton": 20_000,
        }
        for farmer_id, quantity in quantities.items()
    ]
    buyers = [
        {
            "buyer_id": buyer_id,
            "desired_crop": "Rice",
            "max_capacity_tons": 12,
            "offered_price_per_ton": 22_000,
        }
        for buyer_id in ("B0", "B1", "B2")
    ]
    pairs = [
        {
            "farmer_id": farmer_id,
            "buyer_id": buyer_id,
            "distance_km": 10,
            "farmer_preference_score": farmer_scores[farmer_id][buyer_id],
            "buyer_preference_score": buyer_scores[farmer_id][buyer_id],
        }
        for farmer_id in quantities
        for buyer_id in ("B0", "B1", "B2")
    ]

    result = match_farmers_to_buyers(farmers, buyers, pairs)

    assert {
        (pair["farmer_id"], pair["buyer_id"])
        for pair in result["matched_pairs"]
    } == {("F1", "B0"), ("F4", "B0"), ("F0", "B1"), ("F3", "B2")}
