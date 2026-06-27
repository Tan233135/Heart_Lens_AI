"""PostgreSQL persistence for HeartLens (CLAUDE.md §9, §10).

We persist one row per completed risk assessment so the app can show a user their history
and so we have an auditable record of what the model was shown and what it returned.

What we DELIBERATELY do NOT store (CLAUDE.md §13.5 — "no PHI beyond what's necessary, and
treat health data carefully"):
  - no name, phone, address, or any direct identifier,
  - no uploaded report image and no raw OCR text.
We keep only the 15 clinical feature values needed to reproduce/audit the score, the score
itself, the model + threshold used, and a timestamp. That is the minimum required to support
history and audit without accumulating an identifiable health dossier.

The connection string comes from DATABASE_URL (Railway provides it for the managed Postgres
service; locally you point it at your own Postgres — see backend/.env.example). If DATABASE_URL
is unset the app still runs: persistence becomes a no-op and history is empty, because a
logging/DB problem must NEVER block or corrupt a safety-critical prediction result.
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    create_engine,
    func,
    or_,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.types import JSON


def _normalize_database_url(url: str) -> str:
    """Make a DATABASE_URL usable by SQLAlchemy + psycopg 3.

    Railway/Heroku hand out URLs like `postgres://...` or `postgresql://...`, which SQLAlchemy
    would route to psycopg2. We pin the psycopg 3 driver explicitly so the scheme always
    matches the installed driver.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


# DATABASE_URL is OPTIONAL. With nothing set we default to a LOCAL SQLite file living next to
# this module (backend/heartlens.db), so the app is fully self-contained for local use and needs
# no external database. Point DATABASE_URL at a postgres:// URL to use Postgres instead (the
# psycopg 3 driver is selected automatically by _normalize_database_url). An empty string is
# treated the same as unset.
_DEFAULT_SQLITE_PATH = Path(__file__).parent / "heartlens.db"
DATABASE_URL: str = os.getenv("DATABASE_URL") or f"sqlite:///{_DEFAULT_SQLITE_PATH}"

# Build the engine once at import (this module is imported once). For SQLite we must allow the
# connection across threads (FastAPI runs request handlers in a threadpool) and skip pool_pre_ping
# (a file DB never "drops" a connection the way a remote Postgres can).
_normalized_url = _normalize_database_url(DATABASE_URL)
_is_sqlite = _normalized_url.startswith("sqlite")
engine = create_engine(
    _normalized_url,
    pool_pre_ping=not _is_sqlite,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    future=True,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


def init_db() -> None:
    """Create any missing tables (idempotent). Used for local SQLite where we don't run Alembic."""
    Base.metadata.create_all(engine)


class Base(DeclarativeBase):
    pass


# JSON column type: JSONB on Postgres (indexable, efficient), plain JSON elsewhere so the
# schema/migrations also work against SQLite for quick local checks.
_JSON = JSON().with_variant(JSONB, "postgresql")


class Assessment(Base):
    """One stored risk-screening result. See module docstring for the data-minimization rules."""

    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    # "manual" (typed into the form) or "image" (OCR flow) — useful context, not identifying.
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="manual")
    model_used: Mapped[str] = mapped_column(String(64), nullable=False)
    probability: Mapped[float] = mapped_column(Float, nullable=False)
    risk_category: Mapped[str] = mapped_column(String(16), nullable=False)
    # The exact threshold used to derive risk_category, so an old row stays interpretable even
    # if HIGH_RISK_THRESHOLD is later retuned (CLAUDE.md §2).
    high_risk_threshold: Mapped[float] = mapped_column(Float, nullable=False)
    # The 15 clinical feature values shown to the model (CLAUDE.md §5). Stored as JSON so the
    # schema does not have to change if the feature set ever does.
    features: Mapped[dict] = mapped_column(_JSON, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "source": self.source,
            "model_used": self.model_used,
            "probability": self.probability,
            "risk_category": self.risk_category,
            "high_risk_threshold": self.high_risk_threshold,
            "features": self.features,
        }


