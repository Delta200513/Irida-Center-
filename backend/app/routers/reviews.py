import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..deps import get_current_admin, get_current_user, get_db
from ..models import Review, ServiceRequest, User
from ..schemas import (
    ReviewAdminReplyUpdate,
    ReviewCreate,
    ReviewListResponse,
    ReviewResponse,
    ReviewStatusUpdate,
    ReviewSummaryBucket,
    ReviewSummaryResponse,
)
from ..validators import normalize_optional_text, require_text

router = APIRouter(prefix="/reviews", tags=["Reviews"])
logger = logging.getLogger(__name__)

ALLOWED_REVIEW_STATUSES = {"published", "hidden"}


def format_reviewer_name(full_name: str) -> str:
    parts = [part for part in full_name.split() if part]
    if not parts:
        return "Клиент студии"

    if len(parts) == 1:
        return parts[0]

    return f"{parts[0]} {parts[1][:1]}."


def serialize_review(review: Review) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        user_id=review.user_id,
        service_request_id=review.service_request_id,
        reviewer_name=format_reviewer_name(review.user.full_name if review.user else "Клиент студии"),
        rating=review.rating,
        headline=review.headline,
        review_text=review.review_text,
        service_label=review.service_label,
        status=review.status,
        is_verified=review.is_verified,
        admin_reply=review.admin_reply,
        admin_reply_at=review.admin_reply_at,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def build_summary_from_db(db: Session) -> ReviewSummaryResponse:
    published_reviews = db.query(Review).filter(Review.status == "published")
    total_reviews = published_reviews.count()
    average_rating = (
        round(
            float(
                db.query(func.avg(Review.rating))
                .filter(Review.status == "published")
                .scalar()
                or 0
            ),
            1,
        )
        if total_reviews
        else 0.0
    )
    verified_reviews = published_reviews.filter(Review.is_verified == True).count()
    replies_count = published_reviews.filter(Review.admin_reply.isnot(None)).count()
    distribution_counts = {
        rating: count
        for rating, count in (
            db.query(Review.rating, func.count(Review.id))
            .filter(Review.status == "published")
            .group_by(Review.rating)
            .all()
        )
    }

    distribution = [
        ReviewSummaryBucket(
            rating=rating,
            count=distribution_counts.get(rating, 0),
            percentage=round((distribution_counts.get(rating, 0) / total_reviews) * 100)
            if total_reviews
            else 0,
        )
        for rating in range(5, 0, -1)
    ]

    return ReviewSummaryResponse(
        average_rating=average_rating,
        total_reviews=total_reviews,
        verified_reviews=verified_reviews,
        replies_count=replies_count,
        distribution=distribution,
    )


def load_reviews_query(db: Session):
    return (
        db.query(Review)
        .options(joinedload(Review.user))
        .order_by(Review.created_at.desc(), Review.id.desc())
    )


def get_review_or_404(db: Session, review_id: int) -> Review:
    review = (
        db.query(Review)
        .options(joinedload(Review.user))
        .filter(Review.id == review_id)
        .first()
    )
    if not review:
        raise HTTPException(status_code=404, detail="Отзыв не найден.")
    return review


def build_request_service_label(service_request: ServiceRequest) -> str | None:
    service_names: list[str] = []

    for item in service_request.items:
        if item.service_name and item.service_name not in service_names:
            service_names.append(item.service_name)

    if not service_names:
        return None

    preview = service_names[:2]
    suffix = " и другое" if len(service_names) > 2 else ""
    return ", ".join(preview) + suffix


@router.get("/", response_model=ReviewListResponse)
def get_reviews(
    rating: int | None = Query(default=None, ge=1, le=5),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    db: Session = Depends(get_db),
):
    summary = build_summary_from_db(db)
    filtered_query = load_reviews_query(db).filter(Review.status == "published")

    if rating is not None:
        filtered_query = filtered_query.filter(Review.rating == rating)

    total_items = filtered_query.count()
    total_pages = (total_items + page_size - 1) // page_size if total_items else 0
    offset = (page - 1) * page_size
    filtered_reviews = filtered_query.offset(offset).limit(page_size).all()

    return ReviewListResponse(
        summary=summary,
        items=[serialize_review(review) for review in filtered_reviews],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )


