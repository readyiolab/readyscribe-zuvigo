import PDFDocument from "pdfkit";
import { prisma } from "@zuvigo/db";
import { NotFoundError, authz } from "@zuvigo/security";
import type { StorageService } from "@zuvigo/storage";
import { WorkspaceRole as Role } from "@zuvigo/types";
import { getMembership } from "./workspace.js";

export type ExportFormat = "markdown" | "html" | "pdf" | "confluence";

export type WorkspaceBrand = {
  logoUrl?: string | null;
  clickColor?: string | null;
  showBranding?: boolean;
};

type ExportStep = {
  position: number;
  title: string;
  description: string;
  assetUrl: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseBrand(settings: unknown): WorkspaceBrand {
  if (!settings || typeof settings !== "object") return { showBranding: true };
  const s = settings as Record<string, unknown>;
  return {
    logoUrl: typeof s.logoUrl === "string" ? s.logoUrl : null,
    clickColor: typeof s.clickColor === "string" ? s.clickColor : null,
    showBranding: s.showBranding !== false,
  };
}

async function loadExportPayload(userId: string, scribeId: string, storage: StorageService) {
  const scribe = await prisma.scribe.findUnique({
    where: { id: scribeId },
    include: {
      document: { include: { workspace: true } },
      steps: { orderBy: { position: "asc" }, include: { asset: true } },
    },
  });
  if (!scribe || scribe.document.deletedAt) throw new NotFoundError("Scribe not found");

  const membership = await getMembership(userId, scribe.document.workspaceId);
  authz.assertCan(membership.role as Role, "document.read");

  const brand = parseBrand(scribe.document.workspace.settings);

  const steps: ExportStep[] = await Promise.all(
    scribe.steps.map(async (s) => ({
      position: s.position,
      title: s.title,
      description: s.description,
      assetUrl: s.asset
        ? await storage.getSignedUrl(s.asset.objectKey, "get", { expiresIn: 3600 })
        : null,
    })),
  );

  return {
    title: scribe.document.title,
    summary: scribe.document.summary ?? "",
    steps,
    brand,
    slug: scribe.document.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "guide",
  };
}

function toMarkdown(payload: Awaited<ReturnType<typeof loadExportPayload>>): string {
  const lines: string[] = [`# ${payload.title}`, ""];
  if (payload.summary) {
    lines.push(payload.summary, "");
  }
  for (const step of payload.steps) {
    lines.push(`## ${step.position + 1}. ${step.title}`, "");
    if (step.description) lines.push(step.description, "");
    if (step.assetUrl) lines.push(`![Step ${step.position + 1}](${step.assetUrl})`, "");
  }
  if (payload.brand.showBranding !== false) {
    lines.push("---", "", "_Exported from Zuvigo_");
  }
  return lines.join("\n");
}

function toHtml(payload: Awaited<ReturnType<typeof loadExportPayload>>): string {
  const accent = payload.brand.clickColor || "#1c1a16";
  const logo = payload.brand.logoUrl
    ? `<img src="${escapeHtml(payload.brand.logoUrl)}" alt="" style="height:32px;margin-bottom:16px" />`
    : "";
  const stepsHtml = payload.steps
    .map((step) => {
      const img = step.assetUrl
        ? `<img src="${escapeHtml(step.assetUrl)}" alt="" style="max-width:100%;border:1px solid #e5e1d8;border-radius:8px;margin-top:12px" />`
        : "";
      return `<section style="margin:0 0 32px">
  <h2 style="font-size:18px;margin:0 0 8px"><span style="color:#6d685f">${step.position + 1}.</span> ${escapeHtml(step.title)}</h2>
  ${step.description ? `<p style="white-space:pre-wrap;color:#6d685f;line-height:1.5;margin:0">${escapeHtml(step.description)}</p>` : ""}
  ${img}
</section>`;
    })
    .join("\n");

  const footer =
    payload.brand.showBranding !== false
      ? `<footer style="margin-top:48px;padding-top:16px;border-top:1px solid #e5e1d8;color:#9a958c;font-size:12px">Exported from Zuvigo</footer>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.title)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #1c1a16; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.45; }
    h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 8px; color: ${accent}; }
  </style>
</head>
<body>
  ${logo}
  <h1>${escapeHtml(payload.title)}</h1>
  ${payload.summary ? `<p style="color:#6d685f;margin:0 0 32px">${escapeHtml(payload.summary)}</p>` : ""}
  ${stepsHtml}
  ${footer}
</body>
</html>`;
}

/** Confluence-friendly HTML fragment (paste via Insert → Markup / HTML). */
function toConfluence(payload: Awaited<ReturnType<typeof loadExportPayload>>): string {
  const parts: string[] = [
    `<h1>${escapeHtml(payload.title)}</h1>`,
  ];
  if (payload.summary) {
    parts.push(`<p><em>${escapeHtml(payload.summary)}</em></p>`);
  }
  for (const step of payload.steps) {
    parts.push(`<h2>${step.position + 1}. ${escapeHtml(step.title)}</h2>`);
    if (step.description) {
      parts.push(
        `<p>${escapeHtml(step.description).replace(/\n/g, "<br/>")}</p>`,
      );
    }
    if (step.assetUrl) {
      parts.push(
        `<p><ac:image ac:width="680"><ri:url ri:value="${escapeHtml(step.assetUrl)}" /></ac:image></p>`,
      );
      parts.push(
        `<p><img src="${escapeHtml(step.assetUrl)}" alt="Step ${step.position + 1}" /></p>`,
      );
    }
  }
  if (payload.brand.showBranding !== false) {
    parts.push(`<p><sub>Exported from Zuvigo — paste into Confluence as HTML / markup.</sub></p>`);
  }
  return parts.join("\n");
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function toPdf(payload: Awaited<ReturnType<typeof loadExportPayload>>): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(22).text(payload.title, { align: "left" });
  doc.moveDown(0.5);
  if (payload.summary) {
    doc.fontSize(11).fillColor("#555555").text(payload.summary);
    doc.moveDown();
  }
  doc.fillColor("#000000");

  for (const step of payload.steps) {
    doc.fontSize(14).text(`${step.position + 1}. ${step.title}`);
    doc.moveDown(0.3);
    if (step.description) {
      doc.fontSize(10).fillColor("#444444").text(step.description);
      doc.fillColor("#000000");
      doc.moveDown(0.4);
    }
    if (step.assetUrl) {
      const img = await fetchImageBuffer(step.assetUrl);
      if (img) {
        try {
          const maxW = 500;
          doc.image(img, { fit: [maxW, 320] });
          doc.moveDown();
        } catch {
          // skip bad images
        }
      }
    }
    doc.moveDown(0.6);
  }

  if (payload.brand.showBranding !== false) {
    doc.moveDown();
    doc.fontSize(9).fillColor("#999999").text("Exported from Zuvigo");
  }

  doc.end();
  return done;
}

export async function exportScribe(
  userId: string,
  scribeId: string,
  format: ExportFormat,
  storage: StorageService,
): Promise<{ body: Buffer | string; contentType: string; filename: string }> {
  const payload = await loadExportPayload(userId, scribeId, storage);

  if (format === "markdown") {
    return {
      body: toMarkdown(payload),
      contentType: "text/markdown; charset=utf-8",
      filename: `${payload.slug}.md`,
    };
  }
  if (format === "html") {
    return {
      body: toHtml(payload),
      contentType: "text/html; charset=utf-8",
      filename: `${payload.slug}.html`,
    };
  }
  if (format === "confluence") {
    return {
      body: toConfluence(payload),
      contentType: "text/html; charset=utf-8",
      filename: `${payload.slug}-confluence.html`,
    };
  }
  const pdf = await toPdf(payload);
  return {
    body: pdf,
    contentType: "application/pdf",
    filename: `${payload.slug}.pdf`,
  };
}
