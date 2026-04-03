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

## v1.1 — UX Polish
- [ ] Color scheme finalization (Cyan+Purple vs other options)
- [ ] User geolocation on first visit (show user's position on map)
- [ ] Marker clustering (leaflet.markercluster) for zoom-out view
- [ ] Bottom sheet pattern for mobile incident list
- [ ] Virtual scrolling for 500+ incident list
- [ ] District click → filter to that district
- [ ] Selected incident auto-scroll in sidebar
- [ ] Skeleton loading state
- [ ] Korean language support (KO)

## v1.2 — User Engagement
- [ ] User report submission (POST /reports API already exists)
- [ ] Report moderation (is_verified flag)
- [ ] Real-time chat panel (WebSocket, top-right corner)
- [ ] Push notifications for specific district/category (PWA)

## v1.3 — Data Expansion
- [ ] Feuerwehr (fire dept) incident data — CSV from GitHub open data
- [ ] Presseportal Blaulicht RSS — federal police, customs, THW
- [ ] Kriminalitätsatlas background statistics (biannual)
- [ ] News article crawling (Tagesspiegel, Berliner Morgenpost)
- [ ] Body text translation (body_en column + pipeline)

## v2.0 — Multi-City
- [ ] Hamburg, Munich, Frankfurt expansion
- [ ] City selector dropdown + per-city GeoJSON
- [ ] Cross-city comparison dashboard

## Infrastructure
- [ ] Supabase RLS policy review (currently using service_role key)
- [ ] Error monitoring (Sentry)
- [ ] Vercel Git auto-deploy connected
- [ ] Google Maps billing alert setup
- [ ] Performance: server-side date filtering
