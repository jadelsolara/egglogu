from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://egglogu:egglogu@postgres:5432/egglogu"
    REDIS_URL: str = "redis://redis:6379/0"
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    OWM_API_KEY: str = ""
    MQTT_BROKER_URL: str = ""
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_PRO: str = ""
    STRIPE_PRICE_BUSINESS: str = ""
    RESEND_API_KEY: str = ""
    EMAIL_FROM_DOMAIN: str = "egglogu.com"
    FRONTEND_URL: str = "https://egglogu.com"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
