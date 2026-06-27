"""Seed a few sample doctors into the directory (CLAUDE.md §13.6).

Idempotent: does nothing if the table already has rows, so it is safe to run after every
deploy. Requires DATABASE_URL and an applied schema (`alembic upgrade head`).

Run:  python seed_doctors.py
"""

from __future__ import annotations

import sys

from db import Doctor, SessionLocal, count_doctors, db_enabled

# A small, realistic starter set. Specialties skew toward heart-relevant care (cardiology,
# general medicine, diabetes) since users arrive here from a CHD risk result. Phone numbers are
# placeholders for the sample data.
SAMPLE_DOCTORS = [
    {
        "name_bn": "ডা. রফিকুল ইসলাম",
        "name_en": "Dr. Rafiqul Islam",
        "specialty_bn": "হৃদরোগ বিশেষজ্ঞ",
        "specialty_en": "Cardiologist",
        "location_bn": "ঢাকা মেডিকেল কলেজ, ঢাকা",
        "location_en": "Dhaka Medical College, Dhaka",
        "phone": "+8801710000001",
    },
    {
        "name_bn": "ডা. নাসরিন আক্তার",
        "name_en": "Dr. Nasrin Akhter",
        "specialty_bn": "হৃদরোগ বিশেষজ্ঞ",
        "specialty_en": "Cardiologist",
        "location_bn": "চট্টগ্রাম মেডিকেল কলেজ, চট্টগ্রাম",
        "location_en": "Chittagong Medical College, Chattogram",
        "phone": "+8801710000002",
    },
    {
        "name_bn": "ডা. মাহমুদ হাসান",
        "name_en": "Dr. Mahmud Hasan",
        "specialty_bn": "মেডিসিন বিশেষজ্ঞ",
        "specialty_en": "General Physician",
        "location_bn": "রাজশাহী মেডিকেল কলেজ, রাজশাহী",
        "location_en": "Rajshahi Medical College, Rajshahi",
        "phone": "+8801710000003",
    },
    {
        "name_bn": "ডা. ফারজানা রহমান",
        "name_en": "Dr. Farzana Rahman",
        "specialty_bn": "ডায়াবেটিস বিশেষজ্ঞ",
        "specialty_en": "Diabetes Specialist",
        "location_bn": "বারডেম হাসপাতাল, ঢাকা",
        "location_en": "BIRDEM Hospital, Dhaka",
        "phone": "+8801710000004",
    },
    {
        "name_bn": "ডা. কামরুল আহসান",
        "name_en": "Dr. Kamrul Ahsan",
        "specialty_bn": "মেডিসিন বিশেষজ্ঞ",
        "specialty_en": "General Physician",
        "location_bn": "সিলেট এম.এ.জি. ওসমানী মেডিকেল কলেজ, সিলেট",
        "location_en": "Sylhet MAG Osmani Medical College, Sylhet",
        "phone": "+8801710000005",
    },
    {
        "name_bn": "ডা. সুমাইয়া পারভীন",
        "name_en": "Dr. Sumaiya Parvin",
        "specialty_bn": "হৃদরোগ বিশেষজ্ঞ",
        "specialty_en": "Cardiologist",
        "location_bn": "খুলনা মেডিকেল কলেজ, খুলনা",
        "location_en": "Khulna Medical College, Khulna",
        "phone": "+8801710000006",
    },
]


def seed() -> int:
    if not db_enabled():
        print("DATABASE_URL is not set — cannot seed. See backend/.env.example.", file=sys.stderr)
        return 1

    session = SessionLocal()
    try:
        existing = count_doctors(session)
        if existing > 0:
            print(f"Doctors table already has {existing} row(s); skipping seed (idempotent).")
            return 0
        session.add_all(Doctor(**d) for d in SAMPLE_DOCTORS)
        session.commit()
        print(f"Seeded {len(SAMPLE_DOCTORS)} doctors.")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(seed())
