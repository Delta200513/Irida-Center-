import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .logging_config import configure_logging
from .routers import comments, contact_requests, posts, reviews, service_requests, users
from .settings import get_settings

configure_logging()

logger = logging.getLogger(__name__)
settings = get_settings()
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Irida Detailing API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.include_router(users.router)
app.include_router(posts.router)
app.include_router(comments.router)
app.include_router(reviews.router)
app.include_router(service_requests.router)
app.include_router(contact_requests.router)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started_at = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        logger.exception(
            "Unhandled request error: %s %s in %sms",
            request.method,
            request.url.path,
            duration_ms,
        )
        raise

    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    level = logging.INFO
    if response.status_code >= 500:
        level = logging.ERROR
    elif response.status_code >= 400:
        level = logging.WARNING

    logger.log(
        level,
        "%s %s -> %s in %sms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, error: Exception):
    logger.exception("Unhandled application exception", exc_info=error)
    return JSONResponse(
        status_code=500,
        content={"detail": "Внутренняя ошибка сервера."},
    )


@app.get("/")
def root():
    return {"message": "Irida Detailing API работает"}


@app.get("/health")
def healthcheck():
    return {"status": "ok"}
