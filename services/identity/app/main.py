import hashlib
import hmac
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import DataError, OperationalError
from sqlalchemy.orm import Session

from .database import database
from .schema_v1 import sessions, users

app = FastAPI(title="NovelStudio Identity", docs_url=None, redoc_url=None)
DB = Annotated[Session, Depends(database)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=64)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
COOKIE = "novelstudio_session"
SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
PREFIX = "/api/v1/auth"


class Credentials(BaseModel):
    username: Name
    password: str = Field(min_length=8, max_length=256)


class Profile(BaseModel):
    displayName: DisplayName


@app.exception_handler(OperationalError)
async def database_unavailable(request, error):
    return JSONResponse({"detail": "Cơ sở dữ liệu tạm thời chưa sẵn sàng."}, status_code=503)


@app.exception_handler(DataError)
async def invalid_database_value(request, error):
    return JSONResponse({"detail": "Giá trị không hợp lệ trong dữ liệu gửi lên."}, status_code=422)


@app.exception_handler(RequestValidationError)
async def invalid_input(request, error):
    return JSONResponse({"detail": "Kiểm tra tên đăng nhập, mật khẩu và bút danh."}, status_code=422)


@app.middleware("http")
async def csrf(request, call_next):
    # Cross-origin pages cannot set this header. Neither service enables CORS.
    if request.method not in {"GET", "HEAD", "OPTIONS"} and request.headers.get("X-NovelStudio") != "1":
        return JSONResponse({"detail": "Thiếu xác nhận yêu cầu."}, status_code=403)
    return await call_next(request)


def password_key(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**15, r=8, p=1,
                          maxmem=64 * 1024 * 1024).hex()


def create_user(db, data, role):
    salt = secrets.token_hex(16)
    record = dict(id=str(uuid4()), username=data.username.lower(), display_name=data.username,
                  password_hash=salt + "$" + password_key(data.password, salt), role=role)
    try:
        db.execute(insert(users).values(**record))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Tên đăng nhập đã được sử dụng.")
    return public_user(record)


def public_user(row):
    return {"id": row["id"], "username": row["username"],
            "displayName": row["display_name"], "role": row["role"]}


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current(request: Request, db: DB):
    row = db.execute(select(users).join(sessions).where(
        sessions.c.digest == digest(request.cookies.get(COOKIE, "")),
        sessions.c.expires_at > func.now(),
    )).mappings().first()
    if not row:
        raise HTTPException(401, "Vui lòng đăng nhập.")
    return public_user(row)


User = Annotated[dict, Depends(current)]


@app.get("/health")
def health(db: DB):
    db.execute(select(users.c.id).limit(0))
    return {"status": "ok"}


@app.post(PREFIX + "/register", status_code=201)
def register(data: Credentials, db: DB):
    return create_user(db, data, "Author")


@app.post(PREFIX + "/login")
def login(data: Credentials, request: Request, response: Response, db: DB):
    row = db.execute(select(users).where(users.c.username == data.username.lower())).mappings().first()
    salt, expected = row["password_hash"].split("$") if row else ("00" * 16, "")
    if not hmac.compare_digest(password_key(data.password, salt), expected):
        raise HTTPException(401, "Sai tên đăng nhập hoặc mật khẩu.")
    token = secrets.token_urlsafe(32)
    db.execute(delete(sessions).where(
        (sessions.c.expires_at <= func.now()) |
        (sessions.c.digest == digest(request.cookies.get(COOKIE, "")))))
    db.execute(insert(sessions).values(digest=digest(token), user_id=row["id"],
                                       expires_at=datetime.now(UTC) + timedelta(days=7)))
    db.commit()
    response.set_cookie(COOKIE, token, httponly=True, secure=SECURE, samesite="lax", max_age=604800)
    return public_user(row)


@app.post(PREFIX + "/logout")
def logout(request: Request, response: Response, db: DB):
    db.execute(delete(sessions).where(sessions.c.digest == digest(request.cookies.get(COOKIE, ""))))
    db.commit()
    response.delete_cookie(COOKIE, httponly=True, secure=SECURE, samesite="lax")
    return {"ok": True}


@app.get("/internal/session")
@app.get(PREFIX + "/me")
def profile(user: User):
    return user


@app.patch(PREFIX + "/me")
def edit_profile(data: Profile, user: User, db: DB):
    db.execute(update(users).where(users.c.id == user["id"]).values(display_name=data.displayName))
    db.commit()
    return {**user, "displayName": data.displayName}


@app.get(PREFIX + "/users")
def list_users(user: User, db: DB):
    if user["role"] != "Admin":
        raise HTTPException(403, "Chỉ quản trị viên được xem danh sách tài khoản.")
    return [public_user(row) for row in db.execute(select(users).order_by(users.c.username)).mappings()]
