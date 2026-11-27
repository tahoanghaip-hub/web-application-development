import hashlib
import json
import os
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request as InternalRequest, urlopen
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import case, delete, func, insert, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import DataError, IntegrityError, OperationalError
from sqlalchemy.orm import Session

from .contracts import ChapterData, CommentCreate, Draft, NovelData, SavedNovel
from .database import database
from .schema import chapters, comments, imports, novels, versions
from .security import current_user, optional_user, owner

app = FastAPI(title="NovelStudio Studio", docs_url=None, redoc_url=None)
api = APIRouter(prefix="/api/v1/studio")
DB = Annotated[Session, Depends(database)]
Owner = Annotated[str, Depends(owner)]
CurrentUser = Annotated[dict, Depends(current_user)]
OptionalUser = Annotated[dict | None, Depends(optional_user)]
CHAPTER = "/novels/{nid}/chapters/{cid}"
VERSION = CHAPTER + "/versions/{vid}"
IDENTITY_NAMES_URL = os.getenv("IDENTITY_URL", "http://identity:8000") + "/internal/display-names"
COMMENT_MAX_LENGTH = 1000
COMMENT_RATE_LIMIT = int(os.getenv("COMMENT_RATE_LIMIT", "5"))
COMMENT_RATE_WINDOW_SECONDS = int(os.getenv("COMMENT_RATE_WINDOW_SECONDS", "60"))


@app.exception_handler(OperationalError)
async def database_unavailable(request, error):
    return JSONResponse({"detail": "Cơ sở dữ liệu tạm thời chưa sẵn sàng."}, status_code=503)


@app.exception_handler(DataError)
async def invalid_database_value(request, error):
    return JSONResponse({"detail": "Giá trị không hợp lệ trong dữ liệu gửi lên."}, status_code=422)


@app.exception_handler(RequestValidationError)
async def invalid_input(request, error):
    field = ".".join(map(str, error.errors()[0]["loc"]))
    return JSONResponse({"detail": "Dữ liệu không hợp lệ ở " + field}, status_code=422)


@app.get("/health")
def health(db: DB):
    db.execute(select(versions.c.id).limit(0))
    return {"status": "ok"}


def owned(db, uid, nid, lock=False):
    query = select(novels).where(novels.c.owner_id == uid, novels.c.id == nid)
    row = db.execute(query.with_for_update() if lock else query).mappings().first()
    if not row:
        raise HTTPException(404, "Không tìm thấy tác phẩm.")
    return row


def check_chapter(db, uid, nid, cid):
    owned(db, uid, nid, lock=True)
    row = db.execute(
        select(chapters.c.id)
        .where(chapters.c.id == cid, chapters.c.novel_id == nid)
        .with_for_update()
    ).first()
    if row is None:
        raise HTTPException(404, "Không tìm thấy chương.")


def novel_json(row):
    return {
        key: row[key]
        for key in ("id", "title", "description", "deadline", "status", "priority", "visibility")
    } | {"createdAt": row["created_at"]}


def public_novel_json(row, chapter_count: int | None = None):
    data = {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "createdAt": row["created_at"],
    }
    if chapter_count is not None:
        data["chapterCount"] = int(chapter_count)
    return data


def version_json(row):
    return {
        "versionId": str(row["id"]),
        "content": row["content"],
        "timestamp": row["timestamp"],
        "commitMessage": row["message"],
        "published": row["published"],
    }


def _published_chapter_count_subquery():
    return (
        select(func.count(func.distinct(chapters.c.id)))
        .select_from(chapters.join(versions, versions.c.chapter_id == chapters.c.id))
        .where(chapters.c.novel_id == novels.c.id, versions.c.published.is_(True))
        .scalar_subquery()
    )


