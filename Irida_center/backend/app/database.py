from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .settings import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def create_db_and_tables() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
