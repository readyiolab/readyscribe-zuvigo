import { getPublicDocument, parseWorkspaceBrand } from "@zuvigo/core";
import { createStorageService } from "@zuvigo/storage";
import { loadConfig } from "@zuvigo/config";
import { prisma } from "@zuvigo/db";
import { StepScreenshot } from "@/components/step-screenshot";

type PublicGuideBodyProps = {
  publicId: string;
  embed?: boolean;
};

export async function loadPublicGuide(publicId: string) {
  const link = await getPublicDocument(publicId);
  const brand = parseWorkspaceBrand(link.document.workspace.settings);
  const storage = createStorageService(loadConfig());
  const steps = link.document.scribe?.steps ?? [];
  const pageBlocks = link.document.page?.blocks ?? [];

  const stepsWithUrls = await Promise.all(
    steps.map(async (step) => {
      const annotations = (step.annotations as unknown[]) ?? [];
      let destinationAssetUrl: string | null = null;
      for (const raw of annotations) {
        if (!raw || typeof raw !== "object") continue;
        const destId = (raw as { destinationAssetId?: string }).destinationAssetId;
        if (!destId) continue;
        const dest = await prisma.captureAsset.findUnique({ where: { id: destId } });
        if (dest) {
          destinationAssetUrl = await storage.getSignedUrl(dest.objectKey, "get", {
            expiresIn: 600,
          });
        }
        break;
      }
      return {
        ...step,
        annotations,
        assetUrl: step.asset
          ? await storage.getSignedUrl(step.asset.objectKey, "get", { expiresIn: 600 })
          : null,
        destinationAssetUrl,
      };
    }),
  );

  return { link, brand, stepsWithUrls, pageBlocks };
}

export function PublicGuideArticle({
  title,
  summary,
  kind,
  pageBlocks,
  stepsWithUrls,
  brand,
  embed,
}: {
  title: string;
  summary: string | null;
  kind: string;
  pageBlocks: { id: string; type: string; data: unknown }[];
  stepsWithUrls: {
    id: string;
    title: string;
    description: string;
    annotations: unknown[];
    assetUrl: string | null;
    destinationAssetUrl: string | null;
  }[];
  brand: { logoUrl: string | null; clickColor: string; showBranding: boolean };
  embed?: boolean;
}) {
  return (
    <article className={`mx-auto max-w-3xl px-4 ${embed ? "py-6" : "py-8 sm:px-6 sm:py-10"}`}>
      {!embed && brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className="mb-4 h-7 max-w-[160px] object-contain" />
      ) : null}
      <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
      {summary ? (
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
          {summary}
        </p>
      ) : null}

      {kind === "PAGE" && pageBlocks.length > 0 ? (
        <div className="mt-8 space-y-6 pb-12">
          {pageBlocks.map((block) => {
            const data = (block.data ?? {}) as Record<string, unknown>;
            if (block.type === "HEADING") {
              return (
                <h2 key={block.id} className="font-heading text-xl font-semibold tracking-tight">
                  {String(data.text ?? "")}
                </h2>
              );
            }
            if (block.type === "TEXT") {
              return (
                <p
                  key={block.id}
                  className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground sm:text-sm"
                >
                  {String(data.text ?? "")}
                </p>
              );
            }
            if (block.type === "DIVIDER") {
              return <hr key={block.id} className="border-border" />;
            }
            if (block.type === "IMAGE" && typeof data.url === "string") {
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={block.id}
                  src={data.url}
                  alt=""
                  className="w-full rounded-xl border border-border"
                />
              );
            }
            if (block.type === "SCRIBE") {
              return (
                <p key={block.id} className="text-sm text-muted-foreground">
                  Embedded guide: {String(data.scribeId ?? data.title ?? "Scribe")}
                </p>
              );
            }
            return null;
          })}
        </div>
      ) : stepsWithUrls.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">This guide has no steps yet.</p>
      ) : (
        <ol className="mt-8 space-y-8 pb-12">
          {stepsWithUrls.map((step, i) => (
            <li key={step.id} className="space-y-3">
              <h2 className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
                <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                {step.title}
              </h2>
              {step.description ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
                  {step.description}
                </p>
              ) : null}
              <StepScreenshot
                assetUrl={step.assetUrl}
                destinationAssetUrl={step.destinationAssetUrl}
                annotations={step.annotations}
                highlightColor={brand.clickColor}
              />
            </li>
          ))}
        </ol>
      )}

      {brand.showBranding ? (
        <p className="pb-4 text-center text-caption text-muted-foreground">Shared with ReadyScribe · by Readyio PL</p>
      ) : null}
    </article>
  );
}

/** Unused helper keep for typed imports — load via loadPublicGuide in pages. */
export type _PublicGuideBodyProps = PublicGuideBodyProps;
