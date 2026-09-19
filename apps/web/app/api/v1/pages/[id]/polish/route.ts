import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
} from "@/lib/api";
import { getPageForUser, updatePageBlock } from "@zuvigo/core";
import { createAIService } from "@zuvigo/ai";
import { loadConfig } from "@zuvigo/config";
import { ValidationError } from "@zuvigo/security";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const config = loadConfig();
    if (!config.aiEnabled || !config.AI_API_KEY) {
      throw new ValidationError("AI is not configured. Set AI_API_KEY to polish pages.");
    }

    const page = await getPageForUser(session.user.id, id);
    const ai = createAIService(config);
    const blocks = [];

    for (const block of page.blocks) {
      if (block.type !== "TEXT" && block.type !== "HEADING") {
        blocks.push(block);
        continue;
      }
      const text = String(block.data.text ?? "");
      if (!text.trim()) {
        blocks.push(block);
        continue;
      }
      const rewritten = await ai.rewriteStep(
        {
          title: block.type === "HEADING" ? text : "Paragraph",
          description: text,
        },
        block.type === "HEADING"
          ? "Rewrite as a clear concise section heading. Put the heading in title."
          : "Rewrite this paragraph to be clearer and more professional. Put the full paragraph in description.",
      );
      const nextText =
        block.type === "HEADING"
          ? rewritten.title || text
          : rewritten.description || rewritten.title || text;
      const updated = await updatePageBlock(session.user.id, id, block.id, {
        data: { ...block.data, text: nextText },
      });
      blocks.push(updated);
    }

    return jsonOk({ id, blocks });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
