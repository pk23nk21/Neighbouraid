"""Reverse geocoding via OpenStreetMap Nominatim (free, no key)."""

from __future__ import annotations

import asyncio
import logging

import httpx

log = logging.getLogger(__name__)

_NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
_UA = "NeighbourAid/1.0 (contact: parth@neighbouraid.local)"


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
                    "accept-language": "en-IN,en",
                },
                headers={"User-Agent": _UA},
            )
            if r.status_code == 200:
                return r.json().get("display_name")
    except (httpx.HTTPError, asyncio.TimeoutError) as exc:
        log.info("reverse_geocode skipped: %s", exc)
    return None
