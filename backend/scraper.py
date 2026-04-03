"""
berlin_crime_scraper.py
=======================
Berlin Polizei Meldungen scraper.

URL 구조:
  https://www.berlin.de/polizei/polizeimeldungen/{YEAR}/pressemitteilung.{ID}.php

전략:
  1. archive 페이지에서 기사 URL + Ereignisort 수집 (1차).
  2. sitemap.xml fallback (2차).
  3. 개별 기사 파싱 → 주소/지역/카테고리 추출.
"""

import re
import time
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin
from xml.etree import ElementTree as ET

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

BASE = "https://www.berlin.de"
SITEMAP_URL = f"{BASE}/sitemap.xml"
POLIZEI_PREFIX = "/polizei/polizeimeldungen/"
ARCHIVE_URL_TEMPLATE = f"{BASE}{POLIZEI_PREFIX}archiv/{{year}}/"

HEADERS = {
    "User-Agent": "BerlinCrimeMap-Bot/1.0 (https://github.com/yourusername/berlin-crime-map; research only)",
    "Accept-Language": "de-DE,de;q=0.9",
}

# 베를린 12개 구역 (Bezirke)
BERLIN_BEZIRKE: list[str] = [
    "Mitte", "Friedrichshain-Kreuzberg", "Pankow", "Charlottenburg-Wilmersdorf",
    "Spandau", "Steglitz-Zehlendorf", "Tempelhof-Schöneberg", "Neukölln",
    "Treptow-Köpenick", "Marzahn-Hellersdorf", "Lichtenberg", "Reinickendorf",
]

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

# archive 목록에서 수집된 Ereignisort 캐시 (url → bezirk)
_archive_location_cache: dict[str, str] = {}


@dataclass
class Incident:
    source_url: str
    report_nr: Optional[str] = None
    title_de: Optional[str] = None
    body_de: Optional[str] = None
    location_raw: Optional[str] = None   # "Mitte", "Lichtenberg" 등
    address_raw: Optional[str] = None    # 텍스트에서 추출한 거리명
    category: str = "other"
    occurred_at: Optional[datetime] = None
    scraped_at: datetime = field(default_factory=datetime.utcnow)
    # 지오코딩 후 채워짐
    lat: Optional[float] = None
    lng: Optional[float] = None


# RSS 피드 URL
RSS_URL = f"{BASE}/polizei/polizeimeldungen/index.php/rss"


# ── 1. URL 수집 ──────────────────────────────────────────────────────────────

def fetch_rss_urls() -> list[str]:
    """RSS 피드에서 최신 pressemitteilung URL 수집.

    Returns:
        URL 리스트. 실패 시 빈 리스트.
    """
    try:
        r = requests.get(RSS_URL, headers=HEADERS, timeout=20)
        r.raise_for_status()
        root = ET.fromstring(r.content)

        urls: list[str] = []
        for item in root.findall(".//item"):
            link = item.findtext("link", "")
            if link and "pressemitteilung" in link:
                urls.append(link.strip())

        log.info(f"RSS에서 {len(urls)}개 URL 수집 완료")
        return urls
    except Exception as e:
        log.warning(f"RSS fetch failed: {e}")
        return []


def fetch_sitemap_urls(year: int = 2026) -> list[str]:
    """URL 수집: RSS → archive → sitemap → ID scan 순서로 fallback.

    Args:
        year: 수집 대상 연도.

    Returns:
        pressemitteilung URL 리스트.
    """
    # 1차: RSS 피드 (가장 빠르고 안정적) — 현재 연도에만 유효
    if year >= datetime.now().year:
        urls = fetch_rss_urls()
        if urls:
            return urls

    # 2차: archive 페이지
    log.warning("RSS 수집 실패. Archive fallback 시도.")
    urls = _fetch_archive_urls(year)
    if urls:
        log.info(f"Archive에서 {len(urls)}개 URL 수집 완료 ({year})")
        return urls

    # 3차: sitemap fallback
    log.warning("Archive 수집 실패. Sitemap fallback 시도.")
    urls = _fetch_sitemap_urls_fallback(year)
    if urls:
        return urls

    # 4차: ID range scan (최후 수단)
    log.warning("Sitemap도 실패. ID range scan fallback.")
    return _id_range_scan(year)


