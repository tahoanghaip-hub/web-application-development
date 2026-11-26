from sqlalchemy import Column, CheckConstraint, DateTime, ForeignKey, MetaData, String, Table

metadata = MetaData()
users = Table(
    "users", metadata,
    Column("id", String(36), primary_key=True),
    Column("username", String(64), nullable=False, unique=True),
    Column("display_name", String(100), nullable=False),
    Column("password_hash", String, nullable=False),
    Column("role", String, nullable=False),
    CheckConstraint("role IN ('Author', 'Admin')"),
)
sessions = Table(
    "sessions", metadata,
    Column("digest", String(64), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("expires_at", DateTime(timezone=True), nullable=False, index=True),
)
