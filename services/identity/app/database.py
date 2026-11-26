import os
from sqlalchemy import URL, create_engine
from sqlalchemy.orm import Session

engine = create_engine(URL.create(
    "postgresql+psycopg", username="identity_app", password=os.environ["DB_PASSWORD"],
    host=os.getenv("DB_HOST", "db"), port=int(os.getenv("DB_PORT", "5432")),
    database="identity",
), pool_pre_ping=True, hide_parameters=True)


def database():
    with Session(engine) as session:
        yield session
