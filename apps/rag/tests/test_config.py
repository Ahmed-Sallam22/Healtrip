import pytest
from pydantic import ValidationError

from app.config import DEV_INTERNAL_TOKEN, Settings, normalize_database_url


def test_database_url_strips_prisma_schema_param() -> None:
    assert (
        normalize_database_url("postgresql://u:p@db:5432/healtrip?schema=public&sslmode=disable")
        == "postgresql+psycopg://u:p@db:5432/healtrip?sslmode=disable"
    )
    assert normalize_database_url("postgres://db/x") == "postgresql+psycopg://db/x"


def test_dev_token_default_outside_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RAG_INTERNAL_TOKEN", raising=False)
    assert Settings(_env_file=None, app_env="development").internal_token == DEV_INTERNAL_TOKEN


def test_production_requires_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RAG_INTERNAL_TOKEN", raising=False)
    with pytest.raises(ValidationError, match="RAG_INTERNAL_TOKEN"):
        Settings(_env_file=None, app_env="production")
    prod = Settings(_env_file=None, app_env="production", rag_internal_token="s3cret")
    assert prod.internal_token == "s3cret"
