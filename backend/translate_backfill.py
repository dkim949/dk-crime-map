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
    """Ollama (로컬) → OpenAI → Anthropic 순서로 사용 가능한 클라이언트 반환."""
    from openai import OpenAI

    # 1. Ollama 로컬
    try:
        import requests
        r = requests.get("http://localhost:11434/v1/models", timeout=2)
        if r.ok:
            log.info("Using Ollama (local)")
            return OpenAI(base_url="http://localhost:11434/v1", api_key="ollama"), "gemma3:4b"
    except Exception:
        pass

    # 2. OpenAI
    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        log.info("Using OpenAI")
        return OpenAI(api_key=openai_key), "gpt-4o-mini"

    raise RuntimeError("No AI provider available. Start Ollama or set OPENAI_API_KEY.")


def translate(client, model: str, title_de: str) -> str | None:
    try:
        resp = client.chat.completions.create(
            model=model,
            max_tokens=200,
            messages=[{"role": "user", "content": TRANSLATE_PROMPT.format(title=title_de)}],
        )
        text = (resp.choices[0].message.content or "").strip()
        # Ollama may wrap in ```json ... ```
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        return json.loads(text).get("en")
    except Exception as e:
        log.warning(f"Translation failed: {title_de[:50]} ({e})")
        return None


def main():
    db = get_client()
    ai, model = get_ai_client()

    # title_en이 NULL이거나 title_de와 동일한(미번역) 레코드 조회
    result = (
        db.table("incidents")
        .select("id, title_de, title_en")
        .eq("is_active", True)
        .limit(500)
        .execute()
    )

    rows = [r for r in (result.data or []) if not r.get("title_en") or r.get("title_en") == r.get("title_de")]
    log.info(f"Found {len(rows)} records needing translation")

    translated = 0
    for row in rows:
        if not row.get("title_de"):
            continue

        title_en = translate(ai, model, row["title_de"])
        if title_en:
            db.table("incidents").update({"title_en": title_en}).eq("id", row["id"]).execute()
            translated += 1
            log.info(f"  [{translated}/{len(rows)}] {row['title_de'][:40]} → {title_en[:40]}")

    log.info(f"Done. Translated {translated}/{len(rows)} records.")


if __name__ == "__main__":
    main()
