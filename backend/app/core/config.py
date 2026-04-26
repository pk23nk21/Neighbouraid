from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MONGO_URL: str = "mongodb://localhost:27017/neighbouraid"
    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24

    # Optional outbound webhook fired on every new alert. Designed for n8n /
    # Zapier / Make / custom cron runners — point this at a webhook trigger
    # and the automation can fan out to Slack, WhatsApp Business, email,
    # SMS, or anywhere else. Leave empty to disable. Fire-and-forget; the
    # alert creation request never blocks on the webhook.
    ALERT_WEBHOOK_URL: str = ""
    ALERT_WEBHOOK_TIMEOUT_SECONDS: float = 4.0

    # Shared secret for the inbound WhatsApp webhook. Anything posting to
    # /api/inbound/whatsapp must include this in the `X-Inbound-Token`
    # header. Empty string disables the route entirely (default).
    INBOUND_TOKEN: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
