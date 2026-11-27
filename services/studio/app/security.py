import json
import os
from http.client import HTTPException as ConnectionErrorHTTP
from urllib.error import HTTPError, URLError
from urllib.request import Request as InternalRequest, urlopen
from uuid import UUID

from fastapi import HTTPException, Request

IDENTITY = os.getenv("IDENTITY_URL", "http://identity:8000") + "/internal/session"


def _valid_token(request: Request) -> str:
    token = request.cookies.get("novelstudio_session", "")
    if not token or not token.isascii() or not all(c.isalnum() or c in "-_" for c in token):
        return ""
    return token


def _fetch_session(token: str) -> dict:
    query = InternalRequest(IDENTITY, headers={"Cookie": "novelstudio_session=" + token})
    with urlopen(query, timeout=3) as response:
        session = json.load(response)
        if session["role"] not in {"Author", "Admin"}:
            raise ValueError("role")
        return {
            "id": str(UUID(session["id"])),
            "username": str(session["username"]),
            "displayName": str(session["displayName"]),
            "role": str(session["role"]),
        }


def current_user(request: Request) -> dict:
    if request.method not in {"GET", "HEAD", "OPTIONS"} and request.headers.get("X-NovelStudio") != "1":
        raise HTTPException(403, "Thiếu xác nhận yêu cầu.")
    token = _valid_token(request)
    if not token:
        raise HTTPException(401, "Vui lòng đăng nhập.")
    try:
        return _fetch_session(token)
    except HTTPError as error:
        if error.code == 401:
            raise HTTPException(401, "Phiên đã kết thúc. Vui lòng đăng nhập.")
    except (URLError, OSError, ConnectionErrorHTTP, ValueError, TypeError, KeyError):
        pass
    raise HTTPException(503, "Chưa xác minh được phiên. Vui lòng thử lại.")


def owner(request: Request) -> str:
    return current_user(request)["id"]


def optional_user(request: Request) -> dict | None:
    token = _valid_token(request)
    if not token:
        return None
    try:
        return _fetch_session(token)
    except (HTTPError, URLError, OSError, ConnectionErrorHTTP, ValueError, TypeError, KeyError):
        return None
