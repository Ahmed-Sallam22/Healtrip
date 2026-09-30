"""Structured (JSON-lines) logging with the current request id attached."""

from __future__ import annotations

import json
import logging
from contextvars import ContextVar
from datetime import UTC, datetime

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

_STD_ATTRS = set(logging.LogRecord("", 0, "", 0, "", None, None).__dict__) | {"message", "taskName"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if (request_id := request_id_var.get()) is not None:
            entry["requestId"] = request_id
        entry.update({k: v for k, v in record.__dict__.items() if k not in _STD_ATTRS})
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # uvicorn's own access log duplicates our request log line.
    logging.getLogger("uvicorn.access").disabled = True
