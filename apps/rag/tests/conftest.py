"""Shared fixtures. DB tests use TEST_RAG_DATABASE_URL and are skipped if it is unreachable."""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.exc import OperationalError

from app.config import Settings, normalize_database_url
from app.db import bootstrap_schema, make_engine
from app.embeddings.mock import MockEmbeddings
from app.models import SCHEMA

TEST_DB_URL = os.environ.get(
    "TEST_RAG_DATABASE_URL", "postgresql://ahmed@localhost:5432/healtrip_test"
)
TEST_TOKEN = "test-internal-token"


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(
        app_env="test",
        rag_database_url=TEST_DB_URL,
        rag_internal_token=TEST_TOKEN,
        rag_min_score=None,
        rag_auto_ingest=False,
        embeddings_provider="mock",
    )


@pytest.fixture(scope="session")
def provider() -> MockEmbeddings:
    return MockEmbeddings(default_min_score=0.25)


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """Engine on the test DB with a freshly recreated ``rag`` schema."""
    eng = make_engine(normalize_database_url(TEST_DB_URL))
    try:
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
    except OperationalError:
        eng.dispose()
        pytest.skip(f"test database unreachable: {TEST_DB_URL}")
    with eng.begin() as conn:
        conn.execute(text(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE"))
    bootstrap_schema(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def clean_db(engine: Engine) -> Engine:
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {SCHEMA}.documents CASCADE"))
    return engine
