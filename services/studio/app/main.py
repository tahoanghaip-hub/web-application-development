import hashlib
import json
from datetime import UTC, date, datetime
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import case, delete, func, insert, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import DataError, OperationalError
from sqlalchemy.orm import Session

from .contracts import ChapterData, Draft, NovelData, SavedNovel
from .database import database
from .schema import chapters, imports, novels, versions
from .security import owner

app = FastAPI(title="NovelStudio Studio", docs_url=None, redoc_url=None)
api = APIRouter(prefix="/api/v1/studio")
DB = Annotated[Session, Depends(database)]
Owner = Annotated[str, Depends(owner)]
CHAPTER = "/novels/{nid}/chapters/{cid}"
VERSION = CHAPTER + "/versions/{vid}"

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
    if db.scalar(select(chapters.c.id).where(chapters.c.id == cid, chapters.c.novel_id == nid)) is None:
        raise HTTPException(404, "Không tìm thấy chương.")

def novel_json(row):
    return {key: row[key] for key in ("id", "title", "description", "deadline", "status", "priority")} | {
        "createdAt": row["created_at"]}

def version_json(row):
    return {"versionId": str(row["id"]), "content": row["content"], "timestamp": row["timestamp"],
            "commitMessage": row["message"], "published": row["published"]}

def tree(db, rows):
    books = {row["id"]: {**novel_json(row), "chapters": []} for row in rows}
    if not books:
        return []
    query = select(chapters).where(chapters.c.novel_id.in_(books))
    by_chapter = {}
    for row in db.execute(query.order_by(chapters.c.id)).mappings():
        chapter = {"chapterId": str(row["id"]), "chapterTitle": row["title"],
                   "status": "Draft", "versions": []}
        by_chapter[row["id"]] = chapter
        books[row["novel_id"]]["chapters"].append(chapter)
    query = select(versions).where(versions.c.chapter_id.in_(by_chapter))
    for row in db.execute(query.order_by(versions.c.id.desc())).mappings():
        chapter = by_chapter[row["chapter_id"]]
        if row["published"]:
            chapter["status"] = "Published"
        chapter["versions"].append(version_json(row))
    return list(books.values())

@api.get("/public")
def public_library(db: DB):
    books = {}
    query = select(versions.c.public_metadata, versions.c.chapter_id, versions.c.id,
                   versions.c.content, versions.c.timestamp).where(versions.c.published).order_by(
                       versions.c.published_at.desc(), versions.c.id.desc())
    for snapshot, cid, vid, content, timestamp in db.execute(query):
        meta = dict(snapshot)
        chapter_title = meta.pop("chapterTitle")
        book = books.setdefault(meta["id"], {**meta, "chapters": []})
        book["chapters"].append({"chapterId": str(cid), "chapterTitle": chapter_title,
                                 "versions": [{"versionId": str(vid), "content": content, "timestamp": timestamp}]})
    for book in books.values():
        book["chapters"].sort(key=lambda c: int(c["chapterId"]))
    return list(books.values())


@api.get("/public/novels")
def public_novels(db: DB):
    books = {}
    seen_chapters = {}
    query = select(versions.c.public_metadata, versions.c.chapter_id).where(
        versions.c.published.is_(True)
    ).order_by(versions.c.published_at.desc(), versions.c.id.desc())
    for snapshot, cid in db.execute(query):
        meta = dict(snapshot)
        meta.pop("chapterTitle", None)
        nid = meta["id"]
        if nid not in books:
            books[nid] = {**meta, "chapterCount": 0}
            seen_chapters[nid] = set()
        if cid not in seen_chapters[nid]:
            seen_chapters[nid].add(cid)
            books[nid]["chapterCount"] += 1
    return list(books.values())


