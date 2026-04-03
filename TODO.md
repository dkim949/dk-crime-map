# Berlin Crime Map — Roadmap

## Completed
- [x] DE/EN language toggle + i18n
- [x] Mobile responsive layout (top bar + map + bottom list)
- [x] RSS-based scraper (replacing HTML archive scraping)
- [x] Bike theft data pipeline (CSV → Supabase)
- [x] Bike theft merged into Property category with LOR centroid coordinates
- [x] Choropleth district visualization with count labels
- [x] Multi-select category filter + date presets
- [x] Incident detail panel (body text + source link)
- [x] URL state sync (shareable filter links)
- [x] Map legend component
- [x] Zoom hint overlay
- [x] Vercel frontend deployment (auto-deploy on push)
- [x] GitHub Actions cron (12h interval)
- [x] Anthropic API key renewed ($10 credit)
- [x] Translation backfill via Ollama (222 articles)
- [x] Duplicate URL skip optimization
- [x] Category filter radio-style (All + single group, no overlap)
- [x] Choropleth quantile color scale (green→red, dataset-relative)
- [x] User geolocation button (below zoom controls, purple dot)
- [x] Incident limit raised to 5000 (Supabase + backend)
- [x] Traffic category merged into Other
- [x] Violent category color → ruby/crimson (#e0115f)
- [x] District click → filter to that district
- [x] Selected incident auto-scroll in sidebar
- [x] Skeleton loading state (sidebar + mobile list)
- [x] Geocoder coarse result rejection + 438 Berlin-center coords cleared
- [x] Claude Haiku code-fence stripping in translation pipeline
- [x] Translation backfill 2045 articles (3-pass due to Supabase row limit)
- [x] **Phase 1 User Reporting**
  - [x] POST /reports: IP rate limit 1/hour, Cloudflare Turnstile, 72h TTL, 10km geo validation
  - [x] GET /reports/pending: non-expired unverified reports
  - [x] ReportSheet bottom sheet UI (category grid, note, disclaimer, Turnstile)
  - [x] Map pin placement mode (FAB button + crosshair cursor)
  - [x] Unverified reports displayed semi-transparently on map

## v1.1 — UX Polish (남은 것)
- [ ] Marker clustering (leaflet.markercluster) — zoom-out 시 겹침 방지
- [ ] Virtual scrolling — 500+ 사건 목록 성능
- [ ] Korean language support (KO)
- [ ] Bottom sheet mobile incident list (현재는 25dvh 고정 영역)

## v1.2 — User Engagement
- [ ] **Phase 2 Reporting**: 다수 신고 시 verified 승격, 관리자 moderaton UI
- [ ] Turnstile 환경변수 설정 (Render + Vercel) → 봇 방어 활성화
- [ ] Real-time update (polling 또는 Supabase Realtime)
- [ ] Push notifications for specific district/category (PWA)

## v1.3 — Data Expansion
- [ ] Feuerwehr (fire dept) incident data — CSV from GitHub open data
- [ ] Presseportal Blaulicht RSS — federal police, customs, THW
- [ ] Kriminalitätsatlas background statistics (biannual)
- [ ] Body text translation (body_en column + pipeline)

## v2.0 — Multi-City
- [ ] Hamburg, Munich, Frankfurt expansion
- [ ] City selector dropdown + per-city GeoJSON
- [ ] Cross-city comparison dashboard

## Infrastructure
- [ ] Supabase RLS policy review (현재 service_role key 사용 중)
- [ ] Error monitoring (Sentry)
- [ ] Google Maps billing alert setup
- [ ] Server-side date filtering (현재 클라이언트에서 필터링)
- [ ] Cron job: expires_at 지난 신고 주기적 cleanup (선택사항, soft hide라 없어도 됨)
