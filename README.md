# Berlin Crime Map

Real-time crime & safety incident map for Berlin, powered by open data.

**Live:** https://dk-crime-map-dongin.vercel.app

---

## Architecture

```
┌────────────-─┐    ┌──────────────┐    ┌──────────────────┐
│  GitHub      │    │  Vercel      │    │  Render          │
│  Actions     │    │  (Frontend)  │    │  (Backend API)   │
│  Cron 12h    │    │  Next.js 16  │───▶│  FastAPI         │
│  ┌─────────┐ │    │  React 19    │    │  Python 3.11     │
│  │pipeline │─┼───▶│  Leaflet     │    └────────┬─────────┘
│  │  .py    │ │    │  Tailwind    │             │
│  └─────────┘ │    └──────────────┘             │
└──────────────┘                                 │
       │                                         │
       ▼                                         ▼
┌──────────────────────────────────────────────────┐
│                 Supabase (PostgreSQL)            │
│  ┌────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ incidents  │  │ bike_thefts  │  │ app_config│ │
│  │ (222 rows) │  │ (168+ rows)  │  │           │ │
│  └────────────┘  └──────────────┘  └───────────┘ │
└──────────────────────────────────────────────────┘
```

## Data Flow

```
Every 12 hours (GitHub Actions cron):

1. RSS Feed (berlin.de/polizei)
   └─▶ Scrape new article URLs only (skip existing)
       └─▶ Parse: title, body, district, address, category
           └─▶ Geocode addresses (Google Maps API)
               └─▶ Translate DE→EN (Anthropic Claude Haiku)
                   └─▶ Upsert to Supabase (incidents table)

2. Bike Theft CSV (polizei-berlin.eu)
   └─▶ Download daily rolling CSV
       └─▶ Parse last 7 days, map LOR→district
           └─▶ Upsert to Supabase (bike_thefts table)
```

## Data Sources

| Source | Type | Frequency | Records |
|--------|------|-----------|---------|
| [Berlin Polizei Pressemeldungen](https://www.berlin.de/polizei/polizeimeldungen/) | RSS + HTML scraping | 12h cron | ~220 incidents |
| [Fahrraddiebstahl Berlin](https://www.polizei-berlin.eu/Fahrraddiebstahl/Fahrraddiebstahl.csv) | CSV download | 12h cron | ~170/week |

## Project Structure

```
dk-crime-map/
├── .github/workflows/
│   └── scraper.yml          # GitHub Actions cron (every 12h)
├── backend/
│   ├── main.py              # FastAPI server
│   ├── scraper.py           # Polizei article scraper (RSS + archive)
│   ├── bike_theft.py        # Bicycle theft CSV parser
│   ├── geocoder.py          # Google Maps geocoding
│   ├── pipeline.py          # Batch pipeline entry point
│   ├── storage.py           # Supabase client & upsert
│   ├── translate_backfill.py # One-time translation backfill
│   ├── requirements.txt
│   └── .env                 # Local env vars (not committed)
├── frontend/
│   ├── app/
│   │   ├── layout.tsx       # Root layout (Geist fonts, Leaflet CSS)
│   │   ├── page.tsx         # Entry point → Dashboard
│   │   └── globals.css      # Neon green dark theme
│   ├── components/
│   │   ├── Dashboard.tsx    # Main state management
│   │   ├── Sidebar.tsx      # Desktop: filters + incident list
│   │   ├── MobileTopBar.tsx # Mobile: compact filter bar
│   │   ├── MobileList.tsx   # Mobile: bottom incident list
│   │   ├── CrimeMap.tsx     # Leaflet map + choropleth
│   │   └── CategoryIcon.tsx # Geometric shape icons
│   ├── lib/
│   │   ├── api.ts           # API client
│   │   └── i18n.ts          # DE/EN translations
│   ├── types/
│   │   └── incident.ts      # TypeScript interfaces
│   └── public/
│       └── berlin-bezirke.geojson  # 12 district boundaries
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_bike_thefts.sql
├── render.yaml              # Render Blueprint config
└── TODO.md                  # Roadmap
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 | Web app |
| Map | Leaflet + CARTO dark tiles | Interactive map |
| Backend API | FastAPI (Python 3.11) | REST API |
| Database | Supabase (PostgreSQL) | Data storage |
| Hosting (FE) | Vercel (free) | Frontend CDN |
| Hosting (BE) | Render (free) | API server |
| Cron | GitHub Actions | Scheduled scraping |
| Geocoding | Google Maps Geocoding API | Address → coordinates |
| Translation | Anthropic Claude Haiku | DE → EN title translation |

## API Endpoints

| Method | Path | Description    |
|--------|------|----------------|
| GET | `/health` | Health check |
| GET | `/incidents` | Crime incidents (filter: district, limit, offset) |
| GET | `/incidents/{id}` | Single incident detail |
| GET | `/stats` | District statistics |
| GET | `/config` | App configuration |
| GET | `/bike-thefts` | Bicycle theft data |
| GET | `/bike-thefts/by-lor` | Bike thefts aggregated by LOR code |
| POST | `/reports` | User report submission |

**Base URL:** https://dk-crime-api.onrender.com

## Environment Variables

### Backend (.env / GitHub Secrets / Render env)

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...                    # service_role key (legacy JWT)
MAPS_API_KEY=AIza...                   # Google Maps Geocoding
ANTHROPIC_API_KEY=sk-ant-...           # Claude Haiku translation
```

### Frontend (.env.local)

```
NEXT_PUBLIC_API_URL=https://dk-crime-api.onrender.com
```

## Cron Schedule

GitHub Actions runs `pipeline.py --max 200` every 12 hours:

| UTC | Berlin (CEST) |
|-----|---------------|
| 00:00 | 02:00 |
| 12:00 | 14:00 |

The pipeline skips already-stored URLs to avoid redundant scraping.

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

## Features

- Dark neon-green theme (Kepler.gl inspired)
- Choropleth district visualization
- 4 crime category groups with geometric icons (colorblind-safe)
- Multi-select category filter
- Date preset filters (24h / 7d / 30d / All)
- DE/EN language toggle (UI + titles)
- Responsive mobile layout
- Bicycle theft data layer (LOR-based)

## Cost

| Service | Cost |
|---------|------|
| Supabase | Free tier |
| Render | Free tier (sleeps after 15min inactivity) |
| Vercel | Free tier (Hobby plan) |
| GitHub Actions | Free (public repo) |
| Google Maps | $200/month free credit |
| Anthropic | ~$0.01/200 translations (Haiku) |
