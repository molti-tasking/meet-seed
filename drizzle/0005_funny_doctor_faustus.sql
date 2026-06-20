CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "CodeChunk" (
	"id" text PRIMARY KEY NOT NULL,
	"meetingId" text NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Meeting" ADD COLUMN "codebaseChunks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "CodeChunk" ADD CONSTRAINT "CodeChunk_meetingId_Meeting_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "CodeChunk_meetingId_idx" ON "CodeChunk" USING btree ("meetingId");--> statement-breakpoint
CREATE INDEX "CodeChunk_embedding_idx" ON "CodeChunk" USING hnsw ("embedding" vector_cosine_ops);