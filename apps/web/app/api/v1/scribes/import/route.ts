import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { createScribeFromImport, parseDocumentToSteps } from "@zuvigo/core";
import { createAIService } from "@zuvigo/ai";
import { loadConfig } from "@zuvigo/config";
import { importScribeSchema } from "@zuvigo/types";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const body = parseBody(importScribeSchema, await req.json());

    let polished: {
      title?: string;
      summary?: string;
      steps?: { title: string; description: string }[];
    } | null = null;

    if (body.polishWithAi !== false) {
      const config = loadConfig();
      if (config.aiEnabled && config.AI_API_KEY) {
        try {
          const parsed = parseDocumentToSteps(body.content);
          const ai = createAIService(config);
          const guide = await ai.generateGuide(parsed.steps);
          polished = {
            title: guide.title,
            summary: guide.summary,
            steps: guide.steps,
          };
        } catch {
          polished = null;
        }
      }
    }

    const result = await createScribeFromImport(
      session.user.id,
      {
        ...body,
        polishWithAi: Boolean(body.polishWithAi),
      },
      polished,
    );
    return jsonOk(result, { status: 201 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
