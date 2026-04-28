"""Reverse geocoding via OpenStreetMap Nominatim (free, no key)."""

from __future__ import annotations

import asyncio
import logging

import httpx

log = logging.getLogger(__name__)

_NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
_UA = "NeighbourAid/1.0 (contact: parth@neighbouraid.local)"


def _compact_address(data: dict) -> str | None:
    """Prefer a compact, user-facing label over Nominatim's full
    `display_name`, which is often too long and noisy for cards/maps."""
    address = data.get("address") or {}
    parts = [
        address.get("road")
        or address.get("pedestrian")
        or address.get("footway")
        or address.get("cycleway")
        or address.get("path"),
        address.get("suburb")
        or address.get("neighbourhood")
        or address.get("quarter")
        or address.get("hamlet"),
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("county"),
        address.get("state_district") or address.get("state"),
    ]
    compact = ", ".join(part.strip() for part in parts if isinstance(part, str) and part.strip())
    if compact:
        return compact
    return data.get("display_name")


async def reverse_geocode(lat: float, lng: float, timeout: float = 2.0) -> str | None:
    """Return a human-readable address or None. Never raises — crisis
    alerts must not fail because a geocoder is slow."""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(
                _NOMINATIM,
                params={
                    "lat": lat,
                    "lon": lng,
                    "format": "json",
                    "zoom": 16,
                    "addressdetails": 1,
                    "accept-language": "en-IN,en",
                },
                headers={"User-Agent": _UA},
            )
            if r.status_code == 200:
                return _compact_address(r.json())
    except (httpx.HTTPError, asyncio.TimeoutError) as exc:
        log.info("reverse_geocode skipped: %s", exc)
    return None
