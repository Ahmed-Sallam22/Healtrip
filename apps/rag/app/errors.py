"""Application errors and FastAPI exception handlers producing ``{code, message}`` bodies."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.embeddings import EmbeddingsError
from app.ingest import IngestInProgressError
from app.sources import SourceError

log = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code, self.code, self.message = status_code, code, message


def error_response(status_code: int, code: str, message: str, **extra: Any) -> JSONResponse:
    return JSONResponse({"code": code, "message": message, **extra}, status_code=status_code)


_HTTP_CODES = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
            for e in exc.errors()
        ]
        return error_response(
            422, "VALIDATION_ERROR", "Request validation failed.", details=details
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        return error_response(exc.status_code, code, str(exc.detail))

    @app.exception_handler(OperationalError)
    async def _db(_: Request, exc: OperationalError) -> JSONResponse:
        log.error("database unavailable: %s", exc.orig)
        return error_response(503, "DB_UNAVAILABLE", "The knowledge base database is unavailable.")

    @app.exception_handler(EmbeddingsError)
    async def _embeddings(_: Request, exc: EmbeddingsError) -> JSONResponse:
        log.error("embeddings failure: %s", exc)
        return error_response(502, "EMBEDDINGS_UNAVAILABLE", "The embeddings provider failed.")

    @app.exception_handler(IngestInProgressError)
    async def _busy(_: Request, exc: IngestInProgressError) -> JSONResponse:
        return error_response(409, "INGEST_IN_PROGRESS", str(exc))

    @app.exception_handler(SourceError)
    async def _source(_: Request, exc: SourceError) -> JSONResponse:
        log.error("invalid knowledge-base sources: %s", exc)
        return error_response(500, "INVALID_SOURCES", str(exc))
