import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..deps import get_current_admin, get_current_user, get_current_user_optional, get_db
from ..models import Post, PostComment, PostLike, User
from ..validators import normalize_optional_text

router = APIRouter(prefix="/posts", tags=["Posts"])
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
NEWS_UPLOADS_DIR = BASE_DIR / "uploads" / "news"
NEWS_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
MAX_NEWS_IMAGE_SIZE_BYTES = 5 * 1024 * 1024


def build_post_payload(post: Post, db: Session, current_user: User | None = None) -> dict:
    likes_count = db.query(func.count(PostLike.id)).filter(PostLike.post_id == post.id).scalar() or 0
    comments_count = (
        db.query(func.count(PostComment.id))
        .filter(PostComment.post_id == post.id, PostComment.is_deleted == False)
        .scalar()
        or 0
    )
    liked_by_current_user = False

    if current_user is not None:
        liked_by_current_user = (
            db.query(PostLike)
            .filter(PostLike.post_id == post.id, PostLike.user_id == current_user.id)
            .first()
            is not None
        )

    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "image_url": post.image_url,
        "is_published": post.is_published,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "author_id": post.author_id,
        "author_name": post.author.full_name,
        "likes_count": likes_count,
        "comments_count": comments_count,
        "liked_by_current_user": liked_by_current_user,
    }


def build_post_feed_payloads(
    posts: list[Post],
    db: Session,
    current_user: User | None = None,
) -> list[dict]:
    if not posts:
        return []

    post_ids = [post.id for post in posts]
    likes_by_post = {
        post_id: count
        for post_id, count in (
            db.query(PostLike.post_id, func.count(PostLike.id))
            .filter(PostLike.post_id.in_(post_ids))
            .group_by(PostLike.post_id)
            .all()
        )
    }
    comments_by_post = {
        post_id: count
        for post_id, count in (
            db.query(PostComment.post_id, func.count(PostComment.id))
            .filter(
                PostComment.post_id.in_(post_ids),
                PostComment.is_deleted == False,
            )
            .group_by(PostComment.post_id)
            .all()
        )
    }
    liked_post_ids: set[int] = set()

    if current_user is not None:
        liked_post_ids = {
            post_id
            for post_id, in (
                db.query(PostLike.post_id)
                .filter(
                    PostLike.post_id.in_(post_ids),
                    PostLike.user_id == current_user.id,
                )
                .all()
            )
        }

    return [
        {
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "image_url": post.image_url,
            "is_published": post.is_published,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
            "author_id": post.author_id,
            "author_name": post.author.full_name,
            "likes_count": likes_by_post.get(post.id, 0),
            "comments_count": comments_by_post.get(post.id, 0),
            "liked_by_current_user": post.id in liked_post_ids,
        }
        for post in posts
    ]
def is_valid_image_signature(file_bytes: bytes, suffix: str) -> bool:
    if suffix in {".jpg", ".jpeg"}:
        return file_bytes.startswith(b"\xff\xd8\xff")
    if suffix == ".png":
        return file_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    if suffix == ".webp":
        return len(file_bytes) >= 12 and file_bytes.startswith(b"RIFF") and file_bytes[8:12] == b"WEBP"
    if suffix == ".gif":
        return file_bytes.startswith((b"GIF87a", b"GIF89a"))
    return False


def save_news_image(image: UploadFile) -> str:
    suffix = Path(image.filename or "").suffix.lower()
    if suffix not in ALLOWED_IMAGE_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Разрешены только изображения JPG, PNG, WEBP или GIF.",
        )

    content_type = str(image.content_type or "").lower().strip()
    if content_type and content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл должен быть изображением JPG, PNG, WEBP или GIF.",
        )

    file_bytes = image.file.read(MAX_NEWS_IMAGE_SIZE_BYTES + 1)
    image.file.close()

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Выбери изображение для новости.",
        )

    if len(file_bytes) > MAX_NEWS_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Изображение для новости должно быть не больше 5 МБ.",
        )

    if not is_valid_image_signature(file_bytes, suffix):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл повреждён или не похож на поддерживаемое изображение.",
        )

    filename = f"{uuid4().hex}{suffix}"
    target_path = NEWS_UPLOADS_DIR / filename

    try:
        target_path.write_bytes(file_bytes)
    except OSError as error:
        logger.exception("Failed to save news image %s", filename)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить изображение.",
        ) from error

    return f"/uploads/news/{filename}"


def delete_local_image_if_needed(image_url: str | None) -> None:
    if not image_url or not image_url.startswith("/uploads/news/"):
        return

    file_name = Path(str(image_url).removeprefix("/uploads/news/").strip()).name
    if not file_name:
        return

    file_path = NEWS_UPLOADS_DIR / file_name
    if file_path.exists():
        file_path.unlink()


