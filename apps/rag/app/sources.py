"""Load knowledge-base source documents.

* ``SEED_DATA_DIR/doctors.json``   -> ``doctor_bio`` documents (one per doctor per locale)
* ``SEED_DATA_DIR/hospitals.json`` -> ``hospital_profile`` documents (one per hospital per locale)
* ``KB_DIR/guides/<slug>.<locale>.md`` -> ``patient_guide`` documents

Missing seed files raise instead of yielding an empty list: an empty source set would make the
ingestion delete every indexed document.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, TypeAdapter

_GUIDE_FILE_RE = re.compile(r"^(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.(?P<locale>en|ar)\.md$")
_FRONTMATTER_RE = re.compile(r"\A---\s*\n(?P<meta>.*?)\n---\s*\n(?P<body>.*)\Z", re.DOTALL)

_CITY_AR = {"Cairo": "القاهرة", "Giza": "الجيزة", "Alexandria": "الإسكندرية", "Istanbul": "إسطنبول"}


class SourceError(ValueError):
    """A source file is missing or malformed."""


@dataclass(frozen=True)
class SourceDocument:
    id: str
    source_type: str
    source_id: str | None
    locale: str
    title: str
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)


class _Record(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Doctor(_Record):
    id: str
    nameEn: str
    nameAr: str
    specialtyCode: str
    hospitalId: str
    bioEn: str
    bioAr: str


class _Hospital(_Record):
    id: str
    nameEn: str
    nameAr: str
    city: str
    profileEn: str
    profileAr: str


class _Specialty(_Record):
    code: str
    nameEn: str
    nameAr: str


def _load_json(path: Path, model: type[_Record]) -> list[Any]:
    if not path.is_file():
        raise SourceError(f"seed file not found: {path}")
    try:
        return TypeAdapter(list[model]).validate_python(json.loads(path.read_text("utf-8")))
    except ValueError as exc:
        raise SourceError(f"invalid seed file {path}: {exc}") from exc


def doc_id(source_type: str, key: str, locale: str) -> str:
    return f"{source_type}:{key}:{locale}"


def load_hospital_profiles(seed_dir: Path) -> list[SourceDocument]:
    docs: list[SourceDocument] = []
    for h in _load_json(seed_dir / "hospitals.json", _Hospital):
        city_ar = _CITY_AR.get(h.city, h.city)
        for locale, title, content in (
            ("en", h.nameEn, f"{h.nameEn} — {h.city}.\n\n{h.profileEn}"),
            ("ar", h.nameAr, f"{h.nameAr} — {city_ar}.\n\n{h.profileAr}"),
        ):
            docs.append(
                SourceDocument(
                    id=doc_id("hospital_profile", h.id, locale),
                    source_type="hospital_profile",
                    source_id=h.id,
                    locale=locale,
                    title=title,
                    content=content,
                    metadata={"city": h.city},
                )
            )
    return docs


def load_doctor_bios(seed_dir: Path) -> list[SourceDocument]:
    specialties_path = seed_dir / "specialties.json"
    specialties = (
        {s.code: s for s in _load_json(specialties_path, _Specialty)}
        if specialties_path.is_file()
        else {}
    )
    hospitals = {h.id: h for h in _load_json(seed_dir / "hospitals.json", _Hospital)}
    docs: list[SourceDocument] = []
    for d in _load_json(seed_dir / "doctors.json", _Doctor):
        spec = specialties.get(d.specialtyCode)
        spec_en = spec.nameEn if spec else d.specialtyCode.replace("_", " ").title()
        spec_ar = spec.nameAr if spec else spec_en
        hosp = hospitals.get(d.hospitalId)
        where_en = f", {hosp.nameEn} ({hosp.city})" if hosp else ""
        where_ar = f"، {hosp.nameAr} ({_CITY_AR.get(hosp.city, hosp.city)})" if hosp else ""
        for locale, title, content in (
            ("en", f"{d.nameEn} — {spec_en}", f"{d.nameEn} — {spec_en}{where_en}.\n\n{d.bioEn}"),
            ("ar", f"{d.nameAr} — {spec_ar}", f"{d.nameAr} — {spec_ar}{where_ar}.\n\n{d.bioAr}"),
        ):
            docs.append(
                SourceDocument(
                    id=doc_id("doctor_bio", d.id, locale),
                    source_type="doctor_bio",
                    source_id=d.id,
                    locale=locale,
                    title=title,
                    content=content,
                    metadata={"specialtyCode": d.specialtyCode, "hospitalId": d.hospitalId},
                )
            )
    return docs


def parse_guide(path: Path) -> SourceDocument:
    match = _GUIDE_FILE_RE.match(path.name)
    if not match:
        raise SourceError(f"guide file name must be <slug>.<en|ar>.md: {path.name}")
    raw = path.read_text("utf-8")
    fm = _FRONTMATTER_RE.match(raw)
    if not fm:
        raise SourceError(f"guide {path.name} is missing a '---' frontmatter block")
    meta = dict(
        (key.strip(), value.strip())
        for key, _, value in (line.partition(":") for line in fm["meta"].splitlines())
        if key.strip()
    )
    title, body = meta.get("title"), fm["body"].strip()
    if not title or not body:
        raise SourceError(f"guide {path.name} needs a 'title:' and a non-empty body")
    slug, locale = match["slug"], match["locale"]
    return SourceDocument(
        id=doc_id("patient_guide", slug, locale),
        source_type="patient_guide",
        source_id=None,
        locale=locale,
        title=title,
        content=body,
        metadata={"slug": slug},
    )


def load_guides(kb_dir: Path) -> list[SourceDocument]:
    guides_dir = kb_dir / "guides"
    if not guides_dir.is_dir():
        raise SourceError(f"guides directory not found: {guides_dir}")
    return [parse_guide(p) for p in sorted(guides_dir.glob("*.md"))]


def load_all(seed_dir: Path, kb_dir: Path) -> list[SourceDocument]:
    return [*load_doctor_bios(seed_dir), *load_hospital_profiles(seed_dir), *load_guides(kb_dir)]
