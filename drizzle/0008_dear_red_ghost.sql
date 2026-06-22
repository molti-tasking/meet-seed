CREATE TABLE "FeatureRequest" (
	"id" text PRIMARY KEY NOT NULL,
	"meetingId" text NOT NULL,
	"kind" text DEFAULT 'feature' NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_meetingId_Meeting_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "FeatureRequest_meetingId_idx" ON "FeatureRequest" USING btree ("meetingId");