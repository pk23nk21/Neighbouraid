from pymongo.errors import ConfigurationError

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from ..core.config import settings

# Default DB name used when the connection string doesn't carry one.
# Atlas users routinely paste a URL of the form
# `mongodb+srv://.../?retryWrites=true&w=majority` (no `/dbname` segment),
# which makes `get_default_database()` raise. Falling back to this name
# matches what the local-dev URL uses (`mongodb://localhost:27017/neighbouraid`)
# and keeps deploys forgiving.
_DEFAULT_DB_NAME = "neighbouraid"

_client: AsyncIOMotorClient = None
_db: AsyncIOMotorDatabase = None


async def connect():
    global _client, _db
    _client = AsyncIOMotorClient(settings.MONGO_URL)
    try:
        _db = _client.get_default_database()
    except ConfigurationError:
        # Atlas SRV strings often omit the database segment. Picking up
        # `neighbouraid` here keeps the user from having to learn the
        # exact connection-string syntax just to deploy.
        _db = _client[_DEFAULT_DB_NAME]
    await _db.alerts.create_index([("location", "2dsphere")])
    await _db.users.create_index("email", unique=True)


async def disconnect():
    if _client:
        _client.close()


def get_db() -> AsyncIOMotorDatabase:
    return _db