def _fetch_archive_urls(year: int) -> list[str]:
    """Archive 페이지에서 pressemitteilung 링크와 Ereignisort 수집.

    Args:
        year: 수집 대상 연도.

    Returns:
        pressemitteilung URL 리스트. 실패 시 빈 리스트.
    """
    archive_base_url = ARCHIVE_URL_TEMPLATE.format(year=year)
    urls: list[str] = []

    try:
        # 첫 페이지를 가져와서 총 페이지 수 파악
        total_pages = _get_archive_total_pages(archive_base_url)
        log.info(f"Archive {year}: 총 {total_pages} 페이지 발견")

        for page_num in range(1, total_pages + 1):
            if page_num == 1:
                page_url = archive_base_url
            else:
                page_url = f"{archive_base_url}?page_at_1_0={page_num}"

            page_urls = _parse_archive_page(page_url)
            urls.extend(page_urls)
            log.info(f"  Archive 페이지 {page_num}/{total_pages}: {len(page_urls)}개 링크")

            # polite crawling (첫 페이지는 이미 가져왔으므로 skip)
            if page_num < total_pages:
                time.sleep(0.5)

    except Exception as e:
        log.warning(f"Archive fetch failed for {year}: {e}")
        return []

    return list(set(urls))


def _get_archive_total_pages(archive_url: str) -> int:
    """Archive 페이지에서 페이지네이션의 마지막 페이지 번호 추출.

    Args:
        archive_url: archive 기본 URL.

    Returns:
        총 페이지 수. 페이지네이션이 없으면 1.
    """
    r = requests.get(archive_url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    pagination = soup.find("nav", class_="pagination")
    if not pagination:
        return 1

    # "pager-item last" 클래스를 가진 li 안의 링크에서 페이지 번호 추출
    last_item = pagination.find("li", class_=lambda c: c and "last" in c and "pager-item" in c)
    if last_item:
        link = last_item.find("a")
        if link:
            return int(link.get_text(strip=True))

    # fallback: 모든 pager-item에서 최대 숫자 찾기
    max_page = 1
    for li in pagination.find_all("li", class_="pager-item"):
        text = li.get_text(strip=True)
        if text.isdigit():
            max_page = max(max_page, int(text))
    return max_page


def _parse_archive_page(page_url: str) -> list[str]:
    """Archive 단일 페이지에서 pressemitteilung URL과 Ereignisort 추출.

    Args:
        page_url: archive 페이지 URL (페이지네이션 파라미터 포함).

    Returns:
        해당 페이지의 pressemitteilung URL 리스트.
    """
    r = requests.get(page_url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    urls: list[str] = []
    # 목록의 각 <li> 안에 <div class="cell text"> > <a href="...pressemitteilung...">
    for li in soup.find_all("li"):
        cell_text = li.find("div", class_="cell text")
        if not cell_text:
            continue

        link = cell_text.find("a", href=re.compile(r"pressemitteilung\.\d+\.php"))
        if not link:
            continue

        href = link.get("href", "")
        full_url = urljoin(BASE, href)
        urls.append(full_url)

        # Ereignisort 캐시에 저장 (archive 목록에 지역 정보가 있음)
        category_span = cell_text.find("span", class_="category")
        if category_span:
            ereignisort_text = category_span.get_text(strip=True)
            # "Ereignisort: Mitte" → "Mitte"
            match = re.search(r"Ereignisort:\s*(.+)", ereignisort_text)
            if match:
                _archive_location_cache[full_url] = match.group(1).strip()

    return urls


def _fetch_sitemap_urls_fallback(year: int) -> list[str]:
    """Sitemap.xml에서 polizeimeldungen URL 필터링 (fallback).

    Args:
        year: 수집 대상 연도.

    Returns:
        pressemitteilung URL 리스트. 실패 시 빈 리스트.
    """
    urls: list[str] = []
    try:
        r = requests.get(SITEMAP_URL, headers=HEADERS, timeout=20)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        child_sitemaps = root.findall("sm:sitemap/sm:loc", ns)
        if child_sitemaps:
            for loc_el in child_sitemaps:
                loc = loc_el.text or ""
                if "polizei" in loc or str(year) in loc:
                    urls.extend(_parse_sitemap(loc))
        else:
            for url_el in root.findall("sm:url/sm:loc", ns):
                loc = url_el.text or ""
                if POLIZEI_PREFIX in loc and "pressemitteilung" in loc:
                    urls.append(loc)
    except Exception as e:
        log.warning(f"Sitemap fetch failed: {e}")
        return []

    return list(set(urls))


def _parse_sitemap(sitemap_url: str) -> list[str]:
    """단일 sitemap.xml 파싱.

    Args:
        sitemap_url: sitemap XML URL.

    Returns:
        pressemitteilung URL 리스트.
    """
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
    """최후 fallback: ID 범위 기반 URL 후보 생성.

    Args:
        year: 대상 연도.
        start_id: 시작 ID.
        end_id: 끝 ID.
        step: ID 증가 단위.

    Returns:
        URL 후보 리스트.
    """
    return [
        f"{BASE}{POLIZEI_PREFIX}{year}/pressemitteilung.{i}.php"
        for i in range(start_id, end_id, step)
    ]


# ── 2. 개별 기사 파싱 ────────────────────────────────────────────────────────

_NR_RE     = re.compile(r"Nr\.\s*([\d]+)", re.IGNORECASE)
_TIME_RE   = re.compile(r"(\d{1,2}:\d{2})\s*Uhr")
_DATE_RE   = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})")
# 독일 거리명 패턴: Straße, Platz, Allee, Damm, Weg, Chaussee + 번지
_STREET_RE = re.compile(
    r"\b([A-ZÄÖÜ][a-zäöüß-]+"
    r"(?:\s+(?:Stra(?:ße|sse)|Platz|Allee|Damm|Weg|Chaussee|Ring|Ufer|Brücke))"  # 분리형: Rathenower Straße
    r"|[A-ZÄÖÜ][a-zäöüß-]*"
    r"(?:straße|strasse|platz|allee|damm|weg|chaussee|ring|ufer|brücke))"          # 접합형: Hagenstraße
    r"(?:\s+(\d+\w*))?",
    re.IGNORECASE | re.UNICODE,
)


