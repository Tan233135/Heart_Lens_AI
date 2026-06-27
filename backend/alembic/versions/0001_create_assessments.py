"""create assessments table

Revision ID: 0001
Revises:
Create Date: 2026-06-27

Initial schema for HeartLens persistence (CLAUDE.md §9). Stores one row per completed risk
screening: the 15 clinical feature values, the result, the model + threshold used, source, and
a timestamp. No direct identifiers and no images/raw OCR text are stored (see db.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# JSONB on Postgres; plain JSON on other backends (e.g. SQLite for a quick local check).
_JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "assessments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="manual"),
        sa.Column("model_used", sa.String(length=64), nullable=False),
        sa.Column("probability", sa.Float(), nullable=False),
        sa.Column("risk_category", sa.String(length=16), nullable=False),
        sa.Column("high_risk_threshold", sa.Float(), nullable=False),
        sa.Column("features", _JSON, nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assessments_created_at", "assessments", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_assessments_created_at", table_name="assessments")
    op.drop_table("assessments")
