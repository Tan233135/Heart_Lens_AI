"""Alembic migration environment for HeartLens.

Reads DATABASE_URL from the environment (loading backend/.env for local dev) so migrations
run identically locally and on Railway. Target metadata is HeartLens's SQLAlchemy Base, so
`alembic revision --autogenerate` stays in sync with db.py.
"""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the backend package importable (env.py runs from backend/ via prepend_sys_path, but be
# explicit so it works regardless of CWD).
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# Load backend/.env if python-dotenv is available, so local `alembic upgrade` sees DATABASE_URL.
try:
    from dotenv import load_dotenv

    load_dotenv(BACKEND_DIR / ".env")
except Exception:
    pass

from db import Base, _normalize_database_url  # noqa: E402  (import after sys.path setup)
import db  # noqa: E402,F401  (ensure Assessment model is registered on Base.metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Point it at your Postgres before running migrations "
        "(see backend/.env.example)."
    )
config.set_main_option("sqlalchemy.url", _normalize_database_url(DATABASE_URL))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
