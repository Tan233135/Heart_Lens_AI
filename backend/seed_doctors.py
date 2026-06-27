"""Seed sample doctors into the directory (CLAUDE.md §13.6).

Idempotent: does nothing if the table already has rows, so it is safe to run after every
deploy. Requires DATABASE_URL and an applied schema (`alembic upgrade head`).

Run:  python seed_doctors.py

NOTE: This is PLACEHOLDER / SAMPLE data only — invented names, made-up phone numbers, and
illustrative hospital/area pairings. It is NOT a directory of real doctors and must be
replaced with verified referral data before any real-world use.
"""

from __future__ import annotations

import sys

from db import Doctor, SessionLocal, count_doctors, db_enabled

# ~18 sample entries. Specialties skew toward heart-relevant care (cardiology, general
# medicine, diabetes/endocrine) since users arrive here from a CHD risk result, with a few
# adjacent specialties. Locations use real Bangladesh areas/cities (Dhaka-heavy, plus
# Chattogram, Sylhet, Rajshahi, Khulna). `location_*` is the area + city; `hospital_*` is the
# clinic/facility. ALL placeholder — names and phone numbers are invented.
SAMPLE_DOCTORS = [
    # --- Cardiologists ---
    {
        "name_bn": "ডা. রফিকুল ইসলাম", "name_en": "Dr. Rafiqul Islam",
        "specialty_bn": "হৃদরোগ বিশেষজ্ঞ", "specialty_en": "Cardiologist",
        "location_bn": "ধানমন্ডি, ঢাকা", "location_en": "Dhanmondi, Dhaka",
        "hospital_bn": "ল্যাবএইড কার্ডিয়াক হাসপাতাল", "hospital_en": "Labaid Cardiac Hospital",
        "phone": "+8801710000001",
    },
    {
        "name_bn": "ডা. সুমাইয়া পারভীন", "name_en": "Dr. Sumaiya Parvin",
        "specialty_bn": "হৃদরোগ বিশেষজ্ঞ", "specialty_en": "Cardiologist",
        "location_bn": "মিরপুর, ঢাকা", "location_en": "Mirpur, Dhaka",
        "hospital_bn": "ন্যাশনাল হার্ট ফাউন্ডেশন", "hospital_en": "National Heart Foundation",
        "phone": "+8801710000002",
    },
    {
        "name_bn": "ডা. আনোয়ার হোসেন", "name_en": "Dr. Anwar Hossain",
        "specialty_bn": "হৃদরোগ বিশেষজ্ঞ", "specialty_en": "Cardiologist",
        "location_bn": "গুলশান, ঢাকা", "location_en": "Gulshan, Dhaka",
        "hospital_bn": "ইউনাইটেড হাসপাতাল", "hospital_en": "United Hospital",
        "phone": "+8801710000003",
    },
    {
        "name_bn": "ডা. নাসরিন আক্তার", "name_en": "Dr. Nasrin Akhter",
        "specialty_bn": "হৃদরোগ বিশেষজ্ঞ", "specialty_en": "Cardiologist",
        "location_bn": "পাঁচলাইশ, চট্টগ্রাম", "location_en": "Panchlaish, Chattogram",
        "hospital_bn": "শেভরন ক্লিনিক্যাল ল্যাব", "hospital_en": "Chevron Clinical Lab",
        "phone": "+8801710000004",
    },
    {
        "name_bn": "ডা. তাহমিনা বেগম", "name_en": "Dr. Tahmina Begum",
        "specialty_bn": "হৃদরোগ বিশেষজ্ঞ", "specialty_en": "Cardiologist",
        "location_bn": "জিন্দাবাজার, সিলেট", "location_en": "Zindabazar, Sylhet",
        "hospital_bn": "মাউন্ট অ্যাডোরা হাসপাতাল", "hospital_en": "Mount Adora Hospital",
        "phone": "+8801710000005",
    },
    # --- General Physicians ---
    {
        "name_bn": "ডা. মাহমুদ হাসান", "name_en": "Dr. Mahmud Hasan",
        "specialty_bn": "মেডিসিন বিশেষজ্ঞ", "specialty_en": "General Physician",
        "location_bn": "মহাখালী, ঢাকা", "location_en": "Mohakhali, Dhaka",
        "hospital_bn": "ইবনে সিনা হাসপাতাল", "hospital_en": "Ibn Sina Hospital",
        "phone": "+8801710000006",
    },
    {
        "name_bn": "ডা. কামরুল আহসান", "name_en": "Dr. Kamrul Ahsan",
        "specialty_bn": "মেডিসিন বিশেষজ্ঞ", "specialty_en": "General Physician",
        "location_bn": "উত্তরা, ঢাকা", "location_en": "Uttara, Dhaka",
        "hospital_bn": "ক্রিসেন্ট হাসপাতাল", "hospital_en": "Crescent Hospital",
        "phone": "+8801710000007",
    },
    {
        "name_bn": "ডা. সেলিনা খাতুন", "name_en": "Dr. Selina Khatun",
        "specialty_bn": "মেডিসিন বিশেষজ্ঞ", "specialty_en": "General Physician",
        "location_bn": "মতিঝিল, ঢাকা", "location_en": "Motijheel, Dhaka",
        "hospital_bn": "ইসলামী ব্যাংক হাসপাতাল", "hospital_en": "Islami Bank Hospital",
        "phone": "+8801710000008",
    },
    {
        "name_bn": "ডা. মিজানুর রহমান", "name_en": "Dr. Mizanur Rahman",
        "specialty_bn": "মেডিসিন বিশেষজ্ঞ", "specialty_en": "General Physician",
        "location_bn": "বোয়ালিয়া, রাজশাহী", "location_en": "Boalia, Rajshahi",
        "hospital_bn": "পপুলার ডায়াগনস্টিক সেন্টার", "hospital_en": "Popular Diagnostic Centre",
        "phone": "+8801710000009",
    },
    {
        "name_bn": "ডা. হাবিবুর রহমান", "name_en": "Dr. Habibur Rahman",
        "specialty_bn": "মেডিসিন বিশেষজ্ঞ", "specialty_en": "General Physician",
        "location_bn": "সোনাডাঙ্গা, খুলনা", "location_en": "Sonadanga, Khulna",
        "hospital_bn": "গাজী মেডিকেল কলেজ হাসপাতাল", "hospital_en": "Gazi Medical College Hospital",
        "phone": "+8801710000010",
    },
    # --- Diabetes / Endocrine ---
    {
        "name_bn": "ডা. ফারজানা রহমান", "name_en": "Dr. Farzana Rahman",
        "specialty_bn": "ডায়াবেটিস বিশেষজ্ঞ", "specialty_en": "Diabetes Specialist",
        "location_bn": "শাহবাগ, ঢাকা", "location_en": "Shahbagh, Dhaka",
        "hospital_bn": "বারডেম জেনারেল হাসপাতাল", "hospital_en": "BIRDEM General Hospital",
        "phone": "+8801710000011",
    },
    {
        "name_bn": "ডা. আমিনুল করিম", "name_en": "Dr. Aminul Karim",
        "specialty_bn": "ডায়াবেটিস বিশেষজ্ঞ", "specialty_en": "Diabetes Specialist",
        "location_bn": "শ্যামলী, ঢাকা", "location_en": "Shyamoli, Dhaka",
        "hospital_bn": "পপুলার ডায়াগনস্টিক সেন্টার", "hospital_en": "Popular Diagnostic Centre",
        "phone": "+8801710000012",
    },
    {
        "name_bn": "ডা. রেহানা সুলতানা", "name_en": "Dr. Rehana Sultana",
        "specialty_bn": "ডায়াবেটিস বিশেষজ্ঞ", "specialty_en": "Diabetes Specialist",
        "location_bn": "কোতোয়ালী, চট্টগ্রাম", "location_en": "Kotwali, Chattogram",
        "hospital_bn": "চট্টগ্রাম ডায়াবেটিক হাসপাতাল", "hospital_en": "Chattogram Diabetic Hospital",
        "phone": "+8801710000013",
    },
    {
        "name_bn": "ডা. ইমরান চৌধুরী", "name_en": "Dr. Imran Chowdhury",
        "specialty_bn": "হরমোন বিশেষজ্ঞ", "specialty_en": "Endocrinologist",
        "location_bn": "বনানী, ঢাকা", "location_en": "Banani, Dhaka",
        "hospital_bn": "এভারকেয়ার হাসপাতাল", "hospital_en": "Evercare Hospital",
        "phone": "+8801710000014",
    },
    # --- Adjacent specialties ---
    {
        "name_bn": "ডা. শারমিন আক্তার", "name_en": "Dr. Sharmin Akter",
        "specialty_bn": "কিডনি বিশেষজ্ঞ", "specialty_en": "Nephrologist",
        "location_bn": "ধানমন্ডি, ঢাকা", "location_en": "Dhanmondi, Dhaka",
        "hospital_bn": "গ্রিন লাইফ হাসপাতাল", "hospital_en": "Green Life Hospital",
        "phone": "+8801710000015",
    },
    {
        "name_bn": "ডা. শহিদুল হক", "name_en": "Dr. Shahidul Haque",
        "specialty_bn": "ইন্টারনাল মেডিসিন", "specialty_en": "Internal Medicine",
        "location_bn": "বসুন্ধরা, ঢাকা", "location_en": "Bashundhara, Dhaka",
        "hospital_bn": "এভারকেয়ার হাসপাতাল", "hospital_en": "Evercare Hospital",
        "phone": "+8801710000016",
    },
    {
        "name_bn": "ডা. জাহাঙ্গীর আলম", "name_en": "Dr. Jahangir Alam",
        "specialty_bn": "হৃদরোগ সার্জন", "specialty_en": "Cardiac Surgeon",
        "location_bn": "গুলশান, ঢাকা", "location_en": "Gulshan, Dhaka",
        "hospital_bn": "স্কয়ার হাসপাতাল", "hospital_en": "Square Hospital",
        "phone": "+8801710000017",
    },
    {
        "name_bn": "ডা. নুসরাত জাহান", "name_en": "Dr. Nusrat Jahan",
        "specialty_bn": "পারিবারিক চিকিৎসক", "specialty_en": "Family Medicine",
        "location_bn": "মিরপুর, ঢাকা", "location_en": "Mirpur, Dhaka",
        "hospital_bn": "ডেল্টা হেলথ কেয়ার", "hospital_en": "Delta Health Care",
        "phone": "+8801710000018",
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
