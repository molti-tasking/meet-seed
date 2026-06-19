CREATE TABLE "UsageEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"meetingId" text NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"inputTokens" integer DEFAULT 0 NOT NULL,
	"outputTokens" integer DEFAULT 0 NOT NULL,
	"cacheReadTokens" integer DEFAULT 0 NOT NULL,
	"cacheCreationTokens" integer DEFAULT 0 NOT NULL,
	"costUsd" double precision DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_meetingId_Meeting_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "UsageEvent_meetingId_idx" ON "UsageEvent" USING btree ("meetingId");