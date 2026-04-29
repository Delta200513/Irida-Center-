import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

load_dotenv(ENV_PATH)


def _split_origins(value: str) -> list[str]:
    if not value:
        return ["*"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


class Settings:
    def __init__(self) -> None:
        self.db_host = os.getenv("DB_HOST", "localhost")
        self.db_port = os.getenv("DB_PORT", "3306")
        self.db_name = os.getenv("DB_NAME", "")
        self.db_user = os.getenv("DB_USER", "")
        self.db_password = os.getenv("DB_PASSWORD", "")
        self.secret_key = os.getenv("SECRET_KEY", "")
        self.algorithm = os.getenv("ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
        self.cors_origins = _split_origins(os.getenv("CORS_ORIGINS", "*"))

    @property
    def database_url(self) -> str:
        missing = []
        if not self.db_host:
            missing.append("DB_HOST")
        if not self.db_port:
            missing.append("DB_PORT")
        if not self.db_name:
            missing.append("DB_NAME")
        if not self.db_user:
            missing.append("DB_USER")
        if not self.db_password:
            missing.append("DB_PASSWORD")

        if missing:
            raise RuntimeError(f"Database settings are missing: {', '.join(missing)}")

        return (
            f"mysql+pymysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    def validate_auth(self) -> None:
        missing = []
        if not self.secret_key:
            missing.append("SECRET_KEY")
        if not self.algorithm:
            missing.append("ALGORITHM")

        if missing:
            raise RuntimeError(f"Auth settings are missing: {', '.join(missing)}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
