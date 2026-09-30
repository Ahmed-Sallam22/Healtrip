"""FastAPI application: internal RAG service for the HealTrip API."""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import Engine, func, select
from sqlalchemy.exc import SQLAlchemyError

from app.config import Settings, get_settings
from app.db import bootstrap_schema, make_engine
from app.embeddings import EmbeddingsProvider, get_provider
from app.errors import error_response, register_exception_handlers
from app.ingest import run_ingestion
from app.logging_setup import configure_logging, request_id_var
from app.models import documents
from app.schemas import (
    HealthResponse,
    IngestRequest,
    IngestResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
)
from app.search import search
from app.security import require_internal_token

log = logging.getLogger("app")


def _engine(request: Request) -> Engine:
    return request.app.state.engine


def _provider(request: Request) -> EmbeddingsProvider:
    return request.app.state.provider


public = APIRouter()
internal = APIRouter(dependencies=[Depends(require_internal_token)])


@public.get("/health", response_model=HealthResponse, responses={503: {"model": HealthResponse}})
def health(request: Request) -> HealthResponse | JSONResponse:
    provider = _provider(request)
    try:
        with _engine(request).connect() as conn:
            count = conn.execute(select(func.count()).select_from(documents)).scalar_one()
    except SQLAlchemyError as exc:
        log.warning("health check: database error: %s", exc.__class__.__name__)
        body = HealthResponse(
            status="degraded", db="error", embeddings=provider.name, documents=None
        )
        return JSONResponse(body.model_dump(by_alias=True), status_code=503)
    # An empty index is still "up" (200) but flagged, since every search would return nothing.
    status = "ok" if count > 0 else "degraded"
    return HealthResponse(status=status, db="ok", embeddings=provider.name, documents=count)


@internal.post("/search", response_model=SearchResponse)
def search_endpoint(body: SearchRequest, request: Request) -> SearchResponse:
    started = time.perf_counter()
    settings: Settings = request.app.state.settings
    provider = _provider(request)
    # Precedence: request > RAG_MIN_SCORE > provider default.
    min_score = next(
        s
        for s in (body.min_score, settings.rag_min_score, provider.default_min_score)
        if s is not None
    )
    hits = search(
        _engine(request),
        provider,
        body.query,
        top_k=body.top_k,
        min_score=min_score,
        locale=body.locale,
        source_types=body.source_types,
    )
    took_ms = round((time.perf_counter() - started) * 1000)
    log.info(
        "search",
        extra={"results": len(hits), "locale": body.locale, "topK": body.top_k, "tookMs": took_ms},
    )
    return SearchResponse(
        results=[SearchResult(**vars(h)) for h in hits],
        embedding_model=provider.name,
        min_score=min_score,
        took_ms=took_ms,
    )


@internal.post("/ingest", response_model=IngestResponse)
def ingest_endpoint(request: Request, body: IngestRequest | None = None) -> IngestResponse:
    summary = run_ingestion(
        request.app.state.settings,
        _engine(request),
        _provider(request),
        force=body.force if body else False,
    )
    return IngestResponse.model_validate(summary.to_dict())


def create_app(
    settings: Settings | None = None,
    engine: Engine | None = None,
    provider: EmbeddingsProvider | None = None,
) -> FastAPI:
    """Application factory. Tests inject settings/engine/provider; production uses env config."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings
        app.state.engine = engine or make_engine(settings.rag_database_url)
        app.state.provider = provider or get_provider(settings)
        # Fail fast if the DB is unreachable: the orchestrator restarts us.
        bootstrap_schema(app.state.engine)
        if settings.rag_auto_ingest:
            try:
                summary = run_ingestion(settings, app.state.engine, app.state.provider)
                log.info("auto-ingest complete", extra={"summary": summary.to_dict()})
            except Exception:  # keep serving the existing index
                log.exception("auto-ingest failed")
        log.info(
            "rag service ready",
            extra={"embeddings": app.state.provider.name, "env": settings.app_env},
        )
        yield
        if engine is None:
            app.state.engine.dispose()

    app = FastAPI(
        title="HealTrip RAG service",
        version="0.1.0",
        description="Internal retrieval over doctor bios, hospital profiles and patient guides. "
        "All endpoints except /health require the X-Internal-Token header.",
        lifespan=lifespan,
    )
    register_exception_handlers(app)

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        token = request_id_var.set(request_id[:128])
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            log.exception("unhandled error")
            response = error_response(500, "INTERNAL_ERROR", "Internal server error.")
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-Id"] = request_id[:128]
        log.info(
            "request",
            extra={
                "requestId": request_id[:128],
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "durationMs": round((time.perf_counter() - started) * 1000, 1),
            },
        )
        return response

    app.include_router(public)
    app.include_router(internal)
    return app


app = create_app()
