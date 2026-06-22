import { randomUUID } from "crypto";
import {
  pgTable,
  text,
  timestamp,
  doublePrecision,
  boolean,
  integer,
  index,
  vector,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";
import { createId } from "@paralleldrive/cuid2";

// Collision-resistant string ids (cuid2), so lookups that accept "id OR
// roomName" can compare arbitrary strings without a uuid cast error.
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => createId());

const createdAt = () =>
  timestamp("createdAt", { precision: 3 }).notNull().defaultNow();

// --- Auth.js (NextAuth v5) Drizzle adapter tables ---

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
);

export const meetings = pgTable("Meeting", {
  id: id(),
  title: text("title").notNull(),
  roomName: text("roomName").notNull().unique(),
  githubRepoUrl: text("githubRepoUrl"),
  // GitHub App installation id, set when a repo is connected to this room.
  githubInstallationId: text("githubInstallationId"),
  status: text("status").notNull().default("active"), // active | ended
  // Number of code chunks embedded for this meeting's repo (0 = not indexed).
  codebaseChunks: integer("codebaseChunks").notNull().default(0),
  // Deepgram transcription language: "multi" (auto DE/EN/…) or a code like "de".
  language: text("language").notNull().default("multi"),
  createdAt: createdAt(),
});

// An embedded chunk of the connected codebase, for similarity retrieval when
// building coding-agent specs. voyage-code-3 → 1024-dim vectors.
export const codeChunks = pgTable(
  "CodeChunk",
  {
    id: id(),
    meetingId: text("meetingId")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("CodeChunk_meetingId_idx").on(t.meetingId),
    index("CodeChunk_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  ]
);

export const transcriptSegments = pgTable(
  "TranscriptSegment",
  {
    id: id(),
    meetingId: text("meetingId")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    speakerIdentity: text("speakerIdentity").notNull(), // LiveKit participant identity
    speakerLabel: text("speakerLabel").notNull(), // human-friendly display name
    text: text("text").notNull(),
    startTs: doublePrecision("startTs").notNull(), // seconds from meeting start
    isFinal: boolean("isFinal").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("TranscriptSegment_meetingId_idx").on(t.meetingId)]
);

export const contextItems = pgTable(
  "ContextItem",
  {
    id: id(),
    meetingId: text("meetingId")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // note | link | github
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ContextItem_meetingId_idx").on(t.meetingId)]
);

export const actionItems = pgTable(
  "ActionItem",
  {
    id: id(),
    meetingId: text("meetingId")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    fileRefs: text("fileRefs").notNull().default("[]"), // JSON array of file paths
    priority: text("priority").notNull().default("medium"), // low | medium | high
    status: text("status").notNull().default("open"), // open | done
    createdAt: createdAt(),
  },
  (t) => [index("ActionItem_meetingId_idx").on(t.meetingId)]
);

// In-meeting product feedback about the tool ITSELF (dogfooding): a participant
// asks a question or files a feature/bug, Claude tidies it into a backlog entry,
// and a technical user can hand it to a coding agent to fix early.
export const featureRequests = pgTable(
  "FeatureRequest",
  {
    id: id(),
    meetingId: text("meetingId")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("feature"), // question | bug | feature
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    // open | planned (agent started) | done | dismissed
    status: text("status").notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [index("FeatureRequest_meetingId_idx").on(t.meetingId)]
);

export const domRecordings = pgTable(
  "DomRecording",
  {
    id: id(),
    meetingId: text("meetingId")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    events: text("events").notNull(), // JSON array of rrweb events (batched)
    createdAt: createdAt(),
  },
  (t) => [index("DomRecording_meetingId_idx").on(t.meetingId)]
);

// AI token usage + cost, one row per model call, attributed to a meeting.
export const usageEvents = pgTable(
  "UsageEvent",
  {
    id: id(),
    meetingId: text("meetingId")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("anthropic"),
    kind: text("kind").notNull(), // action_items | vision | coding_agent
    model: text("model").notNull(),
    inputTokens: integer("inputTokens").notNull().default(0),
    outputTokens: integer("outputTokens").notNull().default(0),
    cacheReadTokens: integer("cacheReadTokens").notNull().default(0),
    cacheCreationTokens: integer("cacheCreationTokens").notNull().default(0),
    costUsd: doublePrecision("costUsd").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("UsageEvent_meetingId_idx").on(t.meetingId)]
);

// A coding-agent run kicked off from a meeting: a Managed Agents session that
// implements the meeting's action items and opens a pull request.
export const codeChangeRequests = pgTable(
  "CodeChangeRequest",
  {
    id: id(),
    meetingId: text("meetingId")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    sessionId: text("sessionId").notNull(), // Managed Agents session id
    // Ephemeral per-run vault holding the GitHub MCP token (archived when done).
    vaultId: text("vaultId"),
    repoUrl: text("repoUrl").notNull(),
    branch: text("branch"), // branch the agent was told to create
    // running | needs_input (agent asked) | needs_review (PR open) | merged | failed
    status: text("status").notNull().default("running"),
    // The agent's pending question when status is needs_input.
    question: text("question"),
    prUrl: text("prUrl"),
    prNumber: integer("prNumber"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("CodeChangeRequest_meetingId_idx").on(t.meetingId)]
);
