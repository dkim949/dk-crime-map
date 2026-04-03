# Berlin Crime Map

Real-time crime & safety incident map for Berlin, powered by open data and community reports.

**Live:** https://frontend-one-green-49.vercel.app

---

## Features

- **Choropleth heatmap** — 12 Berlin districts colored by crime density (quantile scale, green→red)
- **Incident markers** — geometric icons by category (violent / property / other), visible at zoom 12+
- **Filters** — category (radio), date preset (24h / 7d / 30d / All), district dropdown
- **Bike theft layer** — LOR centroid-based coordinates, merged into property category
- **DE/EN language toggle** — UI + incident titles translated via Claude Haiku
- **User reporting** — GPS-gated report submission with 72h TTL, flag markers on map
- **Report categories** — Assault / Theft / Drugs / Fire / Nuisance 💩 / Other
- **Mobile responsive** — compact top bar + map + scrollable incident list
- **URL state sync** — shareable filter links

---

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  GitHub      │    │  Vercel      │    │  Render          │
│  Actions     │    │  (Frontend)  │    │  (Backend API)   │
│  Cron 12h    │    │  Next.js 16  │───▶│  FastAPI         │
│  ┌─────────┐ │    │  React 19    │    │  Python 3.11     │
│  │pipeline │─┼───▶│  Leaflet     │    └────────┬─────────┘
│  │  .py    │ │    │  Tailwind 4  │             │
│  └─────────┘ │    └──────────────┘             │
└──────────────┘                                 │
       │                                         ▼
       └──────────────────────────▶  ┌──────────────────────────────┐
                                     │     Supabase (PostgreSQL)    │
                                     │  incidents · bike_thefts     │
                                     │  app_config · scraper_runs   │
                                     └──────────────────────────────┘
```

## Data Flow

```
Every 12 hours (GitHub Actions):

1. Berlin Polizei RSS
   └▶ Scrape new URLs only (skip duplicates)
      └▶ Parse: title, body, district, address, category
         └▶ Geocode (Google Maps — coarse results rejected)
            └▶ Translate DE→EN (Claude Haiku)
               └▶ Upsert → incidents table

2. Fahrrad-Diebstahl CSV
   └▶ Download rolling CSV
      └▶ Map LOR code → Bezirk name + centroid coords
         └▶ Upsert → bike_thefts table

3. User Reports (POST /reports)
   └▶ GPS required (browser geolocation)
      └▶ Rate limit: 3/hour per IP (success only)
         └▶ Cloudflare Turnstile verification
            └▶ Insert → incidents (source=report, is_verified=false)
               └▶ Auto-expires after 72h (soft hide)
```

## Data Sources

| Source | Type | Frequency |
|--------|------|-----------|
| [Berlin Polizei Pressemeldungen](https://www.berlin.de/polizei/polizeimeldungen/) | RSS + HTML | 12h cron |
| [Fahrraddiebstahl Berlin](https://www.polizei-berlin.eu/Fahrraddiebstahl/Fahrraddiebstahl.csv) | CSV | 12h cron |
| Community reports | User submission | Real-time |

## Project Structure

```
dk-crime-map/
├── .github/workflows/
│   └── scraper.yml              # GitHub Actions cron (every 12h)
├── backend/
│   ├── main.py                  # FastAPI — incidents, reports, bike-thefts
│   ├── scraper.py               # Polizei RSS + archive scraper
│   ├── bike_theft.py            # Fahrrad-Diebstahl CSV parser
│   ├── geocoder.py              # Google Maps geocoding (coarse rejection)
│   ├── pipeline.py              # Batch pipeline entry point
│   ├── storage.py               # Supabase client + upsert helpers
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # Entry → Dashboard
│   │   └── globals.css          # Dark theme + animations
│   ├── components/
│   │   ├── Dashboard.tsx        # State management hub
│   │   ├── CrimeMap.tsx         # Leaflet map, choropleth, markers, flags
│   │   ├── Sidebar.tsx          # Desktop: filters + incident list
│   │   ├── MobileTopBar.tsx     # Mobile: compact filter bar
│   │   ├── MobileList.tsx       # Mobile: bottom incident list
│   │   ├── ReportSheet.tsx      # User report bottom sheet
│   │   ├── IncidentDetail.tsx   # Incident detail panel
│   │   ├── MapLegend.tsx        # Map legend
│   │   └── CategoryIcon.tsx     # Geometric shape icons
│   ├── lib/
│   │   ├── api.ts               # API client (incidents, reports, bike)
│   │   └── i18n.ts              # DE/EN translations
│   ├── types/
│   │   └── incident.ts          # TypeScript interfaces + category groups
│   └── public/
│       ├── berlin-bezirke.geojson   # 12 district boundaries
│       └── lor-centroids.json       # LOR code → [lat, lng] centroids
├── render.yaml                  # Render Blueprint
└── TODO.md                      # Roadmap
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/incidents` | Verified incidents (filter: district, limit) |
| GET | `/incidents/{id}` | Single incident detail |
| GET | `/stats` | District-level statistics |
| GET | `/config` | App configuration (report_enabled etc.) |
| GET | `/bike-thefts` | Bicycle theft records |
| GET | `/bike-thefts/by-lor` | Bike thefts aggregated by LOR code |
| GET | `/reports/pending` | Unverified user reports (non-expired) |
| POST | `/reports` | Submit user report |

**Base URL:** https://dk-crime-api.onrender.com

## Environment Variables

### Backend (Render / GitHub Secrets)

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...                    # service_role key
MAPS_API_KEY=AIza...                   # Google Maps Geocoding
ANTHROPIC_API_KEY=sk-ant-...           # Claude Haiku translation
TURNSTILE_SECRET_KEY=...               # Cloudflare Turnstile (optional)
```

### Frontend (Vercel)

```
NEXT_PUBLIC_API_URL=https://dk-crime-api.onrender.com
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...     # Cloudflare Turnstile (optional)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Map | Leaflet + CARTO dark tiles |
| Backend | FastAPI (Python 3.11) |
| Database | Supabase (PostgreSQL) |
| Frontend hosting | Vercel (free) |
| Backend hosting | Render (free) |
| Cron | GitHub Actions |
| Geocoding | Google Maps Geocoding API |
| Translation | Anthropic Claude Haiku |
| Bot protection | Cloudflare Turnstile (optional) |

## Local Development

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in your keys
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

## Cost

| Service | Cost |
|---------|------|
| Supabase | Free tier |
| Render | Free tier (sleeps after 15min inactivity) |
| Vercel | Free tier |
| GitHub Actions | Free (public repo) |
| Google Maps | $200/month free credit |
| Anthropic | ~$0.01/200 translations (Haiku) |
| Cloudflare Turnstile | Free |
