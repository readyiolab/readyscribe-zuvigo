import { requirePageSession } from "@/lib/session";
import { getPageForUser } from "@zuvigo/core";
import { notFound } from "next/navigation";
import { PageEditor } from "@/components/page-editor";

type Props = { params: Promise<{ pageId: string }> };

export default async function PageEditorRoute({ params }: Props) {
  const session = await requirePageSession();
  const { pageId } = await params;

  let page;
  try {
    page = await getPageForUser(session.user.id, pageId);
  } catch {
    notFound();
  }

  return (
    <PageEditor
      initial={{
        id: page.id,
        documentId: page.documentId,
        title: page.title,
        summary: page.summary,
        blocks: page.blocks,
      }}
    />
  );
}
