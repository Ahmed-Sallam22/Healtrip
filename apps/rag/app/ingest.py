"""Idempotent ingestion of source documents into ``rag.documents`` / ``rag.chunks``.

    python -m app.ingest [--force]

Per document, ``content_hash`` covers title, content, embedding model and chunker version:
unchanged hash -> skipped; new -> inserted; changed -> chunks replaced in one transaction.
Indexed documents that are no longer in the sources are deleted (chunks cascade).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
from collections.abc import Sequence
from dataclasses import asdict, dataclass

from sqlalchemy import Connection, Engine, delete, func, select, text
from sqlalchemy.dialects.postgresql import insert

from app.chunking import CHUNKER_VERSION, chunk_text
from app.config import Settings
from app.embeddings import EmbeddingsProvider
from app.models import chunks, documents
from app.sources import SourceDocument, SourceError, load_all

log = logging.getLogger(__name__)

# Arbitrary constant key for pg_try_advisory_lock: only one ingestion may run at a time.
_INGEST_LOCK_KEY = 0x4845414C  # "HEAL"

# Public (Prisma-owned) tables that bios/profiles must reference.
_REFERENCE_TABLES = {"doctor_bio": '"Doctor"', "hospital_profile": '"Hospital"'}


class IngestInProgressError(RuntimeError):
    """Another ingestion currently holds the advisory lock."""


@dataclass
class IngestSummary:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    deleted: int = 0
    skippedOrphans: int = 0  # noqa: N815 - camelCase: printed and returned as-is
    chunks: int = 0  # total chunks in the index after the run
    embeddingModel: str = ""  # noqa: N815

    def to_dict(self) -> dict[str, int | str]:
        return asdict(self)


def content_hash(doc: SourceDocument, embedding_model: str) -> str:
    payload = f"{doc.title}\n{doc.content}|{embedding_model}|{CHUNKER_VERSION}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def embedding_input(title: str, chunk: str) -> str:
    """Text actually embedded: the title gives every chunk its document context."""
    return f"{title}\n{chunk}"


def _reference_ids(conn: Connection) -> dict[str, set[str] | None]:
    """Existing Doctor/Hospital ids, or ``None`` when the public table does not exist."""
    refs: dict[str, set[str] | None] = {}
    for source_type, table in _REFERENCE_TABLES.items():
        exists = conn.execute(text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}).scalar()
        if exists is None:
            log.info(
                "reference table public.%s not found; skipping %s validation", table, source_type
            )
            refs[source_type] = None
        else:
            refs[source_type] = set(conn.execute(text(f"SELECT id FROM public.{table}")).scalars())
    return refs


def _drop_orphans(
    docs: Sequence[SourceDocument], refs: dict[str, set[str] | None]
) -> tuple[list[SourceDocument], int]:
    kept: list[SourceDocument] = []
    orphans = 0
    for doc in docs:
        known = refs.get(doc.source_type)
        if known is not None and doc.source_id not in known:
            log.warning("skipping %s: sourceId %s not found in the database", doc.id, doc.source_id)
            orphans += 1
            continue
        kept.append(doc)
    return kept, orphans


def _write_document(
    engine: Engine, doc: SourceDocument, digest: str, provider: EmbeddingsProvider
) -> int:
    pieces = chunk_text(doc.content)
    # Embed before opening the write transaction (remote providers can be slow).
    vectors = provider.embed_documents([embedding_input(doc.title, p) for p in pieces])
    rows = [
        {
            "id": f"{doc.id}#{i}",
            "document_id": doc.id,
            "chunk_index": i,
            "text": piece,
            "locale": doc.locale,
            "embedding": vector,
            "metadata": {
                "title": doc.title,
                "source_type": doc.source_type,
                "source_id": doc.source_id,
                **doc.metadata,
            },
        }
        for i, (piece, vector) in enumerate(zip(pieces, vectors, strict=True))
    ]
    values = {
        "id": doc.id,
        "source_type": doc.source_type,
        "source_id": doc.source_id,
        "locale": doc.locale,
        "title": doc.title,
        "content_hash": digest,
        "embedding_model": provider.name,
    }
    upsert = insert(documents).values(**values)
    upsert = upsert.on_conflict_do_update(
        index_elements=[documents.c.id],
        set_={**{k: upsert.excluded[k] for k in values if k != "id"}, "updated_at": func.now()},
    )
    with engine.begin() as conn:
        conn.execute(upsert)
        conn.execute(delete(chunks).where(chunks.c.document_id == doc.id))
        if rows:
            conn.execute(insert(chunks), rows)
    return len(rows)


def ingest(
    engine: Engine,
    provider: EmbeddingsProvider,
    sources: Sequence[SourceDocument],
    *,
    force: bool = False,
) -> IngestSummary:
    ids = [d.id for d in sources]
    if len(ids) != len(set(ids)):
        raise SourceError("duplicate document ids in sources")

    summary = IngestSummary(embeddingModel=provider.name)
    with engine.connect() as lock_conn:
        if not lock_conn.execute(select(func.pg_try_advisory_lock(_INGEST_LOCK_KEY))).scalar():
            raise IngestInProgressError("another ingestion is already running")
        try:
            with engine.connect() as conn:
                refs = _reference_ids(conn)
                existing = dict(
                    conn.execute(select(documents.c.id, documents.c.content_hash)).all()
                )
            valid, summary.skippedOrphans = _drop_orphans(sources, refs)

            for doc in valid:
                digest = content_hash(doc, provider.name)
                previous = existing.get(doc.id)
                if previous == digest and not force:
                    summary.unchanged += 1
                    continue
                _write_document(engine, doc, digest, provider)
                if previous is None:
                    summary.created += 1
                else:
                    summary.updated += 1

            stale = set(existing) - {d.id for d in valid}
            with engine.begin() as conn:
                if stale:
                    conn.execute(delete(documents).where(documents.c.id.in_(stale)))
                summary.deleted = len(stale)
                summary.chunks = conn.execute(select(func.count()).select_from(chunks)).scalar_one()
        finally:
            lock_conn.execute(select(func.pg_advisory_unlock(_INGEST_LOCK_KEY)))
            lock_conn.commit()

    log.info("ingestion finished", extra={"summary": summary.to_dict()})
    return summary


def run_ingestion(
    settings: Settings, engine: Engine, provider: EmbeddingsProvider, *, force: bool = False
) -> IngestSummary:
    """Load sources from the configured directories and ingest them."""
    return ingest(engine, provider, load_all(settings.seed_data_dir, settings.kb_dir), force=force)


def main(argv: Sequence[str] | None = None) -> int:
    from app.config import get_settings
    from app.db import bootstrap_schema, make_engine
    from app.embeddings import get_provider
    from app.logging_setup import configure_logging

    parser = argparse.ArgumentParser(
        prog="python -m app.ingest", description=__doc__.split("\n")[0]
    )
    parser.add_argument("--force", action="store_true", help="re-embed every document")
    args = parser.parse_args(argv)

    settings = get_settings()
    configure_logging(settings.log_level)
    engine = make_engine(settings.rag_database_url)
    try:
        bootstrap_schema(engine)
        summary = run_ingestion(settings, engine, get_provider(settings), force=args.force)
    finally:
        engine.dispose()
    print(json.dumps(summary.to_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
