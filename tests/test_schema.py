"""Analyst strict-JSON schema validation and 'refine or reject only' clamping."""
from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from backend.agents.analyst import _extract_json, clamp_to_candidate, mock_decision
from backend.core.models import AnalystDecision, LiquidityLevel, Setup

VALID = {
    "instrument": "XAUUSD", "bias": "BEARISH_SWEEP_SHORT", "confidence_score": 8, "htf_level_targeted": "PDH @ 2652",
    "sweep_details": {"extension_depth": "15 pips", "displacement_quality": "strong"},
    "trade_plan": {"entry_price": 2650.0, "stop_loss": 2654.0, "take_profit_1": 2642.0, "take_profit_2": 2638.0, "risk_reward_ratio": 2.0},
    "reasoning": "One. Two. Three.", "invalidation_conditions": ["close above 2654"],
}


def _setup() -> Setup:
    return Setup(signal_id="t", instrument="XAUUSD", direction="SHORT", level=LiquidityLevel(name="PDH", price=2652, side="high", strength=2),
                 sweep_time=0, confirm_time=0, sweep_extreme=2653.5, extension_depth=15, extension_unit="pips", displacement_ratio=2.4,
                 volume_spike=True, entry_price=2650.0, stop_loss=2654.0, take_profit_1=2642.0, take_profit_2=2638.0,
                 risk_reward_ratio=2.0, session="LONDON")


def test_valid_json_parses():
    d = AnalystDecision.model_validate_json(json.dumps(VALID))
    assert d.bias == "BEARISH_SWEEP_SHORT" and d.confidence_score == 8


@pytest.mark.parametrize("patch", [
    {"bias": "MAYBE"},
    {"confidence_score": 11},
    {"confidence_score": 0},
    {"trade_plan": {**VALID["trade_plan"], "stop_loss": 2640.0}},  # SL on wrong side for a short
])
def test_invalid_payloads_rejected(patch):
    with pytest.raises(ValidationError):
        AnalystDecision.model_validate({**VALID, **patch})


def test_missing_field_rejected():
    bad = dict(VALID)
    bad.pop("trade_plan")
    with pytest.raises(ValidationError):
        AnalystDecision.model_validate(bad)


def test_reasoning_truncated_to_three_sentences():
    d = AnalystDecision.model_validate({**VALID, "reasoning": "A. B. C. D. E."})
    assert d.reasoning.count(".") == 3


def test_extract_json_from_wrapped_text():
    assert json.loads(_extract_json("Sure: ```json\n" + json.dumps(VALID) + "\n```"))["instrument"] == "XAUUSD"
    with pytest.raises(ValueError):
        _extract_json("no json here")


def test_clamp_pins_entry_and_stop_and_rejects_invented_targets():
    d = AnalystDecision.model_validate({**VALID, "trade_plan": {**VALID["trade_plan"], "entry_price": 2651.0,
                                                                "stop_loss": 2655.0, "take_profit_2": 2600.0}})
    d, notes = clamp_to_candidate(d, _setup())
    assert d.trade_plan.entry_price == 2650.0 and d.trade_plan.stop_loss == 2654.0
    assert d.trade_plan.take_profit_2 == 2638.0  # beyond candidate TP2 -> reset
    assert notes


def test_clamp_direction_mismatch_becomes_no_trade():
    d = AnalystDecision.model_validate({**VALID, "bias": "BULLISH_SWEEP_LONG",
                                        "trade_plan": {"entry_price": 2650, "stop_loss": 2646, "take_profit_1": 2658, "take_profit_2": 2660, "risk_reward_ratio": 2}})
    d, _ = clamp_to_candidate(d, _setup())
    assert d.bias == "NO_TRADE"


def test_mock_decision_is_schema_valid_and_confident_on_clean_setup():
    d = mock_decision(_setup())
    AnalystDecision.model_validate(d.model_dump())
    assert d.confidence_score >= 7 and d.bias == "BEARISH_SWEEP_SHORT"
