from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from .schema_v1 import metadata as initial

metadata = MetaData()
for table in initial.sorted_tables:
    table.to_metadata(metadata)
novels = metadata.tables["novels"]
chapters = metadata.tables["chapters"]
imports = metadata.tables["imports"]
versions = metadata.tables["chapter_versions"]

novels.append_column(Column("visibility", String(16), nullable=False, server_default="Private"))
novels.append_constraint(CheckConstraint("visibility IN ('Private', 'Public')", name="novels_visibility_check"))
Index("ix_novels_visibility", novels.c.visibility)

versions.append_column(Column("request_id", String(36)))
versions.append_column(Column("public_metadata", JSONB))
versions.append_column(Column("published_at", DateTime(timezone=True)))
versions.append_constraint(UniqueConstraint("chapter_id", "request_id", name="chapter_save_request"))

comments = Table(
    "chapter_comments",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("chapter_id", ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("parent_id", ForeignKey("chapter_comments.id", ondelete="CASCADE"), nullable=True, index=True),
    Column("author_id", String(36), nullable=False, index=True),
    Column("author_display_name", String(100), nullable=False),
    Column("content", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("deleted_at", DateTime(timezone=True), nullable=True),
    Column("request_id", String(36), nullable=True),
    UniqueConstraint("chapter_id", "author_id", "request_id", name="chapter_comment_request"),
    Index("ix_chapter_comments_thread", "chapter_id", "parent_id", "created_at", "id"),
    Index("ix_chapter_comments_rate", "author_id", "created_at"),
)
