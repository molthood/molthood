"""Comparing two subjects.

The theme is refusal: a comparison must not imply more than the data supports.
Every test here is a way that could go wrong.
"""

from __future__ import annotations

from typing import Any

from app.engine.compare import MIN_SHARED_CHECKS, compare


def _execution(
    *, address: str, score: int | None, checks: list[tuple[str, str, Any]]
) -> dict[str, Any]:
    facts: dict[str, Any] = {}
    if score is not None:
        facts["risk"] = {"score": score, "level": "low" if score >= 80 else "moderate"}
    return {
        "execution_id": f"ex_{address[-4:]}",
        "target": "token",
        "address": address,
        "facts": facts,
        "evidence": [
            {
                "kind": kind,
                "label": kind.replace("_", " "),
                "state": state,
                "value": value,
            }
            for kind, state, value in checks
        ],
    }


def _shared(count: int, state: str = "confirmed") -> list[tuple[str, str, Any]]:
    return [(f"check_{i}", state, i) for i in range(count)]


def test_a_check_only_one_side_ran_is_never_scored() -> None:
    """The difference is in the coverage, not the subject."""
    left = _execution(
        address="0x" + "a" * 40, score=80, checks=[("verified", "confirmed", True)]
    )
    right = _execution(address="0x" + "b" * 40, score=80, checks=[])

    result = compare(left, right)

    assert result.shared == []
    assert len(result.not_comparable) == 1
    assert result.not_comparable[0]["ran_on"] == "left"
    assert "Only one side" in result.not_comparable[0]["reason"]


def test_an_unknown_on_either_side_is_not_a_difference() -> None:
    """Treating `unknown` as a value manufactures a difference from two
    absences."""
    left = _execution(
        address="0x" + "a" * 40, score=80, checks=[("sellable", "confirmed", True)]
    )
    right = _execution(
        address="0x" + "b" * 40, score=80, checks=[("sellable", "unknown", None)]
    )

    result = compare(left, right)

    assert result.shared == []
    assert result.not_comparable[0]["ran_on"] == "both"
    assert "could not establish" in result.not_comparable[0]["reason"]


def test_no_verdict_when_too_little_is_shared() -> None:
    """Two subjects agreeing on three things is a coincidence, not a
    comparison."""
    left = _execution(address="0x" + "a" * 40, score=90, checks=_shared(3))
    right = _execution(address="0x" + "b" * 40, score=40, checks=_shared(3))

    result = compare(left, right)

    assert result.verdict is None
    assert "not enough to compare" in result.verdict_reason


def test_a_verdict_names_the_direction_of_the_scale() -> None:
    """The number alone reads backwards to anyone meeting this scale first."""
    left = _execution(
        address="0x" + "a" * 40, score=90, checks=_shared(MIN_SHARED_CHECKS)
    )
    right = _execution(
        address="0x" + "b" * 40, score=40, checks=_shared(MIN_SHARED_CHECKS)
    )

    result = compare(left, right)

    assert result.verdict == "left"
    assert "higher is safer" in result.verdict_reason


def test_a_missing_score_withholds_the_verdict_rather_than_assuming_zero() -> None:
    left = _execution(
        address="0x" + "a" * 40, score=None, checks=_shared(MIN_SHARED_CHECKS)
    )
    right = _execution(
        address="0x" + "b" * 40, score=70, checks=_shared(MIN_SHARED_CHECKS)
    )

    result = compare(left, right)

    assert result.verdict is None
    assert "No score was produced" in result.verdict_reason


def test_equal_scores_are_a_tie_not_a_refusal() -> None:
    """A tie is a finding. Withholding here would lose information."""
    left = _execution(
        address="0x" + "a" * 40, score=70, checks=_shared(MIN_SHARED_CHECKS)
    )
    right = _execution(
        address="0x" + "b" * 40, score=70, checks=_shared(MIN_SHARED_CHECKS)
    )

    result = compare(left, right)

    assert result.verdict == "tie"


def test_a_verdict_warns_about_what_it_did_not_account_for() -> None:
    left = _execution(
        address="0x" + "a" * 40,
        score=90,
        checks=[*_shared(MIN_SHARED_CHECKS), ("extra", "confirmed", 1)],
    )
    right = _execution(
        address="0x" + "b" * 40, score=40, checks=_shared(MIN_SHARED_CHECKS)
    )

    result = compare(left, right)

    assert result.verdict == "left"
    assert any("does not account" in w for w in result.warnings)


def test_comparing_different_kinds_of_subject_warns() -> None:
    left = _execution(address="0x" + "a" * 40, score=80, checks=_shared(2))
    right = _execution(address="0x" + "b" * 40, score=80, checks=_shared(2))
    right["target"] = "wallet"

    result = compare(left, right)

    assert any(
        "checked differently" in w or "checked\ndifferently" in w for w in result.warnings
    )


def test_agreement_is_reported_per_check() -> None:
    left = _execution(
        address="0x" + "a" * 40,
        score=80,
        checks=[("verified", "confirmed", True), ("supply", "confirmed", 100)],
    )
    right = _execution(
        address="0x" + "b" * 40,
        score=80,
        checks=[("verified", "confirmed", True), ("supply", "confirmed", 999)],
    )

    result = compare(left, right)
    by_kind = {item["kind"]: item for item in result.shared}

    assert by_kind["verified"]["agrees"] is True
    assert by_kind["supply"]["agrees"] is False


def test_no_supplier_name_reaches_a_comparison() -> None:
    left = _execution(address="0x" + "a" * 40, score=80, checks=[("v", "confirmed", 1)])
    left["evidence"][0]["label"] = "Blockscout verification"
    right = _execution(address="0x" + "b" * 40, score=80, checks=[("v", "confirmed", 1)])
    right["evidence"][0]["label"] = "Blockscout verification"

    result = compare(left, right)

    assert "blockscout" not in str(result.to_dict()).lower()
