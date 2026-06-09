import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..deps import get_current_admin, get_current_user_optional, get_db
from ..models import ContactRequest, User
from ..schemas import ContactRequestCreate, ContactRequestResponse, ContactRequestStatusUpdate
from ..validators import normalize_full_name, normalize_optional_text, normalize_phone, require_text

router = APIRouter(prefix="/contact-requests", tags=["Contact requests"])
logger = logging.getLogger(__name__)

ALLOWED_CONTACT_REQUEST_STATUSES = {
    "new",
    "pending",
    "processed",
    "closed",
    "archived",
}


def serialize_contact_request(contact_request: ContactRequest) -> ContactRequestResponse:
    return ContactRequestResponse(
        id=contact_request.id,
        user_id=contact_request.user_id,
        customer_name=contact_request.customer_name,
        customer_phone=contact_request.customer_phone,
        customer_email=contact_request.customer_email,
        source_page=contact_request.source_page,
        message=contact_request.message,
        status=contact_request.status,
        created_at=contact_request.created_at,
        updated_at=contact_request.updated_at,
    )


@router.post("/", response_model=ContactRequestResponse, status_code=status.HTTP_201_CREATED)
def create_contact_request(
    payload: ContactRequestCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    source_page = normalize_optional_text(payload.source_page, max_length=50) or "website"

    try:
        contact_request = ContactRequest(
            user_id=current_user.id if current_user else None,
            customer_name=normalize_full_name(payload.name),
            customer_phone=normalize_phone(payload.phone),
            customer_email=current_user.email if current_user else None,
            source_page=source_page,
            message=normalize_optional_text(payload.message, max_length=1000),
            status="new",
        )
        db.add(contact_request)
        db.commit()
        db.refresh(contact_request)
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to create contact request for user_id=%s",
            current_user.id if current_user else None,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить обращение.",
        ) from error

    logger.info(
        "Created contact request id=%s for user_id=%s",
        contact_request.id,
        current_user.id if current_user else None,
    )

    return serialize_contact_request(contact_request)


@router.get("/", response_model=list[ContactRequestResponse])
def get_contact_requests(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    requests = (
        db.query(ContactRequest)
        .order_by(ContactRequest.created_at.desc())
        .all()
    )
    return [serialize_contact_request(contact_request) for contact_request in requests]


@router.put("/{request_id}/status", response_model=ContactRequestResponse)
def update_contact_request_status(
    request_id: int,
    payload: ContactRequestStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    normalized_status = require_text(payload.status, "Укажи новый статус обращения.").lower()
    if normalized_status not in ALLOWED_CONTACT_REQUEST_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Недопустимый статус обращения.",
        )

    contact_request = db.query(ContactRequest).filter(ContactRequest.id == request_id).first()
    if contact_request is None:
        raise HTTPException(status_code=404, detail="Обращение не найдено.")

    try:
        contact_request.status = normalized_status
        db.commit()
        db.refresh(contact_request)
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to update contact request id=%s by admin_id=%s",
            request_id,
            admin.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось обновить статус обращения.",
        ) from error

    logger.info(
        "Admin id=%s changed contact request id=%s status to %s",
        admin.id,
        request_id,
        normalized_status,
    )

    return serialize_contact_request(contact_request)


@router.delete("/{request_id}")
def delete_contact_request(
    request_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    contact_request = db.query(ContactRequest).filter(ContactRequest.id == request_id).first()
    if contact_request is None:
        raise HTTPException(status_code=404, detail="Обращение не найдено.")

    try:
        db.delete(contact_request)
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to delete contact request id=%s by admin_id=%s",
            request_id,
            admin.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось удалить обращение.",
        ) from error

    logger.info("Admin id=%s deleted contact request id=%s", admin.id, request_id)
    return {"message": "Обращение удалено"}
