# Build from the REPO ROOT:  docker build -f apps/rag/Dockerfile -t healtrip-rag .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    SEED_DATA_DIR=/data/seed \
    KB_DIR=/app/data/kb

WORKDIR /app

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin rag

COPY apps/rag/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY apps/rag/app ./app
COPY apps/rag/data/kb ./data/kb
COPY data/seed /data/seed

USER rag
EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=4)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
