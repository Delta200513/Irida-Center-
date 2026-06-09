import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets
from urllib.parse import urlencode, urlparse, urlunparse
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from ..auth import create_access_token, hash_password, verify_password
from ..deps import get_current_user, get_db
from ..models import OAuthAccount, Role, User
from ..oauth_clients import (
    OAuthIdentity,
    OAuthIntegrationError,
    build_yandex_authorization_url,
    fetch_yandex_identity,
)
from ..schemas import AuthResponse, UserLogin, UserProfileUpdate, UserRegister, UserResponse
from ..settings import get_settings
from ..validators import normalize_full_name, normalize_phone, require_text

router = APIRouter(prefix="/users", tags=["Users"])
logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 8
OAUTH_STATE_TTL_MINUTES = 15
PROFILE_PATH_SUFFIXES = ("/pages/profile.html", "/profile.html")
BASE_DIR = Path(__file__).resolve().parent.parent.parent
AVATARS_UPLOADS_DIR = BASE_DIR / "uploads" / "avatars"
AVATARS_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_AVATAR_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_AVATAR_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_SIZE_BYTES = 3 * 1024 * 1024

settings = get_settings()


def has_structured_full_name(full_name: str) -> bool:
    return len([part for part in str(full_name).split() if part.strip()]) >= 2


def is_valid_name_part(part: str) -> bool:
    normalized = str(part).strip()
    if len(normalized) < 2:
        return False

    return (
        any(char.isalpha() for char in normalized)
        and all(char.isalpha() or char in "-'" for char in normalized)
    )


def validate_full_name_parts(full_name: str) -> None:
    parts = [part for part in str(full_name).split() if part.strip()]

    if len(parts) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Укажи имя и фамилию.",
        )

    if not all(is_valid_name_part(part) for part in parts):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Имя и фамилия должны содержать только буквы.",
        )


def has_oauth_account(user: User) -> bool:
    return bool(user.oauth_accounts)


def needs_profile_completion(user: User) -> bool:
    return has_oauth_account(user) and (not user.phone or not has_structured_full_name(user.full_name))


def get_oauth_provider_availability() -> dict[str, bool]:
    return {
        "yandex": all(
            [
                settings.yandex_oauth_client_id,
                settings.yandex_oauth_client_secret,
                settings.yandex_oauth_redirect_uri,
            ]
        ),
    }


def validate_password(password: str, password_confirm: str) -> None:
    if not password or not password.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Укажи пароль.",
        )

    if not password_confirm or not password_confirm.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Подтверди пароль.",
        )

    if password != password_confirm:
        raise HTTPException(status_code=400, detail="Пароли не совпадают.")

    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Пароль должен содержать минимум 8 символов.",
        )

    if not any(char.isdigit() for char in password) or not any(char.isalpha() for char in password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Пароль должен содержать и буквы, и цифры.",
        )


def build_user_response(user: User, role_name: str) -> UserResponse:
    return UserResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        phone=user.phone,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        role=role_name,
        has_oauth_account=has_oauth_account(user),
        needs_profile_completion=needs_profile_completion(user),
    )


def build_auth_response(user: User, role_name: str) -> AuthResponse:
    token = create_access_token({"sub": str(user.id), "role": role_name})
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=build_user_response(user, role_name),
    )


def get_role_name(user: User, db: Session) -> str:
    role = db.query(Role).filter(Role.id == user.role_id).first()
    return role.name if role else "client"


def get_client_role(db: Session) -> Role:
    client_role = db.query(Role).filter(Role.name == "client").first()
    if not client_role:
        raise HTTPException(status_code=500, detail="Роль client не найдена.")
    return client_role


