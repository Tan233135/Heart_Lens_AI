# HeartLens backend

FastAPI service: 10-year CHD risk **screening** (not a diagnosis — see `../CLAUDE.md` §2).

## Setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then edit .env (never commit it)
uvicorn main:app --reload
```

## Database persistence (CLAUDE.md §9, §10)

Each completed assessment is stored in Postgres: the 15 clinical inputs, the result
(probability + risk category), the model + threshold used, the source (`manual` / `image`),
and a timestamp. **No direct identifiers and no images/raw OCR text are stored** — see the
data-minimization notes in `db.py`.

If `DATABASE_URL` is unset the API still runs; persistence and `GET /history` are simply
disabled (a DB problem must never block a prediction result).

### Point DATABASE_URL at a local Postgres

Pick one and put the resulting URL in `backend/.env`:

```bash
# Option A — Docker (no local install)
docker run --name heartlens-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=heartlens -p 5432:5432 -d postgres:16
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/heartlens

# Option B — locally installed Postgres
createdb heartlens
# DATABASE_URL=postgresql://<you>@localhost:5432/heartlens
```

Both `postgres://` and `postgresql://` schemes are accepted; the psycopg 3 driver is selected
automatically (`db.py`). On Railway, the managed Postgres service provides `DATABASE_URL`.

### Migrations (Alembic)

```bash
# apply the schema (creates the `assessments` table)
alembic upgrade head

# inspect / roll back
alembic current
alembic downgrade -1

# after changing the ORM models in db.py, generate a new migration
alembic revision --autogenerate -m "describe change"
```

`alembic/env.py` reads `DATABASE_URL` from the environment (loading `backend/.env`), so the
same migrations run unchanged locally and on Railway. Run `alembic upgrade head` as part of
the backend's deploy/release step.

### Doctor directory (CLAUDE.md §13.6)

The `doctors` table (migration `0002`) holds bilingual referral entries. Seed a few samples
(idempotent — skips if rows already exist):

```bash
python seed_doctors.py
```

Search via `GET /doctors?q=<term>&specialty=<term>` — `q` matches name/specialty/location in
either language.

## Endpoints

- `POST /predict` — 15 manual features → risk estimate (persists the assessment).
- `POST /predict-from-image` — OCR → extract → predict, with the safe manual-fallback contract
  (CLAUDE.md §2, §8); persists only when a prediction is actually produced.
- `GET /history?limit=20` — recent stored assessments, newest first.
- `GET /health` — liveness + whether persistence is enabled.
