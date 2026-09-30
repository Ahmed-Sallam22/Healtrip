import math

from app.config import EMBEDDING_DIM
from app.embeddings.mock import MockEmbeddings, hash_embed
from app.text import normalize_arabic, tokenize


def _cos(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


def test_deterministic_dimension_and_unit_norm() -> None:
    a = hash_embed("Interventional cardiologist performing heart stent procedures")
    b = hash_embed("Interventional cardiologist performing heart stent procedures")
    assert a == b
    assert len(a) == EMBEDDING_DIM
    assert math.isclose(math.sqrt(sum(v * v for v in a)), 1.0, rel_tol=1e-9)


def test_text_without_content_tokens_is_zero_vector() -> None:
    assert hash_embed("the of and ???") == [0.0] * EMBEDDING_DIM


def test_arabic_normalisation_unifies_variants() -> None:
    assert normalize_arabic("مُسْتَشْفَى") == "مستشفي"
    assert normalize_arabic("أإآ ة ى ـــ") == "ااا ه ي "
    # article stripping + letter unification map these spellings to the same token
    assert tokenize("المستشفى") == tokenize("مستشفي") == tokenize("مستشفى") == []  # stopword
    assert tokenize("القلب") == tokenize("قلب") == tokenize("والقلب") == ["قلب"]
    assert tokenize("الرأي") == tokenize("رأى") == ["راي"]
    assert hash_embed("المستشفى الجامعة") == hash_embed("مستشفي جامعه")


def test_english_light_stemming_and_stopwords() -> None:
    assert tokenize("Which doctor has experience with heart stents?") == ["heart", "stent"]
    assert tokenize("stenting") == tokenize("stents") == ["stent"]


def test_related_texts_score_higher_than_unrelated() -> None:
    provider = MockEmbeddings(default_min_score=0.25)
    query = provider.embed_query("cardiologist for heart stents")
    related, unrelated = provider.embed_documents(
        [
            "Interventional cardiologist performing coronary stenting and heart stent procedures.",
            "Dermatologist treating acne, eczema and fungal skin infections.",
        ]
    )
    assert _cos(query, related) > 0.3
    assert _cos(query, related) > _cos(query, unrelated) + 0.2

    ar_query = provider.embed_query("الرأي الطبي الثاني")
    ar_related, ar_unrelated = provider.embed_documents(
        ["كيف يعمل الرأي الطبي الثاني في المستشفى", "علاج حب الشباب والأكزيما"]
    )
    assert _cos(ar_query, ar_related) > _cos(ar_query, ar_unrelated) + 0.2
