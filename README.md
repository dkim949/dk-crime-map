# Render.com 배포 가이드

## 전제조건

- GitHub 계정 (Render와 연결용)
- Supabase 설정 완료 (URL + service_role key 보유)

---

## 1. GitHub 레포 구조

```
berlin-crime-map/
├── render.yaml              ← Render Blueprint 설정
├── backend/
│   ├── main.py              ← FastAPI 앱
│   ├── scraper.py
│   ├── geocoder.py
│   ├── pipeline.py
│   ├── storage.py
│   └── requirements.txt
└── frontend/                ← (다음 단계: Next.js)
```

---

## 2. Render 계정 생성 및 연결

1. https://render.com → Sign up (GitHub으로 로그인 권장)
2. Dashboard → New → **Blueprint**
3. GitHub repo 선택 → `render.yaml` 자동 감지

---

## 3. 환경변수 설정

Blueprint 생성 후 각 서비스에 환경변수 입력:

### berlin-crime-api (Web Service)
```
SUPABASE_URL        = https://xxxx.supabase.co
SUPABASE_KEY        = eyJ...service_role_key...
MAPS_API_KEY        = AIza...
ANTHROPIC_API_KEY   = sk-ant-...
ALLOWED_ORIGINS     = https://berlin-crime-map.vercel.app,http://localhost:3000
```

### berlin-crime-scraper (Cron Job)
```
SUPABASE_URL        = (동일)
SUPABASE_KEY        = (동일)
MAPS_API_KEY        = (동일)
ANTHROPIC_API_KEY   = (동일)
```

---

## 4. 배포 확인

Web Service 배포 완료 후:

```bash
# 헬스체크
curl https://berlin-crime-api.onrender.com/health
# → {"status":"ok"}

# 사건 목록 (DB에 데이터 없으면 빈 배열)
curl https://berlin-crime-api.onrender.com/incidents
# → {"data":[],"count":0}

# 앱 설정 확인
curl https://berlin-crime-api.onrender.com/config
# → {"report_enabled":false,"map_default_lat":52.52,...}
```

---

## 5. 스크래퍼 수동 실행 (첫 데이터 수집)

Render Dashboard → berlin-crime-scraper → **Trigger Run**

로그에서 확인:
```
[INFO] Fetching URL list for 2026...
[INFO] Found XX candidate URLs
[INFO] ✓ [theft     ] Nr.0344 | Lichtenberg | Mutmaßliche Wohnungseinbrecher...
[INFO] Upserted XX incidents to Supabase.
```

---

## 6. 크론 스케줄

`render.yaml`에서 설정:
```yaml
schedule: "0 */6 * * *"   # UTC 기준 6시간마다
```

베를린 시간(CEST, UTC+2) 기준:
| UTC   | 베를린 |
|-------|--------|
| 00:00 | 02:00  |
| 06:00 | 08:00  |
| 12:00 | 14:00  |
| 18:00 | 20:00  |

---

## 7. 프리 티어 제한

| 항목 | 제한 |
|------|------|
| Web Service | 월 750시간 (1개면 충분) |
| 비활성 sleep | 15분 미사용 시 슬립 → 첫 요청 ~30초 |
| Cron Job | 월 750시간 |
| 빌드 시간 | 월 500분 |

슬립 문제 해결:
- 프론트엔드에서 `/health` 핑 or UptimeRobot 무료 모니터링 연결

---

## 8. API 엔드포인트 요약

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 헬스체크 |
| GET | `/incidents` | 사건 목록 (필터: category, district, lang) |
| GET | `/incidents/{id}` | 단일 사건 상세 |
| GET | `/stats` | 지구별 통계 |
| GET | `/config` | 앱 설정 (report_enabled 등) |
| POST | `/reports` | 제보 제출 |
