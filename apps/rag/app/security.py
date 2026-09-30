"""Shared-secret authentication for internal callers (the NestJS API)."""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Header, Request

from app.errors import AppError


def require_internal_token(
    request: Request,
    x_internal_token: Annotated[str | None, Header(alias="X-Internal-Token")] = None,
) -> None:
    expected: str = request.app.state.settings.internal_token
    # compare_digest on bytes: constant time and safe for non-ASCII input.
    if x_internal_token is None or not hmac.compare_digest(
        x_internal_token.encode("utf-8"), expected.encode("utf-8")
    ):
        raise AppError(401, "UNAUTHORIZED", "Missing or invalid X-Internal-Token header.")
