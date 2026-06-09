import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..deps import get_current_admin, get_current_user, get_db
from ..models import Post, PostComment, User
from ..schemas import CommentCreate
from ..validators import require_text

router = APIRouter(prefix="/comments", tags=["Comments"])
logger = logging.getLogger(__name__)


def get_published_post_or_404(post_id: int, db: Session) -> Post:
    post = db.query(Post).filter(Post.id == post_id, Post.is_published == True).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    return post


@router.get("/post/{post_id}")
def get_comments(post_id: int, db: Session = Depends(get_db)):
    get_published_post_or_404(post_id, db)

    comments = (
        db.query(PostComment)
        .filter(PostComment.post_id == post_id, PostComment.is_deleted == False)
        .order_by(PostComment.created_at.asc())
        .all()
    )

    return [
        {
            "id": comment.id,
            "post_id": comment.post_id,
            "user_id": comment.user_id,
            "user_name": comment.user.full_name,
            "comment_text": comment.comment_text,
            "is_deleted": comment.is_deleted,
            "deleted_by_admin": comment.deleted_by_admin,
            "created_at": comment.created_at,
        }
        for comment in comments
    ]


@router.post("/post/{post_id}")
def create_comment(
    post_id: int,
    data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_published_post_or_404(post_id, db)

    comment = PostComment(
        post_id=post_id,
        user_id=current_user.id,
        comment_text=require_text(
            data.comment_text,
            "Напиши текст комментария.",
            min_length=2,
            max_length=1000,
            too_long_detail="Комментарий слишком длинный. Максимум 1000 символов.",
        ),
    )
    try:
        db.add(comment)
        db.commit()
        db.refresh(comment)
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception(
            "Failed to create comment for post_id=%s user_id=%s",
            post_id,
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось добавить комментарий.",
        ) from error

    logger.info("User id=%s created comment id=%s for post_id=%s", current_user.id, comment.id, post_id)

    return {"message": "Комментарий добавлен", "comment_id": comment.id}


@router.get("/admin/all")
def get_all_comments(db: Session = Depends(get_db), _: User = Depends(get_current_admin)):
    comments = db.query(PostComment).order_by(PostComment.created_at.desc()).all()

    return [
        {
            "id": comment.id,
            "post_id": comment.post_id,
            "user_id": comment.user_id,
            "user_name": comment.user.full_name,
            "comment_text": comment.comment_text,
            "is_deleted": comment.is_deleted,
            "deleted_by_admin": comment.deleted_by_admin,
            "created_at": comment.created_at,
        }
        for comment in comments
    ]


@router.put("/admin/hide/{comment_id}")
def hide_comment(comment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    comment = db.query(PostComment).filter(PostComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    try:
        comment.is_deleted = True
        comment.deleted_by_admin = True
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception("Failed to hide comment id=%s by admin_id=%s", comment_id, admin.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось скрыть комментарий.",
        ) from error

    logger.info("Admin id=%s hid comment id=%s", admin.id, comment_id)

    return {"message": "Комментарий скрыт"}


@router.put("/admin/restore/{comment_id}")
def restore_comment(comment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    comment = db.query(PostComment).filter(PostComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    try:
        comment.is_deleted = False
        comment.deleted_by_admin = False
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception("Failed to restore comment id=%s by admin_id=%s", comment_id, admin.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось восстановить комментарий.",
        ) from error

    logger.info("Admin id=%s restored comment id=%s", admin.id, comment_id)

    return {"message": "Комментарий восстановлен"}


@router.delete("/admin/delete/{comment_id}")
def delete_comment(comment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    comment = db.query(PostComment).filter(PostComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    try:
        db.delete(comment)
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception("Failed to delete comment id=%s by admin_id=%s", comment_id, admin.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось удалить комментарий.",
        ) from error

    logger.info("Admin id=%s deleted comment id=%s", admin.id, comment_id)

    return {"message": "Комментарий удалён"}