def tree(db, rows):
    books = {
        row["id"]: {**novel_json(row), "publishedChapterCount": 0, "chapters": []}
        for row in rows
    }
    if not books:
        return []
    query = select(chapters).where(chapters.c.novel_id.in_(books))
    by_chapter = {}
    for row in db.execute(query.order_by(chapters.c.id)).mappings():
        chapter = {
            "chapterId": str(row["id"]),
            "chapterTitle": row["title"],
            "status": "Draft",
            "hasPublishedVersion": False,
            "publishedVersionId": None,
            "effectivelyPublic": False,
            "versions": [],
        }
        by_chapter[row["id"]] = (row["novel_id"], chapter)
        books[row["novel_id"]]["chapters"].append(chapter)
    if by_chapter:
        query = select(versions).where(versions.c.chapter_id.in_(by_chapter))
        for row in db.execute(query.order_by(versions.c.id.desc())).mappings():
            novel_id, chapter = by_chapter[row["chapter_id"]]
            if row["published"]:
                chapter["status"] = "Published"
                chapter["hasPublishedVersion"] = True
                chapter["publishedVersionId"] = str(row["id"])
                chapter["effectivelyPublic"] = books[novel_id]["visibility"] == "Public"
                books[novel_id]["publishedChapterCount"] += 1
            chapter["versions"].append(version_json(row))
    return list(books.values())


@api.get("/public")
def public_library(db: DB):
    latest_pub = (
        select(func.max(versions.c.published_at))
        .select_from(chapters.join(versions, versions.c.chapter_id == chapters.c.id))
        .where(chapters.c.novel_id == novels.c.id, versions.c.published.is_(True))
        .scalar_subquery()
    )
    novel_rows = db.execute(
        select(novels)
        .where(novels.c.visibility == "Public")
        .order_by(latest_pub.desc().nullslast(), novels.c.created_at.desc(), novels.c.id)
    ).mappings().all()
    if not novel_rows:
        return []
    books = {row["id"]: {**public_novel_json(row), "chapters": []} for row in novel_rows}
    chapter_rows = db.execute(
        select(
            chapters.c.novel_id,
            chapters.c.id.label("chapter_id"),
            chapters.c.title.label("chapter_title"),
            versions.c.id.label("version_id"),
            versions.c.content,
            versions.c.timestamp,
            versions.c.public_metadata,
        )
        .select_from(versions.join(chapters, versions.c.chapter_id == chapters.c.id))
        .where(chapters.c.novel_id.in_(books), versions.c.published.is_(True))
        .order_by(chapters.c.id)
    ).mappings()
    for row in chapter_rows:
        meta = row["public_metadata"] or {}
        chapter_title = meta.get("chapterTitle") or row["chapter_title"]
        books[row["novel_id"]]["chapters"].append({
            "chapterId": str(row["chapter_id"]),
            "chapterTitle": chapter_title,
            "versions": [{
                "versionId": str(row["version_id"]),
                "content": row["content"],
                "timestamp": row["timestamp"],
            }],
        })
    return list(books.values())


@api.get("/public/novels")
def public_novels(db: DB, keyword: str = ""):
    pub_count = _published_chapter_count_subquery()
    latest_pub = (
        select(func.max(versions.c.published_at))
        .select_from(chapters.join(versions, versions.c.chapter_id == chapters.c.id))
        .where(chapters.c.novel_id == novels.c.id, versions.c.published.is_(True))
        .scalar_subquery()
    )
    conditions = [novels.c.visibility == "Public"]
    kw = keyword.strip()
    if kw:
        conditions.append(
            or_(
                novels.c.title.icontains(kw, autoescape=True),
                novels.c.description.icontains(kw, autoescape=True),
            )
        )
    rows = db.execute(
        select(novels, pub_count.label("chapterCount"))
        .where(*conditions)
        .order_by(latest_pub.desc().nullslast(), novels.c.created_at.desc(), novels.c.id)
    ).mappings()
    return [public_novel_json(r, r["chapterCount"]) for r in rows]


@api.get("/public/discover")
def public_discover(db: DB, limit: int = Query(12, ge=1, le=12)):
    pub_count = _published_chapter_count_subquery()
    total_public = db.scalar(select(func.count()).select_from(novels).where(novels.c.visibility == "Public")) or 0
    rows = db.execute(
        select(novels, pub_count.label("chapterCount"))
        .where(novels.c.visibility == "Public")
        .order_by(func.random())
        .limit(limit)
    ).mappings()
    return {
        "items": [public_novel_json(r, r["chapterCount"]) for r in rows],
        "totalPublic": int(total_public),
    }


