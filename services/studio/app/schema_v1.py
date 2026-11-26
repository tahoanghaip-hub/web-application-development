from sqlalchemy import (Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey,
                        Index, Integer, MetaData, String, Table, Text)

metadata = MetaData()
novels = Table(
    "novels", metadata,
    Column("id", String(36), primary_key=True),
    Column("owner_id", String(36), index=True, nullable=False),
    Column("title", Text, nullable=False),
    Column("description", Text, nullable=False),
    Column("deadline", Date, nullable=False),
    Column("priority", String, nullable=False),
    Column("status", String, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    CheckConstraint("status IN ('Pending', 'Done')"),
    CheckConstraint("priority IN ('Low', 'Medium', 'High')"),
)
chapters = Table(
    "chapters", metadata,
    Column("id", Integer, primary_key=True),
    Column("novel_id", ForeignKey("novels.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("title", Text, nullable=False),
)
versions = Table(
    "chapter_versions", metadata,
    Column("id", Integer, primary_key=True),
    Column("chapter_id", ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("content", Text, nullable=False),
    Column("message", Text, nullable=False),
    Column("timestamp", DateTime(timezone=True), nullable=False),
    Column("published", Boolean, nullable=False, server_default="false"),
)
Index("one_public_version_per_chapter", versions.c.chapter_id, unique=True,
      postgresql_where=versions.c.published.is_(True))
imports = Table(
    "imports", metadata,
    Column("owner_id", String(36), primary_key=True),
    Column("digest", String(64), primary_key=True),
)
