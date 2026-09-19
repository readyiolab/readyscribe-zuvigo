import { prisma } from "@zuvigo/db";
import { ValidationError } from "@zuvigo/security";
import type { ImportScribeInput } from "@zuvigo/types";
import { assertPermission } from "./workspace.js";

export type ParsedImportStep = { title: string; description: string };

/** Parse markdown/plain text into steps from ## headings or numbered lines. */
export function parseDocumentToSteps(content: string): {
  title: string;
  steps: ParsedImportStep[];
} {
  const text = content.replace(/\r\n/g, "\n").trim();
  if (!text) throw new ValidationError("Document is empty");

  const lines = text.split("\n");
  let title = "Imported guide";
  const steps: ParsedImportStep[] = [];

  const h1 = lines.find((l) => /^#\s+/.test(l) && !/^##/.test(l));
  if (h1) title = h1.replace(/^#\s+/, "").trim() || title;

  const h2Indexes: number[] = [];
  lines.forEach((l, i) => {
    if (/^##\s+/.test(l)) h2Indexes.push(i);
  });

  if (h2Indexes.length > 0) {
    for (let i = 0; i < h2Indexes.length; i++) {
      const start = h2Indexes[i]!;
      const end = h2Indexes[i + 1] ?? lines.length;
      const stepTitle = lines[start]!.replace(/^##\s+/, "").trim();
      const body = lines
        .slice(start + 1, end)
        .join("\n")
        .trim();
      steps.push({ title: stepTitle || `Step ${i + 1}`, description: body });
    }
  } else {
    const numbered: { index: number; title: string }[] = [];
    lines.forEach((l, i) => {
      const m = /^(?:\d+)[.)]\s+(.+)$/.exec(l.trim());
      if (m) numbered.push({ index: i, title: m[1]!.trim() });
    });
    if (numbered.length > 0) {
      for (let i = 0; i < numbered.length; i++) {
        const start = numbered[i]!.index;
        const end = numbered[i + 1]?.index ?? lines.length;
        const body = lines
          .slice(start + 1, end)
          .join("\n")
          .trim();
        steps.push({ title: numbered[i]!.title, description: body });
      }
    } else {
      const chunks = text
        .split(/\n{2,}/)
        .map((c) => c.trim())
        .filter(Boolean);
      for (const chunk of chunks.slice(0, 40)) {
        if (/^#\s+/.test(chunk) && !/^##/.test(chunk)) continue;
        const [first, ...rest] = chunk.split("\n");
        steps.push({
          title: (first ?? "Step").replace(/^#+\s*/, "").slice(0, 200),
          description: rest.join("\n").trim() || chunk,
        });
      }
    }
  }

  if (steps.length === 0) {
    steps.push({ title: "Step 1", description: text.slice(0, 10000) });
  }

  return { title, steps: steps.slice(0, 100) };
}

export async function createScribeFromImport(
  userId: string,
  input: ImportScribeInput,
  polished?: {
    title?: string;
    summary?: string;
    steps?: ParsedImportStep[];
  } | null,
) {
  await assertPermission(userId, input.workspaceId, "document.create");

  const parsed = parseDocumentToSteps(input.content);
  const steps = polished?.steps?.length ? polished.steps : parsed.steps;
  const title = (input.title?.trim() || polished?.title || parsed.title).slice(0, 200);
  const summary =
    polished?.summary?.slice(0, 5000) ?? `Imported guide with ${steps.length} steps.`;

  const doc = await prisma.document.create({
    data: {
      workspaceId: input.workspaceId,
      kind: "SCRIBE",
      title,
      summary,
      status: "READY",
      createdByUserId: userId,
      scribe: {
        create: {
          steps: {
            create: steps.map((s, i) => ({
              position: i,
              title: s.title.slice(0, 200),
              description: s.description.slice(0, 10000),
              callouts: [],
              annotations: [],
            })),
          },
        },
      },
    },
    include: { scribe: true },
  });

  return {
    scribeId: doc.scribe!.id,
    documentId: doc.id,
    title: doc.title,
    stepCount: steps.length,
  };
}
