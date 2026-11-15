"""Capacity-aware many-to-one deferred-acceptance matching."""

from __future__ import annotations

from collections import deque
import math
from typing import Any, Mapping, Sequence


def _identifier(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must not be empty")
    return value.strip()


def _finite_number(value: object, field: str, *, positive: bool = False) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(f"{field} must be a finite number") from exc
    if not math.isfinite(result):
        raise ValueError(f"{field} must be a finite number")
    if positive and result <= 0:
        raise ValueError(f"{field} must be positive")
    return result


def _preferred_feasible_set(
    candidates: Sequence[dict[str, Any]], capacity_tons: float
) -> list[dict[str, Any]]:
    """Greedily retain the highest-ranked whole farmer lots that fit."""
    ordered = sorted(
        candidates,
        key=lambda pair: (
            -float(pair["buyer_preference_score"]),
            str(pair["farmer_id"]),
        ),
    )
    accepted: list[dict[str, Any]] = []
    used = 0.0
    for pair in ordered:
        quantity = _finite_number(pair["quantity_tons"], "quantity_tons", positive=True)
        if used + quantity <= capacity_tons + 1e-9:
            accepted.append(pair)
            used += quantity
    return accepted


def match_farmers_to_buyers(
    farmers: Sequence[Mapping[str, Any]],
    buyers: Sequence[Mapping[str, Any]],
    scored_pairs: Sequence[Mapping[str, Any]],
    max_distance_km: float = 300.0,
) -> dict[str, Any]:
    """    Run farmer-proposing deferred acceptance with buyer tonnage capacities.

    A farmer is indivisible: its full lot must fit in the buyer's remaining
    capacity. Each buyer's choice is the highest buyer-preference-ranked set
    of proposed lots that fits, using deterministic ID tie-breaking. Since
    weighted lots do not have the substitutable-choice property assumed by the
    textbook proof, a final bilateral-stability pass repairs blocking pairs or
    raises rather than returning an unverified assignment.
    """
    max_distance_km = _finite_number(
        max_distance_km, "max_distance_km", positive=True
    )
    farmer_map = {
        _identifier(farmer["farmer_id"], "farmer_id"): dict(farmer)
        for farmer in farmers
    }
    buyer_map = {
        _identifier(buyer["buyer_id"], "buyer_id"): dict(buyer) for buyer in buyers
    }
    if len(farmer_map) != len(farmers) or len(buyer_map) != len(buyers):
        raise ValueError("farmer_id and buyer_id values must be unique")
    for farmer_id, farmer in farmer_map.items():
        farmer["quantity_tons"] = _finite_number(
            farmer["quantity_tons"],
            f"Farmer {farmer_id} quantity_tons",
            positive=True,
        )
        farmer["expected_price_per_ton"] = _finite_number(
            farmer["expected_price_per_ton"],
            f"Farmer {farmer_id} expected_price_per_ton",
            positive=True,
        )
    for buyer_id, buyer in buyer_map.items():
        buyer["max_capacity_tons"] = _finite_number(
            buyer["max_capacity_tons"],
            f"Buyer {buyer_id} max_capacity_tons",
            positive=True,
        )
        buyer["offered_price_per_ton"] = _finite_number(
            buyer["offered_price_per_ton"],
            f"Buyer {buyer_id} offered_price_per_ton",
            positive=True,
        )

    choices: dict[str, list[dict[str, Any]]] = {farmer_id: [] for farmer_id in farmer_map}
    pair_seen: set[tuple[str, str]] = set()
    for raw_pair in scored_pairs:
        pair = dict(raw_pair)
        farmer_id = _identifier(pair["farmer_id"], "farmer_id")
        buyer_id = _identifier(pair["buyer_id"], "buyer_id")
        if farmer_id not in farmer_map or buyer_id not in buyer_map:
            raise ValueError(f"Scored pair references unknown IDs: {farmer_id}, {buyer_id}")
        key = (farmer_id, buyer_id)
        if key in pair_seen:
            raise ValueError(f"Duplicate score for farmer/buyer pair {key}")
        pair_seen.add(key)

        farmer = farmer_map[farmer_id]
        buyer = buyer_map[buyer_id]
        quantity = float(farmer["quantity_tons"])
        capacity = float(buyer["max_capacity_tons"])
        distance = _finite_number(pair["distance_km"], "distance_km")
        if (
            farmer["crop_type"] != buyer["desired_crop"]
            or distance > max_distance_km
            or quantity > capacity
        ):
            continue
        for score_name in ("farmer_preference_score", "buyer_preference_score"):
            score = _finite_number(pair[score_name], score_name)
            if not 0 <= score <= 100:
                raise ValueError(f"{score_name} must be between 0 and 100")
        pair.update(
            {
                "farmer_id": farmer_id,
                "buyer_id": buyer_id,
                "quantity_tons": quantity,
                "distance_km": distance,
                "expected_price_per_ton": float(farmer["expected_price_per_ton"]),
                "offered_price_per_ton": float(buyer["offered_price_per_ton"]),
            }
        )
        choices[farmer_id].append(pair)

    for farmer_id, farmer_choices in choices.items():
        farmer_choices.sort(
            key=lambda pair: (
                -float(pair["farmer_preference_score"]),
                str(pair["buyer_id"]),
            )
        )

    next_choice = {farmer_id: 0 for farmer_id in farmer_map}
    buyer_choice_index = {
        farmer_id: {
            pair["buyer_id"]: index for index, pair in enumerate(farmer_choices)
        }
        for farmer_id, farmer_choices in choices.items()
    }
    held: dict[str, list[dict[str, Any]]] = {buyer_id: [] for buyer_id in buyer_map}
    assignments: dict[str, str] = {}
    applicants: dict[str, set[str]] = {buyer_id: set() for buyer_id in buyer_map}
    proposal_queue = deque(
        (farmer_id, None)
        for farmer_id, options in sorted(choices.items())
        if options
    )
    queued = set(proposal_queue)

    def enqueue(farmer_id: str, buyer_id: str | None = None) -> None:
        proposal = (farmer_id, buyer_id)
        if proposal not in queued:
            proposal_queue.append(proposal)
            queued.add(proposal)

    def reconsider_previous_applicants(buyer_id: str) -> set[str]:
        """Retry past applicants when a weighted-capacity roster changes."""
        retry_ids = set()
        for applicant_id in sorted(applicants[buyer_id]):
            if assignments.get(applicant_id) == buyer_id:
                continue
            current_buyer = assignments.get(applicant_id)
            current_rank = (
                buyer_choice_index[applicant_id].get(current_buyer, float("inf"))
                if current_buyer is not None
                else float("inf")
            )
            target_rank = buyer_choice_index[applicant_id][buyer_id]
            if target_rank < current_rank:
                enqueue(applicant_id, buyer_id)
                retry_ids.add(applicant_id)
        return retry_ids

    while proposal_queue:
        farmer_id, retry_buyer_id = proposal_queue.popleft()
        queued.discard((farmer_id, retry_buyer_id))
        options = choices[farmer_id]

        if retry_buyer_id is None:
            if farmer_id in assignments:
                continue
            option_index = next_choice[farmer_id]
            if option_index >= len(options):
                continue
            proposal = options[option_index]
            next_choice[farmer_id] += 1
        else:
            if assignments.get(farmer_id) == retry_buyer_id:
                continue
            retry_index = buyer_choice_index[farmer_id][retry_buyer_id]
            current_buyer = assignments.get(farmer_id)
            if current_buyer is not None and (
                buyer_choice_index[farmer_id].get(current_buyer, float("inf"))
                <= retry_index
            ):
                continue
            proposal = options[retry_index]

        buyer_id = proposal["buyer_id"]
        buyer = buyer_map[buyer_id]
        previous_holders = {pair["farmer_id"] for pair in held[buyer_id]}
        candidate_set = [*held[buyer_id], proposal]
        selected = _preferred_feasible_set(
            candidate_set, float(buyer["max_capacity_tons"])
        )
        selected_ids = {pair["farmer_id"] for pair in selected}
        rejected_ids = {
            pair["farmer_id"] for pair in candidate_set if pair["farmer_id"] not in selected_ids
        }
        applicants[buyer_id].add(farmer_id)

        if farmer_id not in selected_ids:
            if farmer_id not in assignments and next_choice[farmer_id] < len(options):
                enqueue(farmer_id)
            continue

        previous_buyer = assignments.get(farmer_id)
        if previous_buyer is not None and previous_buyer != buyer_id:
            held[previous_buyer] = [
                pair for pair in held[previous_buyer] if pair["farmer_id"] != farmer_id
            ]
            assignments.pop(farmer_id, None)
            reconsider_previous_applicants(previous_buyer)

        held[buyer_id] = selected
        for displaced_id in previous_holders - selected_ids:
            assignments.pop(displaced_id, None)
        for selected_pair in selected:
            assignments[selected_pair["farmer_id"]] = buyer_id

        roster_changed = selected_ids != previous_holders
        retry_ids = (
            reconsider_previous_applicants(buyer_id)
            if roster_changed
            else set()
        )
        for rejected_id in rejected_ids - retry_ids:
            if (
                rejected_id not in assignments
                and next_choice[rejected_id] < len(choices[rejected_id])
            ):
                enqueue(rejected_id)

    # Weighted, indivisible lots do not have the substitutable-choice
    # property assumed by the textbook many-to-one deferred-acceptance proof.
    # Verify and repair bilateral blocking pairs before returning a result.
    # Track the actual buyer rosters, not just the assignment map: the same
    # matching can be reached with different accepted sets when buyers prefer
    # different weighted subsets of applicants for the same capacity.
    for buyer_id in buyer_map:
        held[buyer_id] = [
            pair
            for pair in held[buyer_id]
            if assignments.get(pair["farmer_id"]) == buyer_id
        ]

    def _state_signature() -> tuple[tuple[str, tuple[str, ...]], ...]:
        return tuple(
            sorted(
                (
                    buyer_id,
                    tuple(sorted(pair["farmer_id"] for pair in held[buyer_id])),
                )
                for buyer_id in buyer_map
            )
        )

    seen_matchings = {_state_signature()}
    repair_limit = min(
        1_000, max(100, len(farmer_map) * max(1, len(buyer_map)) * 2)
    )
    for repair_step in range(repair_limit + 1):
        blocking_pair = None
        for farmer_id in sorted(farmer_map):
            current_buyer = assignments.get(farmer_id)
            current_rank = (
                buyer_choice_index[farmer_id].get(current_buyer, float("inf"))
                if current_buyer is not None
                else float("inf")
            )
            for pair in choices[farmer_id]:
                buyer_id = pair["buyer_id"]
                if buyer_id == current_buyer:
                    continue
                if buyer_choice_index[farmer_id][buyer_id] >= current_rank:
                    continue
                candidate_set = [*held[buyer_id], pair]
                selected = _preferred_feasible_set(
                    candidate_set, float(buyer_map[buyer_id]["max_capacity_tons"])
                )
                if farmer_id in {item["farmer_id"] for item in selected}:
                    blocking_pair = (farmer_id, buyer_id, selected)
                    break
            if blocking_pair is not None:
                break

        if blocking_pair is None:
            break
        if repair_step == repair_limit:
            raise RuntimeError(
                "Unable to verify a stable matching within the weighted-capacity "
                "repair limit; no result was returned."
            )
        farmer_id, buyer_id, selected = blocking_pair
        previous_buyer = assignments.pop(farmer_id, None)
        if previous_buyer is not None:
            held[previous_buyer] = [
                pair for pair in held[previous_buyer] if pair["farmer_id"] != farmer_id
            ]
        previous_holders = {pair["farmer_id"] for pair in held[buyer_id]}
        selected_ids = {pair["farmer_id"] for pair in selected}
        held[buyer_id] = selected
        for displaced_id in previous_holders - selected_ids:
            assignments.pop(displaced_id, None)
        for selected_pair in selected:
            assignments[selected_pair["farmer_id"]] = buyer_id

        signature = _state_signature()
        if signature in seen_matchings:
            raise RuntimeError(
                "Weighted-capacity preferences produced a cycle while resolving "
                "blocking pairs; no stable result was returned."
            )
        seen_matchings.add(signature)

    matched_pairs = []
    buyer_metrics = []
    matched_farmer_ids: set[str] = set()
    total_distance = 0.0
    total_quantity = 0.0
    for buyer_id in sorted(buyer_map):
        buyer = buyer_map[buyer_id]
        accepted = held[buyer_id]
        used_capacity = sum(float(pair["quantity_tons"]) for pair in accepted)
        capacity = float(buyer["max_capacity_tons"])
        buyer_metrics.append(
            {
                "buyer_id": buyer_id,
                "capacity_tons": capacity,
                "capacity_utilized_tons": round(used_capacity, 2),
                "capacity_utilization_pct": round(100 * used_capacity / capacity, 2),
            }
        )
        for pair in sorted(accepted, key=lambda item: str(item["farmer_id"])):
            quantity = float(pair["quantity_tons"])
            distance = float(pair["distance_km"])
            price = (
                float(pair["expected_price_per_ton"])
                + float(pair["offered_price_per_ton"])
            ) / 2
            matched_farmer_ids.add(pair["farmer_id"])
            total_distance += distance
            total_quantity += quantity
            matched_pairs.append(
                {
                    "farmer_id": pair["farmer_id"],
                    "buyer_id": buyer_id,
                    "quantity_tons": round(quantity, 2),
                    "distance_km": round(distance, 2),
                    "price_agreed_per_ton": round(price, 2),
                    "farmer_preference_score": round(
                        float(pair["farmer_preference_score"]), 2
                    ),
                    "buyer_preference_score": round(
                        float(pair["buyer_preference_score"]), 2
                    ),
                }
            )

    total_capacity = sum(float(buyer["max_capacity_tons"]) for buyer in buyer_map.values())
    return {
        "matched_pairs": matched_pairs,
        "unmatched_farmers": sorted(set(farmer_map) - matched_farmer_ids),
        "buyer_metrics": buyer_metrics,
        "summary_metrics": {
            "farmers_considered": len(farmer_map),
            "buyers_considered": len(buyer_map),
            "matched_farmer_count": len(matched_farmer_ids),
            "unmatched_farmer_count": len(farmer_map) - len(matched_farmer_ids),
            "total_quantity_tons": round(total_quantity, 2),
            "total_distance_km": round(total_distance, 2),
            "average_distance_km": round(
                total_distance / len(matched_pairs), 2
            )
            if matched_pairs
            else 0.0,
            "capacity_utilization_pct": round(
                100 * total_quantity / total_capacity, 2
            )
            if total_capacity
            else 0.0,
        },
    }
