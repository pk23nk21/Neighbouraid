import os

# Force the keyword-heuristic fallback so unit tests are deterministic and
# don't pull the 1.6 GB HuggingFace model. Must be set before app imports.
os.environ.setdefault("NA_DISABLE_AI_MODEL", "1")

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.users.find_one = AsyncMock(return_value=None)
    db.users.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id="507f1f77bcf86cd799439011")
    )
    db.users.create_index = AsyncMock()
    db.alerts.find_one = AsyncMock(return_value=None)
    db.alerts.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id="507f1f77bcf86cd799439012")
    )
    db.alerts.create_index = AsyncMock()
    return db


@pytest.fixture
async def client(mock_db):
    from app.db import client as db_client
    from app.main import app

    original = db_client._db
    db_client._db = mock_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c, mock_db
    finally:
        db_client._db = original
