import re

from fastapi import HTTPException, status

PHONE_DIGITS_PATTERN = re.compile(r"\D+")
MAX_FULL_NAME_LENGTH = 80


def normalize_phone(phone: str) -> str:
    digits = PHONE_DIGITS_PATTERN.sub("", phone)

    if len(digits) == 10:
        digits = f"7{digits}"
    elif len(digits) == 11 and digits.startswith("8"):
        digits = f"7{digits[1:]}"

    if len(digits) != 11 or not digits.startswith("7"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Укажи корректный номер телефона в российском формате.",
        )

    return f"+7 ({digits[1:4]}) {digits[4:7]}-{digits[7:9]}-{digits[9:11]}"


def normalize_full_name(full_name: str, *, max_length: int = MAX_FULL_NAME_LENGTH) -> str:
    normalized = " ".join(full_name.split())
    if len(normalized) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Имя должно содержать минимум 2 символа.",
        )
    if len(normalized) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Имя слишком длинное. Максимум {max_length} символов.",
        )
    return normalized


def normalize_optional_text(value: str | None, *, max_length: int | None = None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if max_length is not None and len(normalized) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Текст слишком длинный. Максимум {max_length} символов.",
        )
    return normalized or None


def require_text(
    value: str | None,
    detail: str,
    *,
    min_length: int = 1,
    max_length: int | None = None,
    too_long_detail: str | None = None,
) -> str:
    normalized = normalize_optional_text(value)
    if not normalized or len(normalized) < min_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
        )
    if max_length is not None and len(normalized) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=too_long_detail or f"Текст слишком длинный. Максимум {max_length} символов.",
        )
    return normalized
