# 7. Deployment

NeighbourAid is small enough to deploy from a single VM, but the
recommended path is the **Vercel + Render + MongoDB Atlas** split —
all free tiers, no credit card.

---

## 7.1 Recommended (Vercel + Render + Atlas)

```
       ┌──────────────┐    HTTPS / WSS   ┌──────────────┐
       │  Vercel      │ ────────────────▶│  Render      │
       │  Static SPA  │                   │  Docker app  │
       │              │ ◀─────────────────│              │
       └──────────────┘                   └──────┬───────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │  Atlas M0    │
                                          │  Mumbai DC   │
                                          └──────────────┘
```

### 1. MongoDB Atlas (DB)
- Create an M0 cluster in **Mumbai (ap-south-1)**.
- Network access: `0.0.0.0/0` is the easiest for Render's dynamic IPs.
- Create a DB user. Note the connection string —
  `mongodb+srv://<user>:<pwd>@cluster.../neighbouraid`.

### 2. Render (backend)
- New Web Service → connect this repo → Docker.
- Set env vars:
  - `JWT_SECRET` — `openssl rand -hex 32`
  - `MONGO_URL` — paste the Atlas string
  - `NA_DISABLE_AI_MODEL=0` if you want the real HF model (needs a
    paid 2 GB instance), `1` for the heuristic fallback (free tier OK).
  - `FRONTEND_ORIGINS=https://your-vercel-app.vercel.app`
- The free tier sleeps after 15 min of inactivity; first request
  after a sleep takes ~30 s. Set up a cron-job.org ping to `/health`
  every 10 min if you want it always-on.

### 3. Vercel (frontend)
- New project → import this repo → root dir `frontend/`.
- Build command: `npm run build`. Output dir: `dist`.
- Env vars:
  - `VITE_API_URL=https://your-render-app.onrender.com`
  - `VITE_WS_URL=wss://your-render-app.onrender.com`

### 4. Trigger a Render redeploy on every push to main

The repo ships `.github/workflows/deploy.yml` which POSTs the Render
deploy hook. To enable:

1. In Render, copy the **Deploy Hook URL** for your service.
2. In GitHub repo → Settings → Secrets → New secret named
   `RENDER_DEPLOY_HOOK`, paste the URL.
3. Push to `main` → CI runs → on green, the deploy job pings the
   hook → Render redeploys.

If `RENDER_DEPLOY_HOOK` isn't set, the workflow logs a warning and
exits 0, so it doesn't break the pipeline.

---

## 7.2 One-command Ubuntu VM

For self-hosting on AWS Lightsail / EC2 / Oracle Always Free /
DigitalOcean / Hetzner:

```bash
curl -fsSL https://raw.githubusercontent.com/pk23nk21/NeighbourAid/main/deploy.sh | bash
```

The script ([deploy.sh](../deploy.sh)) is idempotent. It:

1. Installs Docker + Compose plugin.
2. Clones (or pulls) the repo into `~/neighbouraid`.
3. Generates a fresh `JWT_SECRET` if `.env` doesn't exist.
4. Runs `docker compose up -d --build`.

You'll need to open ports `3000` and `8000` in your cloud firewall.
For HTTPS, put Caddy in front:

```bash
docker run -d -p 80:80 -p 443:443 --name caddy caddy \
  caddy reverse-proxy --from yourdomain.com --to localhost:3000
```

(Or use Traefik, nginx, whatever you're comfortable with.)

---

## 7.3 Render Blueprint

The repo ships `render.yaml` for one-click setup:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/pk23nk21/NeighbourAid)

The blueprint declares both services and prompts you only for
`MONGO_URL`. Generated `JWT_SECRET` is opaque — you can rotate it
later from the Render dashboard.

---

## 7.4 Post-deploy checklist

- [ ] Frontend loads at `https://...vercel.app`. Health check at
      `/health` (proxied) returns `{status:"ok"}`.
- [ ] Backend `/docs` renders the Swagger UI.
- [ ] Register a reporter + a volunteer from two browsers. Post an
      alert from the reporter; the volunteer's `/volunteer` feed
      should light up over WebSocket within ~1 second.
- [ ] Open the volunteer feed → tap **Enable** for browser
      notifications → background the tab → post another alert →
      verify the native notification fires.
- [ ] Open `/api/news/recent` directly — confirm the cache populates
      (first call is slow ≈ 5 s as it scrapes 4 RSS feeds, subsequent
      calls are instant for 5 minutes).
- [ ] If you set `INBOUND_TOKEN`, send a test POST to
      `/api/inbound/whatsapp` from `curl` and confirm the alert
      appears in the volunteer feed.
- [ ] Set up a cron-job.org ping to `/health` every 10 min if you're
      on Render free tier.

---

## 7.5 Scaling notes

### When to upgrade Render

- **You need the real HF model** (not the heuristic fallback) — needs
  ~2 GB RAM. Render free is 512 MB; you'd OOM.
- **You expect simultaneous WebSocket connections > ~50** — free
  tier limits.
- **You can't tolerate the cold-start delay**.

### When to upgrade Mongo

Atlas M0 limits you to 512 MB and 100 connections. For a real
deployment in a metro area, M10 (paid, ~$57/mo) is the next step.
Geographic indexes scale fine — `2dsphere` queries are O(log n)
in the index size.

### Multi-region

Currently single-region. If you want HA across regions:
- Use Atlas M10+ with a multi-region replica set.
- Run the backend in two Render regions behind a CDN.
- The WebSocket manager is in-process — for multi-replica you'd
  need a Redis pub/sub bus to fan broadcasts across replicas.
  See `services/websocket.py` for the swap point.

### CDN

Vercel does this for the frontend automatically. The static CSS+JS
bundle is ~155 KB gzipped, which is tiny — caching pays off
mainly for repeat visitors and Service Worker pre-cache.

---

## 7.6 Rolling back

### Render
Go to the service's **Deploys** tab → Rollback to the previous green
deploy. Takes ~30 s.

### Vercel
**Deployments** tab → click the previous successful deploy →
**Promote to Production**. Takes ~5 s.

### Database

There's no backwards-incompatible schema change in this repo so far,
but if you ever ship one and need to roll back the backend:

1. Render rollback first.
2. Don't drop fields the *new* code wrote. Old code will ignore
   them, which is fine — every backend route uses Mongo's natural
   permissive shape (`doc.get(field, default)`).

---

## 7.7 Logs + observability

- Render's built-in logs view captures stdout/stderr from uvicorn.
- The backend logs structured JSON for warnings/errors and prints
  exception tracebacks for any 500 (the global exception handler
  converts them to `{"detail": "Internal server error"}` for the
  client, but logs the full trace).
- For real observability, plug Render into Datadog / Sentry / New
  Relic — not enabled by default to keep the free-stack pure.
