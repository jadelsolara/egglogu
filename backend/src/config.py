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
    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    # Monthly prices (create in Stripe Dashboard)
    STRIPE_PRICE_HOBBY: str = ""  # $9/mo
    STRIPE_PRICE_STARTER: str = ""  # $19/mo
    STRIPE_PRICE_PRO: str = ""  # $49/mo
    STRIPE_PRICE_ENTERPRISE: str = ""  # $99/mo
    # Annual prices (create in Stripe Dashboard — 2 months free)
    STRIPE_PRICE_HOBBY_ANNUAL: str = ""  # $90/yr
    STRIPE_PRICE_STARTER_ANNUAL: str = ""  # $190/yr
    STRIPE_PRICE_PRO_ANNUAL: str = ""  # $490/yr
    STRIPE_PRICE_ENTERPRISE_ANNUAL: str = ""  # $990/yr
    # Email
    RESEND_API_KEY: str = ""
    GOOGLE_CLIENT_ID: str = ""
    APPLE_CLIENT_ID: str = ""  # Apple Services ID (e.g. com.egglogu.auth)
    APPLE_TEAM_ID: str = ""
    APPLE_KEY_ID: str = ""
    APPLE_PRIVATE_KEY: str = ""  # PEM contents of the .p8 key file
    MICROSOFT_CLIENT_ID: str = ""  # Azure AD Application (client) ID
    MICROSOFT_TENANT_ID: str = "common"  # "common" for multi-tenant
    EMAIL_FROM_DOMAIN: str = "egglogu.com"
    FRONTEND_URL: str = "https://egglogu.com"
    CORREOS_DIR: str = "/home/jose-antonio/Desktop/Proyectos/EGGlogU/correos"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
