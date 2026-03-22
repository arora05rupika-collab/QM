from pydantic_settings import BaseSettings
from typing import List
import secrets


class Settings(BaseSettings):
    APP_NAME: str = "ERP Migration Platform"
    VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Security
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/erp_migration"
    REDIS_URL: str = "redis://localhost:6379/0"

    # Anthropic AI
    ANTHROPIC_API_KEY: str = ""

    # Encryption key for connector credentials
    ENCRYPTION_KEY: str = secrets.token_urlsafe(32)

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Storage (for migration snapshots)
    S3_BUCKET: str = ""
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()