def _extract_location(body: str, url: str) -> Optional[str]:
    """본문 텍스트와 archive 캐시에서 베를린 구역명(Bezirk) 추출.

    우선순위:
      1. archive 목록에서 수집한 Ereignisort 캐시
      2. 본문에서 Ereignisort 패턴 매칭
      3. 본문에서 12개 Bezirk 이름 직접 매칭

    Args:
        body: 기사 본문 텍스트.
        url: 기사 URL (캐시 조회용).

    Returns:
        구역명 또는 None.
    """
    # 1. archive 캐시
    if url in _archive_location_cache:
        return _archive_location_cache[url]

    # 2. 본문에서 Ereignisort 패턴
    ereignis_match = re.search(r"Ereignisort[:\s]+(.+?)(?:\n|$)", body, re.IGNORECASE)
    if ereignis_match:
        return ereignis_match.group(1).strip()

    # 3. 본문에서 Bezirk 이름 직접 매칭
    for bezirk in BERLIN_BEZIRKE:
        if bezirk in body:
            return bezirk

    return None


def parse_incident(url: str, session: requests.Session, delay: float = 1.0) -> Optional[Incident]:
    """단일 기사 URL 파싱 → Incident 반환. 404/오류 시 None.

    Args:
        url: 기사 URL.
        session: requests Session 객체.
        delay: 요청 간 대기 시간(초).

    Returns:
        파싱된 Incident 또는 None.
    """
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

    # 본문: div.textile (실제 기사 본문 컨테이너)
    body = None
    textile_div = soup.find("div", class_="textile")
    if textile_div:
        body = textile_div.get_text(separator="\n", strip=True)
    else:
        # fallback: div.text
        text_div = soup.find("div", class_="text")
        if text_div:
            body = text_div.get_text(separator="\n", strip=True)

    if not body:
        # 최후 fallback: modul-text_bild section
        section = soup.find("section", class_=re.compile(r"modul-text"))
        if section:
            body = section.get_text(separator="\n", strip=True)

    # Nr. 추출
    nr_match = _NR_RE.search(body or "")
    report_nr = nr_match.group(1) if nr_match else None

    # 지역 추출 (archive 캐시 + 본문 매칭)
    location_raw = _extract_location(body or "", url)

    # 거리명 추출 (첫 번째 매치 우선)
    street_match = _STREET_RE.search(body or "")
    if street_match:
        street = street_match.group(1)
        number = street_match.group(2) or ""
        address_raw = f"{street} {number}".strip() + ", Berlin"
    else:
        address_raw = f"{location_raw}, Berlin" if location_raw else None

    # 카테고리 분류
    combined_text = ((title or "") + " " + (body or "")).lower()
    category = "other"
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in combined_text for kw in keywords):
            category = cat
            break

    # 날짜 추출 (meta 또는 본문)
    occurred_at = None
    date_meta = soup.find("meta", attrs={"name": "dcterms.date"})
    if date_meta and date_meta.get("content"):
        try:
            occurred_at = datetime.strptime(date_meta["content"], "%Y-%m-%d")
        except ValueError:
            pass

    return Incident(
        source_url=url,
        report_nr=report_nr,
        title_de=title,
        body_de=body[:2000] if body else None,
        location_raw=location_raw,
        address_raw=address_raw,
        category=category,
        occurred_at=occurred_at,
    )