def build_oauth_state(provider: str, return_url: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OAUTH_STATE_TTL_MINUTES)
    return jwt.encode(
        {
            "provider": provider,
            "return_url": return_url,
            "exp": expires_at,
        },
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def decode_oauth_state(state_token: str, provider: str) -> str:
    try:
        payload = jwt.decode(state_token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as error:
        raise HTTPException(status_code=400, detail="Состояние OAuth-запроса недействительно.") from error

    if payload.get("provider") != provider:
        raise HTTPException(status_code=400, detail="Провайдер OAuth не совпадает.")

    return_url = str(payload.get("return_url") or "").strip()
    if not return_url:
        raise HTTPException(status_code=400, detail="Не найден адрес возврата после OAuth.")

    return return_url


def get_allowed_frontend_origins() -> set[str]:
    allowed_origins = {
        origin.rstrip("/")
        for origin in settings.cors_origins
        if urlparse(origin).scheme in {"http", "https"} and urlparse(origin).netloc
    }

    redirect_uri = settings.yandex_oauth_redirect_uri.strip()
    if redirect_uri:
        parsed_redirect_uri = urlparse(redirect_uri)
        if parsed_redirect_uri.scheme in {"http", "https"} and parsed_redirect_uri.netloc:
            allowed_origins.add(f"{parsed_redirect_uri.scheme}://{parsed_redirect_uri.netloc}")

    return allowed_origins


def get_default_profile_url() -> str:
    for origin in sorted(get_allowed_frontend_origins()):
        return f"{origin}/pages/profile.html"

    return "http://127.0.0.1:5500/pages/profile.html"


def sanitize_frontend_return_url(next_url: str | None) -> str:
    if not next_url:
        return get_default_profile_url()

    parsed = urlparse(next_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Некорректный адрес возврата после OAuth.")

    allowed_origins = get_allowed_frontend_origins()
    request_origin = f"{parsed.scheme}://{parsed.netloc}"

    if request_origin not in allowed_origins:
        raise HTTPException(status_code=400, detail="Этот адрес возврата не разрешён.")

    if not any(parsed.path.endswith(suffix) for suffix in PROFILE_PATH_SUFFIXES):
        raise HTTPException(status_code=400, detail="OAuth можно вернуть только на страницу профиля.")

    return urlunparse(parsed._replace(fragment=""))


def build_frontend_redirect_url(
    return_url: str,
    *,
    access_token: str | None = None,
    token_type: str | None = None,
    provider: str | None = None,
    oauth_error: str | None = None,
) -> str:
    fragment_payload: dict[str, str] = {}

    if access_token:
        fragment_payload["access_token"] = access_token
    if token_type:
        fragment_payload["token_type"] = token_type
    if provider:
        fragment_payload["provider"] = provider
    if oauth_error:
        fragment_payload["oauth_error"] = oauth_error

    parsed = urlparse(return_url)
    return urlunparse(parsed._replace(fragment=urlencode(fragment_payload)))


def get_provider_config(provider: str) -> tuple[str, str, str]:
    if provider == "yandex":
        config = (
            settings.yandex_oauth_client_id,
            settings.yandex_oauth_client_secret,
            settings.yandex_oauth_redirect_uri,
        )
    else:
        raise HTTPException(status_code=404, detail="Неизвестный OAuth-провайдер.")

    missing = [
        name
        for name, value in (
            ("CLIENT_ID", config[0]),
            ("CLIENT_SECRET", config[1]),
            ("REDIRECT_URI", config[2]),
        )
        if not value
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Вход через Яндекс ещё не настроен на сервере.",
        )

    return config


def build_random_password() -> str:
    return f"Irida{secrets.token_urlsafe(18)}9"


def build_initial_oauth_full_name(identity: OAuthIdentity) -> str:
    raw_name = str(identity.full_name or "").strip()
    if len(raw_name) >= 2:
        return normalize_full_name(raw_name)

    return normalize_full_name("Клиент")


def is_local_avatar_url(avatar_url: str | None) -> bool:
    return str(avatar_url or "").startswith("/uploads/avatars/")


def delete_local_avatar_if_needed(avatar_url: str | None) -> None:
    if not is_local_avatar_url(avatar_url):
        return

    file_name = str(avatar_url).removeprefix("/uploads/avatars/").strip()
    if not file_name:
        return

    file_path = AVATARS_UPLOADS_DIR / file_name
    if file_path.exists():
        file_path.unlink()


def is_valid_avatar_signature(file_bytes: bytes, suffix: str) -> bool:
    if suffix in {".jpg", ".jpeg"}:
        return file_bytes.startswith(b"\xff\xd8\xff")
    if suffix == ".png":
        return file_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    if suffix == ".webp":
        return len(file_bytes) >= 12 and file_bytes.startswith(b"RIFF") and file_bytes[8:12] == b"WEBP"
    return False


async def save_avatar_file(avatar: UploadFile) -> str:
    suffix = Path(avatar.filename or "").suffix.lower()
    if suffix not in ALLOWED_AVATAR_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Разрешены только изображения JPG, PNG или WEBP.",
        )

    content_type = str(avatar.content_type or "").lower().strip()
    if content_type and content_type not in ALLOWED_AVATAR_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл должен быть изображением JPG, PNG или WEBP.",
        )

    file_bytes = await avatar.read(MAX_AVATAR_SIZE_BYTES + 1)
    await avatar.close()

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Выбери изображение для аватарки.",
        )

    if len(file_bytes) > MAX_AVATAR_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Аватарка должна быть не больше 3 МБ.",
        )

    if not is_valid_avatar_signature(file_bytes, suffix):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл повреждён или не похож на поддерживаемое изображение.",
        )

    file_name = f"{uuid4().hex}{suffix}"
    target_path = AVATARS_UPLOADS_DIR / file_name
    target_path.write_bytes(file_bytes)
    return f"/uploads/avatars/{file_name}"


