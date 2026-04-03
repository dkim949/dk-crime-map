-- 자전거 도난 데이터 테이블
CREATE TABLE IF NOT EXISTS bike_thefts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'fahrrad_data',
  source_url TEXT NOT NULL UNIQUE,  -- 고유 키 (날짜+LOR+시간+피해액 조합)
  title_de TEXT,
  title_en TEXT,
  category TEXT DEFAULT 'theft',
  district TEXT,
  lor_code TEXT,           -- 8자리 LOR Planungsraum 코드
  address_raw TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  occurred_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  is_verified BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  bike_type TEXT,          -- Fahrrad, Herrenfahrrad, E-Bike 등
  damage_eur INTEGER DEFAULT 0,
  is_attempt BOOLEAN DEFAULT FALSE
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_bike_thefts_occurred ON bike_thefts (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_bike_thefts_lor ON bike_thefts (lor_code);
CREATE INDEX IF NOT EXISTS idx_bike_thefts_district ON bike_thefts (district);

-- RLS (서비스 키 사용 중이므로 기본 허용)
ALTER TABLE bike_thefts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON bike_thefts FOR ALL USING (TRUE);