@api.get("/public/search")
def public_search(
    db: DB,
    keyword: str = "",
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=24),
):
    conditions = [novels.c.visibility == "Public"]
    kw = keyword.strip()
    if kw:
        conditions.append(
            or_(
                novels.c.title.icontains(kw, autoescape=True),
                novels.c.description.icontains(kw, autoescape=True),
            )
        )
    total = int(db.scalar(select(func.count()).select_from(novels).where(*conditions)) or 0)
    pub_count = _published_chapter_count_subquery()
    rows = db.execute(
        select(novels, pub_count.label("chapterCount"))
        .where(*conditions)
        .order_by(novels.c.created_at.desc(), novels.c.id)
        .limit(size)
        .offset((page - 1) * size)
    ).mappings()
    return {
        "items": [public_novel_json(r, r["chapterCount"]) for r in rows],
        "total": total,
        "page": page,
        "size": size,
        "hasMore": page * size < total,
    }


@api.get("/public/novels/{nid}")
def public_novel_detail(nid: str, db: DB, chapter: str | None = None, includeDefault: bool = False):
    novel_row = db.execute(
        select(novels).where(novels.c.id == nid, novels.c.visibility == "Public")
    ).mappings().first()
    if not novel_row:
        raise HTTPException(404, "Không tìm thấy tác phẩm công khai.")

    char_count_expr = func.char_length(versions.c.content).label("char_count")
    word_count_expr = case(
        (func.btrim(versions.c.content) == "", 0),
        else_=func.cardinality(func.regexp_split_to_array(func.btrim(versions.c.content), r"\s+")),
    ).label("word_count")
    rows = db.execute(
        select(
            versions.c.public_metadata,
            chapters.c.title.label("chapter_title"),
            versions.c.chapter_id,
            versions.c.id,
            versions.c.timestamp,
            char_count_expr,
            word_count_expr,
        )
        .select_from(versions.join(chapters, versions.c.chapter_id == chapters.c.id))
        .where(chapters.c.novel_id == nid, versions.c.published.is_(True))
        .order_by(chapters.c.id)
    ).all()

    book = {**public_novel_json(novel_row, chapter_count=len(rows)), "chapters": []}
    for meta, fallback_title, cid, vid, timestamp, char_count, word_count in rows:
        chapter_title = (meta or {}).get("chapterTitle") or fallback_title
        book["chapters"].append({
            "chapterId": str(cid),
            "chapterTitle": chapter_title,
            "versionId": str(vid),
            "timestamp": timestamp,
            "wordCount": int(word_count or 0),
            "charCount": int(char_count or 0),
        })

    if chapter is not None or includeDefault:
        if chapter is not None:
            target = next((c for c in book["chapters"] if c["chapterId"] == chapter), None)
        else:
            target = book["chapters"][0] if book["chapters"] else None
        if target is None:
            book["activeChapter"] = None
        else:
            content = db.scalar(
                select(versions.c.content).where(
                    versions.c.id == int(target["versionId"]),
                    versions.c.published.is_(True),
                )
            )
            book["activeChapter"] = {
                "chapterId": target["chapterId"],
                "chapterTitle": target["chapterTitle"],
                "versionId": target["versionId"],
                "timestamp": target["timestamp"],
                "content": content,
            }
    return book


@api.get("/public/novels/{nid}/chapters/{cid}")
def public_chapter_detail(nid: str, cid: int, db: DB):
    row = db.execute(
        select(
            versions.c.id,
            versions.c.chapter_id,
            versions.c.public_metadata,
            chapters.c.title.label("chapter_title"),
            versions.c.content,
            versions.c.timestamp,
        )
        .select_from(
            versions.join(chapters, versions.c.chapter_id == chapters.c.id).join(
                novels, chapters.c.novel_id == novels.c.id
            )
        )
        .where(
            novels.c.id == nid,
            novels.c.visibility == "Public",
            versions.c.chapter_id == cid,
            versions.c.published.is_(True),
        )
    ).mappings().first()
    if not row:
        raise HTTPException(404, "Không tìm thấy chương công khai.")
    meta = row["public_metadata"] or {}
    return {
        "chapterId": str(row["chapter_id"]),
        "chapterTitle": meta.get("chapterTitle") or row["chapter_title"],
        "versionId": str(row["id"]),
        "timestamp": row["timestamp"],
        "content": row["content"],
    }


