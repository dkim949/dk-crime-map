"""
main.py
=======
FastAPI 백엔드 — Berlin Crime Map API

엔드포인트:
  GET  /health              헬스체크
  GET  /incidents           지도용 사건 목록
  GET  /incidents/{id}      단일 사건 상세
  GET  /stats               지구별 통계
  GET  /config              앱 설정 (제보 on/off 상태)
  POST /reports             제보 제출 (report_enabled=true 일 때만)
"""

import os
import logging
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import time

from storage import (
    get_client,
    is_report_enabled,
    insert_report,
    get_config,
)

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Berlin Crime Map API",
    version="1.0.0",
    docs_url="/docs",           # 개발 중 Swagger UI 접근 가능
)

# CORS
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Rate limit 간단 구현 (IP 기반 인메모리)
# 프로덕션에서는 Redis로 교체 권장
_rate_limit: dict[str, list[float]] = {}

def check_rate_limit(ip: str, max_req: int = 60, window: int = 60) -> bool:
    """60초 윈도우 내 max_req 초과 시 False."""
    now = time.time()
    hits = [t for t in _rate_limit.get(ip, []) if now - t < window]
    _rate_limit[ip] = hits
    if len(hits) >= max_req:
        return False
    _rate_limit[ip].append(now)
    return True


# ── 헬스체크 ─────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── 사건 목록 ─────────────────────────────────────────────────

@app.get("/incidents")
def get_incidents(
    category: Optional[str] = None,
    district: Optional[str] = None,
    limit: int = 5000,
    offset: int = 0,
):
    """
    지도용 사건 목록. public_incidents 뷰 사용 (검증된 데이터만).

    Query params:
      category  : theft | assault | shooting | ...
      district  : Mitte | Lichtenberg | ...
      limit     : 최대 5000
      offset    : 페이지네이션
      lang      : 제목 언어 선택
    """
    db = get_client()
    query = (
        db.table("public_incidents")
        .select("id, source, title_de, title_en, district, address_raw, lat, lng, category, occurred_at, scraped_at")
        .order("occurred_at", desc=True)
        .limit(min(limit, 5000))
        .offset(offset)
    )

    if category:
        query = query.eq("category", category)
    if district:
        query = query.eq("district", district)

    result = query.execute()
    return {"data": result.data, "count": len(result.data)}


@app.get("/incidents/{incident_id}")
def get_incident(incident_id: str, lang: str = "de"):
    """단일 사건 상세 (body_de 포함)."""
    db = get_client()
    result = (
        db.table("incidents")
        .select("id, source, title_de, title_ko, title_en, title_ja, body_de, district, address_raw, lat, lng, category, occurred_at, scraped_at, source_url")
        .eq("id", incident_id)
        .eq("is_active", True)
        .eq("is_verified", True)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Incident not found")
    return result.data


# ── 통계 ──────────────────────────────────────────────────────

@app.get("/stats")
def get_stats():
    """지구별 카테고리 통계."""
    db = get_client()
    result = db.table("district_stats").select("*").execute()
    return {"data": result.data}


# ── 자전거 도난 ──────────────────────────────────────────────

@app.get("/bike-thefts")
def get_bike_thefts(
    district: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
):
    """자전거 도난 데이터 (LOR 기반 집계용)."""
    db = get_client()
    query = (
        db.table("bike_thefts")
        .select("lor_code, district, occurred_at, damage_eur, bike_type")
        .eq("is_active", True)
        .order("occurred_at", desc=True)
        .limit(min(limit, 2000))
        .offset(offset)
    )
    if district:
        query = query.eq("district", district)
    result = query.execute()
    return {"data": result.data, "count": len(result.data)}


@app.get("/bike-thefts/by-lor")
def get_bike_thefts_by_lor():
    """LOR 코드별 자전거 도난 건수 집계."""
    db = get_client()
    result = (
        db.table("bike_thefts")
        .select("lor_code, district")
        .eq("is_active", True)
        .execute()
    )
    counts: dict[str, int] = {}
    for row in (result.data or []):
        lor = row.get("lor_code", "")
        counts[lor] = counts.get(lor, 0) + 1
    return {"data": counts}


# ── 앱 설정 ───────────────────────────────────────────────────

@app.get("/config")
def get_app_config():
    """프론트엔드용 공개 설정값."""
    db = get_client()
    result = db.table("app_config").select("key, value").execute()
    # key-value 딕셔너리로 변환
    config = {row["key"]: row["value"] for row in (result.data or [])}
    return {
        "report_enabled":  config.get("report_enabled", "false") == "true",
        "map_default_lat": float(config.get("map_default_lat", "52.52")),
        "map_default_lng": float(config.get("map_default_lng", "13.405")),
        "map_default_zoom": int(config.get("map_default_zoom", "12")),
    }


# ── 제보 제출 ─────────────────────────────────────────────────

class ReportPayload(BaseModel):
    address_raw:   str = Field(..., min_length=5, max_length=200)
    category:      str = Field(..., pattern="^(theft|assault|shooting|fraud|drugs|traffic|fire|missing|homicide|other)$")
    reporter_note: str = Field("", max_length=500)
    lat:           Optional[float] = Field(None, ge=52.3, le=52.7)   # 베를린 범위 제한
    lng:           Optional[float] = Field(None, ge=13.1, le=13.8)


@app.post("/reports", status_code=201)
async def submit_report(payload: ReportPayload, request: Request):
    """
    제보 제출.
    report_enabled=false 이면 503 반환.
    Rate limit: IP당 60초에 5건.
    """
    # rate limit (제보는 더 엄격하게)
    client_ip = request.client.host
    now = time.time()
    report_hits = [t for t in _rate_limit.get(f"report:{client_ip}", []) if now - t < 60]
    if len(report_hits) >= 5:
        raise HTTPException(status_code=429, detail="Too many requests. Please wait.")
    _rate_limit[f"report:{client_ip}"] = report_hits + [now]

    # 제보 기능 상태 확인
    db = get_client()
    if not is_report_enabled(db):
        raise HTTPException(status_code=503, detail="Report feature is currently disabled.")

    incident_id = insert_report(
        address_raw=payload.address_raw,
        category=payload.category,
        reporter_note=payload.reporter_note,
        lat=payload.lat,
        lng=payload.lng,
        client=db,
    )

    if not incident_id:
        raise HTTPException(status_code=500, detail="Failed to save report.")

    return {"id": incident_id, "status": "pending_review"}
