"""
pipeline.py
===========
배치 파이프라인 진입점.
Cloud Scheduler / Render cron이 이 파일을 실행.

실행:
  python pipeline.py --year 2025 --max 100

환경변수:
  SUPABASE_URL, SUPABASE_KEY, MAPS_API_KEY, ANTHROPIC_API_KEY
"""

import argparse
import logging
import os
from datetime import datetime

import anthropic

from scraper import scrape_batch, Incident
from geocoder import geocode
from storage import get_client, upsert_incidents

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


# ── 번역 (Claude API) ────────────────────────────────────────────────────────

def translate_title(title_de: str, client: anthropic.Anthropic) -> dict[str, str]:
    """
    독일어 제목 → 영어 번역.
    """
    prompt = f"""Translate this German police report title into English.
Return ONLY valid JSON with key: en. No explanation.

Title: {title_de}"""

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        import json
        return json.loads(msg.content[0].text)
    except Exception as e:
        log.warning(f"Translation failed for: {title_de} ({e})")
        return {"en": title_de}


# ── 메인 파이프라인 ──────────────────────────────────────────────────────────

def run(year: int | None = None, max_articles: int = 100) -> None:
    if year is None:
        year = datetime.now().year
    maps_key      = os.environ["MAPS_API_KEY"]
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")

    ai_client = anthropic.Anthropic(api_key=anthropic_key) if anthropic_key else None
    db_client = get_client()

    # 1. 스크래핑
    log.info("=== Step 1: Scraping ===")
    incidents = scrape_batch(year=year, max_articles=max_articles)

    # 2. 지오코딩
    log.info("=== Step 2: Geocoding ===")
    for inc in incidents:
        if inc.address_raw:
            coords = geocode(inc.address_raw, maps_key)
            if coords:
                inc.lat, inc.lng = coords

    # 3. 번역 (AI 클라이언트 있을 때만)
    if ai_client:
        log.info("=== Step 3: Translation ===")
        for inc in incidents:
            if inc.title_de:
                translations = translate_title(inc.title_de, ai_client)
                inc.title_en = translations.get("en")

    # 4. Supabase 저장
    log.info("=== Step 4: Storage ===")
    upsert_incidents(incidents, client=db_client)

    log.info("=== Pipeline complete ===")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser()
    parser.add_argument("--year",    type=int, default=datetime.now().year)
    parser.add_argument("--max",     type=int, default=100)
    args = parser.parse_args()
    run(year=args.year, max_articles=args.max)
