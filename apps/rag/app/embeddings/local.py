"""Local multilingual sentence-transformers model (optional: requirements-local.txt)."""

from __future__ import annotations

from collections.abc import Sequence

from app.config import EMBEDDING_DIM
from app.embeddings import EmbeddingsError


class LocalEmbeddings:
    def __init__(self, model_name: str, default_min_score: float) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:  # pragma: no cover - depends on optional install
            raise EmbeddingsError(
                "EMBEDDINGS_PROVIDER=local needs sentence-transformers "
                "(pip install -r requirements-local.txt)"
            ) from exc
        self._model = SentenceTransformer(model_name)
        dim = self._model.get_sentence_embedding_dimension()
        if dim != EMBEDDING_DIM:
            raise EmbeddingsError(
                f"{model_name} produces {dim}-dim vectors, expected {EMBEDDING_DIM}"
            )
        self.name = f"local:{model_name}"
        self.default_min_score = default_min_score

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        vectors = self._model.encode(list(texts), normalize_embeddings=True, batch_size=32)
        return [v.tolist() for v in vectors]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]
