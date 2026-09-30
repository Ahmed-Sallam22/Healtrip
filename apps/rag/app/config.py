"""Service configuration (environment variables, validated with pydantic-settings)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

RAG_ROOT = Path(__file__).resolve().parent.parent  # apps/rag
REPO_ROOT = RAG_ROOT.parent.parent

EMBEDDING_DIM = 384  # every provider must produce vectors of this size (see models.chunks)

DEV_INTERNAL_TOKEN = "dev-internal-token"

ProviderName = Literal["mock", "local", "openai"]

# Default minimum cosine similarity per provider (override with RAG_MIN_SCORE or per request).
# - mock  : measured on the seeded corpus with a probe set of on-topic and off-topic EN/AR
#           queries (the key cases are pinned in tests/test_search_api.py). On-topic queries
#           score ~0.38-0.46 on their best chunk; off-topic ones ("price of parking at the
#           airport", "best pizza recipe", "weather in London") peak at ~0.20, the ceiling of
#           hash-collision noise plus isolated shared words. 0.25 sits in that gap, biased low
#           so that short but relevant queries still match.
# - local : paraphrase-multilingual-MiniLM-L12-v2 typically gives 0.1-0.3 for unrelated and
#           0.4+ for on-topic pairs; 0.35 is a conservative starting point (not measured here).
# - openai: text-embedding-3-small at 384 dims compresses scores (unrelated ~0.05-0.2,
#           related ~0.3-0.6); 0.30 is a starting point (not measured here, needs a key).
DEFAULT_MIN_SCORES: dict[str, float] = {"mock": 0.25, "local": 0.35, "openai": 0.30}


def normalize_database_url(url: str) -> str:
    """Accept a libpq/Prisma URL and return a SQLAlchemy psycopg3 URL.

    Strips Prisma's ``?schema=...`` query parameter (libpq rejects it) and selects the psycopg
    driver for ``postgres://`` / ``postgresql://`` URLs.
    """
    parts = urlsplit(url)
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if k != "schema"])
    scheme = parts.scheme
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+psycopg"
    return urlunsplit((scheme, parts.netloc, parts.path, query, parts.fragment))


class Settings(BaseSettings):
    # Local dev: read the repo-root .env (shared with the API) and an optional apps/rag/.env.
    # Real environment variables always take precedence; in containers no file exists.
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", RAG_ROOT / ".env"), extra="ignore", case_sensitive=False
    )

    app_env: str = "development"
    log_level: str = "INFO"

    rag_database_url: str = "postgresql://localhost:5432/healtrip"
    rag_internal_token: SecretStr | None = None
    rag_min_score: float | None = None
    rag_auto_ingest: bool = False

    embeddings_provider: ProviderName = "mock"
    openai_api_key: SecretStr | None = None
    openai_embeddings_model: str = "text-embedding-3-small"
    openai_base_url: str = "https://api.openai.com/v1"
    local_embeddings_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

    seed_data_dir: Path = REPO_ROOT / "data" / "seed"
    kb_dir: Path = RAG_ROOT / "data" / "kb"

    @field_validator("rag_database_url")
    @classmethod
    def _normalize_url(cls, value: str) -> str:
        return normalize_database_url(value)

    @field_validator("rag_min_score")
    @classmethod
    def _check_min_score(cls, value: float | None) -> float | None:
        if value is not None and not 0.0 <= value <= 1.0:
            raise ValueError("RAG_MIN_SCORE must be between 0 and 1")
        return value

    @model_validator(mode="after")
    def _require_token_in_production(self) -> Settings:
        if self.rag_internal_token is None or not self.rag_internal_token.get_secret_value():
            if self.is_production:
                raise ValueError("RAG_INTERNAL_TOKEN is required when APP_ENV=production")
            self.rag_internal_token = SecretStr(DEV_INTERNAL_TOKEN)
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def internal_token(self) -> str:
        assert self.rag_internal_token is not None  # guaranteed by the validator
        return self.rag_internal_token.get_secret_value()


@lru_cache
def get_settings() -> Settings:
    return Settings()