class Doctor(Base):
    """A referral entry for the doctor directory (CLAUDE.md §13.6).

    Bilingual by design (CLAUDE.md §1): name / specialty / location are stored in BOTH Bangla
    and English so the low-literacy, Bangla-first UI can show whichever the user has selected.
    This is public referral information (not patient data) — safe to store and serve freely.
    `is_active` lets an entry be hidden without deleting the row.
    """

    __tablename__ = "doctors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_bn: Mapped[str] = mapped_column(String(160), nullable=False)
    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    specialty_bn: Mapped[str] = mapped_column(String(160), nullable=False)
    specialty_en: Mapped[str] = mapped_column(String(160), nullable=False)
    location_bn: Mapped[str] = mapped_column(String(200), nullable=False)
    location_en: Mapped[str] = mapped_column(String(200), nullable=False)
    # Optional clinic/hospital name, separate from the area in location_* (CLAUDE.md §13.6).
    # Nullable: not every referral entry names a specific facility.
    hospital_bn: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    hospital_en: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name_bn": self.name_bn,
            "name_en": self.name_en,
            "specialty_bn": self.specialty_bn,
            "specialty_en": self.specialty_en,
            "location_bn": self.location_bn,
            "location_en": self.location_en,
            "hospital_bn": self.hospital_bn,
            "hospital_en": self.hospital_en,
            "phone": self.phone,
        }


def db_enabled() -> bool:
    return SessionLocal is not None


def get_session():
    """FastAPI dependency. Yields a Session, or None when no DATABASE_URL is configured."""
    if SessionLocal is None:
        yield None
        return
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def save_assessment(
    session: Optional[Session],
    *,
    features: dict,
    probability: float,
    risk_category: str,
    model_used: str,
    high_risk_threshold: float,
    source: str = "manual",
) -> Optional[int]:
    """Persist one assessment; return its new id (or None if persistence is unavailable).

    Best-effort by contract: a DB failure here must never propagate up and break a prediction
    response (CLAUDE.md §2 — a logging problem must not turn into a wrong/blocked health result).
    """
    if session is None:
        return None
    try:
        row = Assessment(
            features=features,
            probability=probability,
            risk_category=risk_category,
            model_used=model_used,
            high_risk_threshold=high_risk_threshold,
            source=source,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return row.id
    except Exception:
        session.rollback()
        return None


def get_recent_assessments(session: Optional[Session], limit: int = 20) -> list[dict]:
    """Return the most recent assessments, newest first. Empty list if DB is unavailable."""
    if session is None:
        return []
    stmt = select(Assessment).order_by(Assessment.created_at.desc(), Assessment.id.desc()).limit(limit)
    return [row.to_dict() for row in session.scalars(stmt)]


def search_doctors(
    session: Optional[Session],
    *,
    q: Optional[str] = None,
    specialty: Optional[str] = None,
    location: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """Search the doctor directory (CLAUDE.md §13.6). Empty list if DB is unavailable.

    `q` is a free-text term matched case-insensitively across name, specialty, and location in
    BOTH languages, so a Bangla- or English-typed query finds the same entry. `specialty` and
    `location` are optional additional filters (each on the matching bilingual columns) and
    combine with AND — e.g. specialty="Cardiologist" + location="Dhaka" returns only Dhaka
    cardiologists. Only active entries are returned, sorted by name for a stable, scannable list.
    """
    if session is None:
        return []
    stmt = select(Doctor).where(Doctor.is_active.is_(True))

    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Doctor.name_bn.ilike(like),
                Doctor.name_en.ilike(like),
                Doctor.specialty_bn.ilike(like),
                Doctor.specialty_en.ilike(like),
                Doctor.location_bn.ilike(like),
                Doctor.location_en.ilike(like),
            )
        )
    if specialty:
        slike = f"%{specialty.strip()}%"
        stmt = stmt.where(or_(Doctor.specialty_bn.ilike(slike), Doctor.specialty_en.ilike(slike)))
    if location:
        llike = f"%{location.strip()}%"
        stmt = stmt.where(or_(Doctor.location_bn.ilike(llike), Doctor.location_en.ilike(llike)))

    stmt = stmt.order_by(Doctor.name_en.asc()).limit(limit)
    return [row.to_dict() for row in session.scalars(stmt)]


def count_doctors(session: Optional[Session]) -> int:
    if session is None:
        return 0
    return int(session.scalar(select(func.count()).select_from(Doctor)) or 0)
