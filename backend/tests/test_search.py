"""Global search."""

from __future__ import annotations

from app.api.v1.endpoints.search import _score


def test_every_term_must_appear() -> None:
    """An OR search over a short query returns almost everything, which is the
    same as returning nothing useful."""
    assert _score("token 0xabc succeeded", ["token", "0xabc"]) > 0
    assert _score("token 0xabc succeeded", ["token", "missing"]) == 0


def test_repetition_ranks_higher() -> None:
    assert _score("token token token", ["token"]) > _score("token once", ["token"])


def test_a_non_match_scores_zero_rather_than_a_small_number() -> None:
    """Zero is the signal to drop the row. A small positive score would put
    unrelated records at the bottom of every result list."""
    assert _score("nothing relevant", ["absent"]) == 0
