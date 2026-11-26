import hmac
import os
import secrets
import smtplib
import ssl
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from typing import Annotated
from uuid import UUID, uuid4

from email_validator import validate_email
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints, field_validator
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.orm import Session

from .database import database
from .passwords import password_key
from .schema import pending, users

router = APIRouter(prefix="/api/v1/auth")
DB = Annotated[Session, Depends(database)]
KEY = os.environ["VERIFICATION_HMAC_KEY"].encode()
if len(KEY) < 32:
    raise RuntimeError("VERIFICATION_HMAC_KEY requires at least 32 bytes")


def identifier_key(value):
    return value.strip().lower()


class Registration(BaseModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=64)]
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)]
    password: str = Field(min_length=8, max_length=256)

    @field_validator("email")
    @classmethod
    def plain_address(cls, value):
        validate_email(value, check_deliverability=False)
        return identifier_key(value)


class Challenge(BaseModel):
    requestId: UUID


class Verification(Challenge):
    code: str = Field(pattern=r"^[0-9]{4}$")


def check_identifiers(db, username, email=None):
    # Both the Admin CLI and verification acquire these locks before inserting.
    for identifier in sorted({username, email} - {None}):
        db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(identifier, 0))))
    for identifier, message in [(username, "Tên đăng nhập đã được sử dụng."),
                                (email, "Email đã được sử dụng.")]:
        if identifier and db.scalar(select(users.c.id).where(
                (users.c.username == identifier) | (users.c.email == identifier))):
            raise HTTPException(409, message)


def signature(request_id, email, code):
    return hmac.new(KEY, f"{request_id}:{email}:{code}".encode(), "sha256").hexdigest()


def send_email(email, code):
    message = EmailMessage()
    message["From"] = os.environ["SMTP_FROM"]
    message["To"] = email
    message["Subject"] = "Xác minh email NovelStudio"
    message.set_content(f"Mã xác nhận NovelStudio của bạn là {code}. Mã có hiệu lực trong 5 phút.")
    mode = os.environ["SMTP_SECURITY"]
    if mode not in {"ssl", "starttls", "plain"}:
        raise ValueError("Invalid SMTP security mode")
    host, port = os.environ["SMTP_HOST"], int(os.environ["SMTP_PORT"])
    context = ssl.create_default_context()
    connection = (smtplib.SMTP_SSL(host, port, timeout=8, context=context) if mode == "ssl"
                  else smtplib.SMTP(host, port, timeout=8))
    with connection as smtp:
        if mode == "starttls":
            smtp.starttls(context=context)
        if os.getenv("SMTP_USERNAME"):
            smtp.login(os.environ["SMTP_USERNAME"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(message)


def challenge_row(db, request_id):
    row = db.execute(select(pending).where(pending.c.request_id == str(request_id))
                     .with_for_update()).mappings().first()
    if not row:
        raise HTTPException(400, "Yêu cầu không còn hiệu lực hoặc mã đã dùng.")
    return row


def issue(db, email, previous, data=None):
    now = datetime.now(UTC)
    if previous and now - previous["sent_at"] < timedelta(seconds=60):
        raise HTTPException(429, "Vui lòng chờ 60 giây giữa hai lần gửi.")
    attempts, start = 0, now
    if previous and now - previous["window_start"] < timedelta(minutes=15):
        attempts, start = previous["attempts"], previous["window_start"]
        if attempts >= 5:
            raise HTTPException(429, "Đã hết lượt thử. Vui lòng thử lại sau 15 phút.")
    request_id = str(uuid4()) if data else previous["request_id"]
    code = f"{secrets.randbelow(10000):04d}"
    while previous and signature(previous["request_id"], email, code) == previous["code_hash"]:
        code = f"{secrets.randbelow(10000):04d}"
    values = dict(request_id=request_id, code_hash=signature(request_id, email, code),
                  sent_at=now, expires_at=now + timedelta(minutes=5), attempts=attempts, window_start=start)
    if data:
        salt = secrets.token_hex(16)
        values.update(username=data.username, password_hash=salt + "$" + password_key(data.password, salt))
    try:
        send_email(email, code)
        delivered = True
    except (OSError, ValueError, smtplib.SMTPException):
        delivered = False
        # Count the SMTP attempt, including a lost acknowledgement. A prior challenge
        # keeps its original credentials, code and expiry until a send succeeds.
        if previous:
            values = {"sent_at": now}
        else:
            values.update(expires_at=now, code_hash="")
    if previous:
        db.execute(update(pending).where(pending.c.email == email).values(**values))
    else:
        db.execute(insert(pending).values(email=email, **values))
    db.commit()
    if not delivered:
        raise HTTPException(503, "Không gửi được email xác nhận. Vui lòng thử lại sau 60 giây.")
    return {"requestId": request_id}


@router.post("/register", status_code=202)
def register(data: Registration, db: DB):
    email = data.email
    check_identifiers(db, identifier_key(data.username), email)
    previous = db.execute(select(pending).where(pending.c.email == email).with_for_update()).mappings().first()
    return issue(db, email, previous, data)


@router.post("/register/resend")
def resend(data: Challenge, db: DB):
    row = challenge_row(db, data.requestId)
    return issue(db, row["email"], row)


@router.post("/register/verify", status_code=201)
def verify(data: Verification, db: DB):
    # Acquire identifier locks in the same order as registration before locking the challenge.
    keys = db.execute(select(pending.c.username, pending.c.email).where(
        pending.c.request_id == str(data.requestId))).first()
    if not keys:
        raise HTTPException(400, "Yêu cầu không còn hiệu lực hoặc mã đã dùng.")
    check_identifiers(db, identifier_key(keys.username), keys.email)
    row = challenge_row(db, data.requestId)
    if row["expires_at"] <= datetime.now(UTC):
        raise HTTPException(400, "Mã đã hết hạn.")
    if row["attempts"] >= 5:
        raise HTTPException(429, "Đã hết lượt thử.")
    if not hmac.compare_digest(row["code_hash"], signature(row["request_id"], row["email"], data.code)):
        db.execute(update(pending).where(pending.c.email == row["email"]).values(attempts=row["attempts"] + 1))
        db.commit()
        raise HTTPException(400, "Mã xác nhận không đúng.")
    db.execute(insert(users).values(id=str(uuid4()), username=identifier_key(row["username"]), email=row["email"],
                                    display_name=row["username"], password_hash=row["password_hash"], role="Author"))
    db.execute(delete(pending).where(pending.c.email == row["email"]))
    db.commit()
    return {"username": row["username"]}