def resolve_display_names(author_ids: set[str]) -> dict[str, str]:
    ids = [uid for uid in author_ids if uid]
    if not ids:
        return {}
    req = InternalRequest(
        IDENTITY_NAMES_URL,
        data=json.dumps({"ids": ids[:200]}).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "X-NovelStudio": "1"},
    )
    try:
        with urlopen(req, timeout=2) as response:
            data = json.load(response)
            if isinstance(data, dict):
                return {str(k): str(v) for k, v in data.items()}
    except (HTTPError, URLError, OSError, ValueError, TypeError):
        pass
    return {}


def require_public_chapter(db: Session, nid: str, cid: int, lock_share: bool = False):
    ch_query = (
        select(chapters.c.id)
        .select_from(chapters.join(novels, chapters.c.novel_id == novels.c.id))
        .where(
            novels.c.id == nid,
            novels.c.visibility == "Public",
            chapters.c.id == cid,
        )
    )
    if lock_share:
        ch_query = ch_query.with_for_update(read=True)
    if db.execute(ch_query).first() is None:
        raise HTTPException(404, "Không tìm thấy chương công khai.")

    pub_query = select(versions.c.id).where(versions.c.chapter_id == cid, versions.c.published.is_(True))
    if lock_share:
        pub_query = pub_query.with_for_update(read=True)
    if db.execute(pub_query).first() is None:
        raise HTTPException(404, "Không tìm thấy chương công khai.")


def serialize_comment(
    row,
    viewer_id: str | None,
    display_names: dict[str, str],
    replies: list | None = None,
    reply_count: int = 0,
    replies_has_more: bool = False,
):
    is_deleted = row["deleted_at"] is not None
    data = {
        "id": row["id"],
        "chapterId": str(row["chapter_id"]),
        "parentId": row["parent_id"],
        "authorDisplayName": None if is_deleted else display_names.get(row["author_id"], row["author_display_name"]),
        "content": "" if is_deleted else row["content"],
        "createdAt": row["created_at"],
        "deleted": is_deleted,
        "canDelete": bool(viewer_id and viewer_id == row["author_id"] and not is_deleted),
    }
    if row["parent_id"] is None:
        data["replyCount"] = int(reply_count)
        data["replies"] = replies if replies is not None else []
        data["repliesHasMore"] = bool(replies_has_more)
    return data


@api.get("/public/novels/{nid}/chapters/{cid}/comments")
def list_chapter_comments(
    nid: str,
    cid: int,
    db: DB,
    viewer: OptionalUser,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=30),
    replySize: int = Query(3, ge=0, le=10),
):
    require_public_chapter(db, nid, cid)
    viewer_id = viewer["id"] if viewer else None
    total = int(
        db.scalar(
            select(func.count())
            .select_from(comments)
            .where(comments.c.chapter_id == cid, comments.c.parent_id.is_(None))
        )
        or 0
    )
    parents = (
        db.execute(
            select(comments)
            .where(comments.c.chapter_id == cid, comments.c.parent_id.is_(None))
            .order_by(comments.c.created_at.desc(), comments.c.id.desc())
            .limit(size)
            .offset((page - 1) * size)
        )
        .mappings()
        .all()
    )
    parent_ids = [p["id"] for p in parents]
    reply_counts: dict[int, int] = {}
    replies_by_parent: dict[int, list] = {pid: [] for pid in parent_ids}
    author_ids = {p["author_id"] for p in parents if p["deleted_at"] is None}

    if parent_ids:
        for pid, cnt in db.execute(
            select(comments.c.parent_id, func.count())
            .where(comments.c.parent_id.in_(parent_ids))
            .group_by(comments.c.parent_id)
        ):
            reply_counts[pid] = int(cnt)
        if replySize > 0:
            ranked = (
                select(
                    comments,
                    func.row_number()
                    .over(partition_by=comments.c.parent_id, order_by=(comments.c.created_at.asc(), comments.c.id.asc()))
                    .label("rn"),
                )
                .where(comments.c.parent_id.in_(parent_ids))
                .subquery()
            )
            reply_rows = db.execute(
                select(ranked).where(ranked.c.rn <= replySize).order_by(ranked.c.created_at.asc(), ranked.c.id.asc())
            ).mappings()
            for r in reply_rows:
                replies_by_parent[r["parent_id"]].append(r)
                if r["deleted_at"] is None:
                    author_ids.add(r["author_id"])

    display_names = resolve_display_names(author_ids)
    items = []
    for p in parents:
        pid = p["id"]
        rcount = reply_counts.get(pid, 0)
        raw_replies = replies_by_parent.get(pid, [])
        serialized_replies = [serialize_comment(r, viewer_id, display_names) for r in raw_replies]
        items.append(
            serialize_comment(
                p,
                viewer_id,
                display_names,
                replies=serialized_replies,
                reply_count=rcount,
                replies_has_more=len(serialized_replies) < rcount,
            )
        )
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "hasMore": page * size < total,
    }