@api.get("/public/novels/{nid}")
def public_novel_detail(nid: str, db: DB, chapter: str | None = None, includeDefault: bool = False):
    char_count_expr = func.char_length(versions.c.content).label("char_count")
    word_count_expr = case(
        (func.btrim(versions.c.content) == "", 0),
        else_=func.cardinality(func.regexp_split_to_array(func.btrim(versions.c.content), r"\s+")),
    ).label("word_count")
    query = select(
        versions.c.public_metadata,
        versions.c.chapter_id,
        versions.c.id,
        versions.c.timestamp,
        char_count_expr,
        word_count_expr,
    ).select_from(
        versions.join(chapters, versions.c.chapter_id == chapters.c.id)
    ).where(
        chapters.c.novel_id == nid,
        versions.c.published.is_(True),
    ).order_by(versions.c.published_at.desc(), versions.c.id.desc())
    rows = db.execute(query).all()
    if not rows:
        raise HTTPException(404, "Không tìm thấy tác phẩm công khai.")

    first_meta = dict(rows[0][0])
    first_meta.pop("chapterTitle", None)
    book = {**first_meta, "chapters": []}
    for snapshot, cid, vid, timestamp, char_count, word_count in rows:
        book["chapters"].append({
            "chapterId": str(cid),
            "chapterTitle": snapshot["chapterTitle"],
            "versionId": str(vid),
            "timestamp": timestamp,
            "wordCount": int(word_count or 0),
            "charCount": int(char_count or 0),
        })
    book["chapters"].sort(key=lambda c: int(c["chapterId"]))

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
            versions.c.content,
            versions.c.timestamp,
        ).select_from(
            versions.join(chapters, versions.c.chapter_id == chapters.c.id)
        ).where(
            chapters.c.novel_id == nid,
            versions.c.chapter_id == cid,
            versions.c.published.is_(True),
        )
    ).mappings().first()
    if not row:
        raise HTTPException(404, "Không tìm thấy chương công khai.")
    return {
        "chapterId": str(row["chapter_id"]),
        "chapterTitle": row["public_metadata"]["chapterTitle"],
        "versionId": str(row["id"]),
        "timestamp": row["timestamp"],
        "content": row["content"],
    }


@api.get("/novels")
def library(uid: Owner, db: DB, keyword: str = "", status: Literal["All","Pending","Done"] = "All",
            priority: Literal["All","High","Medium","Low"] = "All",
            sortBy: Literal["created-desc","deadline-asc","deadline-desc","title-asc"] = "created-desc",
            page: int = Query(1, ge=1), size: int = Query(10, ge=1, le=100)):
    conditions = [novels.c.owner_id == uid]
    if keyword.strip():
        conditions.append(or_(novels.c.title.icontains(keyword.strip(), autoescape=True),
                              novels.c.description.icontains(keyword.strip(), autoescape=True)))
    for col, value in [(novels.c.status, status), (novels.c.priority, priority)]:
        if value != "All":
            conditions.append(col == value)
    total = db.scalar(select(func.count()).select_from(novels).where(*conditions))
    order = {"created-desc": novels.c.created_at.desc(), "deadline-asc": novels.c.deadline,
             "deadline-desc": novels.c.deadline.desc(), "title-asc": novels.c.title}[sortBy]
    count = select(func.count(chapters.c.id)).where(chapters.c.novel_id == novels.c.id).scalar_subquery()
    query = select(novels, count.label("chapterCount")).where(*conditions).order_by(order, novels.c.id)
    rows = db.execute(query.limit(size).offset((page - 1) * size)).mappings()
    return {"items": [novel_json(r) | {"chapterCount": r["chapterCount"]} for r in rows], "total": total}

@api.get("/novels/{nid}")
def detail(nid: str, uid: Owner, db: DB):
    return tree(db, [owned(db, uid, nid)])[0]

@api.post("/novels", status_code=201)
def create(data: NovelData, uid: Owner, db: DB):
    if data.deadline < date.today():
        raise HTTPException(422, "Hạn hoàn thành đã qua.")
    row = db.execute(insert(novels).values(id=str(uuid4()), owner_id=uid, created_at=datetime.now(UTC),
                                          **data.model_dump()).returning(novels)).mappings().one()
    db.commit()
    return novel_json(row)

