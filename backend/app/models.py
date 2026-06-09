from sqlalchemy import (
    Boolean,
    Column,
    ForeignKey,
    Integer,
    String,
    Text,
    TIMESTAMP,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from .database import Base


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False, default=1)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False, index=True)
    phone = Column(String(20), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    avatar_url = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )

    role = relationship("Role")
    oauth_accounts = relationship(
        "OAuthAccount",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    posts = relationship("Post", back_populates="author")
    comments = relationship("PostComment", back_populates="user")
    likes = relationship("PostLike", back_populates="user")
    service_requests = relationship("ServiceRequest", back_populates="user")
    contact_requests = relationship("ContactRequest", back_populates="user")
    reviews = relationship("Review", back_populates="user", cascade="all, delete-orphan")


class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uq_oauth_accounts_provider_user"),
        UniqueConstraint("user_id", "provider", name="uq_oauth_accounts_user_provider"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider = Column(String(30), nullable=False)
    provider_user_id = Column(String(255), nullable=False)
    provider_email = Column(String(100), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )

    user = relationship("User", back_populates="oauth_accounts")


class Post(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    image_url = Column(String(255), nullable=True)
    is_published = Column(Boolean, default=True, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )

    author = relationship("User", back_populates="posts")
    comments = relationship("PostComment", back_populates="post", cascade="all, delete-orphan")
    likes = relationship("PostLike", back_populates="post", cascade="all, delete-orphan")


class PostComment(Base):
    __tablename__ = "post_comments"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    comment_text = Column(Text, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_by_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )

    post = relationship("Post", back_populates="comments")
    user = relationship("User", back_populates="comments")


class PostLike(Base):
    __tablename__ = "post_likes"
    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_post_likes_post_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    post = relationship("Post", back_populates="likes")
    user = relationship("User", back_populates="likes")


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    customer_full_name = Column(String(120), nullable=False)
    customer_phone = Column(String(20), nullable=False)
    customer_email = Column(String(100), nullable=True)
    status = Column(String(30), nullable=False, default="new")
    source = Column(String(50), nullable=False, default="website")
    comment = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )

    user = relationship("User", back_populates="service_requests")
    reviews = relationship("Review", back_populates="service_request")
    items = relationship(
        "ServiceRequestItem",
        back_populates="service_request",
        cascade="all, delete-orphan",
    )


class ServiceRequestItem(Base):
    __tablename__ = "service_request_items"

    id = Column(Integer, primary_key=True, index=True)
    service_request_id = Column(Integer, ForeignKey("service_requests.id"), nullable=False)
    section_title = Column(String(255), nullable=False)
    service_name = Column(String(255), nullable=False)
    vehicle_class_label = Column(String(50), nullable=False)
    price_label = Column(String(100), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    service_request = relationship("ServiceRequest", back_populates="items")


class ContactRequest(Base):
    __tablename__ = "contact_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    customer_name = Column(String(120), nullable=False)
    customer_phone = Column(String(20), nullable=False)
    customer_email = Column(String(100), nullable=True)
    source_page = Column(String(50), nullable=False, default="website")
    message = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="new")
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )

    user = relationship("User", back_populates="contact_requests")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    service_request_id = Column(Integer, ForeignKey("service_requests.id"), nullable=True)
    rating = Column(Integer, nullable=False)
    headline = Column(String(120), nullable=True)
    review_text = Column(Text, nullable=False)
    service_label = Column(String(120), nullable=True)
    status = Column(String(30), nullable=False, default="published")
    is_verified = Column(Boolean, nullable=False, default=False)
    admin_reply = Column(Text, nullable=True)
    admin_reply_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )

    user = relationship("User", back_populates="reviews")
    service_request = relationship("ServiceRequest", back_populates="reviews")
