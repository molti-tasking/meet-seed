# Meeting Intelligence for Software Consulting

An online meeting tool for software consulting that **captures itself** — so key
users and project managers can verbalize ideas without losing the details to
incomplete notes. It reduces cognitive load by recording the full meeting
context automatically: live transcription, shared-surface interactions, attached
reference material, and a connected codebase — then turns all of it into
concrete technical action items.

> ### The original idea
> Key users and project managers sit together in an online meeting and discuss
> problems and questions about software. They verbalize their ideas and want to
> find solutions. Traditionally they take notes and execute them afterwards, but
> many details are missing because the notes and the meeting context are lost.
> This project improves that through live transcription, session-recorded shared
> websites (DOM interactions), upfront/meanwhile context (notes, links, a
> connected GitHub repo), and contextual technical action items for the next
> steps.

## Features

| Status | Feature |
|--------|---------|
| ✅ MVP | Create / join a meeting room (LiveKit video + audio) |
| ✅ MVP | Live transcription, per-speaker (Deepgram), shared across participants |
| ✅ MVP | Context inputs: notes, reference links, connect a GitHub repo |
| ✅ MVP | AI-generated technical action items from transcript + context (Claude) |
| ✅ MVP | DOM interaction capture on an in-app shared surface (rrweb) |
| 🔜 Next | Real-time automated code fixing on the linked repo |
| 🔜 Next | Email-inbox context ingestion; GitHub OAuth app |
| 🔜 Next | Cross-origin external-site DOM capture (needs injected script / extension) |
| 🔜 Next | Server-side LiveKit Agents transcription for recording-grade accuracy |

## Architecture

```
Browser (per participant)
  ├─ LiveKit room  ── audio/video grid (@livekit/components-react)
  ├─ mic audio ──► Deepgram WS (direct, short-lived key) ──► transcript text
  │                         ├─► published over the LiveKit data channel (speaker = identity)
  │                         └─► POST /api/meetings/[id]/transcript (persisted)
  ├─ rrweb recorder on the in-app shared surface ──► POST .../dom-events
  └─ context inputs + "Generate action items"

Next.js API routes (Node)
  ├─ /api/token            LiveKit JWT (livekit-server-sdk)
  ├─ /api/deepgram/token   short-lived Deepgram grant token
  ├─ /api/meetings...      CRUD + transcript / context / dom-events (Drizzle + Postgres)
  ├─ /api/github/inspect   repo tree + key files (Octokit)
  └─ .../action-items      Claude over the assembled context (@anthropic-ai/sdk)
```

**Why transcription is client-side, per participant:** each browser streams its
own mic to Deepgram with a short-lived server-minted token, then shares the
result over LiveKit's data channel. This avoids running a separate LiveKit
Agents worker (Next.js can't host one inline) and gives speaker attribution for
free (one mic = one speaker). The production path — a server-side LiveKit Agents
worker with the Deepgram plugin — is noted as future work.

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind · LiveKit · Deepgram · Anthropic
Claude (`claude-opus-4-8`) · Octokit · rrweb · Drizzle ORM + PostgreSQL.

## Setup

1. **Install dependencies** (already done if you cloned a built tree):
   ```bash
   npm install
   ```

2. **Configure environment.** Copy `.env.example` to `.env` and fill in:
   - `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` — from
     [LiveKit Cloud](https://cloud.livekit.io) or a self-hosted server
   - `DEEPGRAM_API_KEY` — from [Deepgram](https://console.deepgram.com)
   - `ANTHROPIC_API_KEY` — from [the Anthropic Console](https://console.anthropic.com)
   - `GITHUB_TOKEN` — optional, for private repos / higher rate limits
   - `DATABASE_URL` — a PostgreSQL connection string (run one locally with
     `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`)

3. **Set up the database** (applies the committed migration):
   ```bash
   npm run db:migrate
   ```
   When you change `src/db/schema.ts` during development, run `npm run db:generate`
   to create a new migration, then `npm run db:migrate` to apply it.
   (`npm run db:studio` opens Drizzle Studio to inspect data.)

4. **Run the dev server:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

## Using it

1. Create a meeting (optionally attach a GitHub repo URL).
2. Open the room in two browser tabs and join with different names to see the
   video grid populate.
3. Speak — the transcript streams into both tabs, labeled per speaker.
4. Add notes / links / a GitHub repo in the **Context** tab.
5. Browse a URL in the **Shared surface** tab and hit **Record** to capture DOM
   interactions.
6. Click **Generate** in the action-items panel to get technical next steps from
   Claude, grounded in the transcript and attached context.

Inspect persisted data with `npm run db:studio` (Drizzle Studio).

## Notes & limitations

- rrweb records **same-origin** DOM only. External sites loaded in the shared
  surface iframe are displayed but their internal DOM isn't captured — that
  needs an injected recorder or a browser extension (future work).
- This MVP has no authentication or multi-tenancy; meetings are reachable by
  anyone with the room URL. Add auth before any real-world use.