@api.get("/public/novels/{nid}/chapters/{cid}/comments/{comment_id}/replies")
def list_comment_replies(
    nid: str,
    cid: int,
    comment_id: int,
    db: DB,
    viewer: OptionalUser,
    page: int = Query(1, ge=1),
    size: int = Query(5, ge=1, le=20),
):
    require_public_chapter(db, nid, cid)
    parent = (
        db.execute(
            select(comments.c.id).where(
                comments.c.id == comment_id,
                comments.c.chapter_id == cid,
                comments.c.parent_id.is_(None),
            )
        ).first()
    )
    if parent is None:
        raise HTTPException(404, "Không tìm thấy bình luận.")

    viewer_id = viewer["id"] if viewer else None
    total = int(
        db.scalar(select(func.count()).select_from(comments).where(comments.c.parent_id == comment_id)) or 0
    )
    rows = (
        db.execute(
            select(comments)
            .where(comments.c.parent_id == comment_id)
            .order_by(comments.c.created_at.asc(), comments.c.id.asc())
            .limit(size)
            .offset((page - 1) * size)
        )
        .mappings()
        .all()
    )
    display_names = resolve_display_names({r["author_id"] for r in rows if r["deleted_at"] is None})
    return {
        "items": [serialize_comment(r, viewer_id, display_names) for r in rows],
        "total": total,
        "page": page,
        "size": size,
        "hasMore": page * size < total,
    }


