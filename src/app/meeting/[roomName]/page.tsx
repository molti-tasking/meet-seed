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

  const [context, actionItems] = await Promise.all([
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
      }}
    />
  );
}