# ── 3. 배치 실행 ─────────────────────────────────────────────────────────────

def scrape_batch(
    year: int = 2026,
    max_articles: int = 50,
    delay: float = 1.5,
    existing_urls: set[str] | None = None,
) -> list[Incident]:
    """배치 스크래핑 메인 함수.

    Args:
        year: 대상 연도.
        max_articles: 최대 수집 기사 수.
        delay: 기사 간 요청 대기 시간(초).
        existing_urls: DB에 이미 있는 source_url 집합. 있으면 스킵.

    Returns:
        Incident 리스트.
    """
    log.info(f"Fetching URL list for {year}...")
    urls = fetch_sitemap_urls(year)
    log.info(f"Found {len(urls)} candidate URLs")

    # 이미 DB에 있는 URL 스킵
    if existing_urls:
        new_urls = [u for u in urls if u not in existing_urls]
        log.info(f"Skipping {len(urls) - len(new_urls)} already-stored URLs, {len(new_urls)} new")
        urls = new_urls

    session = requests.Session()
    session.headers.update(HEADERS)

    incidents: list[Incident] = []
    for url in urls[:max_articles]:
        inc = parse_incident(url, session, delay=delay)
        if inc:
            log.info(
                f"  [{inc.category:10s}] Nr.{inc.report_nr} "
                f"| {inc.location_raw} "
                f"| {inc.title_de[:50] if inc.title_de else '?'}"
            )
            incidents.append(inc)
        else:
            log.debug(f"  skip {url}")

    log.info(f"Scraped {len(incidents)} incidents.")
    return incidents
