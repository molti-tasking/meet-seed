CREATE TABLE "TranscriptTopic" (
	"id" text PRIMARY KEY NOT NULL,
	"meetingId" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"points" text DEFAULT '[]' NOT NULL,
	"orderIndex" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Meeting" ADD COLUMN "glossary" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "TranscriptTopic" ADD CONSTRAINT "TranscriptTopic_meetingId_Meeting_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "TranscriptTopic_meetingId_idx" ON "TranscriptTopic" USING btree ("meetingId");