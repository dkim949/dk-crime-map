-- ============================================================
-- Berlin Crime Map — Supabase Migration
-- 파일: supabase/migrations/001_initial_schema.sql
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣기 → Run
-- ============================================================


-- ── 0. Extensions ─────────────────────────────────────────────
-- PostGIS: 공간 쿼리 (반경 검색 등)
-- pgcrypto: UUID 생성
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ── 1. incidents 테이블 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 데이터 출처
  source        TEXT        NOT NULL DEFAULT 'official'
                            CHECK (source IN ('official', 'report')),
  source_url    TEXT        UNIQUE,          -- 공식 기사 URL (중복 방지 키)
  report_nr     TEXT,                        -- 경찰 보고서 번호 (Nr. 0344)

  -- 다국어 제목
  title_de      TEXT,
  title_ko      TEXT,
  title_en      TEXT,
  title_ja      TEXT,

  -- 본문 (독일어 원문만 저장, 번역은 제목만)
  body_de       TEXT,

  -- 위치
  location_raw  TEXT,                        -- "Ereignisort: Lichtenberg"
  address_raw   TEXT,                        -- "Hagenstraße 5, Berlin"
  district      TEXT,                        -- 정규화된 베를린 지구명
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,

  -- 분류
  category      TEXT        NOT NULL DEFAULT 'other'
                            CHECK (category IN (
                              'theft', 'assault', 'shooting', 'fraud',
                              'drugs', 'traffic', 'fire', 'missing',
                              'homicide', 'other'
                            )),

  -- 시간
  occurred_at   TIMESTAMPTZ,                 -- 사건 발생 시각 (텍스트 파싱)
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 상태 플래그
  is_verified   BOOLEAN     NOT NULL DEFAULT false,
  is_active     BOOLEAN     NOT NULL DEFAULT true,

  -- 제보 전용 필드 (source = 'report' 일 때만 사용)
  reporter_note TEXT,                        -- 제보자 메모
  moderated_at  TIMESTAMPTZ,                 -- 관리자 승인 시각
  moderated_by  TEXT                         -- 관리자 ID (미래용)
);

COMMENT ON TABLE incidents IS '베를린 경찰 공식 발표 및 제보 기반 사건 데이터';
COMMENT ON COLUMN incidents.source IS 'official=경찰 공식, report=제보';
COMMENT ON COLUMN incidents.is_verified IS 'official은 자동 true, report는 관리자 승인 후 true';
COMMENT ON COLUMN incidents.is_active IS 'false면 지도에서 숨김 (소프트 삭제)';


-- ── 2. 인덱스 ──────────────────────────────────────────────────

-- 지오 인덱스 (반경 검색용)
CREATE INDEX IF NOT EXISTS idx_incidents_geo
  ON incidents USING GIST (ST_MakePoint(lng, lat))
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- 최신순 조회 (지도 기본 뷰)
CREATE INDEX IF NOT EXISTS idx_incidents_scraped_at
  ON incidents (scraped_at DESC);

-- 카테고리 필터
CREATE INDEX IF NOT EXISTS idx_incidents_category
  ON incidents (category);

-- 지구별 필터
CREATE INDEX IF NOT EXISTS idx_incidents_district
  ON incidents (district);

-- 미검증 제보 관리자 조회
CREATE INDEX IF NOT EXISTS idx_incidents_unverified
  ON incidents (is_verified, source)
  WHERE source = 'report' AND is_verified = false;


-- ── 3. scraper_runs 테이블 (배치 로그) ────────────────────────
CREATE TABLE IF NOT EXISTS scraper_runs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  year        INT,
  urls_found  INT         DEFAULT 0,
  scraped     INT         DEFAULT 0,
  upserted    INT         DEFAULT 0,
  errors      INT         DEFAULT 0,
  status      TEXT        DEFAULT 'running'
                          CHECK (status IN ('running', 'success', 'failed'))
);

COMMENT ON TABLE scraper_runs IS '스크래핑 배치 실행 로그';


-- ── 4. app_config 테이블 (제보 on/off 토글 등) ────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key         TEXT  PRIMARY KEY,
  value       TEXT  NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT
);

-- 초기 설정값
INSERT INTO app_config (key, value, description) VALUES
  ('report_enabled',  'false', '제보 기능 활성화 여부 (true/false)'),
  ('report_min_wait', '60',    '제보 제출 최소 간격 (초, rate limit)'),
  ('map_default_lat', '52.52', '지도 초기 중심 위도'),
  ('map_default_lng', '13.405','지도 초기 중심 경도'),
  ('map_default_zoom','12',    '지도 초기 줌 레벨')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE app_config IS '어드민 설정값. report_enabled로 제보 on/off 제어.';


