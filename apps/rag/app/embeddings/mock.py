"""Deterministic feature-hashing embeddings: a LEXICAL stand-in, not a semantic model.

Lets the whole stack run without API keys or model downloads while still giving meaningful
keyword retrieval:

* text is normalised (lowercase, Arabic letter/diacritic unification), tokenised, stripped of
  EN/AR stopwords (including domain-generic words such as "doctor" / "مستشفى") and lightly
  stemmed (see ``app.text``);
* each token contributes a word feature (weight 1.0, sublinear in term frequency) plus its
  character 4-grams (weight 0.4 each, so "stent" ~ "stenting", "cardiology" ~ "cardiologist");
* every feature is hashed with blake2b into ``HASHES_PER_FEATURE`` of the ``EMBEDDING_DIM``
  buckets with a hash-derived sign (the signed "hashing trick" keeps collisions unbiased;
  two hashes per feature make random collisions less spiky, which lowered the best score of
  off-topic queries from ~0.25 to ~0.20 on the seeded corpus), then the vector is
  L2-normalised.

Cosine similarity therefore approximates weighted term overlap. It knows nothing about
synonyms or cross-lingual meaning: "heart" will not match "قلب".
"""

from __future__ import annotations

import hashlib
import math
from collections import Counter
from collections.abc import Sequence

from app.config import EMBEDDING_DIM
from app.text import tokenize

WORD_WEIGHT = 1.0
CHAR_NGRAM_WEIGHT = 0.4
CHAR_NGRAM_SIZE = 4
HASHES_PER_FEATURE = 2


def _features(text: str) -> Counter[str]:
    features: Counter[str] = Counter()
    for token in tokenize(text):
        features[f"w:{token}"] += 1
        padded = f"<{token}>"
        for i in range(len(padded) - CHAR_NGRAM_SIZE + 1):
            features[f"c:{padded[i : i + CHAR_NGRAM_SIZE]}"] += 1
    return features


def _buckets(feature: str) -> list[tuple[int, float]]:
    out = []
    for seed in range(HASHES_PER_FEATURE):
        digest = hashlib.blake2b(f"{seed}:{feature}".encode(), digest_size=8).digest()
        value = int.from_bytes(digest, "big")
        out.append((value % EMBEDDING_DIM, 1.0 if (value >> 63) & 1 else -1.0))
    return out


def hash_embed(text: str) -> list[float]:
    """Embed ``text`` into a unit vector (all zeros if it has no content tokens)."""
    vector = [0.0] * EMBEDDING_DIM
    for feature, count in _features(text).items():
        base = WORD_WEIGHT if feature.startswith("w:") else CHAR_NGRAM_WEIGHT
        weight = base * (1.0 + math.log(count)) / math.sqrt(HASHES_PER_FEATURE)
        for index, sign in _buckets(feature):
            vector[index] += sign * weight
    norm = math.sqrt(sum(v * v for v in vector))
    return [v / norm for v in vector] if norm else vector


class MockEmbeddings:
    name = "mock-lexical-hash-v1"

    def __init__(self, default_min_score: float) -> None:
        self.default_min_score = default_min_score

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return [hash_embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return hash_embed(text)
