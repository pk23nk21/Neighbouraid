"""Multi-source verification scoring.

An alert's `verified_score` (0-100) combines independent signals:
  • witnesses      — distinct users who say they also see the incident
  • corroboration  — other alerts of the same category posted nearby recently
  • weather_match  — external weather data consistent with the alert category
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from bson import ObjectId

CORROBORATE_RADIUS_M = 500
CORROBORATE_WINDOW_MIN = 30
WITNESS_RADIUS_M = 2000  # users within 2 km can add a witness vote


def compute_verified_score(
    witnesses: int,
    corroborating_alerts: int,
    weather_match: bool,
) -> int:
    """Composite 0-100 score. Each independent source adds capped weight."""
    score = 0
    score += min(40, witnesses * 8)          # up to 40 pts from community witnesses
    score += min(40, corroborating_alerts * 15)  # up to 40 pts from nearby same-category alerts
    if weather_match:
        score += 20                          # 20 pts from external weather confirmation
    return min(100, score)


async def find_corroborating_alerts(db, category: str, coordinates: list[float]):
    """Return open alerts of the same category within the corroboration
    radius/window — excluding resolved ones. Caller filters out the alert
    being scored if needed."""
    since = datetime.now(timezone.utc) - timedelta(minutes=CORROBORATE_WINDOW_MIN)
    cursor = db.alerts.find(
        {
            "category": category,
            "status": {"$ne": "resolved"},
            "created_at": {"$gte": since},
            "location": {
                "$nearSphere": {
                    "$geometry": {"type": "Point", "coordinates": coordinates},
                    "$maxDistance": CORROBORATE_RADIUS_M,
                }
            },
        }
    )
    return [doc async for doc in cursor]


async def bump_witness(db, alert_id: ObjectId, user_id: str) -> dict | None:
    """Idempotently add a witness — one user can only confirm once."""
    return await db.alerts.find_one_and_update(
        {"_id": alert_id, "witnessed_by": {"$ne": user_id}},
        {
            "$addToSet": {"witnessed_by": user_id},
            "$inc": {"witnesses": 1},
        },
        return_document=True,
    )
