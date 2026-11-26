from sqlalchemy import Column, DateTime, MetaData, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from .schema_v1 import metadata as initial

metadata = MetaData()
for table in initial.sorted_tables:
    table.to_metadata(metadata)
novels = metadata.tables["novels"]
chapters = metadata.tables["chapters"]
imports = metadata.tables["imports"]
versions = metadata.tables["chapter_versions"]
versions.append_column(Column("request_id", String(36)))
versions.append_column(Column("public_metadata", JSONB))
versions.append_column(Column("published_at", DateTime(timezone=True)))

versions.append_constraint(UniqueConstraint("chapter_id", "request_id", name="chapter_save_request"))
