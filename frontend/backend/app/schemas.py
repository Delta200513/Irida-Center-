from datetime import datetime
from pydantic import BaseModel, EmailStr
from typing import Optional, List


class UserRegister(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    phone: str
    role: str

    class Config:
        from_attributes = True


class PostCreate(BaseModel):
    title: str
    content: str
    image_url: Optional[str] = None
    is_published: bool = True


class PostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    image_url: Optional[str] = None
    is_published: Optional[bool] = None


class PostResponse(BaseModel):
    id: int
    title: str
    content: str
    image_url: Optional[str]
    is_published: bool
    created_at: datetime
    author_name: str
    likes_count: int

    class Config:
        from_attributes = True


class CommentCreate(BaseModel):
    comment_text: str


class CommentResponse(BaseModel):
    id: int
    post_id: int
    user_id: int
    user_name: str
    comment_text: str
    is_deleted: bool
    deleted_by_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True