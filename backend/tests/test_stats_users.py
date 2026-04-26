import pytest
from unittest.mock import AsyncMock, MagicMock
from bson import ObjectId
from app.core.security import create_token


def _token(role="reporter"):
    return create_token({"sub": str(ObjectId()), "role": role})


@pytest.mark.asyncio
async def test_stats_public_no_auth_needed(client):
    c, db = client
    db.alerts.count_documents = AsyncMock(return_value=0)

    async def empty_agg(*args, **kwargs):
        if False:
            yield
    db.alerts.aggregate = MagicMock(return_value=empty_agg())

    resp = await c.get("/api/stats/")
    assert resp.status_code == 200
    body = resp.json()
    assert "active_alerts" in body
    assert "critical_open" in body
    assert "last_24h" in body


@pytest.mark.asyncio
async def test_user_me_requires_auth(client):
    c, _ = client
    resp = await c.get("/api/users/me")
    # FastAPI's HTTPBearer returns 403 when the header is missing
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_update_location_requires_valid_coords(client):
    c, db = client
    db.users.find_one_and_update = AsyncMock(
        return_value={
            "_id": ObjectId(),
            "name": "x",
            "email": "x@x.com",
            "role": "reporter",
            "location": {"type": "Point", "coordinates": [76.7, 30.7]},
            "created_at": "2024-01-01T00:00:00",
        }
    )
    resp = await c.patch(
        "/api/users/me/location",
        json={"location": {"type": "Point", "coordinates": [999, 999]}},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    # 422 — our validator rejects out-of-range coords
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_news_endpoint_structure(client, monkeypatch):
    c, _ = client
    # Patch the symbol where it's actually used (imported into the route module).
    from app.routes import news as news_route

    async def fake_fetch():
        return [
            {
                "source": "Test",
                "title": "Fire in city centre",
                "link": "https://example.com/a",
                "summary": "...",
                "published": "",
            }
        ]

    monkeypatch.setattr(news_route, "fetch_news", fake_fetch)

    resp = await c.get("/api/news/recent")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 1
    assert body["items"][0]["title"] == "Fire in city centre"


@pytest.mark.asyncio
async def test_my_stats_reporter_shape(client):
    c, db = client
    db.alerts.count_documents = AsyncMock(return_value=3)
    resp = await c.get(
        "/api/users/me/stats",
        headers={"Authorization": f"Bearer {_token('reporter')}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "reporter"
    assert body["posted"] == 3