@api.put("/novels/{nid}")
def edit(nid: str, data: NovelData, uid: Owner, db: DB):
    old = owned(db, uid, nid, lock=True)
    if old["deadline"] != data.deadline and data.deadline < date.today():
        raise HTTPException(422, "Hạn hoàn thành đã qua.")
    row = db.execute(update(novels).where(novels.c.id == nid).values(**data.model_dump())
                     .returning(novels)).mappings().one()
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
    row = db.execute(insert(versions).values(chapter_id=cid, content=content, message=message,
                     timestamp=datetime.now(UTC), request_id=request_id).returning(versions)).mappings().one()
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
        previous = db.execute(select(versions).where(
            versions.c.chapter_id == cid, versions.c.request_id == request_id)).mappings().first()
        if previous:
            if previous["content"] != data.content or previous["message"] != message:
                raise HTTPException(409, "Mã lần lưu đã được dùng cho nội dung khác.")
            return version_json(previous)
    return append_version(db, cid, data.content, message, request_id)

def checked_version(db, uid, nid, cid, vid):
    check_chapter(db, uid, nid, cid)
    row = db.execute(select(versions).where(versions.c.chapter_id == cid,
                                           versions.c.id == vid)).mappings().first()
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
    db.execute(update(versions).where(versions.c.chapter_id == cid, versions.c.published).values(published=False))
    snapshot = novel_json(owned(db, uid, nid))
    snapshot["deadline"] = snapshot["deadline"].isoformat()
    snapshot["createdAt"] = snapshot["createdAt"].isoformat()
    snapshot["chapterTitle"] = db.scalar(select(chapters.c.title).where(chapters.c.id == cid))
    db.execute(update(versions).where(versions.c.id == vid).values(
        published=True, published_at=datetime.now(UTC), public_metadata=snapshot))
    db.commit()
    return {"ok": True}

@api.delete(CHAPTER + "/publication")
def unpublish(nid: str, cid: int, uid: Owner, db: DB):
    check_chapter(db, uid, nid, cid)
    db.execute(update(versions).where(versions.c.chapter_id == cid).values(published=False))
    db.commit()
    return {"ok": True}

@api.get("/statistics")
def statistics(uid: Owner, db: DB):
    scope = novels.c.owner_id == uid
    counts = db.execute(select(novels.c.status, novels.c.priority, func.count()).where(scope)
                        .group_by(novels.c.status, novels.c.priority)).all()
    total = sum(n for _, _, n in counts)
    done = sum(n for status, _, n in counts if status == "Done")
    return {"total": total, "doneCount": done, "pendingCount": total-done,
            "completionRate": round(100*done/total, 1) if total else 0,
            "totalChapters": db.scalar(select(func.count()).select_from(novels.join(chapters)).where(scope)),
            "totalVersions": db.scalar(select(func.count()).select_from(novels.join(chapters).join(versions)).where(scope)),
            **{p.lower()+"Count": sum(n for _, priority, n in counts if priority == p)
               for p in ("Low", "Medium", "High")}}

@api.get("/export")
def export_library(uid: Owner, db: DB):
    return tree(db, db.execute(select(novels).where(novels.c.owner_id == uid)
                               .order_by(novels.c.created_at.desc(), novels.c.id)).mappings())

@api.post("/import")
def import_library(data: list[SavedNovel], uid: Owner, db: DB):
    normalized = [item.model_dump(mode="json") for item in data]
    digest = hashlib.sha256(json.dumps(normalized, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    claimed = db.scalar(pg_insert(imports).values(owner_id=uid, digest=digest)
                        .on_conflict_do_nothing().returning(imports.c.digest))
    if not claimed:
        return {"count": 0, "duplicate": True}
    for book in data:
        nid = str(uuid4())
        fields = book.model_dump(include=set(NovelData.model_fields))
        db.execute(insert(novels).values(**fields, id=nid, owner_id=uid, created_at=book.createdAt))
        for chapter in book.chapters:
            cid = db.scalar(insert(chapters).values(novel_id=nid, title=chapter.chapterTitle)
                            .returning(chapters.c.id))
            for version in reversed(chapter.versions):
                db.execute(insert(versions).values(chapter_id=cid, content=version.content,
                           message=version.commitMessage, timestamp=version.timestamp))
    db.commit()
    return {"count": len(data), "duplicate": False}

app.include_router(api)
