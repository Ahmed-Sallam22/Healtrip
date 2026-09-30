import json

import httpx
import pytest

from app.embeddings import EmbeddingsError
from app.embeddings.openai import OpenAIEmbeddings


def _provider(handler) -> OpenAIEmbeddings:
    return OpenAIEmbeddings(
        api_key="sk-test",
        model="text-embedding-3-small",
        default_min_score=0.3,
        transport=httpx.MockTransport(handler),
    )


def test_requests_384_dimensions_and_preserves_order() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["dimensions"] == 384 and request.headers["authorization"] == "Bearer sk-test"
        data = [{"index": i, "embedding": [float(i)] * 384} for i in range(len(body["input"]))]
        return httpx.Response(200, json={"data": list(reversed(data))})

    vectors = _provider(handler).embed_documents(["a", "b", "c"])
    assert [v[0] for v in vectors] == [0.0, 1.0, 2.0]


def test_http_errors_become_embeddings_errors() -> None:
    provider = _provider(lambda _: httpx.Response(429, json={"error": "rate limited"}))
    with pytest.raises(EmbeddingsError, match="HTTP 429"):
        provider.embed_query("hello")
