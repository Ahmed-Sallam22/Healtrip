"""OpenAI embeddings over plain HTTP (``dimensions=384`` so vectors fit the shared column)."""

from __future__ import annotations

from collections.abc import Sequence

import httpx

from app.config import EMBEDDING_DIM
from app.embeddings import EmbeddingsError

_BATCH_SIZE = 96


class OpenAIEmbeddings:
    def __init__(
        self,
        api_key: str,
        model: str,
        default_min_score: float,
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 20.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._model = model
        self._client = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
            transport=transport,
        )
        self.name = f"openai:{model}@{EMBEDDING_DIM}"
        self.default_min_score = default_min_score

    def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        try:
            response = self._client.post(
                "/embeddings",
                json={"model": self._model, "input": texts, "dimensions": EMBEDDING_DIM},
            )
        except httpx.HTTPError as exc:
            raise EmbeddingsError(f"OpenAI embeddings request failed: {exc}") from exc
        if response.status_code != 200:
            raise EmbeddingsError(
                f"OpenAI embeddings returned HTTP {response.status_code}: {response.text[:200]}"
            )
        data = sorted(response.json()["data"], key=lambda item: item["index"])
        vectors = [item["embedding"] for item in data]
        if len(vectors) != len(texts) or any(len(v) != EMBEDDING_DIM for v in vectors):
            raise EmbeddingsError("OpenAI embeddings response has an unexpected shape")
        return vectors  # OpenAI embeddings are already unit-normalised

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        items = list(texts)
        out: list[list[float]] = []
        for start in range(0, len(items), _BATCH_SIZE):
            out.extend(self._embed_batch(items[start : start + _BATCH_SIZE]))
        return out

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]