@router.get("/")
def get_posts(
    response: Response,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    total_posts = db.query(func.count(Post.id)).filter(Post.is_published == True).scalar() or 0
    posts = (
        db.query(Post)
        .options(joinedload(Post.author))
        .filter(Post.is_published == True)
        .order_by(Post.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    response.headers["X-Total-Count"] = str(total_posts)
    response.headers["X-Offset"] = str(skip)
    response.headers["X-Limit"] = str(limit)
    return build_post_feed_payloads(posts, db, current_user)


@router.post("/")
def create_post(
    title: str = Form(...),
    content: str = Form(...),
    is_published: bool = Form(True),
    image_url: str | None = Form(None),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    normalized_title = title.strip()
    normalized_content = content.strip()
    normalized_image_url = normalize_optional_text(image_url, max_length=300)

    if len(normalized_title) < 3:
        raise HTTPException(status_code=400, detail="Заголовок слишком короткий.")
    if len(normalized_title) > 140:
        raise HTTPException(status_code=400, detail="Заголовок слишком длинный. Максимум 140 символов.")

    if len(normalized_content) < 10:
        raise HTTPException(status_code=400, detail="Текст новости слишком короткий.")
    if len(normalized_content) > 10000:
        raise HTTPException(status_code=400, detail="Текст новости слишком длинный. Максимум 10000 символов.")

    final_image_url = normalized_image_url
    if image is not None and image.filename:
        final_image_url = save_news_image(image)

    try:
        post = Post(
            author_id=admin.id,
            title=normalized_title,
            content=normalized_content,
            image_url=final_image_url,
            is_published=is_published,
        )
        db.add(post)
        db.commit()
        db.refresh(post)
    except SQLAlchemyError as error:
        db.rollback()
        delete_local_image_if_needed(final_image_url)
        logger.exception("Failed to create post by admin_id=%s", admin.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось опубликовать новость.",
        ) from error

    logger.info("Admin id=%s created post id=%s", admin.id, post.id)
    return {
        "message": "Новость опубликована",
        "post": build_post_payload(post, db, admin),
    }


@router.put("/{post_id}")
def update_post(
    post_id: int,
    title: str | None = Form(None),
    content: str | None = Form(None),
    is_published: bool | None = Form(None),
    image_url: str | None = Form(None),
    remove_image: bool = Form(False),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден.")

    normalized_title = normalize_optional_text(title)
    normalized_content = normalize_optional_text(content)
    normalized_image_url = normalize_optional_text(image_url, max_length=300)

    if normalized_title is not None:
        if len(normalized_title) < 3:
            raise HTTPException(status_code=400, detail="Заголовок слишком короткий.")
        if len(normalized_title) > 140:
            raise HTTPException(status_code=400, detail="Заголовок слишком длинный. Максимум 140 символов.")
        post.title = normalized_title

    if normalized_content is not None:
        if len(normalized_content) < 10:
            raise HTTPException(status_code=400, detail="Текст новости слишком короткий.")
        if len(normalized_content) > 10000:
            raise HTTPException(status_code=400, detail="Текст новости слишком длинный. Максимум 10000 символов.")
        post.content = normalized_content

    if is_published is not None:
        post.is_published = is_published

    if remove_image:
        delete_local_image_if_needed(post.image_url)
        post.image_url = None

    if normalized_image_url is not None:
        delete_local_image_if_needed(post.image_url)
        post.image_url = normalized_image_url

    if image is not None and image.filename:
        delete_local_image_if_needed(post.image_url)
        post.image_url = save_news_image(image)

    try:
        db.commit()
        db.refresh(post)
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception("Failed to update post id=%s by admin_id=%s", post_id, admin.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось обновить новость.",
        ) from error

    logger.info("Admin id=%s updated post id=%s", admin.id, post.id)
    return {
        "message": "Пост обновлён",
        "post": build_post_payload(post, db, admin),
    }


@router.delete("/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден.")

    delete_local_image_if_needed(post.image_url)

    try:
        db.delete(post)
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception("Failed to delete post id=%s by admin_id=%s", post_id, admin.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось удалить новость.",
        ) from error

    logger.info("Admin id=%s deleted post id=%s", admin.id, post_id)
    return {"message": "Пост удалён"}


@router.post("/{post_id}/like")
def toggle_like(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.id == post_id, Post.is_published == True).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден.")

    existing_like = (
        db.query(PostLike)
        .filter(PostLike.post_id == post_id, PostLike.user_id == current_user.id)
        .first()
    )

    if existing_like:
        db.delete(existing_like)
        db.commit()
        return {
            "message": "Лайк убран",
            "liked": False,
            "post": build_post_payload(post, db, current_user),
        }

    like = PostLike(post_id=post_id, user_id=current_user.id)
    db.add(like)
    db.commit()
    return {
        "message": "Лайк поставлен",
        "liked": True,
        "post": build_post_payload(post, db, current_user),
    }
