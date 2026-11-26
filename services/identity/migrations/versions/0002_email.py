from alembic import op
import sqlalchemy as sa
from app.schema import pending

revision = "0002"
down_revision = "0001"


def upgrade():
    op.add_column("users", sa.Column("email", sa.String(254), nullable=True))
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    pending.create(op.get_bind())


def downgrade():
    pending.drop(op.get_bind())
    op.drop_column("users", "email")
