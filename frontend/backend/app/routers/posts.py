from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models import Post, PostLike, User
from ..schemas import PostCreate, PostUpdate
from ..deps import get_db, get_current_admin, get_current_user

router = APIRouter(prefix="/posts", tags=["Posts"])


@router.get("/")
def get_posts(db: Session = Depends(get_db)):
    posts = db.query(Post).filter(Post.is_published == True).order_by(Post.created_at.desc()).all()

    result = []
    for post in posts:
        likes_count = db.query(func.count(PostLike.id)).filter(PostLike.post_id == post.id).scalar()
        result.append({
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "image_url": post.image_url,
            "is_published": post.is_published,
            "created_at": post.created_at,
            "author_name": post.author.full_name,
            "likes_count": likes_count
        })
    return result


@router.post("/")
def create_post(post_data: PostCreate, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    post = Post(
        author_id=admin.id,
        title=post_data.title,
        content=post_data.content,
        image_url=post_data.image_url,
        is_published=post_data.is_published
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return {"message": "Пост создан", "post_id": post.id}


@router.put("/{post_id}")
def update_post(post_id: int, post_data: PostUpdate, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")

    if post_data.title is not None:
        post.title = post_data.title
    if post_data.content is not None:
        post.content = post_data.content
    if post_data.image_url is not None:
        post.image_url = post_data.image_url
    if post_data.is_published is not None:
        post.is_published = post_data.is_published

    db.commit()
    return {"message": "Пост обновлён"}


@router.delete("/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")

    db.delete(post)
    db.commit()
    return {"message": "Пост удалён"}


@router.post("/{post_id}/like")
def toggle_like(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")

    existing_like = db.query(PostLike).filter(
        PostLike.post_id == post_id,
        PostLike.user_id == current_user.id
    ).first()

    if existing_like:
        db.delete(existing_like)
        db.commit()
        return {"message": "Лайк убран"}

    like = PostLike(post_id=post_id, user_id=current_user.id)
    db.add(like)
    db.commit()
    return {"message": "Лайк поставлен"}