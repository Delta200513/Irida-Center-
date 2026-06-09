from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .settings import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def create_db_and_tables() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def apply_schema_patches() -> None:
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    if "users" not in table_names:
        return

    columns = {column["name"]: column for column in inspector.get_columns("users")}
    phone_column = columns.get("phone")

    if phone_column and phone_column.get("nullable") is False:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users MODIFY phone VARCHAR(20) NULL"))

    if "reviews" in table_names and "service_requests" in table_names:
        review_columns = {column["name"]: column for column in inspector.get_columns("reviews")}
        review_foreign_keys = {
            foreign_key["name"]
            for foreign_key in inspector.get_foreign_keys("reviews")
            if foreign_key.get("name")
        }

        with engine.begin() as connection:
            if "service_request_id" not in review_columns:
                connection.execute(
                    text(
                        "ALTER TABLE reviews "
                        "ADD COLUMN service_request_id INT NULL AFTER user_id"
                    )
                )
                connection.execute(
                    text(
                        "ALTER TABLE reviews "
                        "ADD INDEX ix_reviews_service_request_id (service_request_id)"
                    )
                )

            if "fk_reviews_service_request_id" not in review_foreign_keys:
                connection.execute(
                    text(
                        "ALTER TABLE reviews "
                        "ADD CONSTRAINT fk_reviews_service_request_id "
                        "FOREIGN KEY (service_request_id) REFERENCES service_requests(id) "
                        "ON UPDATE CASCADE ON DELETE SET NULL"
                    )
                )


def seed_roles() -> None:
    from .models import Role

    with SessionLocal() as db:
        existing_roles = {role.name for role in db.query(Role).all()}

        for role_name in ("client", "admin"):
            if role_name not in existing_roles:
                db.add(Role(name=role_name))

        db.commit()


def seed_admin_user() -> None:
    from .auth import hash_password
    from .models import Role, User
    from .validators import normalize_phone

    if not settings.admin_seed_enabled:
        return

    with SessionLocal() as db:
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if admin_role is None:
            return

        existing_admin = db.query(User).filter(User.email == settings.admin_email).first()
        if existing_admin:
            return

        db.add(
            User(
                role_id=admin_role.id,
                full_name=settings.admin_full_name,
                email=settings.admin_email,
                phone=normalize_phone(settings.admin_phone),
                password_hash=hash_password(settings.admin_password),
                is_active=True,
            )
        )
        db.commit()


def init_db() -> None:
    create_db_and_tables()
    apply_schema_patches()
    seed_roles()
    seed_admin_user()
