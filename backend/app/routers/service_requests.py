import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..deps import get_current_admin, get_current_user, get_current_user_optional, get_db
from ..models import Review, ServiceRequest, ServiceRequestItem, User
from ..schemas import (
    ServiceRequestAdminUpdate,
    ServiceRequestCreate,
    ServiceRequestItemResponse,
    ServiceRequestResponse,
    ServiceRequestStatusUpdate,
)
from ..validators import normalize_full_name, normalize_optional_text, normalize_phone, require_text

router = APIRouter(prefix="/service-requests", tags=["Service requests"])
logger = logging.getLogger(__name__)

ALLOWED_SERVICE_REQUEST_STATUSES = {
    "new",
    "pending",
    "confirmed",
    "scheduled",
    "in_progress",
    "processing",
    "accepted",
    "completed",
    "done",
    "finished",
    "closed",
    "cancelled",
    "canceled",
    "archived",
}


def serialize_service_request(service_request: ServiceRequest) -> ServiceRequestResponse:
    items = [
        ServiceRequestItemResponse(
            id=item.id,
            section=item.section_title,
            service=item.service_name,
            class_label=item.vehicle_class_label,
            price=item.price_label,
            quantity=item.quantity,
        )
        for item in service_request.items
    ]

    return ServiceRequestResponse(
        id=service_request.id,
        user_id=service_request.user_id,
        customer_full_name=service_request.customer_full_name,
        customer_phone=service_request.customer_phone,
        customer_email=service_request.customer_email,
        status=service_request.status,
        source=service_request.source,
        comment=service_request.comment,
        created_at=service_request.created_at,
        updated_at=service_request.updated_at,
        total_items=sum(item.quantity for item in service_request.items),
        items=items,
    )


def load_request_with_items(db: Session, request_id: int) -> ServiceRequest | None:
    return (
        db.query(ServiceRequest)
        .options(joinedload(ServiceRequest.items))
        .filter(ServiceRequest.id == request_id)
        .first()
    )


def delete_request_with_related_reviews(db: Session, request_id: int, service_request: ServiceRequest) -> None:
    (
        db.query(Review)
        .filter(Review.service_request_id == request_id)
        .update({Review.service_request_id: None}, synchronize_session=False)
    )
    db.delete(service_request)


def normalize_request_items(items: list) -> list[dict]:
    if not items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Добавь хотя бы одну услугу в заявку.",
        )

    normalized_items: list[dict] = []

    for item in items:
        section = require_text(
            item.section,
            "Укажи раздел услуги.",
            max_length=120,
            too_long_detail="Название раздела слишком длинное. Максимум 120 символов.",
        )
        service = require_text(
            item.service,
            "Укажи название услуги.",
            max_length=120,
            too_long_detail="Название услуги слишком длинное. Максимум 120 символов.",
        )
        class_label = require_text(
            item.class_label,
            "Укажи класс автомобиля.",
            max_length=40,
            too_long_detail="Поле с классом автомобиля слишком длинное. Максимум 40 символов.",
        )
        price = require_text(
            item.price,
            "Укажи ориентировочную стоимость услуги.",
            max_length=40,
            too_long_detail="Поле со стоимостью слишком длинное. Максимум 40 символов.",
        )

        if item.quantity < 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Количество услуги должно быть не меньше 1.",
            )

        normalized_items.append(
            {
                "section": section,
                "service": service,
                "class_label": class_label,
                "price": price,
                "quantity": item.quantity,
            }
        )

    return normalized_items


def resolve_customer_contacts(payload: ServiceRequestCreate, current_user: User | None) -> tuple[int | None, str, str, str | None]:
    if current_user is None:
        first_name = require_text(payload.first_name, "Укажи имя.")
        last_name = require_text(payload.last_name, "Укажи фамилию.")
        customer_full_name = normalize_full_name(f"{first_name} {last_name}")
        customer_phone = normalize_phone(payload.phone or "")
        return None, customer_full_name, customer_phone, None

    customer_full_name = current_user.full_name
    customer_email = current_user.email

    if current_user.phone:
        return current_user.id, customer_full_name, current_user.phone, customer_email

    fallback_phone = normalize_phone(payload.phone or "")
    fallback_full_name = (
        normalize_full_name(f"{payload.first_name or ''} {payload.last_name or ''}")
        if payload.first_name or payload.last_name
        else customer_full_name
    )

    return current_user.id, fallback_full_name, fallback_phone, customer_email


