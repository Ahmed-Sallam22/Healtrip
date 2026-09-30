"""Embeddings providers. All of them return L2-normalised vectors of ``EMBEDDING_DIM`` floats."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, runtime_checkable

from app.config import DEFAULT_MIN_SCORES, Settings


class EmbeddingsError(RuntimeError):
    """The embeddings backend failed or is misconfigured."""


@runtime_checkable
class EmbeddingsProvider(Protocol):
    #: Stable identifier stored with each document (changing it triggers re-embedding).
    name: str
    #: Provider-specific default similarity threshold (see config.DEFAULT_MIN_SCORES).
    default_min_score: float

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


def get_provider(settings: Settings) -> EmbeddingsProvider:
    """Build the provider selected by ``EMBEDDINGS_PROVIDER`` (heavy imports are lazy)."""
    kind = settings.embeddings_provider
    min_score = DEFAULT_MIN_SCORES[kind]
    if kind == "mock":
        from app.embeddings.mock import MockEmbeddings

        return MockEmbeddings(default_min_score=min_score)
    if kind == "local":
        from app.embeddings.local import LocalEmbeddings

        return LocalEmbeddings(settings.local_embeddings_model, default_min_score=min_score)
    if kind == "openai":
        from app.embeddings.openai import OpenAIEmbeddings

        if settings.openai_api_key is None:
            raise EmbeddingsError("EMBEDDINGS_PROVIDER=openai requires OPENAI_API_KEY")
        return OpenAIEmbeddings(
            api_key=settings.openai_api_key.get_secret_value(),
            model=settings.openai_embeddings_model,
            base_url=settings.openai_base_url,
            default_min_score=min_score,
        )
    raise EmbeddingsError(f"unknown embeddings provider: {kind}")  # pragma: no cover