@router.post("/", response_model=ReviewResponse)
def create_review(
    payload: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    headline = normalize_optional_text(payload.headline, max_length=120)
    review_text = require_text(
        payload.review_text,
        "Напиши хотя бы короткий текст отзыва.",
        min_length=12,
        max_length=3000,
        too_long_detail="Текст отзыва слишком длинный. Максимум 3000 символов.",
    )
    service_label = normalize_optional_text(payload.service_label, max_length=120)
    service_request_id = payload.service_request_id
    existing_review: Review | None = None
    is_verified = False

    if service_request_id is not None:
        service_request = (
            db.query(ServiceRequest)
            .options(joinedload(ServiceRequest.items))
            .filter(
                ServiceRequest.id == service_request_id,
                ServiceRequest.user_id == current_user.id,
            )
            .first()
        )
        if service_request is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Заявка для отзыва не найдена в твоём профиле.",
            )

        existing_review = (
            db.query(Review)
            .filter(
                Review.user_id == current_user.id,
                Review.service_request_id == service_request.id,
            )
            .first()
        )
        is_verified = True
        if service_label is None:
            service_label = build_request_service_label(service_request)
    else:
        existing_review = (
            db.query(Review)
            .filter(
                Review.user_id == current_user.id,
                Review.service_request_id.is_(None),
            )
            .first()
        )

    if existing_review is not None:
        try:
            existing_review.rating = payload.rating
            existing_review.headline = headline
            existing_review.review_text = review_text
            existing_review.service_label = service_label
            existing_review.status = "published"
            existing_review.is_verified = is_verified
            existing_review.admin_reply = None
            existing_review.admin_reply_at = None
            db.commit()
            db.refresh(existing_review)
        except SQLAlchemyError as error:
            db.rollback()
            logger.exception(
                "Failed to update review id=%s for user_id=%s",
                existing_review.id,
                current_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Не удалось сохранить отзыв.",
            ) from error

        logger.info("User id=%s updated review id=%s", current_user.id, existing_review.id)
        return serialize_review(existing_review)

    try:
        review = Review(
            user_id=current_user.id,
            service_request_id=service_request_id,
            rating=payload.rating,
            headline=headline,
            review_text=review_text,
            service_label=service_label,
            status="published",
            is_verified=is_verified,
        )
        db.add(review)
        db.commit()
        db.refresh(review)
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception("Failed to create review for user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить отзыв.",
        ) from error

    logger.info("User id=%s created review id=%s", current_user.id, review.id)
    return serialize_review(review)


@router.get("/my", response_model=list[ReviewResponse])
def get_my_reviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reviews = load_reviews_query(db).filter(Review.user_id == current_user.id).all()
    return [serialize_review(review) for review in reviews]


@router.get("/admin", response_model=list[ReviewResponse])
def get_all_reviews(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    reviews = load_reviews_query(db).all()
    return [serialize_review(review) for review in reviews]


@router.put("/admin/{review_id}/status", response_model=ReviewResponse)
def update_review_status(
    review_id: int,
    payload: ReviewStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    normalized_status = require_text(payload.status, "Укажи новый статус отзыва.").lower()
    if normalized_status not in ALLOWED_REVIEW_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Статус отзыва должен быть published или hidden.",
        )

    review = get_review_or_404(db, review_id)

    try:
        review.status = normalized_status
        db.commit()
        db.refresh(review)
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to update review status review_id=%s by admin_id=%s",
            review_id,
            admin.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось обновить статус отзыва.",
        ) from error

    logger.info(
        "Admin id=%s changed review id=%s status to %s",
        admin.id,
        review_id,
        normalized_status,
    )
    return serialize_review(review)


@router.put("/admin/{review_id}/reply", response_model=ReviewResponse)
def reply_to_review(
    review_id: int,
    payload: ReviewAdminReplyUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    review = get_review_or_404(db, review_id)

    try:
        review.admin_reply = require_text(
            payload.admin_reply,
            "Напиши текст ответа от студии.",
            min_length=4,
            max_length=1500,
            too_long_detail="Ответ студии слишком длинный. Максимум 1500 символов.",
        )
        review.admin_reply_at = datetime.utcnow()
        db.commit()
        db.refresh(review)
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to save reply for review_id=%s by admin_id=%s",
            review_id,
            admin.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить ответ на отзыв.",
        ) from error

    logger.info("Admin id=%s replied to review id=%s", admin.id, review_id)
    return serialize_review(review)
