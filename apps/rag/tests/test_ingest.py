from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from sqlalchemy import Engine, func, select, text

from app.embeddings.mock import MockEmbeddings
from app.ingest import _INGEST_LOCK_KEY, IngestInProgressError, ingest
from app.models import chunks, documents
from app.sources import SourceDocument, load_guides

LONG_BODY = "\n\n".join(
    " ".join(f"Paragraph {p} sentence {s} explains travel planning." for s in range(12))
    for p in range(4)
)


def _doc(key: str, content: str, source_type: str = "patient_guide") -> SourceDocument:
    source_id = None if source_type == "patient_guide" else key
    return SourceDocument(
        id=f"{source_type}:{key}:en",
        source_type=source_type,
        source_id=source_id,
        locale="en",
        title=f"Title {key}",
        content=content,
    )


def _chunk_rows(engine: Engine, document_id: str) -> list[tuple[str, str]]:
    with engine.connect() as conn:
        return conn.execute(
            select(chunks.c.id, chunks.c.text)
            .where(chunks.c.document_id == document_id)
            .order_by(chunks.c.chunk_index)
        ).all()


def _count(engine: Engine, table) -> int:
    with engine.connect() as conn:
        return conn.execute(select(func.count()).select_from(table)).scalar_one()


def test_ingest_is_idempotent(clean_db: Engine, provider: MockEmbeddings) -> None:
    docs = [_doc("a", "Short guide about visas."), _doc("b", LONG_BODY)]

    first = ingest(clean_db, provider, docs)
    assert (first.created, first.updated, first.unchanged, first.deleted) == (2, 0, 0, 0)
    assert first.chunks == _count(clean_db, chunks) > 2
    assert first.embeddingModel == provider.name

    second = ingest(clean_db, provider, docs)
    assert (second.created, second.updated, second.unchanged, second.deleted) == (0, 0, 2, 0)
    assert second.chunks == first.chunks


def test_chunk_ids_are_stable_and_readable(clean_db: Engine, provider: MockEmbeddings) -> None:
    ingest(clean_db, provider, [_doc("b", LONG_BODY)])
    ids = [row.id for row in _chunk_rows(clean_db, "patient_guide:b:en")]
    assert ids == [f"patient_guide:b:en#{i}" for i in range(len(ids))]


def test_changed_document_replaces_its_chunks(clean_db: Engine, provider: MockEmbeddings) -> None:
    doc = _doc("b", LONG_BODY)
    ingest(clean_db, provider, [doc, _doc("a", "Short guide about visas.")])
    assert len(_chunk_rows(clean_db, doc.id)) > 1

    summary = ingest(
        clean_db,
        provider,
        [replace(doc, content="Now a one-line guide."), _doc("a", "Short guide about visas.")],
    )
    assert (summary.created, summary.updated, summary.unchanged) == (0, 1, 1)
    assert [r.text for r in _chunk_rows(clean_db, doc.id)] == ["Now a one-line guide."]


def test_removed_document_is_deleted_with_chunks(
    clean_db: Engine, provider: MockEmbeddings
) -> None:
    a, b = _doc("a", "Short guide about visas."), _doc("b", LONG_BODY)
    ingest(clean_db, provider, [a, b])

    summary = ingest(clean_db, provider, [a])
    assert (summary.deleted, summary.unchanged) == (1, 1)
    assert _chunk_rows(clean_db, b.id) == []
    assert _count(clean_db, documents) == 1


def test_force_reembeds_everything(clean_db: Engine, provider: MockEmbeddings) -> None:
    docs = [_doc("a", "Short guide about visas."), _doc("b", LONG_BODY)]
    ingest(clean_db, provider, docs)
    summary = ingest(clean_db, provider, docs, force=True)
    assert (summary.created, summary.updated, summary.unchanged) == (0, 2, 0)


def test_changing_the_embedding_model_reembeds(clean_db: Engine) -> None:
    docs = [_doc("a", "Short guide about visas.")]
    ingest(clean_db, MockEmbeddings(0.25), docs)

    other = MockEmbeddings(0.25)
    other.name = "mock-lexical-hash-test"
    assert ingest(clean_db, other, docs).updated == 1


def test_guides_from_a_kb_directory(
    clean_db: Engine, provider: MockEmbeddings, tmp_path: Path
) -> None:
    guides = tmp_path / "guides"
    guides.mkdir()
    guide = guides / "visa-basics.en.md"
    guide.write_text("---\ntitle: Visa basics\n---\nApply for a medical visa early.\n", "utf-8")

    assert ingest(clean_db, provider, load_guides(tmp_path)).created == 1

    guide.write_text(
        "---\ntitle: Visa basics\n---\nApply for a medical visa weeks ahead.\n", "utf-8"
    )
    summary = ingest(clean_db, provider, load_guides(tmp_path))
    assert summary.updated == 1
    assert [r.text for r in _chunk_rows(clean_db, "patient_guide:visa-basics:en")] == [
        "Apply for a medical visa weeks ahead."
    ]


def test_orphans_skipped_when_reference_table_exists(
    clean_db: Engine, provider: MockEmbeddings
) -> None:
    known, orphan = (
        _doc("doc-1", "Cardiologist.", "doctor_bio"),
        _doc("doc-x", "Ghost.", "doctor_bio"),
    )
    # Without public."Doctor" validation is skipped and both are indexed.
    assert ingest(clean_db, provider, [known, orphan]).skippedOrphans == 0

    with clean_db.begin() as conn:
        conn.execute(text('CREATE TABLE public."Doctor" (id text PRIMARY KEY)'))
        conn.execute(text("""INSERT INTO public."Doctor" (id) VALUES ('doc-1')"""))
    try:
        summary = ingest(clean_db, provider, [known, orphan])
    finally:
        with clean_db.begin() as conn:
            conn.execute(text('DROP TABLE public."Doctor"'))

    assert summary.skippedOrphans == 1
    assert summary.deleted == 1  # the previously indexed orphan is removed
    with clean_db.connect() as conn:
        assert set(conn.execute(select(documents.c.id)).scalars()) == {known.id}


def test_concurrent_ingestion_is_rejected(clean_db: Engine, provider: MockEmbeddings) -> None:
    with clean_db.connect() as conn:
        conn.execute(select(func.pg_advisory_lock(_INGEST_LOCK_KEY)))
        try:
            with pytest.raises(IngestInProgressError):
                ingest(clean_db, provider, [_doc("a", "Short guide about visas.")])
        finally:
            conn.execute(select(func.pg_advisory_unlock(_INGEST_LOCK_KEY)))
