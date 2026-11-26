from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table

from . import schema_v1

metadata = MetaData()
users = schema_v1.users.to_metadata(metadata)
users.append_column(Column("email", String(254), unique=True))
sessions = schema_v1.sessions.to_metadata(metadata)
pending = Table(
    "pending_registrations", metadata,
    Column("email", String(254), primary_key=True),
    Column("request_id", String(36), unique=True, nullable=False),
    Column("username", String(64), nullable=False),
    Column("password_hash", String, nullable=False),
    Column("code_hash", String(64), nullable=False),
    Column("sent_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("attempts", Integer, nullable=False),
    Column("window_start", DateTime(timezone=True), nullable=False),
)
