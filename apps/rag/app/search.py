"""Vector search over ``rag.chunks``."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import Engine, select, text

from app.embeddings import EmbeddingsProvider
from app.models import chunks, documents

# Candidates fetched per requested result. See the comment in `search`.
_OVERFETCH = 4


@dataclass(frozen=True)
class SearchHit:
    chunk_id: str
    document_id: str
    source_type: str
    source_id: str | None
    title: str
    text: str
    score: float
    locale: str


def search(
    engine: Engine,
    provider: EmbeddingsProvider,
    query: str,
    *,
    top_k: int,
    min_score: float,
    locale: str | None = None,
    source_types: Sequence[str] | None = None,
) -> list[SearchHit]:
    """Return up to ``top_k`` chunks with cosine similarity >= ``min_score``, best first."""
    query_vector = provider.embed_query(query)
    distance = chunks.c.embedding.cosine_distance(query_vector)

    # `ORDER BY embedding <=> :q LIMIT n` is the shape the HNSW index (vector_cosine_ops) can
    # serve. WHERE filters are applied to the index's candidate stream, so we over-fetch
    # (top_k * 4, with hnsw.ef_search raised to match) and apply the score threshold in Python:
    # a threshold predicate in SQL would not use the index anyway and would hide how many
    # candidates were dropped. With pgvector >= 0.8, `hnsw.iterative_scan` could replace the
    # over-fetch for very selective filters; at this corpus size it is unnecessary.
    limit = top_k * _OVERFETCH
    stmt = (
        select(
            chunks.c.id,
            chunks.c.document_id,
            chunks.c.text,
            chunks.c.locale,
            documents.c.source_type,
            documents.c.source_id,
            documents.c.title,
            (1 - distance).label("score"),
        )
        .join(documents, documents.c.id == chunks.c.document_id)
        .order_by(distance)
        .limit(limit)
    )
    if locale:
        stmt = stmt.where(chunks.c.locale == locale)
    if source_types:
        stmt = stmt.where(documents.c.source_type.in_(list(source_types)))

    with engine.begin() as conn:
        # SET LOCAL cannot take bind parameters; `limit` is a validated int.
        conn.execute(text(f"SET LOCAL hnsw.ef_search = {max(40, int(limit))}"))
        rows = conn.execute(stmt).all()

    hits = [
        SearchHit(
            chunk_id=r.id,
            document_id=r.document_id,
            source_type=r.source_type,
            source_id=r.source_id,
            title=r.title,
            text=r.text,
            score=round(float(r.score), 4),
            locale=r.locale,
        )
        for r in rows
        if r.score >= min_score
    ]
    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:top_k]
