"""
berlin_crime_scraper.py
=======================
Berlin Polizei Meldungen scraper.

URL 구조:
  https://www.berlin.de/polizei/polizeimeldungen/{YEAR}/pressemitteilung.{ID}.php

전략:
  1. 목록 페이지는 JS 렌더링이라 정적 파싱 불가.
  2. 대신 sitemap.xml에서 기사 URL 목록 수집.
  3. 개별 기사 파싱 → 주소/지역/카테고리 추출.
"""

import re
import time
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from xml.etree import ElementTree as ET

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

BASE = "https://www.berlin.de"
SITEMAP_URL = f"{BASE}/sitemap.xml"
POLIZEI_PREFIX = "/polizei/polizeimeldungen/"

HEADERS = {
    "User-Agent": "BerlinCrimeMap-Bot/1.0 (https://github.com/yourusername/berlin-crime-map; research only)",
    "Accept-Language": "de-DE,de;q=0.9",
}

# 카테고리 키워드 매핑 (독일어 → 영어 slug)
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "theft":      ["diebstahl", "einbruch", "raub", "handtasche", "taschendiebstahl"],
    "assault":    ["körperverletzung", "angriff", "schläge", "streit", "auseinandersetzung"],
    "shooting":   ["schuss", "schussverletzung", "schussabgabe", "schusswaffe"],
    "fraud":      ["betrug", "schockanruf", "enkeltrick", "täuschung"],
    "drugs":      ["drogen", "rauschgift", "btm", "betäubungsmittel"],
    "traffic":    ["verkehrsunfall", "unfall", "zusammenstoß"],
    "fire":       ["brand", "feuer", "brandanschlag", "brandstiftung"],
    "missing":    ["vermisst", "verschwunden"],
    "homicide":   ["tötungsdelikt", "mord", "totschlag", "leiche"],
    "other":      [],
}


@dataclass
class Incident:
    source_url: str
    report_nr: Optional[str] = None
    title_de: Optional[str] = None
    body_de: Optional[str] = None
    location_raw: Optional[str] = None   # "Ereignisort: Lichtenberg"
    address_raw: Optional[str] = None    # 텍스트에서 추출한 거리명
    category: str = "other"
    occurred_at: Optional[datetime] = None
    scraped_at: datetime = field(default_factory=datetime.utcnow)
    # 지오코딩 후 채워짐
    lat: Optional[float] = None
    lng: Optional[float] = None


# ── 1. URL 수집 ──────────────────────────────────────────────────────────────

def fetch_sitemap_urls(year: int = 2026) -> list[str]:
    """
    berlin.de sitemap에서 polizeimeldungen URL 필터링.
    sitemap index → 연도별 sitemap → 기사 URL.
    """
    urls: list[str] = []

    try:
        r = requests.get(SITEMAP_URL, headers=HEADERS, timeout=20)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        # sitemap index인 경우 하위 sitemap들 순회
        child_sitemaps = root.findall("sm:sitemap/sm:loc", ns)
        if child_sitemaps:
            for loc_el in child_sitemaps:
                loc = loc_el.text or ""
                if "polizei" in loc or str(year) in loc:
                    urls.extend(_parse_sitemap(loc))
        else:
            # 직접 url 목록인 경우
            for url_el in root.findall("sm:url/sm:loc", ns):
                loc = url_el.text or ""
                if POLIZEI_PREFIX in loc and "pressemitteilung" in loc:
                    urls.append(loc)

    except Exception as e:
        log.warning(f"Sitemap fetch failed: {e}. Falling back to ID scan.")
        urls = _id_range_scan(year)

    return list(set(urls))


