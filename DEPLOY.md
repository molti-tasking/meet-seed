# Deploying to Coolify

This app is a single Next.js container plus a database. The only genuinely
involved piece is **LiveKit** (real-time video needs a media server) — use
LiveKit Cloud unless you have a reason to self-host.

## 0. What you need first

- A running Coolify instance with a wildcard domain or a hostname you can point
  at the app (e.g. `meetings.example.com`).
- **Deepgram** API key and **Anthropic** API key (external SaaS — nothing to host).
- A **LiveKit** server (see step 2).

> ⚠️ **HTTPS is mandatory.** Browsers only grant camera/mic access (`getUserMedia`)
> on `https://` or `localhost`. Coolify provisions TLS automatically via its
> Traefik proxy — just set a domain and it works. Plain HTTP will silently break
> video + transcription.

## 1. The app container

The repo ships a `Dockerfile`. In Coolify:

1. **New Resource → Application → Public/Private Git Repository**, point it at this repo.
2. **Build Pack: `Dockerfile`** (Coolify auto-detects it).
3. Set the **Port** to `3000`.
4. Add a **Domain** (e.g. `https://meetings.example.com`) — TLS is automatic.

### Environment variables (Coolify → Environment Variables)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_LIVEKIT_URL` | **Mark as "Build Variable".** `NEXT_PUBLIC_*` values are baked into the browser bundle at *build* time, not read at runtime — if it's only a runtime var the client gets `undefined`. The `Dockerfile` already declares it as an `ARG`. |
| `LIVEKIT_API_KEY` | runtime |
| `LIVEKIT_API_SECRET` | runtime |
| `DEEPGRAM_API_KEY` | runtime |
| `ANTHROPIC_API_KEY` | runtime |
| `DATABASE_URL` | see step 3 |

Deepgram and Anthropic are called server-side or browser→SaaS directly, so no
extra proxying or open ports are needed for them.

## 2. LiveKit

### Option A — LiveKit Cloud (recommended)

Create a project at <https://cloud.livekit.io>. It gives you a `wss://…livekit.cloud`
URL and an API key/secret. Put them in `NEXT_PUBLIC_LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Done — nothing to host.

### Option B — self-host LiveKit on Coolify (advanced)

Deploy the `livekit/livekit-server` image as a separate Coolify resource. This
is more work because WebRTC needs media ports, not just HTTP:

- Open a **UDP port range** (e.g. `50000-50100/udp`) plus `7881/tcp`, and either
  expose `7880` behind TLS or run LiveKit's built-in TURN. On a single small VPS
  behind NAT this is the fiddly part — you must set `rtc.use_external_ip: true`
  and map the UDP range through.
- Point `NEXT_PUBLIC_LIVEKIT_URL` at the public `wss://` hostname you give it.

Start with Option A and revisit this only if you need to keep media on your own
infra.

## 3. Database (PostgreSQL)

The app uses Drizzle ORM against Postgres (`src/db/schema.ts`), with a generated
migration committed under `drizzle/`.

1. In Coolify, create a **PostgreSQL** resource (one click).
2. Copy its connection string into the app's `DATABASE_URL` env var. If the
   database runs inside the same Coolify project, use the **internal** hostname
   Coolify gives you (e.g. `postgresql://user:pass@<service>:5432/<db>`) so
   traffic stays on the internal network.

No persistent volume is needed on the app container — Postgres owns the data and
survives redeploys, and it handles concurrent writers once more than one meeting
runs at a time.

### Migrations apply automatically

The container's start command is `npm run db:migrate && npm run start` —
i.e. `drizzle-kit migrate` then `next start` (see the `Dockerfile` CMD). On every
deploy it applies any not-yet-applied migrations from `drizzle/` and is a no-op
when the DB is already up to date — so the schema is created on the first deploy
and kept in sync on later ones, with no manual step.

> The app container may start before Postgres is reachable on a cold first
> deploy. `drizzle-kit migrate` will error and the container restarts until
> Postgres accepts connections — Coolify's restart policy handles this, but if
> the first boot logs a connection error, give it a few seconds to retry.

## 4. Deploy

Click **Deploy** in Coolify. The build runs `next build`; the container then runs
`drizzle-kit migrate` and `next start`. Watch the build logs the first time to
confirm the migration applied.

## Redeploys & migrations

Each deploy re-runs `drizzle-kit migrate`, which only applies *new* migrations and
is a no-op otherwise. When you change `src/db/schema.ts`, run `npm run db:generate`
locally, commit the new file under `drizzle/`, and push — Coolify applies it on
the next deploy.
