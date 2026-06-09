import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

YANDEX_AUTHORIZE_URL = "https://oauth.yandex.com/authorize"
YANDEX_TOKEN_URL = "https://oauth.yandex.com/token"
YANDEX_USERINFO_URL = "https://login.yandex.ru/info?format=json"


class OAuthIntegrationError(RuntimeError):
    pass


@dataclass(slots=True)
class OAuthIdentity:
    provider: str
    provider_user_id: str
    email: str
    full_name: str
    avatar_url: str | None = None
    is_name_fallback: bool = False


def _decode_json(payload: bytes) -> dict:
    return json.loads(payload.decode("utf-8"))


def _extract_error_message(error: HTTPError) -> str:
    raw_payload = error.read().decode("utf-8", errors="ignore").strip()
    if not raw_payload:
        return str(error.reason)

    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        return raw_payload

    return (
        payload.get("error_description")
        or payload.get("error")
        or payload.get("message")
        or raw_payload
    )


def _request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
) -> dict:
    request = Request(url, method=method, data=data, headers=headers or {})

    try:
        with urlopen(request, timeout=15) as response:
            return _decode_json(response.read())
    except HTTPError as error:
        raise OAuthIntegrationError(_extract_error_message(error)) from error
    except URLError as error:
        raise OAuthIntegrationError("Не удалось связаться с OAuth-провайдером.") from error


def _post_form_json(
    url: str,
    payload: dict[str, str],
    *,
    headers: dict[str, str] | None = None,
) -> dict:
    request_headers = {
        "Content-Type": "application/x-www-form-urlencoded",
    }
    if headers:
        request_headers.update(headers)

    return _request_json(
        url,
        method="POST",
        headers=request_headers,
        data=urlencode(payload).encode("utf-8"),
    )


def _build_full_name(*values: str) -> str:
    return " ".join(part.strip() for part in values if part and part.strip())


def build_yandex_authorization_url(*, client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": "login:email login:info",
        "force_confirm": "yes",
    }
    return f"{YANDEX_AUTHORIZE_URL}?{urlencode(params)}"


def fetch_yandex_identity(
    *,
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> OAuthIdentity:
    token_payload = _post_form_json(
        YANDEX_TOKEN_URL,
        {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        },
    )

    access_token = str(token_payload.get("access_token") or "").strip()
    if not access_token:
        raise OAuthIntegrationError("Яндекс не вернул access token.")

    profile = _request_json(
        YANDEX_USERINFO_URL,
        headers={"Authorization": f"OAuth {access_token}"},
    )

    provider_user_id = str(profile.get("id") or "").strip()
    email = (
        str(profile.get("default_email") or "").strip().lower()
        or next(
            (
                str(value).strip().lower()
                for value in profile.get("emails", [])
                if str(value).strip()
            ),
            "",
        )
    )

    if not provider_user_id:
        raise OAuthIntegrationError("Яндекс не вернул идентификатор пользователя.")
    if not email:
        raise OAuthIntegrationError(
            "Яндекс не вернул email. Проверь, что у приложения включен доступ к email."
        )

    real_name = str(profile.get("real_name") or "").strip()
    structured_name = _build_full_name(
        str(profile.get("first_name") or ""),
        str(profile.get("last_name") or ""),
    )
    is_name_fallback = not bool(real_name or structured_name)
    full_name = (
        real_name
        or structured_name
        or str(profile.get("display_name") or "").strip()
        or str(profile.get("login") or "").strip()
        or email.split("@", 1)[0]
    )

    avatar_url = None
    avatar_id = str(profile.get("default_avatar_id") or "").strip()
    if avatar_id and not profile.get("is_avatar_empty"):
        avatar_url = f"https://avatars.yandex.net/get-yapic/{avatar_id}/islands-200"

    return OAuthIdentity(
        provider="yandex",
        provider_user_id=provider_user_id,
        email=email,
        full_name=full_name,
        avatar_url=avatar_url,
        is_name_fallback=is_name_fallback,
    )
