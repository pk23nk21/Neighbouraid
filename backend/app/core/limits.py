"""FastAPI dependency wrappers for the rate limiters.

Lets a route declare:

    @router.post("/login", dependencies=[Depends(limit_login)])
    async def login(...):
        ...

… and have the per-IP cap enforced before the handler runs. 429 on
overflow with a friendly message; the limiter itself logs nothing —
add tracing if you ever care about who's hitting the cap.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

from ..services.ratelimit import (
    login_limiter,
    register_limiter,
    write_limiter,
    RateLimiter,
)


def _client_ip(request: Request) -> str:
    """Best-effort source IP. Honours one X-Forwarded-For hop so the
    limiter behaves correctly behind Render / HuggingFace's proxies.
    Falls back to the direct peer when no header is present."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _make_dep(limiter: RateLimiter, scope: str):
    """Build a dependency that rate-limits per IP. `scope` is included
    in the bucket key so the same IP can have separate buckets per
    endpoint family (login vs register vs writes)."""
    async def dep(request: Request):
        if not limiter.allow(f"{scope}:{_client_ip(request)}"):
            raise HTTPException(
                429,
                f"Too many requests — please slow down for a moment ({scope})",
            )
    return dep


limit_login = _make_dep(login_limiter, "login")
limit_register = _make_dep(register_limiter, "register")
limit_write = _make_dep(write_limiter, "write")
