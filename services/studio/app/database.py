import os
from fastapi import Request
from sqlalchemy import URL, create_engine
from sqlalchemy.orm import Session

engine = create_engine(URL.create(
    "postgresql+psycopg", username="studio_app", password=os.environ["DB_PASSWORD"],
    host=os.getenv("DB_HOST", "db"), port=int(os.getenv("DB_PORT", "5432")),
    database="studio",
), pool_pre_ping=True, hide_parameters=True)


def database(request: Request):
    # One snapshot for metadata, chapters and versions during multi-query reads.
    bind = engine.execution_options(isolation_level="REPEATABLE READ") if request.method == "GET" else engine
    with Session(bind) as session:
        yield session