@router.post("/", response_model=ServiceRequestResponse, status_code=status.HTTP_201_CREATED)
def create_service_request(
    payload: ServiceRequestCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    normalized_items = normalize_request_items(payload.items)

    user_id, customer_full_name, customer_phone, customer_email = resolve_customer_contacts(
        payload,
        current_user,
    )

    try:
        service_request = ServiceRequest(
            user_id=user_id,
            customer_full_name=customer_full_name,
            customer_phone=customer_phone,
            customer_email=customer_email,
            status="new",
            source="website",
            comment=normalize_optional_text(payload.comment, max_length=1000),
        )
        db.add(service_request)
        db.flush()

        for item in normalized_items:
            db.add(
                ServiceRequestItem(
                    service_request_id=service_request.id,
                    section_title=item["section"],
                    service_name=item["service"],
                    vehicle_class_label=item["class_label"],
                    price_label=item["price"],
                    quantity=item["quantity"],
                )
            )
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to create service request for user_id=%s",
            user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить заявку.",
        ) from error

    created_request = load_request_with_items(db, service_request.id)
    if created_request is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить заявку.",
        )

    logger.info(
        "Created service request id=%s for user_id=%s",
        created_request.id,
        user_id,
    )
    return serialize_service_request(created_request)


@router.get("/my", response_model=list[ServiceRequestResponse])
def get_my_service_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    requests = (
        db.query(ServiceRequest)
        .options(joinedload(ServiceRequest.items))
        .filter(ServiceRequest.user_id == current_user.id)
        .order_by(ServiceRequest.created_at.desc())
        .all()
    )
    return [serialize_service_request(service_request) for service_request in requests]


@router.get("/", response_model=list[ServiceRequestResponse])
def get_service_requests(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    requests = (
        db.query(ServiceRequest)
        .options(joinedload(ServiceRequest.items))
        .order_by(ServiceRequest.created_at.desc())
        .all()
    )
    return [serialize_service_request(service_request) for service_request in requests]


@router.put("/{request_id}", response_model=ServiceRequestResponse)
def update_service_request(
    request_id: int,
    payload: ServiceRequestAdminUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    service_request = load_request_with_items(db, request_id)
    if service_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заявка не найдена.")

    normalized_status = require_text(payload.status, "Укажи статус заявки.").lower()
    if normalized_status not in ALLOWED_SERVICE_REQUEST_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Недопустимый статус заявки.",
        )

    normalized_items = normalize_request_items(payload.items)

    try:
        service_request.customer_full_name = normalize_full_name(payload.customer_full_name)
        service_request.customer_phone = normalize_phone(payload.customer_phone)
        service_request.customer_email = normalize_optional_text(payload.customer_email)
        service_request.status = normalized_status
        service_request.comment = normalize_optional_text(payload.comment, max_length=1000)

        service_request.items.clear()
        db.flush()

        for item in normalized_items:
            service_request.items.append(
                ServiceRequestItem(
                    section_title=item["section"],
                    service_name=item["service"],
                    vehicle_class_label=item["class_label"],
                    price_label=item["price"],
                    quantity=item["quantity"],
                )
            )
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to update service request id=%s by admin_id=%s",
            request_id,
            admin.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось обновить заявку.",
        ) from error

    updated_request = load_request_with_items(db, request_id)
    if updated_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заявка не найдена.")

    logger.info(
        "Admin id=%s updated service request id=%s",
        admin.id,
        request_id,
    )
    return serialize_service_request(updated_request)


@router.put("/{request_id}/status", response_model=ServiceRequestResponse)
def update_service_request_status(
    request_id: int,
    payload: ServiceRequestStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    normalized_status = require_text(payload.status, "Укажи новый статус заявки.").lower()
    if normalized_status not in ALLOWED_SERVICE_REQUEST_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Недопустимый статус заявки.",
        )

    service_request = load_request_with_items(db, request_id)
    if service_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заявка не найдена.")

    try:
        service_request.status = normalized_status
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to update status for service request id=%s by admin_id=%s",
            request_id,
            admin.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось обновить статус заявки.",
        ) from error

    updated_request = load_request_with_items(db, request_id)
    if updated_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заявка не найдена.")

    logger.info(
        "Admin id=%s changed service request id=%s status to %s",
        admin.id,
        request_id,
        normalized_status,
    )
    return serialize_service_request(updated_request)


@router.delete("/my/{request_id}")
def delete_my_service_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service_request = (
        db.query(ServiceRequest)
        .options(joinedload(ServiceRequest.items))
        .filter(
            ServiceRequest.id == request_id,
            ServiceRequest.user_id == current_user.id,
        )
        .first()
    )
    if service_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заявка не найдена.",
        )

    try:
        delete_request_with_related_reviews(db, request_id, service_request)
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to delete own service request id=%s by user_id=%s",
            request_id,
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось удалить заявку.",
        ) from error

    logger.info("User id=%s deleted own service request id=%s", current_user.id, request_id)
    return {"message": "Заявка удалена"}


@router.delete("/{request_id}")
def delete_service_request(
    request_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    service_request = load_request_with_items(db, request_id)
    if service_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заявка не найдена.",
        )

    try:
        delete_request_with_related_reviews(db, request_id, service_request)
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to delete service request id=%s by admin_id=%s",
            request_id,
            admin.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось удалить заявку.",
        ) from error

    logger.info("Admin id=%s deleted service request id=%s", admin.id, request_id)
    return {"message": "Заявка удалена"}
