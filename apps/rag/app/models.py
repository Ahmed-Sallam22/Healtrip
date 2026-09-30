"""Tables of the ``rag`` schema (owned by this service; Prisma never touches it)."""

from __future__ import annotations

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.config import EMBEDDING_DIM

SCHEMA = "rag"
SOURCE_TYPES = ("doctor_bio", "hospital_profile", "patient_guide")
LOCALES = ("en", "ar")

metadata = MetaData(schema=SCHEMA)

documents = Table(
    "documents",
    metadata,
    Column("id", Text, primary_key=True),  # e.g. doctor_bio:doc-cai-card-01:en
    Column("source_type", Text, nullable=False),
    Column("source_id", Text, nullable=True),  # Doctor/Hospital id; NULL for guides
    Column("locale", Text, nullable=False),
    Column("title", Text, nullable=False),
    Column("content_hash", Text, nullable=False),
    Column("embedding_model", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    CheckConstraint(f"source_type IN {SOURCE_TYPES}", name="documents_source_type_check"),
    CheckConstraint(f"locale IN {LOCALES}", name="documents_locale_check"),
)

chunks = Table(
    "chunks",
    metadata,
    Column("id", Text, primary_key=True),  # f"{document_id}#{chunk_index}"
    Column(
        "document_id",
        Text,
        ForeignKey(f"{SCHEMA}.documents.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("chunk_index", Integer, nullable=False),
    Column("text", Text, nullable=False),
    Column("locale", Text, nullable=False),
    Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
    Column("metadata", JSONB, nullable=False, server_default="{}"),
    # The unique btree also serves lookups/deletes by document_id (leading column).
    UniqueConstraint("document_id", "chunk_index", name="chunks_document_id_chunk_index_key"),
    Index("chunks_locale_idx", "locale"),
    Index(
        "chunks_embedding_hnsw_idx",
        "embedding",
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    ),
)
