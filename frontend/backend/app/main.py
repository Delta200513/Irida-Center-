from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import create_db_and_tables
from .routers import comments, posts, users
from .settings import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(title="Irida Detailing API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(posts.router)
app.include_router(comments.router)


@app.get("/")
def root():
    return {"message": "Irida Detailing API работает"}


@app.get("/health")
def healthcheck():
    return {"status": "ok"}
