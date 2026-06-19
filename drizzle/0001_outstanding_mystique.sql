CREATE TABLE "CodeChangeRequest" (
	"id" text PRIMARY KEY NOT NULL,
	"meetingId" text NOT NULL,
	"sessionId" text NOT NULL,
	"repoUrl" text NOT NULL,
	"branch" text,
	"status" text DEFAULT 'running' NOT NULL,
	"prUrl" text,
	"prNumber" integer,
	"error" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "CodeChangeRequest" ADD CONSTRAINT "CodeChangeRequest_meetingId_Meeting_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "CodeChangeRequest_meetingId_idx" ON "CodeChangeRequest" USING btree ("meetingId");