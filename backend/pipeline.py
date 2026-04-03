"""
pipeline.py
===========
배치 파이프라인 진입점.
Cloud Scheduler / Render cron이 이 파일을 실행.

실행:
  python pipeline.py --year 2026 --max 100

환경변수:
  SUPABASE_URL, SUPABASE_KEY, MAPS_API_KEY
  AI_PROVIDER (opencode | openai | anthropic), 기본: 사용 가능한 키 자동 선택
  OPENCODE_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY
"""

import argparse
import json
import logging
import os
from datetime import datetime

from scraper import scrape_batch, Incident
from geocoder import geocode
from storage import get_client, upsert_incidents

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

TRANSLATE_PROMPT = """Translate this German police report title into English.
Return ONLY valid JSON with key: en. No explanation.

Title: {title}"""


# ── 번역 ──────────────────────────────────────────────────────────────────────

def _get_ai_provider() -> tuple[str, object] | None:
    """사용 가능한 AI provider를 반환. (provider_name, client)"""
    provider = os.environ.get("AI_PROVIDER", "").lower()

    # opencode (OpenAI-compatible)
    opencode_key = os.environ.get("OPENCODE_API_KEY")
    if opencode_key and provider in ("", "opencode"):
        from openai import OpenAI
        client = OpenAI(
            api_key=opencode_key,
            base_url="https://api.open-coder.com/v1",
        )
        return ("opencode", client)

    # openai
    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key and provider in ("", "openai"):
        from openai import OpenAI
        client = OpenAI(api_key=openai_key)
        return ("openai", client)

    # anthropic
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if anthropic_key and provider in ("", "anthropic"):
        import anthropic
        client = anthropic.Anthropic(api_key=anthropic_key)
        return ("anthropic", client)

    return None


def translate_title(title_de: str, provider: str, client: object) -> dict[str, str]:
    """독일어 제목 → 영어 번역. provider에 따라 API 호출."""
    prompt = TRANSLATE_PROMPT.format(title=title_de)

    try:
        if provider in ("opencode", "openai"):
            from openai import OpenAI
            resp = client.chat.completions.create(  # type: ignore
                model="gpt-4o-mini" if provider == "openai" else "gpt-4o-mini",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            text = resp.choices[0].message.content or ""
            return json.loads(text)
        else:  # anthropic
            msg = client.messages.create(  # type: ignore
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            return json.loads(msg.content[0].text)
    except Exception as e:
        log.warning(f"Translation failed ({provider}): {title_de} ({e})")
        return {"en": title_de}


# ── 메인 파이프라인 ──────────────────────────────────────────────────────────

def run(year: int | None = None, max_articles: int = 100) -> None:
    if year is None:
        year = datetime.now().year
    maps_key = os.environ["MAPS_API_KEY"]
    db_client = get_client()

    ai = _get_ai_provider()
    if ai:
        log.info(f"AI provider: {ai[0]}")
    else:
        log.info("No AI provider configured. Translation will be skipped.")

    # 0. 기존 URL 조회 (중복 크롤링 방지)
    log.info("=== Step 0: Fetching existing URLs ===")
    existing = db_client.table("incidents").select("source_url").execute()
    existing_urls = {r["source_url"] for r in (existing.data or []) if r.get("source_url")}
    log.info(f"Found {len(existing_urls)} existing URLs in DB")

    # 1. 스크래핑 (새 URL만)
    log.info("=== Step 1: Scraping ===")
    incidents = scrape_batch(year=year, max_articles=max_articles, existing_urls=existing_urls)

    # 2. 지오코딩
    log.info("=== Step 2: Geocoding ===")
    for inc in incidents:
        if inc.address_raw:
            coords = geocode(inc.address_raw, maps_key)
            if coords:
                inc.lat, inc.lng = coords

    # 3. 번역
    if ai:
        provider_name, client = ai
        log.info(f"=== Step 3: Translation ({provider_name}) ===")
        for inc in incidents:
            if inc.title_de:
                translations = translate_title(inc.title_de, provider_name, client)
                inc.title_en = translations.get("en")

    # 4. Supabase 저장
    log.info("=== Step 4: Storage ===")
    upsert_incidents(incidents, client=db_client)

    # 5. 자전거 도난 데이터 수집
    log.info("=== Step 5: Bike Thefts ===")
    try:
        from bike_theft import fetch_bike_thefts, upsert_bike_thefts
        bike_rows = fetch_bike_thefts(days_back=7)
        if bike_rows:
            upsert_bike_thefts(bike_rows, client=db_client)
    except Exception as e:
        log.warning(f"Bike theft collection failed (non-fatal): {e}")

    log.info("=== Pipeline complete ===")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(override=True)

    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.now().year)
    parser.add_argument("--max", type=int, default=100)
    args = parser.parse_args()
    run(year=args.year, max_articles=args.max)
