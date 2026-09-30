from itertools import pairwise

import pytest

from app.chunking import chunk_text, split_sentences


def _words(text: str) -> list[str]:
    return text.split()


def test_short_text_is_one_chunk() -> None:
    text = "Dr. Karim Fawzy — Cardiology.\n\nInterventional cardiologist. Reviews angiograms."
    assert chunk_text(text) == [
        "Dr. Karim Fawzy — Cardiology.\nInterventional cardiologist. Reviews angiograms."
    ]


def test_empty_text_has_no_chunks() -> None:
    assert chunk_text("   \n\n ") == []


def test_long_text_respects_limit_and_overlaps() -> None:
    sentences = [f"Sentence number {i} has exactly seven words." for i in range(60)]
    text = " ".join(sentences)  # 420 words, no paragraph breaks
    chunks = chunk_text(text, target_words=100, max_words=120, overlap_words=15)

    assert len(chunks) >= 4
    assert all(len(_words(c)) <= 120 for c in chunks)
    # every chunk ends on a sentence boundary
    assert all(c.endswith(".") for c in chunks)
    # consecutive chunks share the previous chunk's trailing sentences (2 x 7 words <= 15)
    for prev, nxt in pairwise(chunks):
        assert split_sentences(nxt)[:2] == split_sentences(prev)[-2:]
    # nothing is lost
    covered = set().union(*(split_sentences(c) for c in chunks))
    assert covered == set(sentences)


def test_prefers_paragraph_boundaries() -> None:
    para = " ".join(["Alpha beta gamma delta epsilon zeta eta theta."] * 9)  # 72 words
    chunks = chunk_text(f"{para}\n\n{para}", target_words=100, max_words=120, overlap_words=15)
    assert len(chunks) == 2
    assert chunks[0] == para


def test_overlong_sentence_is_split_on_clauses_then_words() -> None:
    sentence = ", ".join(["one two three four five six seven eight nine ten"] * 30) + "."
    chunks = chunk_text(sentence, target_words=50, max_words=60, overlap_words=5)
    assert len(chunks) > 1
    assert all(len(_words(c)) <= 60 for c in chunks)


def test_arabic_sentence_splitting() -> None:
    text = "ما هو الرأي الطبي الثاني؟ هو مراجعة لتشخيصك۔ يستغرق عادة ثلاثة أيام. هل هو مفيد؟"
    assert split_sentences(text) == [
        "ما هو الرأي الطبي الثاني؟",
        "هو مراجعة لتشخيصك۔",
        "يستغرق عادة ثلاثة أيام.",
        "هل هو مفيد؟",
    ]


def test_long_arabic_text_chunks_on_arabic_punctuation() -> None:
    sentence = "يراجع الطبيب المتخصص التقارير وصور الأشعة، ثم يكتب رأيه بوضوح للمريض؟"  # 11 words
    chunks = chunk_text(" ".join([sentence] * 30), target_words=40, max_words=50, overlap_words=12)
    assert len(chunks) > 1
    assert all(c.endswith("؟") for c in chunks)
    assert all(len(_words(c)) <= 50 for c in chunks)


def test_deterministic() -> None:
    text = " ".join(f"Line {i} of a guide about travel." for i in range(80))
    assert chunk_text(text) == chunk_text(text)


def test_rejects_inconsistent_parameters() -> None:
    with pytest.raises(ValueError):
        chunk_text("x", target_words=50, max_words=40)
