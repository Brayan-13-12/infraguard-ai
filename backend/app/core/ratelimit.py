"""Best-effort, in-process rate limiting for sensitive endpoints.

Scope and limitations (documented deliberately)
-----------------------------------------------
* State lives in this process's memory. It is **not** shared across replicas and
  is lost on restart. With a single backend replica (v0.2) it still meaningfully
  slows credential stuffing / brute force from one source.
* Production should enforce rate limiting at a shared layer (Redis-backed limiter,
  API gateway, or WAF). That belongs to the security-hardening phase - we do not
  pull in Redis for v0.2.

Algorithm: fixed window per (bucket, client key). Cheap, predictable, easy to
reason about. A bounded dict with LRU-ish eviction guards against memory growth.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict


class RateLimiter:
    def __init__(self, *, max_attempts: int, window_seconds: int, max_tracked_keys: int = 10_000):
        self._max = max_attempts
        self._window = window_seconds
        self._cap = max_tracked_keys
        self._lock = threading.Lock()
        # key -> (window_start_epoch, count)
        self._hits: OrderedDict[str, tuple[float, int]] = OrderedDict()

    def check(self, key: str) -> tuple[bool, int]:
        """Register an attempt for ``key``.

        Returns ``(allowed, retry_after_seconds)``. ``retry_after`` is 0 when allowed.
        """
        now = time.monotonic()
        with self._lock:
            window_start, count = self._hits.get(key, (now, 0))
            if now - window_start >= self._window:
                window_start, count = now, 0

            count += 1
            self._hits[key] = (window_start, count)
            self._hits.move_to_end(key)
            while len(self._hits) > self._cap:
                self._hits.popitem(last=False)

            if count > self._max:
                retry_after = int(self._window - (now - window_start)) + 1
                return False, max(retry_after, 1)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
