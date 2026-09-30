"""End-to-end API tests against the test DB with the real seed data and KB guides."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app.config import Settings
from app.embeddings.mock import MockEmbeddings
from app.main import create_app
from tests.conftest import TEST_TOKEN

AUTH = {"X-Internal-Token": TEST_TOKEN}


@pytest.fixture(scope="module")
def client(engine: Engine, settings: Settings, provider: MockEmbeddings) -> Iterator[TestClient]:
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE rag.documents CASCADE"))
    with TestClient(create_app(settings, engine=engine, provider=provider)) as test_client:
        response = test_client.post("/ingest", json={}, headers=AUTH)
        assert response.status_code == 200, response.text
        summary = response.json()
        assert summary["created"] == 90 and summary["skippedOrphans"] == 0
        yield test_client


def _search(client: TestClient, **body) -> dict:
    response = client.post("/search", json=body, headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def test_requires_internal_token(client: TestClient) -> None:
    for headers in ({}, {"X-Internal-Token": "wrong"}):
        response = client.post("/search", json={"query": "heart stents"}, headers=headers)
        assert response.status_code == 401
        assert response.json()["code"] == "UNAUTHORIZED"
    assert client.post("/ingest", json={}).status_code == 401


def test_health_is_public(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "db": "ok",
        "embeddings": "mock-lexical-hash-v1",
        "documents": 90,
    }


def test_second_ingest_is_noop(client: TestClient) -> None:
    summary = client.post("/ingest", headers=AUTH).json()
    assert (summary["created"], summary["updated"], summary["unchanged"]) == (0, 0, 90)


def test_stents_query_cites_cardiologist_bio(client: TestClient) -> None:
    body = _search(
        client, query="Which cardiologist has experience with heart stents?", locale="en"
    )
    results = body["results"]
    assert results, "expected matches"
    assert "doctor_bio:doc-cai-card-01:en#0" in [r["chunkId"] for r in results[:3]]
    karim = next(r for r in results if r["chunkId"] == "doctor_bio:doc-cai-card-01:en#0")
    assert karim["sourceType"] == "doctor_bio" and karim["sourceId"] == "doc-cai-card-01"
    assert body["embeddingModel"] == "mock-lexical-hash-v1"
    assert body["minScore"] == 0.25
    assert isinstance(body["tookMs"], int)


def test_second_opinion_query_returns_guide_first(client: TestClient) -> None:
    results = _search(client, query="how does the second opinion process work")["results"]
    assert results[0]["documentId"] == "patient_guide:second-opinion:en"
    assert results[0]["sourceId"] is None


def test_arabic_second_opinion_query(client: TestClient) -> None:
    results = _search(client, query="كيف تعمل عملية الرأي الطبي الثاني؟", locale="ar")["results"]
    assert results[0]["documentId"] == "patient_guide:second-opinion:ar"
    assert all(r["locale"] == "ar" for r in results)


@pytest.mark.parametrize(
    "query",
    [
        "What is the price of parking at the airport?",
        "best pizza recipe",
        "What is the weather in London tomorrow?",
        "طريقة عمل البيتزا",
        "what is the",  # only stopwords -> zero query vector
    ],
)
def test_irrelevant_queries_return_no_results(client: TestClient, query: str) -> None:
    assert _search(client, query=query)["results"] == []


def test_result_shape_and_filters(client: TestClient) -> None:
    body = _search(
        client, query="knee replacement surgery", sourceTypes=["doctor_bio"], topK=3, minScore=0.1
    )
    results = body["results"]
    assert 0 < len(results) <= 3
    assert body["minScore"] == 0.1
    for r in results:
        assert set(r) == {
            "chunkId",
            "documentId",
            "sourceType",
            "sourceId",
            "title",
            "text",
            "score",
            "locale",
        }
        assert r["sourceType"] == "doctor_bio" and r["chunkId"].startswith(r["documentId"] + "#")
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)


def test_validation_errors_use_error_shape(client: TestClient) -> None:
    response = client.post("/search", json={"query": "hi", "topK": 50}, headers=AUTH)
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert {d["field"] for d in body["details"]} == {"query", "topK"}


def test_request_id_is_echoed(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-Id": "req-123"})
    assert response.headers["X-Request-Id"] == "req-123"
    assert client.get("/health").headers["X-Request-Id"]


def test_unknown_route_uses_error_shape(client: TestClient) -> None:
    response = client.get("/nope", headers=AUTH)
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
