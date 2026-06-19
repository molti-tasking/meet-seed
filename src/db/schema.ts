import {
  pgTable,
  text,
  timestamp,
  doublePrecision,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

// Collision-resistant string ids (cuid2), so lookups that accept "id OR
// roomName" can compare arbitrary strings without a uuid cast error.
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => createId());

const createdAt = () =>
  timestamp("createdAt", { precision: 3 }).notNull().defaultNow();

export const meetings = pgTable("Meeting", {
  id: id(),
  title: text("title").notNull(),
  roomName: text("roomName").notNull().unique(),
  githubRepoUrl: text("githubRepoUrl"),
  // GitHub App installation id, set when a repo is connected to this room.
  githubInstallationId: text("githubInstallationId"),
  status: text("status").notNull().default("active"), // active | ended
  createdAt: createdAt(),
});

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
