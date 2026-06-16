# SkyCast — Interactive Weather Map Dashboard

SkyCast is a full-stack web application that combines an interactive Leaflet map with NASA POWER historical weather data, user accounts, cloud-synced saved locations, and an Arabic-friendly weather assistant.

## Features

- **Offline-safe local database fallback** — accounts, saved locations, and markers keep working even without MongoDB during development.
- **Interactive map** — Multiple base layers, RainViewer radar overlay, geolocation, markers, distance measure
- **Weather analytics** — Temperature, precipitation, wind, and air quality (AOD) charts via Chart.js
- **Compare two locations** — Side-by-side charts and summary (Control Panel → Compare Locations)
- **PDF weather reports** — Export single-location or comparison reports
- **AI assistant** — OpenAI when `OPENAI_API_KEY` is set; Arabic rules fallback otherwise
- **PWA** — Installable app with service worker (offline static assets + cached map tiles)
- **Email auth** — Verification on signup, forgot/reset password (SMTP or dev console links)
- **NASA POWER API** — Server-proxied with 15-minute response caching
- **Cloud sync** — Saved locations/markers in MongoDB; import from localStorage
- **Share URLs** — `?lat=&lon=&start=&end=` deep links
- **Health check** — `GET /api/health`

## Quick start

### 1. Install dependencies

```bash
cd Finalapp/Finalapp0000
npm install
```

### 2. Configure environment

```bash
copy .env.example .env
```

Edit `.env`:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas or local connection string. If unavailable in development, SkyCast falls back to `data/skycast-local-db.json`. |
| `SESSION_SECRET` | Random string for session cookies |
| `JAWG_ACCESS_TOKEN` | Optional — Jawg map tiles ([jawg.io](https://jawg.io)) |
| `OPENAI_API_KEY` | Optional — enables LLM chat assistant |
| `SMTP_*` | Optional — email verification & password reset |
| `PORT` | Default `5001` |

Test database connection:

```bash
npm run test:db
```

If MongoDB is not installed or Atlas is unavailable, the app automatically uses the local JSON fallback database. This is useful for demos and graduation-project testing. For production, use MongoDB Atlas or a real MongoDB server.

### 3. Run

```bash
npm start
# or for development:
npm run dev
```

Open **http://localhost:5001**

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server & database status |
| GET | `/api/config` | Public client config |
| GET | `/api/search?q=` | Location search |
| GET | `/api/reverse?lat=&lon=` | Reverse geocoding |
| GET | `/api/weather?lat=&lon=&start=&end=` | Weather data (YYYYMMDD) |
| GET/POST/DELETE | `/api/locations` | Saved locations (auth) |
| GET/POST/DELETE | `/api/markers` | Map markers (auth) |
| GET | `/api/profile` | User profile (auth) |
| PUT | `/api/profile/preferences` | Update preferences (auth) |
| POST | `/api/weather/compare` | Compare 2 locations |
| POST | `/api/weather/report` | Download PDF report |
| POST | `/api/chat` | AI / rules chat |
| POST | `/api/sync` | Import localStorage → MongoDB (auth) |

## Project structure

```
src/
  config.js          # Environment configuration
  db.js              # MongoDB connection
  index.js           # Express app entry
  models/            # User, SavedLocation, MapMarker
  routes/api.js      # REST API
  services/          # Weather & geocode services
public/
  map.js             # Leaflet map logic
  master.js          # Weather UI & charts
  api-client.js      # Frontend API wrapper
  app-enhancements.js # Share URLs, units, onboarding
views/
  home.ejs           # Main dashboard
  profile.ejs        # User settings
```

## Security notes

- Never commit `.env` or real credentials to git
- Rotate any credentials that were previously hardcoded in source
- In production, set `NODE_ENV=production` and use HTTPS so session cookies are secure

## License

ISC
