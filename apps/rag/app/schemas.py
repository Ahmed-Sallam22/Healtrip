"""HTTP request/response models (camelCase JSON)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pydantic.alias_generators import to_camel

Locale = Literal["en", "ar"]
SourceType = Literal["doctor_bio", "hospital_profile", "patient_guide"]


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class SearchRequest(_CamelModel):
    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]
    locale: Locale | None = None
    source_types: Annotated[list[SourceType], Field(min_length=1)] | None = None
    top_k: Annotated[int, Field(ge=1, le=20)] = 5
    min_score: Annotated[float, Field(ge=0.0, le=1.0)] | None = None


class SearchResult(_CamelModel):
    chunk_id: str
    document_id: str
    source_type: SourceType
    source_id: str | None
    title: str
    text: str
    score: float
    locale: Locale


class SearchResponse(_CamelModel):
    results: list[SearchResult]
    embedding_model: str
    min_score: float
    took_ms: int


class IngestRequest(_CamelModel):
    force: bool = False


class IngestResponse(_CamelModel):
    created: int
    updated: int
    unchanged: int
    deleted: int
    skipped_orphans: int
    chunks: int
    embedding_model: str


class HealthResponse(_CamelModel):
    status: Literal["ok", "degraded"]
    db: Literal["ok", "error"]
    embeddings: str
    documents: int | None
