# syntax=docker/dockerfile:1

# --- base: shared runtime ---
FROM node:22-slim AS base
WORKDIR /app

# --- deps: install ALL deps (incl. dev) so we can build + run drizzle-kit ---
FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: build Next ---
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined into the client bundle AT BUILD TIME.
# Coolify must pass this as a build-time variable (see README/DEPLOY notes).
ARG NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
RUN npm run build

# --- runner: image that migrates then serves ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
# Apply pending migrations on boot (idempotent), then start the server.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
