"""Text normalisation and tokenisation for English and Arabic.

Used by the mock (lexical) embeddings provider and by the chunker's word counting.
Everything here is pure and deterministic.
"""

from __future__ import annotations

import re
import unicodedata

# Arabic diacritics (harakat, tanween, shadda, sukun, superscript alef) and tatweel.
_AR_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭ]")
_AR_TATWEEL = "ـ"
_AR_CHAR_MAP = str.maketrans(
    {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ة": "ه",
        "ى": "ي",
        "ؤ": "و",
        "ئ": "ي",
        # Arabic-Indic and Extended Arabic-Indic digits -> ASCII.
        **{chr(0x0660 + i): str(i) for i in range(10)},
        **{chr(0x06F0 + i): str(i) for i in range(10)},
    }
)
# Longest first: definite article, optionally preceded by و / ب / ك / ف, and لل ("for the").
_AR_PREFIXES = ("وال", "بال", "كال", "فال", "لل", "ال")

_TOKEN_RE = re.compile(r"[a-z0-9]+|[ء-ي]+")

_EN_STOPWORDS_RAW = """
a an the and or but if of to in on at by for with from as is are was were be been being am
do does did doing have has had having i me my we our you your he she him her his it its they
them their this that these those what which who whom whose when where why how can could should
would will shall may might must not no yes so than too very just about into over under also any
some all more most other such only own same there here then up down out off again further once
each both few nor now get need want like please tell know find one per via usually s t
""".split()

# Domain-generic words: they occur in almost every document of this corpus, so for a model
# without IDF they would dominate similarity ("which doctor ..." would match every bio).
# Also the boilerplate disclaimer words that start every guide.
_EN_DOMAIN_STOPWORDS = """
doctor dr hospital patient medical healtrip experience experienced specialist
sample prototype fictional
""".split()

_AR_STOPWORDS_RAW = """
في من إلى الى على عن مع هذا هذه ذلك تلك التي الذي الذين هو هي هم هن أنت انت نحن أنا انا أن إن
أو ثم كما لكن قد كل بعض غير بين عند عندما كيف ما ماذا متى أين لماذا هل أي لا لم لن ليس كان كانت
يكون تكون أيضا حتى إذا اذا لدى ذات ضمن خلال نحو بعد قبل فقط منذ به بها له لها عليه فيها فيه
دكتور د طبيب أطباء الطبيب مستشفى مستشفيات المستشفى مريض مرضى المريض هيلتريب خبرة متخصص
محتوى تجريبي نموذج أولي خيالي
""".split()


def normalize_arabic(text: str) -> str:
    """Remove diacritics/tatweel and unify common letter variants (أإآ→ا, ة→ه, ى→ي)."""
    text = _AR_DIACRITICS.sub("", text).replace(_AR_TATWEEL, "")
    return text.translate(_AR_CHAR_MAP)


def normalize(text: str) -> str:
    """Unicode-normalise, lowercase and apply Arabic normalisation."""
    return normalize_arabic(unicodedata.normalize("NFKC", text).casefold())


def _is_arabic(token: str) -> bool:
    return "ء" <= token[0] <= "ي"


def strip_arabic_prefix(token: str) -> str:
    """Strip a leading definite article (ال / وال / بال / كال / فال / لل) if a stem remains."""
    for prefix in _AR_PREFIXES:
        if token.startswith(prefix) and len(token) - len(prefix) >= 2:
            return token[len(prefix) :]
    return token


def stem_english(token: str) -> str:
    """Very light suffix stripping (plural, -ing, -ed, trailing -e). Not a real stemmer."""
    if len(token) <= 3 or token.isdigit():
        return token
    if token.endswith("ies") and len(token) > 4:
        token = token[:-3] + "y"
    elif token.endswith("s") and not token.endswith(("ss", "us", "is")):
        token = token[:-1]
    if token.endswith("ing") and len(token) >= 6:
        token = token[:-3]
    elif token.endswith("ed") and len(token) >= 5:
        token = token[:-2]
    if token.endswith("e") and len(token) > 4:
        token = token[:-1]
    return token


def _canonical(token: str) -> str:
    return strip_arabic_prefix(token) if _is_arabic(token) else stem_english(token)


# Stopwords are stored in canonical form so they match regardless of prefix/letter variants.
STOPWORDS: frozenset[str] = frozenset(
    _canonical(t)
    for word in (*_EN_STOPWORDS_RAW, *_EN_DOMAIN_STOPWORDS, *_AR_STOPWORDS_RAW)
    for t in _TOKEN_RE.findall(normalize(word))
) | frozenset(t for w in (*_EN_STOPWORDS_RAW, *_EN_DOMAIN_STOPWORDS) for t in [w])


def tokenize(text: str) -> list[str]:
    """Normalise, split into word tokens, canonicalise (stem / strip article) and drop stopwords."""
    out: list[str] = []
    for raw in _TOKEN_RE.findall(normalize(text)):
        if raw in STOPWORDS:
            continue
        token = _canonical(raw)
        if len(token) < 2 or token in STOPWORDS:
            continue
        out.append(token)
    return out


def word_count(text: str) -> int:
    return len(text.split())
