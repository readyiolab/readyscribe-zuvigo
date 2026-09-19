import { prisma } from "@zuvigo/db";
import { requirePageSession } from "@/lib/session";
import { notFound, redirect } from "next/navigation";

export default async function ScribeByDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  await requirePageSession();
  const { documentId } = await params;

  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    include: { scribe: true },
  });
  if (!doc) notFound();
  if (!doc.scribe) notFound();

  redirect(`/editor/${doc.scribe.id}`);
}