def _parse_sitemap(sitemap_url: str) -> list[str]:
    """단일 sitemap.xml 파싱."""
    try:
        r = requests.get(sitemap_url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        return [
            el.text for el in root.findall("sm:url/sm:loc", ns)
            if el.text and POLIZEI_PREFIX in el.text and "pressemitteilung" in el.text
        ]
    except Exception as e:
        log.warning(f"Child sitemap failed {sitemap_url}: {e}")
        return []


def _id_range_scan(year: int, start_id: int = 1640000, end_id: int = 1670000, step: int = 1) -> list[str]:
    """
    Sitemap 실패 시 fallback: ID 범위를 기반으로 URL 후보 생성.
    실제 존재 여부는 fetch 시 확인.
    ID 범위는 검색 결과에서 추정한 값 (2026년 기준).
    """
    return [
        f"{BASE}{POLIZEI_PREFIX}{year}/pressemitteilung.{i}.php"
        for i in range(start_id, end_id, step)
    ]


# ── 2. 개별 기사 파싱 ────────────────────────────────────────────────────────

_EREIGNISORT_RE = re.compile(r"Ereignisort[:\s]+(.+?)(?:\n|$)", re.IGNORECASE)
_NR_RE          = re.compile(r"Nr\.\s*([\d]+)", re.IGNORECASE)
_TIME_RE        = re.compile(r"(\d{1,2}:\d{2})\s*Uhr")
# 독일 거리명 패턴: Straße, Platz, Allee, Damm, Weg, Chaussee + 번지
_STREET_RE      = re.compile(
    r"\b([A-ZÄÖÜ][a-zäöüß-]+"
    r"(?:\s+(?:Stra(?:ße|sse)|Platz|Allee|Damm|Weg|Chaussee|Ring|Ufer|Brücke))"  # 분리형: Rathenower Straße
    r"|[A-ZÄÖÜ][a-zäöüß-]*"
    r"(?:straße|strasse|platz|allee|damm|weg|chaussee|ring|ufer|brücke))"          # 접합형: Hagenstraße
    r"(?:\s+(\d+\w*))?",
    re.IGNORECASE | re.UNICODE,
)


def parse_incident(url: str, session: requests.Session, delay: float = 1.0) -> Optional[Incident]:
    """단일 기사 URL 파싱 → Incident 반환. 404/오류 시 None."""
    time.sleep(delay)  # polite crawling
    try:
        r = session.get(url, timeout=15)
        if r.status_code == 404:
            return None
        r.raise_for_status()
    except requests.RequestException as e:
        log.warning(f"Fetch error {url}: {e}")
        return None

    soup = BeautifulSoup(r.text, "html.parser")

    # 제목
    h1 = soup.find("h1")
    title = h1.get_text(strip=True) if h1 else None

    # 본문 (article > p 또는 div.html5-section)
    article = soup.find("article") or soup.find("div", class_=re.compile("content|article|meldung"))
    if article:
        body = article.get_text(separator="\n", strip=True)
    else:
        body = soup.get_text(separator="\n", strip=True)

    # Nr. 추출
    nr_match = _NR_RE.search(body or "")
    report_nr = nr_match.group(1) if nr_match else None

    # Ereignisort 추출
    loc_match = _EREIGNISORT_RE.search(body or "")
    location_raw = loc_match.group(1).strip() if loc_match else None

    # 거리명 추출 (첫 번째 매치 우선)
    street_match = _STREET_RE.search(body or "")
    if street_match:
        street = street_match.group(1)
        number = street_match.group(2) or ""
        address_raw = f"{street} {number}, Berlin".strip()
    else:
        address_raw = f"{location_raw}, Berlin" if location_raw else None

    # 카테고리 분류
    body_lower = (body or "").lower()
    category = "other"
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in body_lower for kw in keywords):
            category = cat
            break

    return Incident(
        source_url=url,
        report_nr=report_nr,
        title_de=title,
        body_de=body[:2000] if body else None,
        location_raw=location_raw,
        address_raw=address_raw,
        category=category,
    )


# ── 3. 배치 실행 ─────────────────────────────────────────────────────────────

def scrape_batch(year: int = 2026, max_articles: int = 50, delay: float = 1.5) -> list[Incident]:
    """
    배치 스크래핑 메인 함수.
    Supabase 저장 전 Incident 리스트 반환.
    """
    log.info(f"Fetching URL list for {year}...")
    urls = fetch_sitemap_urls(year)
    log.info(f"Found {len(urls)} candidate URLs")

    session = requests.Session()
    session.headers.update(HEADERS)

    incidents: list[Incident] = []
    for url in urls[:max_articles]:
        inc = parse_incident(url, session, delay=delay)
        if inc:
            log.info(f"  ✓ [{inc.category:10s}] Nr.{inc.report_nr} | {inc.location_raw} | {inc.title_de[:50] if inc.title_de else '?'}")
            incidents.append(inc)
        else:
            log.debug(f"  ✗ skip {url}")

    log.info(f"Scraped {len(incidents)} incidents.")
    return incidents
