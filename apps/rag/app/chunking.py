"""Paragraph- and sentence-aware chunking (pure functions).

Strategy:
1. Split into paragraphs (blank lines) and lines (markdown bullets/headings stay whole).
2. Split lines into sentences on . ! ? … and the Arabic ؟ and ۔ (followed by whitespace).
   A sentence longer than ``max_words`` is split on clause punctuation (, ، ; ؛ :) and, as a
   last resort, on word boundaries.
3. Greedily pack sentences into chunks of up to ``max_words`` words, preferring to close a chunk
   at a paragraph boundary once it has reached ``target_words * 0.6``.
4. Each new chunk starts with an overlap of the previous chunk's trailing whole sentences (up to
   ``overlap_words``); if no whole sentence fits, the last ``overlap_words`` words are used.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Bump when the algorithm or defaults change: it is part of the ingestion content hash, so a new
# version triggers re-chunking and re-embedding of every document.
CHUNKER_VERSION = "para-sent-v1"

TARGET_WORDS = 100
MAX_WORDS = 120
OVERLAP_WORDS = 15

_PARAGRAPH_RE = re.compile(r"\n\s*\n")
_SENTENCE_RE = re.compile(r"(?<=[.!?…؟۔])\s+")
_CLAUSE_RE = re.compile(r"(?<=[,،;؛:])\s+")


@dataclass(frozen=True)
class _Unit:
    text: str
    words: int
    new_line: bool  # starts a new line in the source (heading/bullet/paragraph)
    new_paragraph: bool


def _split_long(sentence: str, max_words: int) -> list[str]:
    if len(sentence.split()) <= max_words:
        return [sentence]
    pieces: list[str] = []
    current: list[str] = []
    for clause in _CLAUSE_RE.split(sentence):
        words = clause.split()
        if len(words) > max_words:  # no usable punctuation: hard split on words
            if current:
                pieces.append(" ".join(current))
                current = []
            pieces.extend(
                " ".join(words[i : i + max_words]) for i in range(0, len(words), max_words)
            )
        elif len(current) + len(words) > max_words:
            pieces.append(" ".join(current))
            current = words
        else:
            current.extend(words)
    if current:
        pieces.append(" ".join(current))
    return pieces


def split_sentences(text: str) -> list[str]:
    """Split a single line/paragraph into sentences (EN + AR punctuation)."""
    return [s.strip() for s in _SENTENCE_RE.split(text.strip()) if s.strip()]


def _units(text: str, max_words: int) -> list[_Unit]:
    units: list[_Unit] = []
    for paragraph in _PARAGRAPH_RE.split(text.strip()):
        first_in_paragraph = True
        for line in paragraph.splitlines():
            first_in_line = True
            for sentence in split_sentences(line):
                for piece in _split_long(sentence, max_words):
                    units.append(
                        _Unit(piece, len(piece.split()), first_in_line, first_in_paragraph)
                    )
                    first_in_line = first_in_paragraph = False
    return units


def _join(units: list[_Unit]) -> str:
    out = ""
    for i, unit in enumerate(units):
        if i:
            out += "\n" if unit.new_line else " "
        out += unit.text
    return out


def _overlap(units: list[_Unit], overlap_words: int) -> list[_Unit]:
    tail: list[_Unit] = []
    total = 0
    for unit in reversed(units):
        if total + unit.words > overlap_words:
            break
        tail.insert(0, unit)
        total += unit.words
    if tail or overlap_words <= 0 or not units:
        return tail
    words = units[-1].text.split()[-overlap_words:]
    return [_Unit(" ".join(words), len(words), False, False)]


def chunk_text(
    text: str,
    *,
    target_words: int = TARGET_WORDS,
    max_words: int = MAX_WORDS,
    overlap_words: int = OVERLAP_WORDS,
) -> list[str]:
    """Split ``text`` into overlapping chunks of at most ``max_words`` words.

    Text that fits in ``max_words`` is returned as a single chunk. Empty text yields ``[]``.
    """
    if not 0 <= overlap_words < target_words <= max_words:
        raise ValueError("expected 0 <= overlap_words < target_words <= max_words")
    units = _units(text, max_words)
    if not units:
        return []
    if sum(u.words for u in units) <= max_words:
        return [_join(units)]

    chunks: list[str] = []
    current: list[_Unit] = []
    fresh = 0  # words in `current` that are not overlap from the previous chunk
    for unit in units:
        size = sum(u.words for u in current)
        paragraph_break = unit.new_paragraph and size >= target_words * 0.6
        if fresh and (size + unit.words > max_words or paragraph_break):
            chunks.append(_join(current))
            current = _overlap(current, overlap_words)
            if sum(u.words for u in current) + unit.words > max_words:
                current = []
            fresh = 0
        current.append(unit)
        fresh += unit.words
    if fresh:
        chunks.append(_join(current))
    return chunks
