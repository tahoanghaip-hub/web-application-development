FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --system novelstudio
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini .
USER novelstudio
CMD ["sh", "-ec", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
