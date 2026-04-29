from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models import Post, PostComment, User
from ..schemas import CommentCreate
from ..deps import get_db, get_current_user, get_current_admin

router = APIRouter(prefix="/comments", tags=["Comments"])


@router.get("/post/{post_id}")
def get_comments(post_id: int, db: Session = Depends(get_db)):
    comments = (
        db.query(PostComment)
        .filter(PostComment.post_id == post_id, PostComment.is_deleted == False)
        .order_by(PostComment.created_at.asc())
        .all()
    )

    return [
        {
            "id": c.id,
            "post_id": c.post_id,
            "user_id": c.user_id,
            "user_name": c.user.full_name,
            "comment_text": c.comment_text,
            "is_deleted": c.is_deleted,
            "deleted_by_admin": c.deleted_by_admin,
            "created_at": c.created_at
        }
        for c in comments
    ]


@router.post("/post/{post_id}")
def create_comment(post_id: int, data: CommentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")

    comment = PostComment(
        post_id=post_id,
        user_id=current_user.id,
        comment_text=data.comment_text
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return {"message": "Комментарий добавлен", "comment_id": comment.id}


@router.get("/admin/all")
def get_all_comments(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    comments = db.query(PostComment).order_by(PostComment.created_at.desc()).all()

    return [
        {
            "id": c.id,
            "post_id": c.post_id,
            "user_id": c.user_id,
            "user_name": c.user.full_name,
            "comment_text": c.comment_text,
            "is_deleted": c.is_deleted,
            "deleted_by_admin": c.deleted_by_admin,
            "created_at": c.created_at
        }
        for c in comments
    ]


@router.put("/admin/hide/{comment_id}")
def hide_comment(comment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    comment = db.query(PostComment).filter(PostComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    comment.is_deleted = True
    comment.deleted_by_admin = True
    db.commit()

    return {"message": "Комментарий скрыт"}


@router.put("/admin/restore/{comment_id}")
def restore_comment(comment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    comment = db.query(PostComment).filter(PostComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    comment.is_deleted = False
    comment.deleted_by_admin = False
    db.commit()

    return {"message": "Комментарий восстановлен"}


@router.delete("/admin/delete/{comment_id}")
def delete_comment(comment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    comment = db.query(PostComment).filter(PostComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    db.delete(comment)
    db.commit()

    return {"message": "Комментарий удалён"}