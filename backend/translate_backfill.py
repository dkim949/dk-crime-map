"""
translate_backfill.py
=====================
기존 DB 레코드 중 title_en이 없는 것들을 번역.
python translate_backfill.py
"""

import json
import logging
import os

from dotenv import load_dotenv
load_dotenv()

from storage import get_client

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

TRANSLATE_PROMPT = """Translate this German police report title into English.
Return ONLY valid JSON with key: en. No explanation.

Title: {title}"""


def get_ai_client():
    key = os.environ.get("OPENCODE_API_KEY")
    if key:
        from openai import OpenAI
        return OpenAI(api_key=key, base_url="https://api.open-coder.com/v1")
    raise RuntimeError("OPENCODE_API_KEY not set")


def translate(client, title_de: str) -> str | None:
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=200,
            messages=[{"role": "user", "content": TRANSLATE_PROMPT.format(title=title_de)}],
        )
        text = resp.choices[0].message.content or ""
        return json.loads(text).get("en")
    except Exception as e:
        log.warning(f"Translation failed: {title_de[:50]} ({e})")
        return None


def main():
    db = get_client()
    ai = get_ai_client()

    # title_en이 NULL인 레코드 조회
    result = (
        db.table("incidents")
        .select("id, title_de")
        .is_("title_en", "null")
        .eq("is_active", True)
        .limit(500)
        .execute()
    )

    rows = result.data or []
    log.info(f"Found {len(rows)} records without title_en")

    translated = 0
    for row in rows:
        if not row.get("title_de"):
            continue

        title_en = translate(ai, row["title_de"])
        if title_en:
            db.table("incidents").update({"title_en": title_en}).eq("id", row["id"]).execute()
            translated += 1
            log.info(f"  [{translated}/{len(rows)}] {row['title_de'][:40]} → {title_en[:40]}")

    log.info(f"Done. Translated {translated}/{len(rows)} records.")


if __name__ == "__main__":
    main()
