CREATE TABLE "ActionItem" (
	"id" text PRIMARY KEY NOT NULL,
	"meetingId" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"fileRefs" text DEFAULT '[]' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ContextItem" (
	"id" text PRIMARY KEY NOT NULL,
	"meetingId" text NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DomRecording" (
	"id" text PRIMARY KEY NOT NULL,
	"meetingId" text NOT NULL,
	"events" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Meeting" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"roomName" text NOT NULL,
	"githubRepoUrl" text,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "Meeting_roomName_unique" UNIQUE("roomName")
);
--> statement-breakpoint
CREATE TABLE "TranscriptSegment" (
	"id" text PRIMARY KEY NOT NULL,
	"meetingId" text NOT NULL,
	"speakerIdentity" text NOT NULL,
	"speakerLabel" text NOT NULL,
	"text" text NOT NULL,
	"startTs" double precision NOT NULL,
	"isFinal" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_meetingId_Meeting_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ContextItem" ADD CONSTRAINT "ContextItem_meetingId_Meeting_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "DomRecording" ADD CONSTRAINT "DomRecording_meetingId_Meeting_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_meetingId_Meeting_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ActionItem_meetingId_idx" ON "ActionItem" USING btree ("meetingId");--> statement-breakpoint
CREATE INDEX "ContextItem_meetingId_idx" ON "ContextItem" USING btree ("meetingId");--> statement-breakpoint
CREATE INDEX "DomRecording_meetingId_idx" ON "DomRecording" USING btree ("meetingId");--> statement-breakpoint
CREATE INDEX "TranscriptSegment_meetingId_idx" ON "TranscriptSegment" USING btree ("meetingId");