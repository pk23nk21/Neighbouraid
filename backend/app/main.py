import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.security import decode_token_safe
from .core.security_headers import SecurityHeadersMiddleware
from .db.client import connect, disconnect
from .routes import alerts, auth, inbound, news, resources, safety, stats, users
from .services.websocket import manager

log = logging.getLogger("neighbouraid")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect()
    yield
    await disconnect()


app = FastAPI(title="NeighbourAid API", version="1.0.0", lifespan=lifespan)

# Security headers run BEFORE CORS so they apply even to CORS-rejected
# preflight responses. (Starlette evaluates middleware in reverse-add
# order — last-added is outermost.)
app.add_middleware(SecurityHeadersMiddleware)

# Allow the configured frontend origins. Extra hosts can be appended via
# FRONTEND_ORIGINS (comma-separated). The regex allow-list covers the two
# free hosts users actually deploy to (Vercel + HuggingFace Spaces). Auth
# is JWT-in-Authorization-header — not cookies — so credentials=true is
# safe and the Authorization header is not exempt from same-origin policy.
_default_origins = ["http://localhost:3000", "http://localhost:5173"]
_extra = [o.strip() for o in os.getenv("FRONTEND_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _extra,
    allow_origin_regex=(
        r"https://.*\.vercel\.app|"
        r"https://.*\.onrender\.com|"
        r"https://.*\.hf\.space|"
        r"https://.*\.netlify\.app|"
        r"https://.*\.pages\.dev"
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Inbound-Token"],
    expose_headers=[],
    max_age=600,
)

app.include_router(auth.router)
app.include_router(alerts.router)
app.include_router(users.router)
app.include_router(stats.router)
app.include_router(safety.router)
app.include_router(news.router)
app.include_router(resources.router)
app.include_router(inbound.router)


def _safe_errors(errors):
    """Pydantic errors may include non-JSON-serializable objects (ValueError
    instances under `ctx`). Keep only the client-useful keys so the response
    is always JSON-safe."""
    safe = []
    for e in errors:
        safe.append(
            {
                "type": e.get("type"),
                "loc": [str(x) for x in e.get("loc", ())],
                "msg": e.get("msg"),
            }
        )
    return safe


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Flatten Pydantic validation errors into a concise single string so the
    frontend can render `detail` directly. Raw, JSON-safe errors stay under
    `errors` for anyone who wants them."""
    messages = []
    for err in exc.errors():
        loc = ".".join(str(x) for x in err.get("loc", ()) if x not in ("body",))
        msg = err.get("msg", "invalid value")
        messages.append(f"{loc}: {msg}" if loc else msg)
    return JSONResponse(
        status_code=422,
        content={
            "detail": "; ".join(messages) or "Invalid request",
            "errors": _safe_errors(exc.errors()),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Last-resort: never leak stack traces to clients. Logs full trace."""
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error — please try again"},
    )


@app.get("/")
async def root():
    return {"service": "NeighbourAid API", "status": "ok", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/volunteer")
async def volunteer_ws(websocket: WebSocket, token: str):
    payload = decode_token_safe(token)
    if not payload:
        await websocket.close(code=4001)
        return
    if payload.get("role") != "volunteer":
        await websocket.close(code=4003)
        return

    await websocket.accept()
    vol_id = payload["sub"]

    try:
        # First message must carry the volunteer's coordinates: {"coordinates": [lng, lat]}
        raw = await websocket.receive_text()
        try:
            loc = json.loads(raw)
            coords = loc["coordinates"]
            if not (isinstance(coords, list) and len(coords) == 2):
                raise ValueError("bad coordinates")
            lng, lat = float(coords[0]), float(coords[1])
            if not (-180 <= lng <= 180 and -90 <= lat <= 90):
                raise ValueError("out-of-range coordinates")
        except (ValueError, KeyError, TypeError):
            await websocket.close(code=4002)
            return

        manager.register(vol_id, websocket, [lng, lat])
        while True:
            # subsequent frames ignored — keep-alive only
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(vol_id)
