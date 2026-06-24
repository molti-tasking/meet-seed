import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { MeetingRoom } from "@/components/MeetingRoom";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ roomName: string }>;
}) {
  const { roomName } = await params;

  const [meeting] = await db
    .select()
    .from(schema.meetings)
    .where(eq(schema.meetings.roomName, roomName))
    .limit(1);

  if (!meeting) notFound();

  let glossary: string[] = [];
  try {
    glossary = JSON.parse(meeting.glossary) as string[];
  } catch {
    /* malformed — treat as empty */
  }

  const [transcript, topics, context, actionItems, featureRequests] =
    await Promise.all([
      db
        .select()
        .from(schema.transcriptSegments)
        .where(eq(schema.transcriptSegments.meetingId, meeting.id))
        .orderBy(asc(schema.transcriptSegments.startTs)),
      db
        .select()
        .from(schema.transcriptTopics)
        .where(eq(schema.transcriptTopics.meetingId, meeting.id))
        .orderBy(asc(schema.transcriptTopics.orderIndex)),
    db
      .select()
      .from(schema.contextItems)
      .where(eq(schema.contextItems.meetingId, meeting.id))
      .orderBy(asc(schema.contextItems.createdAt)),
    db
      .select()
      .from(schema.actionItems)
      .where(eq(schema.actionItems.meetingId, meeting.id))
      .orderBy(desc(schema.actionItems.createdAt)),
    db
      .select()
      .from(schema.featureRequests)
      .where(eq(schema.featureRequests.meetingId, meeting.id))
      .orderBy(desc(schema.featureRequests.createdAt)),
  ]);

  return (
    <MeetingRoom
      meeting={{
        id: meeting.id,
        title: meeting.title,
        roomName: meeting.roomName,
        githubRepoUrl: meeting.githubRepoUrl,
        githubInstallationId: meeting.githubInstallationId,
        codebaseChunks: meeting.codebaseChunks,
        language: meeting.language,
        glossary,
        transcript: transcript.map((t) => ({
          id: t.id,
          speakerIdentity: t.speakerIdentity,
          speakerLabel: t.speakerLabel,
          text: t.text,
        })),
        topics: topics.map((t) => ({
          id: t.id,
          title: t.title,
          summary: t.summary,
          points: t.points,
        })),
        context: context.map((c) => ({
          id: c.id,
          type: c.type,
          content: c.content,
        })),
        actionItems: actionItems.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          fileRefs: a.fileRefs,
          priority: a.priority,
        })),
        featureRequests: featureRequests.map((f) => ({
          id: f.id,
          kind: f.kind,
          title: f.title,
          detail: f.detail,
          status: f.status,
        })),
      }}
    />
  );
}