@api.post("/public/novels/{nid}/chapters/{cid}/comments", status_code=201)
def create_chapter_comment(
    nid: str,
    cid: int,
    data: CommentCreate,
    user: CurrentUser,
    db: DB,
):
    clean_content = data.content.strip()
    if not clean_content:
        raise HTTPException(422, "Nội dung bình luận không được để trống.")
    if len(clean_content) > COMMENT_MAX_LENGTH:
        raise HTTPException(422, f"Bình luận tối đa {COMMENT_MAX_LENGTH} ký tự.")

    require_public_chapter(db, nid, cid, lock_share=True)
    request_id = str(data.requestId) if data.requestId else None

    if request_id:
        existing = (
            db.execute(
                select(comments).where(
                    comments.c.chapter_id == cid,
                    comments.c.author_id == user["id"],
                    comments.c.request_id == request_id,
                )
            )
            .mappings()
            .first()
        )
        if existing:
            if existing["parent_id"] != data.parentId or (
                existing["deleted_at"] is None and existing["content"] != clean_content
            ):
                raise HTTPException(409, "Mã gửi bình luận đã được dùng cho nội dung khác.")
            names = {user["id"]: user["displayName"]}
            return serialize_comment(existing, user["id"], names)

    if data.parentId is not None:
        parent = (
            db.execute(
                select(comments)
                .where(comments.c.id == data.parentId)
                .with_for_update(read=True)
            )
            .mappings()
            .first()
        )
        if not parent:
            raise HTTPException(404, "Không tìm thấy bình luận cha.")
        if parent["chapter_id"] != cid:
            raise HTTPException(422, "Bình luận cha không thuộc chương này.")
        if parent["parent_id"] is not None:
            raise HTTPException(422, "Chỉ hỗ trợ trả lời một cấp.")
        if parent["deleted_at"] is not None:
            raise HTTPException(409, "Bình luận cha đã bị xóa.")

    window_start = datetime.now(UTC) - timedelta(seconds=COMMENT_RATE_WINDOW_SECONDS)
    recent_count = int(
        db.scalar(
            select(func.count())
            .select_from(comments)
            .where(comments.c.author_id == user["id"], comments.c.created_at >= window_start)
        )
        or 0
    )
    if recent_count >= COMMENT_RATE_LIMIT:
        raise HTTPException(429, "Bạn gửi bình luận quá nhanh. Vui lòng thử lại sau ít phút.")

    try:
        row = (
            db.execute(
                insert(comments)
                .values(
                    chapter_id=cid,
                    parent_id=data.parentId,
                    author_id=user["id"],
                    author_display_name=user["displayName"],
                    content=clean_content,
                    created_at=datetime.now(UTC),
                    request_id=request_id,
                )
                .returning(comments)
            )
            .mappings()
            .one()
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        if request_id:
            existing = (
                db.execute(
                    select(comments).where(
                        comments.c.chapter_id == cid,
                        comments.c.author_id == user["id"],
                        comments.c.request_id == request_id,
                    )
                )
                .mappings()
                .first()
            )
            if existing:
                if existing["parent_id"] != data.parentId or (
                    existing["deleted_at"] is None and existing["content"] != clean_content
                ):
                    raise HTTPException(409, "Mã gửi bình luận đã được dùng cho nội dung khác.")
                return serialize_comment(existing, user["id"], {user["id"]: user["displayName"]})
        raise HTTPException(409, "Không thể gửi bình luận. Vui lòng thử lại.")

    return serialize_comment(row, user["id"], {user["id"]: user["displayName"]})


@api.delete("/public/novels/{nid}/chapters/{cid}/comments/{comment_id}")
def delete_chapter_comment(
    nid: str,
    cid: int,
    comment_id: int,
    user: CurrentUser,
    db: DB,
):
    require_public_chapter(db, nid, cid, lock_share=True)
    comment = (
        db.execute(
            select(comments)
            .where(comments.c.id == comment_id, comments.c.chapter_id == cid)
            .with_for_update()
        )
        .mappings()
        .first()
    )
    if not comment:
        raise HTTPException(404, "Không tìm thấy bình luận.")
    if comment["author_id"] != user["id"]:
        raise HTTPException(403, "Bạn chỉ có thể xóa bình luận của mình.")
    if comment["deleted_at"] is not None:
        return {"ok": True, "softDeleted": True}

    if comment["parent_id"] is None:
        reply_count = int(
            db.scalar(select(func.count()).select_from(comments).where(comments.c.parent_id == comment_id)) or 0
        )
        if reply_count > 0:
            db.execute(
                update(comments)
                .where(comments.c.id == comment_id)
                .values(deleted_at=datetime.now(UTC), content="")
            )
            db.commit()
            return {"ok": True, "softDeleted": True}
        db.execute(delete(comments).where(comments.c.id == comment_id))
        db.commit()
        return {"ok": True, "softDeleted": False}

    parent_id = comment["parent_id"]
    db.execute(delete(comments).where(comments.c.id == comment_id))
    remaining = int(
        db.scalar(select(func.count()).select_from(comments).where(comments.c.parent_id == parent_id)) or 0
    )
    if remaining == 0:
        db.execute(
            delete(comments).where(comments.c.id == parent_id, comments.c.deleted_at.is_not(None))
        )
    db.commit()
    return {"ok": True, "softDeleted": False}


@api.get("/novels")
def library(
    uid: Owner,
    db: DB,
    keyword: str = "",
    status: Literal["All", "Pending", "Done"] = "All",
    priority: Literal["All", "High", "Medium", "Low"] = "All",
    sortBy: Literal["created-desc", "deadline-asc", "deadline-desc", "title-asc"] = "created-desc",
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
):
    conditions = [novels.c.owner_id == uid]
    if keyword.strip():
        conditions.append(
            or_(
                novels.c.title.icontains(keyword.strip(), autoescape=True),
                novels.c.description.icontains(keyword.strip(), autoescape=True),
            )
        )
    for col, value in [(novels.c.status, status), (novels.c.priority, priority)]:
        if value != "All":
            conditions.append(col == value)
    total = db.scalar(select(func.count()).select_from(novels).where(*conditions))
    order = {
        "created-desc": novels.c.created_at.desc(),
        "deadline-asc": novels.c.deadline,
        "deadline-desc": novels.c.deadline.desc(),
        "title-asc": novels.c.title,
    }[sortBy]
    count = select(func.count(chapters.c.id)).where(chapters.c.novel_id == novels.c.id).scalar_subquery()
    pub_count = _published_chapter_count_subquery()
    query = (
        select(novels, count.label("chapterCount"), pub_count.label("publishedChapterCount"))
        .where(*conditions)
        .order_by(order, novels.c.id)
    )
    rows = db.execute(query.limit(size).offset((page - 1) * size)).mappings()
    return {
        "items": [
            novel_json(r)
            | {
                "chapterCount": r["chapterCount"],
                "publishedChapterCount": int(r["publishedChapterCount"] or 0),
            }
            for r in rows
        ],
        "total": total,
    }


@api.get("/novels/{nid}")
def detail(nid: str, uid: Owner, db: DB):
    return tree(db, [owned(db, uid, nid)])[0]


@api.post("/novels", status_code=201)
def create(data: NovelData, uid: Owner, db: DB):
    if data.deadline < date.today():
        raise HTTPException(422, "Hạn hoàn thành đã qua.")
    values = data.model_dump(exclude={"visibility"})
    values["visibility"] = data.visibility or "Private"
    row = (
        db.execute(
            insert(novels)
            .values(id=str(uuid4()), owner_id=uid, created_at=datetime.now(UTC), **values)
            .returning(novels)
        )
        .mappings()
        .one()
    )
    db.commit()
    return novel_json(row)


@api.put("/novels/{nid}")
def edit(nid: str, data: NovelData, uid: Owner, db: DB):
    old = owned(db, uid, nid, lock=True)
    if old["deadline"] != data.deadline and data.deadline < date.today():
        raise HTTPException(422, "Hạn hoàn thành đã qua.")
    values = data.model_dump(exclude={"visibility"})
    if data.visibility is not None:
        values["visibility"] = data.visibility
    row = (
        db.execute(update(novels).where(novels.c.id == nid).values(**values).returning(novels))
        .mappings()
        .one()
    )
    db.commit()
    return novel_json(row)


@api.delete("/novels/{nid}")
def remove(nid: str, uid: Owner, db: DB):
    owned(db, uid, nid, lock=True)
    db.execute(delete(novels).where(novels.c.id == nid))
    db.commit()
    return {"ok": True}


@api.delete("/novels")
def clear_library(uid: Owner, db: DB):
    db.execute(delete(novels).where(novels.c.owner_id == uid))
    db.execute(delete(imports).where(imports.c.owner_id == uid))
    db.commit()
    return {"ok": True}


@api.post("/novels/{nid}/chapters", status_code=201)
def add_chapter(nid: str, data: ChapterData, uid: Owner, db: DB):
    owned(db, uid, nid, lock=True)
    cid = db.scalar(insert(chapters).values(novel_id=nid, title=data.chapterTitle).returning(chapters.c.id))
    db.commit()
    return {"chapterId": str(cid)}


@api.put(CHAPTER)
def rename(nid: str, cid: int, data: ChapterData, uid: Owner, db: DB):
    check_chapter(db, uid, nid, cid)
    db.execute(update(chapters).where(chapters.c.id == cid).values(title=data.chapterTitle))
    db.commit()
    return {"ok": True}


@api.delete(CHAPTER)
def remove_chapter(nid: str, cid: int, uid: Owner, db: DB):
    check_chapter(db, uid, nid, cid)
    db.execute(delete(chapters).where(chapters.c.id == cid))
    db.commit()
    return {"ok": True}


def append_version(db, cid, content, message, request_id=None):
    row = (
        db.execute(
            insert(versions)
            .values(
                chapter_id=cid,
                content=content,
                message=message,
                timestamp=datetime.now(UTC),
                request_id=request_id,
            )
            .returning(versions)
        )
        .mappings()
        .one()
    )
    db.commit()
    return version_json(row)


@api.post(CHAPTER + "/versions", status_code=201)
def save(nid: str, cid: int, data: Draft, uid: Owner, db: DB):
    check_chapter(db, uid, nid, cid)
    if not data.content.strip():
        raise HTTPException(422, "Nội dung bản thảo đang trống.")
    message = data.commitMessage or "Cập nhật bản thảo"
    request_id = str(data.requestId) if data.requestId else None
    if request_id:
        previous = (
            db.execute(
                select(versions).where(versions.c.chapter_id == cid, versions.c.request_id == request_id)
            )
            .mappings()
            .first()
        )
        if previous:
            if previous["content"] != data.content or previous["message"] != message:
                raise HTTPException(409, "Mã lần lưu đã được dùng cho nội dung khác.")
            return version_json(previous)
    return append_version(db, cid, data.content, message, request_id)


def checked_version(db, uid, nid, cid, vid):
    check_chapter(db, uid, nid, cid)
    row = (
        db.execute(select(versions).where(versions.c.chapter_id == cid, versions.c.id == vid))
        .mappings()
        .first()
    )
    if not row:
        raise HTTPException(404, "Không tìm thấy phiên bản.")
    return row


@api.post(VERSION + "/restore", status_code=201)
def restore(nid: str, cid: int, vid: int, uid: Owner, db: DB):
    source = checked_version(db, uid, nid, cid, vid)
    return append_version(db, cid, source["content"], f"Khôi phục phiên bản {vid}")


@api.put(VERSION + "/publish")
def publish(nid: str, cid: int, vid: int, uid: Owner, db: DB):
    checked_version(db, uid, nid, cid, vid)
    db.execute(
        update(versions)
        .where(versions.c.chapter_id == cid, versions.c.published.is_(True))
        .values(published=False)
    )
    novel = owned(db, uid, nid)
    snapshot = {
        "id": novel["id"],
        "title": novel["title"],
        "description": novel["description"],
        "status": novel["status"],
        "createdAt": novel["created_at"].isoformat(),
        "chapterTitle": db.scalar(select(chapters.c.title).where(chapters.c.id == cid)),
    }
    db.execute(
        update(versions)
        .where(versions.c.id == vid)
        .values(published=True, published_at=datetime.now(UTC), public_metadata=snapshot)
    )
    db.commit()
    return {"ok": True}


@api.delete(CHAPTER + "/publication")
def unpublish(nid: str, cid: int, uid: Owner, db: DB):
    check_chapter(db, uid, nid, cid)
    db.execute(
        update(versions)
        .where(versions.c.chapter_id == cid, versions.c.published.is_(True))
        .values(published=False)
    )
    db.commit()
    return {"ok": True}


@api.get("/statistics")
def statistics(uid: Owner, db: DB):
    scope = novels.c.owner_id == uid
    counts = (
        db.execute(
            select(novels.c.status, novels.c.priority, func.count())
            .where(scope)
            .group_by(novels.c.status, novels.c.priority)
        ).all()
    )
    total = sum(n for _, _, n in counts)
    done = sum(n for status, _, n in counts if status == "Done")
    return {
        "total": total,
        "doneCount": done,
        "pendingCount": total - done,
        "completionRate": round(100 * done / total, 1) if total else 0,
        "totalChapters": db.scalar(select(func.count()).select_from(novels.join(chapters)).where(scope)),
        "totalVersions": db.scalar(
            select(func.count()).select_from(novels.join(chapters).join(versions)).where(scope)
        ),
        **{p.lower() + "Count": sum(n for _, priority, n in counts if priority == p) for p in ("Low", "Medium", "High")},
    }


@api.get("/export")
def export_library(uid: Owner, db: DB):
    return tree(
        db,
        db.execute(
            select(novels).where(novels.c.owner_id == uid).order_by(novels.c.created_at.desc(), novels.c.id)
        ).mappings(),
    )


@api.post("/import")
def import_library(data: list[SavedNovel], uid: Owner, db: DB):
    normalized = [item.model_dump(mode="json") for item in data]
    digest = hashlib.sha256(json.dumps(normalized, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    claimed = db.scalar(
        pg_insert(imports)
        .values(owner_id=uid, digest=digest)
        .on_conflict_do_nothing()
        .returning(imports.c.digest)
    )
    if not claimed:
        return {"count": 0, "duplicate": True}
    for book in data:
        nid = str(uuid4())
        fields = book.model_dump(include={"title", "description", "deadline", "priority", "status"})
        db.execute(
            insert(novels).values(**fields, visibility="Private", id=nid, owner_id=uid, created_at=book.createdAt)
        )
        for chapter in book.chapters:
            cid = db.scalar(insert(chapters).values(novel_id=nid, title=chapter.chapterTitle).returning(chapters.c.id))
            for version in reversed(chapter.versions):
                db.execute(
                    insert(versions).values(
                        chapter_id=cid,
                        content=version.content,
                        message=version.commitMessage,
                        timestamp=version.timestamp,
                    )
                )
    db.commit()
    return {"count": len(data), "duplicate": False}


app.include_router(api)
