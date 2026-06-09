from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str
    password_confirm: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool
    role: str
    has_oauth_account: bool = False
    needs_profile_completion: bool = False

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class UserProfileUpdate(BaseModel):
    first_name: str
    last_name: str
    phone: str


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


class ServiceRequestItemCreate(BaseModel):
    section: str
    service: str
    class_label: str
    price: str
    quantity: int = 1


class ServiceRequestCreate(BaseModel):
    items: list[ServiceRequestItemCreate]
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    comment: Optional[str] = None


class ServiceRequestItemResponse(BaseModel):
    id: int
    section: str
    service: str
    class_label: str
    price: str
    quantity: int


class ServiceRequestResponse(BaseModel):
    id: int
    user_id: Optional[int]
    customer_full_name: str
    customer_phone: str
    customer_email: Optional[EmailStr] = None
    status: str
    source: str
    comment: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    total_items: int
    items: list[ServiceRequestItemResponse]


class ServiceRequestStatusUpdate(BaseModel):
    status: str


class ServiceRequestAdminUpdate(BaseModel):
    customer_full_name: str
    customer_phone: str
    customer_email: Optional[EmailStr] = None
    status: str
    comment: Optional[str] = None
    items: list[ServiceRequestItemCreate]


class ContactRequestCreate(BaseModel):
    name: str
    phone: str
    message: Optional[str] = None
    source_page: Optional[str] = None


class ContactRequestResponse(BaseModel):
    id: int
    user_id: Optional[int]
    customer_name: str
    customer_phone: str
    customer_email: Optional[EmailStr] = None
    source_page: str
    message: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class ContactRequestStatusUpdate(BaseModel):
    status: str


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    service_request_id: Optional[int] = None
    headline: Optional[str] = None
    review_text: str
    service_label: Optional[str] = None


class ReviewStatusUpdate(BaseModel):
    status: str


class ReviewAdminReplyUpdate(BaseModel):
    admin_reply: str


class ReviewResponse(BaseModel):
    id: int
    user_id: int
    service_request_id: Optional[int] = None
    reviewer_name: str
    rating: int
    headline: Optional[str] = None
    review_text: str
    service_label: Optional[str] = None
    status: str
    is_verified: bool
    admin_reply: Optional[str] = None
    admin_reply_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ReviewSummaryBucket(BaseModel):
    rating: int
    count: int
    percentage: int


class ReviewSummaryResponse(BaseModel):
    average_rating: float
    total_reviews: int
    verified_reviews: int
    replies_count: int
    distribution: list[ReviewSummaryBucket]


class ReviewListResponse(BaseModel):
    summary: ReviewSummaryResponse
    items: list[ReviewResponse]
    page: int = 1
    page_size: int = 12
    total_items: int = 0
    total_pages: int = 0
