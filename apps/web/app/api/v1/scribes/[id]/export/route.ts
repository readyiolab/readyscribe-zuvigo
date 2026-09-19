import { requireSession, handleApiError, getRequestId } from "@/lib/api";
import { exportScribe } from "@zuvigo/core";
import { getStorage } from "@/lib/infra";
import { ValidationError } from "@zuvigo/security";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const format = new URL(req.url).searchParams.get("format");
    if (
      format !== "markdown" &&
      format !== "html" &&
      format !== "pdf" &&
      format !== "confluence"
    ) {
      throw new ValidationError("format must be markdown, html, pdf, or confluence");
    }

    const result = await exportScribe(session.user.id, id, format, getStorage());
    const body =
      typeof result.body === "string" ? result.body : new Uint8Array(result.body);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Request-Id": requestId,
      },
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
