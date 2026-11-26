"""Freeze reader metadata at publication and identify retried saves per chapter."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002"
down_revision = "0001"


def upgrade():
    op.add_column("chapter_versions", sa.Column("request_id", sa.String(36)))
    op.create_unique_constraint("chapter_save_request", "chapter_versions", ["chapter_id", "request_id"])
    op.add_column("chapter_versions", sa.Column("public_metadata", JSONB))
    op.add_column("chapter_versions", sa.Column("published_at", sa.DateTime(timezone=True)))
    op.execute("""
        UPDATE chapter_versions v SET published_at = v.timestamp,
            public_metadata = jsonb_build_object(
                'id', n.id, 'title', n.title, 'description', n.description,
                'deadline', n.deadline, 'status', n.status, 'priority', n.priority,
                'createdAt', n.created_at, 'chapterTitle', c.title)
        FROM chapters c JOIN novels n ON n.id = c.novel_id
        WHERE v.chapter_id = c.id AND v.published
    """)


def downgrade():
    op.drop_column("chapter_versions", "published_at")
    op.drop_column("chapter_versions", "public_metadata")
    op.drop_constraint("chapter_save_request", "chapter_versions", type_="unique")
    op.drop_column("chapter_versions", "request_id")
