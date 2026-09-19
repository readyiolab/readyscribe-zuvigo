import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { updateScribeStep, getMembership } from "@zuvigo/core";
import { prisma } from "@zuvigo/db";
import { createAIService } from "@zuvigo/ai";
import { loadConfig } from "@zuvigo/config";
import { rewriteScribeStepSchema } from "@zuvigo/types";
import { NotFoundError, ValidationError, authz } from "@zuvigo/security";
import { WorkspaceRole as Role } from "@zuvigo/types";

const PRESET_INSTRUCTIONS = {
  clearer: "Rewrite to be clearer and more actionable. Keep the same intent.",
  shorter: "Rewrite shorter and tighter. Keep the essential action only.",
  formal: "Rewrite in a more formal professional tone suitable for SOPs.",
} as const;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; stepId: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id: scribeId, stepId } = await ctx.params;
    const body = parseBody(rewriteScribeStepSchema, await req.json());

    const scribe = await prisma.scribe.findUnique({
      where: { id: scribeId },
      include: { document: true },
    });
    if (!scribe) throw new NotFoundError("Scribe not found");

    const membership = await getMembership(session.user.id, scribe.document.workspaceId);
    authz.assertMutateDocument(
      membership.role as Role,
      "document.edit",
      scribe.document.createdByUserId === session.user.id,
    );

    const step = await prisma.scribeStep.findFirst({
      where: { id: stepId, scribeId },
    });
    if (!step) throw new NotFoundError("Step not found");

    const instruction =
      body.instruction?.trim() ||
      (body.preset ? PRESET_INSTRUCTIONS[body.preset] : null);
    if (!instruction) throw new ValidationError("preset or instruction is required");

    const config = loadConfig();
    if (!config.aiEnabled || !config.AI_API_KEY) {
      throw new ValidationError(
        "AI is not configured. Set AI_API_KEY in the environment to use Improve.",
      );
    }

    const ai = createAIService(config);
    const rewritten = await ai.rewriteStep(
      { title: step.title, description: step.description },
      instruction,
    );

    await updateScribeStep(session.user.id, scribeId, stepId, {
      title: rewritten.title,
      description: rewritten.description,
    });

    return jsonOk({
      id: stepId,
      title: rewritten.title,
      description: rewritten.description,
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
