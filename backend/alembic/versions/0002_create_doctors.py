"""create doctors table

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-27

Doctor directory (CLAUDE.md §13.6). Bilingual name/specialty/location columns so the
Bangla-first, low-literacy UI can render either language (CLAUDE.md §1). This is public
referral information, not patient data.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "doctors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name_bn", sa.String(length=160), nullable=False),
        sa.Column("name_en", sa.String(length=160), nullable=False),
        sa.Column("specialty_bn", sa.String(length=160), nullable=False),
        sa.Column("specialty_en", sa.String(length=160), nullable=False),
        sa.Column("location_bn", sa.String(length=200), nullable=False),
        sa.Column("location_en", sa.String(length=200), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    # Index the most common search/sort column.
    op.create_index("ix_doctors_name_en", "doctors", ["name_en"])


def downgrade() -> None:
    op.drop_index("ix_doctors_name_en", table_name="doctors")
    op.drop_table("doctors")
