"""Unit tests for the in-process rate limiter."""

from __future__ import annotations

from app.core.ratelimit import RateLimiter


def test_allows_up_to_the_limit_then_blocks() -> None:
    rl = RateLimiter(max_attempts=3, window_seconds=60)
    assert [rl.check("k")[0] for _ in range(3)] == [True, True, True]
    allowed, retry_after = rl.check("k")
    assert allowed is False
    assert retry_after >= 1


def test_buckets_are_independent_per_key() -> None:
    rl = RateLimiter(max_attempts=1, window_seconds=60)
    assert rl.check("a")[0] is True
    assert rl.check("b")[0] is True
    assert rl.check("a")[0] is False


def test_window_resets_after_expiry() -> None:
    rl = RateLimiter(max_attempts=1, window_seconds=0)  # window immediately elapsed
    assert rl.check("k")[0] is True
    assert rl.check("k")[0] is True  # previous window already expired


def test_reset_clears_state() -> None:
    rl = RateLimiter(max_attempts=1, window_seconds=60)
    rl.check("k")
    assert rl.check("k")[0] is False
    rl.reset()
    assert rl.check("k")[0] is True


def test_tracked_keys_are_bounded() -> None:
    rl = RateLimiter(max_attempts=1, window_seconds=60, max_tracked_keys=10)
    for i in range(50):
        rl.check(f"key-{i}")
    assert len(rl._hits) <= 10
