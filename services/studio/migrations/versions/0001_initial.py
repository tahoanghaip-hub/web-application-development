"""Initial studio schema. Keep schema_v1 frozen when adding later revisions."""
from alembic import op
from app.schema_v1 import metadata

revision = "0001"
down_revision = None


def upgrade():
    metadata.create_all(op.get_bind(), checkfirst=False)


def downgrade():
    metadata.drop_all(op.get_bind(), checkfirst=False)
