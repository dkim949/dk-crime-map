"""
bike_theft.py
=============
Berlin Fahrraddiebstahl (자전거 도난) CSV 수집 + Supabase 저장.

데이터 소스: https://www.polizei-berlin.eu/Fahrraddiebstahl/Fahrraddiebstahl.csv
업데이트: 매일 (현재연도 + 전년도 rolling)
"""

import csv
import io
import logging
from datetime import datetime

import requests

log = logging.getLogger(__name__)

CSV_URL = "https://www.polizei-berlin.eu/Fahrraddiebstahl/Fahrraddiebstahl.csv"

# LOR Bezirk 코드 → 구 이름 매핑 (LOR 앞 2자리)
BEZ_MAP: dict[str, str] = {
    "01": "Mitte",
    "02": "Friedrichshain-Kreuzberg",
    "03": "Pankow",
    "04": "Charlottenburg-Wilmersdorf",
    "05": "Spandau",
    "06": "Steglitz-Zehlendorf",
    "07": "Tempelhof-Schöneberg",
    "08": "Neukölln",
    "09": "Treptow-Köpenick",
    "10": "Marzahn-Hellersdorf",
    "11": "Lichtenberg",
    "12": "Reinickendorf",
}

# 자전거 종류 독→영
BIKE_TYPE_EN: dict[str, str] = {
    "Fahrrad": "Bicycle",
    "Herrenfahrrad": "Men's bicycle",
    "Damenfahrrad": "Women's bicycle",
    "Kinderfahrrad": "Children's bicycle",
    "Mountainbike": "Mountain bike",
    "E-Bike/Pedelec": "E-bike",
    "Rennrad": "Racing bike",
    "Lastenrad": "Cargo bike",
    "sonstiges Fahrrad": "Other bicycle",
}


def _parse_date(s: str) -> datetime | None:
    """DD.MM.YYYY → datetime."""
    try:
        return datetime.strptime(s.strip(), "%d.%m.%Y")
    except (ValueError, AttributeError):
        return None


def fetch_bike_thefts(days_back: int = 7) -> list[dict]:
    """CSV 다운로드 후 최근 N일 데이터만 파싱.

    Args:
        days_back: 오늘 기준 며칠 전까지 수집 (기본 7일).

    Returns:
        dict 리스트 (Supabase 행 형식).
    """
    log.info(f"Downloading bike theft CSV...")
    r = requests.get(CSV_URL, timeout=30)
    r.raise_for_status()

    # CSV는 latin-1 인코딩
    text = r.content.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))

    cutoff = datetime.now()
    cutoff = cutoff.replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    cutoff = cutoff - timedelta(days=days_back)

    rows: list[dict] = []
    row_idx = 0
    for row in reader:
        row_idx += 1
        occurred = _parse_date(row.get("TATZEIT_ANFANG_DATUM", ""))
        if not occurred or occurred < cutoff:
            continue

        lor = row.get("LOR", "").strip()
        bez_code = lor[:2] if len(lor) >= 2 else ""
        district = BEZ_MAP.get(bez_code)

        bike_type = row.get("ART_DES_FAHRRADS", "Fahrrad").strip()
        damage = row.get("SCHADENSHOEHE", "0").strip()
        attempt = row.get("VERSUCH", "Nein").strip() == "Ja"

        # 고유 키: 날짜 + LOR + 시간 + 피해액 조합
        hour = row.get("TATZEIT_ANFANG_STUNDE", "0").strip()
        unique_key = f"fahrrad_{occurred.strftime('%Y%m%d')}_{lor}_{hour}_{damage}_{row_idx}"

        title_de = f"Fahrraddiebstahl — {bike_type} ({damage}€)"
        title_en = f"Bicycle theft — {BIKE_TYPE_EN.get(bike_type, bike_type)} ({damage}€)"

        rows.append({
            "source": "fahrrad_data",
            "source_url": unique_key,
            "title_de": title_de,
            "title_en": title_en,
            "category": "theft",
            "district": district,
            "lor_code": lor,
            "address_raw": None,
            "lat": None,
            "lng": None,
            "occurred_at": occurred.isoformat(),
            "scraped_at": datetime.utcnow().isoformat(),
            "is_verified": True,
            "is_active": True,
            "bike_type": bike_type,
            "damage_eur": int(damage) if damage.isdigit() else 0,
            "is_attempt": attempt,
        })

    log.info(f"Parsed {len(rows)} bike thefts (last {days_back} days)")
    return rows


def upsert_bike_thefts(rows: list[dict], client) -> int:
    """Supabase bike_thefts 테이블에 upsert.

    Args:
        rows: fetch_bike_thefts() 반환값.
        client: Supabase client.

    Returns:
        upsert된 행 수.
    """
    if not rows:
        return 0

    BATCH = 500
    total = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        result = (
            client.table("bike_thefts")
            .upsert(chunk, on_conflict="source_url")
            .execute()
        )
        total += len(result.data) if result.data else 0

    log.info(f"Upserted {total} bike thefts.")
    return total
