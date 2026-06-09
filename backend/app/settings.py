import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

load_dotenv(ENV_PATH)


def _split_origins(value: str) -> list[str]:
    if not value:
        return [
            "null",
            "http://127.0.0.1:5500",
            "http://localhost:5500",
            "http://127.0.0.1:3000",
            "http://localhost:3000",
            "http://127.0.0.1:8000",
            "http://localhost:8000",
        ]
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
        self.cors_origins = _split_origins(os.getenv("CORS_ORIGINS", ""))
        self.admin_full_name = os.getenv("ADMIN_FULL_NAME", "").strip()
        self.admin_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
        self.admin_phone = os.getenv("ADMIN_PHONE", "").strip()
        self.admin_password = os.getenv("ADMIN_PASSWORD", "")
        self.yandex_oauth_client_id = os.getenv("YANDEX_OAUTH_CLIENT_ID", "").strip()
        self.yandex_oauth_client_secret = os.getenv("YANDEX_OAUTH_CLIENT_SECRET", "").strip()
        self.yandex_oauth_redirect_uri = os.getenv("YANDEX_OAUTH_REDIRECT_URI", "").strip()

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

        encoded_user = quote_plus(self.db_user)
        encoded_password = quote_plus(self.db_password)

        return (
            f"mysql+pymysql://{encoded_user}:{encoded_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"
        )

    def validate_auth(self) -> None:
        missing = []
        if not self.secret_key:
            missing.append("SECRET_KEY")
        if not self.algorithm:
            missing.append("ALGORITHM")

        if missing:
            raise RuntimeError(f"Auth settings are missing: {', '.join(missing)}")

        if len(self.secret_key) < 32:
            raise RuntimeError("SECRET_KEY must contain at least 32 characters")

    @property
    def admin_seed_enabled(self) -> bool:
        return all(
            [
                self.admin_full_name,
                self.admin_email,
                self.admin_phone,
                self.admin_password,
            ]
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
