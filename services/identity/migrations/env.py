from alembic import context
from app.database import engine
from app.schema_v1 import metadata

with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=metadata)
    with context.begin_transaction():
        context.run_migrations()