-- ── 5. Row Level Security (RLS) ────────────────────────────────
-- 공개 읽기: 활성화된 검증 완료 데이터만
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- 일반 사용자: 검증된 활성 데이터만 읽기
CREATE POLICY "public_read_verified"
  ON incidents FOR SELECT
  USING (is_active = true AND is_verified = true);

-- 서비스 롤(scraper): 전체 쓰기
-- Supabase Dashboard에서 service_role key 사용 시 RLS bypass 자동 적용
-- (별도 policy 불필요)

-- app_config 공개 읽기
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_config"
  ON app_config FOR SELECT
  USING (true);

-- scraper_runs: 비공개 (service_role만)
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;


-- ── 6. 베를린 지구명 정규화 헬퍼 함수 ────────────────────────
CREATE OR REPLACE FUNCTION normalize_district(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  r TEXT := lower(trim(raw));
BEGIN
  -- 주요 베를린 지구명 매핑
  IF r LIKE '%mitte%'                     THEN RETURN 'Mitte';
  ELSIF r LIKE '%friedrichshain%'
     OR r LIKE '%kreuzberg%'              THEN RETURN 'Friedrichshain-Kreuzberg';
  ELSIF r LIKE '%pankow%'                 THEN RETURN 'Pankow';
  ELSIF r LIKE '%charlottenburg%'
     OR r LIKE '%wilmersdorf%'            THEN RETURN 'Charlottenburg-Wilmersdorf';
  ELSIF r LIKE '%spandau%'                THEN RETURN 'Spandau';
  ELSIF r LIKE '%steglitz%'
     OR r LIKE '%zehlendorf%'             THEN RETURN 'Steglitz-Zehlendorf';
  ELSIF r LIKE '%tempelhof%'
     OR r LIKE '%schöneberg%'
     OR r LIKE '%schoeneberg%'            THEN RETURN 'Tempelhof-Schöneberg';
  ELSIF r LIKE '%neukölln%'
     OR r LIKE '%neukoelln%'              THEN RETURN 'Neukölln';
  ELSIF r LIKE '%treptow%'
     OR r LIKE '%köpenick%'
     OR r LIKE '%koepenick%'              THEN RETURN 'Treptow-Köpenick';
  ELSIF r LIKE '%marzahn%'
     OR r LIKE '%hellersdorf%'            THEN RETURN 'Marzahn-Hellersdorf';
  ELSIF r LIKE '%lichtenberg%'            THEN RETURN 'Lichtenberg';
  ELSIF r LIKE '%reinickendorf%'          THEN RETURN 'Reinickendorf';
  ELSIF r LIKE '%moabit%'                 THEN RETURN 'Mitte';  -- Moabit은 Mitte 구역
  ELSIF r LIKE '%prenzlauer%'             THEN RETURN 'Pankow';
  ELSIF r LIKE '%wedding%'                THEN RETURN 'Mitte';
  ELSIF r LIKE '%berlinweit%'
     OR r LIKE '%bundesland%'             THEN RETURN 'Berlinweit';
  ELSE RETURN 'Unbekannt';
  END IF;
END;
$$;

-- location_raw에서 district 자동 채우는 트리거
CREATE OR REPLACE FUNCTION set_district()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.district IS NULL AND NEW.location_raw IS NOT NULL THEN
    NEW.district := normalize_district(NEW.location_raw);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_district
  BEFORE INSERT OR UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_district();


-- ── 7. 유용한 뷰 ──────────────────────────────────────────────

-- 지도용 공개 뷰 (민감 정보 제외)
CREATE OR REPLACE VIEW public_incidents AS
SELECT
  id,
  source,
  title_de, title_ko, title_en, title_ja,
  location_raw,
  district,
  address_raw,
  lat, lng,
  category,
  occurred_at,
  scraped_at
FROM incidents
WHERE is_active = true
  AND is_verified = true
  AND lat IS NOT NULL
  AND lng IS NOT NULL;

COMMENT ON VIEW public_incidents IS '지도 API에서 사용하는 공개 뷰. body_de, reporter_note 등 제외.';

-- 지구별 통계 뷰
CREATE OR REPLACE VIEW district_stats AS
SELECT
  district,
  category,
  COUNT(*) AS count,
  MAX(scraped_at) AS last_seen
FROM incidents
WHERE is_active = true AND is_verified = true
GROUP BY district, category
ORDER BY district, count DESC;
