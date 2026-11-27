"""Add novel visibility (backfilling novels with published chapters) and chapter comments."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"


def upgrade():
    op.add_column("novels", sa.Column("visibility", sa.String(16), nullable=False, server_default="Private"))
    op.create_check_constraint("novels_visibility_check", "novels", "visibility IN ('Private', 'Public')")
    op.create_index("ix_novels_visibility", "novels", ["visibility"])
    op.execute("""
        UPDATE novels n
        SET visibility = 'Public'
        WHERE EXISTS (
            SELECT 1
            FROM chapters c
            JOIN chapter_versions v ON v.chapter_id = c.id
            WHERE c.novel_id = n.id AND v.published IS TRUE
        )
    """)

    op.create_table(
        "chapter_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("chapter_id", sa.Integer(), sa.ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("chapter_comments.id", ondelete="CASCADE"), nullable=True),
        sa.Column("author_id", sa.String(36), nullable=False),
        sa.Column("author_display_name", sa.String(100), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("request_id", sa.String(36), nullable=True),
        sa.UniqueConstraint("chapter_id", "author_id", "request_id", name="chapter_comment_request"),
    )
    op.create_index("ix_chapter_comments_chapter_id", "chapter_comments", ["chapter_id"])
    op.create_index("ix_chapter_comments_parent_id", "chapter_comments", ["parent_id"])
    op.create_index("ix_chapter_comments_author_id", "chapter_comments", ["author_id"])
    op.create_index("ix_chapter_comments_thread", "chapter_comments", ["chapter_id", "parent_id", "created_at", "id"])
    op.create_index("ix_chapter_comments_rate", "chapter_comments", ["author_id", "created_at"])


def downgrade():
    op.drop_index("ix_chapter_comments_rate", table_name="chapter_comments")
    op.drop_index("ix_chapter_comments_thread", table_name="chapter_comments")
    op.drop_index("ix_chapter_comments_author_id", table_name="chapter_comments")
    op.drop_index("ix_chapter_comments_parent_id", table_name="chapter_comments")
    op.drop_index("ix_chapter_comments_chapter_id", table_name="chapter_comments")
    op.drop_table("chapter_comments")
    op.drop_index("ix_novels_visibility", table_name="novels")
    op.drop_constraint("novels_visibility_check", "novels", type_="check")
    op.drop_column("novels", "visibility")
