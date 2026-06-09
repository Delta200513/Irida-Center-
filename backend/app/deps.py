from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .auth import decode_access_token
from .database import SessionLocal
from .models import Role, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/users/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/users/login", auto_error=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или просроченный токен.",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Некорректный токен.",
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден.")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Аккаунт деактивирован.")

    return user


def get_current_user_optional(
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
):
    if not token:
        return None

    payload = decode_access_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    user = db.query(User).filter(User.id == int(user_id), User.is_active == True).first()
    return user


def get_current_admin(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.id == current_user.role_id).first()
    if not role or role.name != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для администратора.",
        )
    return current_user
