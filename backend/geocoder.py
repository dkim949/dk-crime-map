"""
geocoder.py
===========
Google Maps Geocoding API wrapper.
주소 문자열 → (lat, lng) 변환.

설계 원칙:
  - 캐시 (주소 → 좌표) 로 중복 API 호출 방지
  - 실패 시 Berlin 중심 좌표 fallback (None 반환으로 명확히 구분)
  - rate limit: 50 QPS 이하 유지
"""

import time
import logging
from typing import Optional

import requests

log = logging.getLogger(__name__)

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
BERLIN_BBOX = "52.3,13.1|52.7,13.8"  # bounds bias

# 인메모리 캐시 (프로세스 내)
_cache: dict[str, tuple[float, float]] = {}


def geocode(address: str, api_key: str, delay: float = 0.05) -> Optional[tuple[float, float]]:
    """
    주소 문자열 → (lat, lng).
    실패 시 None 반환 (지도에 표시 안 함).

    Args:
        address:  e.g. "Rathenower Straße 10, Berlin"
        api_key:  Google Maps API key (개인 계정)
        delay:    API 호출 간 대기 (초)

    Returns:
        (lat, lng) tuple or None
    """
    if not address:
        return None

    # 캐시 hit
    key = address.lower().strip()
    if key in _cache:
        return _cache[key]

    time.sleep(delay)

    try:
        resp = requests.get(
            GEOCODE_URL,
            params={
                "address": address,
                "bounds": BERLIN_BBOX,
                "language": "de",
                "key": api_key,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        if data["status"] == "OK" and data["results"]:
            loc = data["results"][0]["geometry"]["location"]
            coords = (loc["lat"], loc["lng"])
            _cache[key] = coords
            log.debug(f"Geocoded: {address} → {coords}")
            return coords

        log.warning(f"Geocode failed [{data['status']}]: {address}")
        return None

    except Exception as e:
        log.warning(f"Geocode error for '{address}': {e}")
        return None


def geocode_batch(
    addresses: list[str],
    api_key: str,
    delay: float = 0.1,
) -> list[Optional[tuple[float, float]]]:
    """
    주소 목록 일괄 지오코딩.
    순서 보장 (None 포함).
    """
    results = []
    for addr in addresses:
        coords = geocode(addr, api_key, delay=delay)
        results.append(coords)
    return results
