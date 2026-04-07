# AI Code Reviewer (Full‑Stack)

AI-powered GitHub PR review app with a modern React dashboard and a secure Node/Express backend. It supports GitHub OAuth login, webhook-driven review processing via a queue, realtime progress updates over WebSockets, and optional billing with Stripe.

## Highlights

- **GitHub OAuth login**: JWT access tokens + httpOnly refresh token rotation
- **Webhook-first workflow**: GitHub events → queue → worker → review results
- **Realtime updates**: WebSocket endpoint at `/ws` (same port as the API)
- **API documentation**: Swagger UI at `/api/docs`
- **Infra-ready**: MongoDB persistence, Redis + BullMQ for background jobs
- **Payments (optional)**: Stripe subscription plumbing (PRO tier hooks)

## Tech stack

- **Frontend**: React + TypeScript + Vite, React Router, Tailwind CSS
- **Backend**: Node.js + TypeScript, Express, WebSockets (`ws`)
- **Data/Jobs**: MongoDB (Mongoose), Redis, BullMQ
- **Integrations**: GitHub (OAuth + App), Groq, Stripe

## Repo structure

```text
.
├─ backend/                 # Express API + WebSocket server + queue worker
│  ├─ src/
│  │  ├─ app.ts            # Express app (CORS, routes, Swagger)
│  │  ├─ server.ts         # HTTP + WS bootstrap (single port)
│  │  ├─ modules/          # auth, review, webhook, billing
│  │  ├─ queues/           # BullMQ queue + worker
│  │  └─ lib/              # mongodb, redis, swagger, stripe, github client
│  └─ .env.example
└─ frontend/                # Vite React app (dashboard UI)
   └─ src/
      ├─ pages/            # Login, Dashboard, PR detail, Billing, etc.
      ├─ api/              # API client with auto refresh-on-401
      └─ hooks/            # WebSocket hook for review events
```

## Quickstart (local dev)

### Prerequisites

- **Node.js** (recommended: current LTS)
- **MongoDB** running locally or a hosted connection string
- **Redis** running locally (default `redis://localhost:6379`)

### 1) Backend setup

```bash
cd backend
npm install
copy .env.example .env
```

Fill in the values in `backend/.env` (see **Environment variables** below).

Run the API + WebSocket server:

```bash
npm run dev
```

Backend defaults:

- **API**: `http://localhost:5000`
- **WebSocket**: `ws://localhost:5000/ws`
- **Swagger UI**: `http://localhost:5000/api/docs`
- **Health**: `http://localhost:5000/health`

### 2) Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend default:

- **App**: `http://localhost:5173`

#### Optional: configure the API base URL

The frontend uses:

- `VITE_API_URL` (if set), otherwise defaults to `http://localhost:5000`

You can set it via your shell before running Vite, for example:

```bash
set VITE_API_URL=http://localhost:5000
npm run dev
```

## Environment variables (backend)

Start from `backend/.env.example`. Commonly used variables:

### Core

- **`PORT`**: API/WS port (default `5000`)
- **`MONGODB_URI`**: Mongo connection string
- **`FRONTEND_URL`**: frontend origin allowed by CORS (default `http://localhost:5173`)
- **`NODE_ENV`**: `development` / `production`

### Auth (JWT)

- **`JWT_ACCESS_SECRET`**: secret used to sign access tokens
- **`JWT_REFRESH_SECRET`**: secret used to sign refresh tokens

### GitHub OAuth (login)

- **`GITHUB_CLIENT_ID`**
- **`GITHUB_CLIENT_SECRET`**
- **`GITHUB_CALLBACK_URL`**: defaults to `http://localhost:5000/api/auth/github/callback`

### Webhooks + Queue

- **`REDIS_URL`**: default `redis://localhost:6379`
- **`GITHUB_WEBHOOK_SECRET`**: used to validate webhook HMAC signatures

### AI review engine

- **`GITHUB_APP_PRIVATE_KEY`**: GitHub App private key (multiline string)
- **`GITHUB_APP_ID`**: GitHub App ID
- **`GROQ_API_KEY`**: Groq API key

### Stripe billing (optional)

- **`STRIPE_SECRET_KEY`**
- **`STRIPE_WEBHOOK_SECRET`**
- **`STRIPE_PRO_PRICE_ID`**

## How it works (high level)

1. **Login**: user signs in via GitHub OAuth. The backend issues:
   - a **JWT access token** (short-lived) used in `Authorization: Bearer …`
   - a **refresh token** stored in an **httpOnly cookie**, rotated on use
2. **Webhook event**: GitHub sends events to the backend webhook route.
3. **Queue + worker**: the backend enqueues review work in BullMQ; the worker processes it.
4. **Realtime status**: the frontend opens a WebSocket to `/ws` and authenticates on the first message; progress and results stream live.

## API docs

Run the backend and open Swagger UI:

- `http://localhost:5000/api/docs`

## Scripts

### Backend (`backend/package.json`)

- **`npm run dev`**: start in watch mode (ts-node-dev)
- **`npm run build`**: compile TypeScript
- **`npm run start`**: run compiled server from `dist/`

### Frontend (`frontend/package.json`)

- **`npm run dev`**: start Vite dev server
- **`npm run build`**: typecheck + build
- **`npm run preview`**: preview production build
- **`npm run lint`**: run ESLint

## Notes for production

- **Same-origin vs cross-origin**: the backend is configured for credentialed CORS so the refresh-token cookie works across origins.
- **Webhooks require raw body**: webhook routes are mounted before `express.json()` so HMAC signature validation can use the raw bytes.
- **WebSocket auth**: the server uses a “first message” auth handshake (browser WebSocket API can’t send custom headers on connect).

## License

ISC (see `backend/package.json`).

