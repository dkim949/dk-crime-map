"""
storage.py (v2)
===============
Supabase 연동 — incidents upsert + scraper_run 로그 + app_config 조회.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from supabase import create_client, Client

log = logging.getLogger(__name__)


def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]   # service_role key
    return create_client(url, key)


# ── app_config ────────────────────────────────────────────────

def get_config(key: str, client: Optional[Client] = None) -> Optional[str]:
    """app_config에서 설정값 조회."""
    db = client or get_client()
    result = db.table("app_config").select("value").eq("key", key).single().execute()
    return result.data["value"] if result.data else None


def is_report_enabled(client: Optional[Client] = None) -> bool:
    """제보 기능 활성화 여부."""
    val = get_config("report_enabled", client)
    return val == "true"


def set_report_enabled(enabled: bool, client: Optional[Client] = None) -> None:
    """제보 on/off 토글."""
    db = client or get_client()
    db.table("app_config").update({
        "value": "true" if enabled else "false",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("key", "report_enabled").execute()
    log.info(f"report_enabled → {enabled}")


# ── scraper_run 로그 ──────────────────────────────────────────

def start_run(year: int, client: Optional[Client] = None) -> str:
    """배치 실행 시작 기록. run_id 반환."""
    db = client or get_client()
    result = db.table("scraper_runs").insert({
        "year": year,
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    run_id = result.data[0]["id"]
    log.info(f"Scraper run started: {run_id}")
    return run_id


def finish_run(
    run_id: str,
    urls_found: int = 0,
    scraped: int = 0,
    upserted: int = 0,
    errors: int = 0,
    status: str = "success",
    client: Optional[Client] = None,
) -> None:
    """배치 실행 완료 기록."""
    db = client or get_client()
    db.table("scraper_runs").update({
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "urls_found":  urls_found,
        "scraped":     scraped,
        "upserted":    upserted,
        "errors":      errors,
        "status":      status,
    }).eq("id", run_id).execute()
    log.info(f"Scraper run finished: {run_id} [{status}] upserted={upserted}")


# ── incidents upsert ──────────────────────────────────────────

def _incident_to_row(inc) -> dict:
    row = {
        "source":        "official",
        "source_url":    inc.source_url,
        "report_nr":     inc.report_nr,
        "title_de":      inc.title_de,
        "body_de":       inc.body_de,
        "location_raw":  inc.location_raw,
        "address_raw":   inc.address_raw,
        "category":      inc.category,
        "lat":           inc.lat,
        "lng":           inc.lng,
        "occurred_at":   inc.occurred_at.isoformat() if inc.occurred_at else None,
        "scraped_at":    inc.scraped_at.isoformat(),
        "is_verified":   True,
        "is_active":     True,
    }
    for lang in ("ko", "en", "ja"):
        attr = f"title_{lang}"
        if hasattr(inc, attr):
            row[attr] = getattr(inc, attr)
    return row


def upsert_incidents(incidents: list, client: Optional[Client] = None) -> int:
    if not incidents:
        return 0

    db = client or get_client()
    rows = [_incident_to_row(inc) for inc in incidents]

    BATCH = 500
    total = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        result = (
            db.table("incidents")
            .upsert(chunk, on_conflict="source_url")
            .execute()
        )
        total += len(result.data) if result.data else 0

    log.info(f"Upserted {total} incidents.")
    return total


# ── 제보 저장 ─────────────────────────────────────────────────

def insert_report(
    address_raw: str,
    category: str,
    reporter_note: str,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    client: Optional[Client] = None,
) -> Optional[str]:
    """
    제보 데이터 저장. 제보 기능이 꺼져있으면 None 반환.
    Returns: incident id or None
    """
    db = client or get_client()

    if not is_report_enabled(db):
        log.warning("Report submission attempted but feature is disabled.")
        return None

    result = db.table("incidents").insert({
        "source":        "report",
        "address_raw":   address_raw,
        "category":      category,
        "reporter_note": reporter_note,
        "lat":           lat,
        "lng":           lng,
        "is_verified":   False,
        "is_active":     True,
    }).execute()

    if result.data:
        incident_id = result.data[0]["id"]
        log.info(f"Report saved: {incident_id}")
        return incident_id
    return None
