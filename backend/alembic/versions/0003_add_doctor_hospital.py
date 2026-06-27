"""add optional hospital/clinic columns to doctors

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-27

Adds bilingual, NULLABLE hospital/clinic-name columns to the doctor directory (CLAUDE.md
§13.6), separate from the area in location_*. Nullable because not every referral entry names
a specific facility. Public referral information, not patient data.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("doctors", sa.Column("hospital_bn", sa.String(length=200), nullable=True))
    op.add_column("doctors", sa.Column("hospital_en", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("doctors", "hospital_en")
    op.drop_column("doctors", "hospital_bn")
