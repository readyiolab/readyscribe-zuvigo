import { requirePageSession } from "@/lib/session";
import { getScribeForUser } from "@zuvigo/core";
import { getStorage } from "@/lib/infra";
import { ScribeEditor } from "@/components/scribe-editor";
import { notFound } from "next/navigation";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ scribeId: string }>;
}) {
  const session = await requirePageSession();
  const { scribeId } = await params;

  try {
    const scribe = await getScribeForUser(session.user.id, scribeId, getStorage());
    return (
      <ScribeEditor
        initial={{
          id: scribe.id,
          documentId: scribe.documentId,
          title: scribe.title,
          summary: scribe.summary,
          status: scribe.status,
          steps: scribe.steps,
        }}
      />
    );
  } catch {
    notFound();
  }
}