def apply_identity_to_user(user: User, identity: OAuthIdentity) -> None:
    if (not has_structured_full_name(user.full_name)) and not identity.is_name_fallback:
        user.full_name = normalize_full_name(identity.full_name)

    if identity.avatar_url and not is_local_avatar_url(user.avatar_url):
        user.avatar_url = identity.avatar_url


def get_or_create_user_from_oauth(identity: OAuthIdentity, db: Session) -> User:
    oauth_account = (
        db.query(OAuthAccount)
        .filter(
            OAuthAccount.provider == identity.provider,
            OAuthAccount.provider_user_id == identity.provider_user_id,
        )
        .first()
    )

    if oauth_account:
        user = db.query(User).filter(User.id == oauth_account.user_id).first()
        if user is None:
            raise HTTPException(status_code=500, detail="OAuth-аккаунт связан с несуществующим пользователем.")

        apply_identity_to_user(user, identity)
        oauth_account.provider_email = identity.email
        db.commit()
        db.refresh(user)
        return user

    user = db.query(User).filter(User.email == identity.email).first()

    if user is None:
        client_role = get_client_role(db)
        user = User(
            role_id=client_role.id,
            full_name=build_initial_oauth_full_name(identity),
            email=identity.email,
            phone=None,
            password_hash=hash_password(build_random_password()),
            avatar_url=identity.avatar_url,
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        apply_identity_to_user(user, identity)

    db.add(
        OAuthAccount(
            user_id=user.id,
            provider=identity.provider,
            provider_user_id=identity.provider_user_id,
            provider_email=identity.email,
        )
    )
    db.commit()
    db.refresh(user)
    return user


def fetch_oauth_identity(provider: str, code: str) -> OAuthIdentity:
    client_id, client_secret, redirect_uri = get_provider_config(provider)

    return fetch_yandex_identity(
        code=code,
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    normalized_email = user_data.email.strip().lower()
    normalized_phone = normalize_phone(user_data.phone)
    normalized_full_name = normalize_full_name(user_data.full_name)

    validate_full_name_parts(normalized_full_name)
    validate_password(user_data.password, user_data.password_confirm)

    existing_email = db.query(User).filter(User.email == normalized_email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован.")

    existing_phone = db.query(User).filter(User.phone == normalized_phone).first()
    if existing_phone:
        raise HTTPException(status_code=400, detail="Телефон уже зарегистрирован.")

    client_role = get_client_role(db)

    new_user = User(
        role_id=client_role.id,
        full_name=normalized_full_name,
        email=normalized_email,
        phone=normalized_phone,
        password_hash=hash_password(user_data.password),
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    logger.info("Registered new user id=%s email=%s", new_user.id, normalized_email)

    return build_auth_response(new_user, client_role.name)


@router.post("/login", response_model=AuthResponse)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    normalized_email = user_data.email.strip().lower()
    if not user_data.password or not user_data.password.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Укажи пароль.",
        )

    user = db.query(User).filter(User.email == normalized_email).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        logger.warning("Failed login attempt for email=%s", normalized_email)
        raise HTTPException(status_code=400, detail="Неверный email или пароль.")

    if not user.is_active:
        logger.warning("Blocked login attempt for inactive user id=%s", user.id)
        raise HTTPException(status_code=403, detail="Аккаунт деактивирован.")

    logger.info("Successful login for user id=%s email=%s", user.id, normalized_email)
    return build_auth_response(user, get_role_name(user, db))


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_user_response(current_user, get_role_name(current_user, db))


@router.get("/oauth/providers")
def get_oauth_providers():
    return get_oauth_provider_availability()


@router.patch("/me", response_model=UserResponse)
def update_me(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    first_name = require_text(
        payload.first_name,
        "Укажи имя.",
        min_length=2,
        max_length=40,
        too_long_detail="Имя не должно превышать 40 символов.",
    )
    last_name = require_text(
        payload.last_name,
        "Укажи фамилию.",
        min_length=2,
        max_length=40,
        too_long_detail="Фамилия не должна превышать 40 символов.",
    )
    if not is_valid_name_part(first_name) or not is_valid_name_part(last_name):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Имя и фамилия должны содержать только буквы.",
        )

    normalized_phone = normalize_phone(payload.phone)
    normalized_full_name = normalize_full_name(f"{first_name} {last_name}")

    existing_phone = (
        db.query(User)
        .filter(User.phone == normalized_phone, User.id != current_user.id)
        .first()
    )
    if existing_phone:
        raise HTTPException(status_code=400, detail="Телефон уже зарегистрирован.")

    current_user.full_name = normalized_full_name
    current_user.phone = normalized_phone
    db.commit()
    db.refresh(current_user)
    logger.info("Updated profile for user id=%s", current_user.id)

    return build_user_response(current_user, get_role_name(current_user, db))


@router.post("/me/avatar", response_model=UserResponse)
async def upload_my_avatar(
    avatar: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    next_avatar_url = await save_avatar_file(avatar)
    delete_local_avatar_if_needed(current_user.avatar_url)
    current_user.avatar_url = next_avatar_url
    db.commit()
    db.refresh(current_user)
    logger.info("Uploaded avatar for user id=%s", current_user.id)
    return build_user_response(current_user, get_role_name(current_user, db))


@router.delete("/me/avatar", response_model=UserResponse)
def delete_my_avatar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    delete_local_avatar_if_needed(current_user.avatar_url)
    current_user.avatar_url = None
    db.commit()
    db.refresh(current_user)
    logger.info("Deleted avatar for user id=%s", current_user.id)
    return build_user_response(current_user, get_role_name(current_user, db))


@router.get("/oauth/{provider}/start")
def start_oauth_login(
    provider: str,
    next: str | None = Query(default=None),
):
    normalized_provider = provider.strip().lower()
    if normalized_provider != "yandex":
        raise HTTPException(status_code=404, detail="Неизвестный OAuth-провайдер.")

    client_id, _, redirect_uri = get_provider_config(normalized_provider)
    return_url = sanitize_frontend_return_url(next)
    state = build_oauth_state(normalized_provider, return_url)

    try:
        redirect_url = build_yandex_authorization_url(
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
        )
    except OAuthIntegrationError as error:
        logger.exception("Failed to start OAuth login for provider=%s", normalized_provider)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Не удалось начать OAuth-вход: {error}",
        ) from error

    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


@router.get("/oauth/{provider}/callback")
def oauth_callback(
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
):
    normalized_provider = provider.strip().lower()
    if normalized_provider != "yandex":
        raise HTTPException(status_code=404, detail="Неизвестный OAuth-провайдер.")

    if not state:
        raise HTTPException(status_code=400, detail="OAuth провайдер не вернул state.")

    return_url = decode_oauth_state(state, normalized_provider)

    if error:
        logger.warning("OAuth callback returned error provider=%s error=%s", normalized_provider, error)
        error_message = error_description or error
        redirect_url = build_frontend_redirect_url(
            return_url,
            provider=normalized_provider,
            oauth_error=error_message,
        )
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)

    if not code:
        logger.warning("OAuth callback without code provider=%s", normalized_provider)
        redirect_url = build_frontend_redirect_url(
            return_url,
            provider=normalized_provider,
            oauth_error="OAuth-провайдер не вернул код авторизации.",
        )
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)

    try:
        identity = fetch_oauth_identity(normalized_provider, code)
        user = get_or_create_user_from_oauth(identity, db)
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Аккаунт деактивирован.")

        role_name = get_role_name(user, db)
        access_token = create_access_token({"sub": str(user.id), "role": role_name})
        redirect_url = build_frontend_redirect_url(
            return_url,
            access_token=access_token,
            token_type="bearer",
            provider=normalized_provider,
        )
        logger.info("Successful OAuth login provider=%s user_id=%s", normalized_provider, user.id)
    except (HTTPException, OAuthIntegrationError) as error:
        error_message = error.detail if isinstance(error, HTTPException) else str(error)
        logger.warning("OAuth login failed provider=%s error=%s", normalized_provider, error_message)
        redirect_url = build_frontend_redirect_url(
            return_url,
            provider=normalized_provider,
            oauth_error=error_message,
        )

    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
