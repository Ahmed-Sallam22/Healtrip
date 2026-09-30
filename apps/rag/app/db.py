"""Database engine and idempotent schema bootstrap."""

from __future__ import annotations

import logging

from sqlalchemy import Engine, create_engine, text

from app.models import SCHEMA, metadata

log = logging.getLogger(__name__)


def make_engine(url: str) -> Engine:
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args={"connect_timeout": 5, "application_name": "healtrip-rag"},
    )


def bootstrap_schema(engine: Engine) -> None:
    """Create the pgvector extension, the ``rag`` schema, tables and indexes if missing.

    Existence is checked first because Postgres requires database-level privileges even for
    ``CREATE ... IF NOT EXISTS``. In docker compose the extension and schema are pre-created by
    the init script, so the least-privilege ``healtrip_rag`` role never needs those privileges.
    """
    with engine.begin() as conn:
        if not conn.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")).scalar():
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        schema_exists = conn.execute(
            text("SELECT 1 FROM pg_namespace WHERE nspname = :s"), {"s": SCHEMA}
        ).scalar()
        if not schema_exists:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        metadata.create_all(conn, checkfirst=True)
    log.info("schema bootstrap complete", extra={"schema": SCHEMA})
