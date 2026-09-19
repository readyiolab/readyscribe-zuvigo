import { prisma } from "@zuvigo/db";
import { requirePageSession } from "@/lib/session";
import { notFound, redirect } from "next/navigation";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession();
  const { id } = await params;

  const doc = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    include: { page: true, scribe: true },
  });
  if (!doc) notFound();

  if (doc.kind === "SCRIBE" && doc.scribe) {
    redirect(`/editor/${doc.scribe.id}`);
  }
  if (doc.kind === "PAGE" && doc.page) {
    redirect(`/pages/${doc.page.id}`);
  }

  notFound();
}
