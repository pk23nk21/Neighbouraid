from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from ..core.config import settings

_client: AsyncIOMotorClient = None
_db: AsyncIOMotorDatabase = None


async def connect():
    global _client, _db
    _client = AsyncIOMotorClient(settings.MONGO_URL)
    _db = _client.get_default_database()
    await _db.alerts.create_index([("location", "2dsphere")])
    await _db.users.create_index("email", unique=True)


async def disconnect():
    if _client:
        _client.close()


def get_db() -> AsyncIOMotorDatabase:
    return _db
