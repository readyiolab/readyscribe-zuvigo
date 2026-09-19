import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { loadPublicGuide, PublicGuideArticle } from "@/components/public-guide-body";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { publicId } = await params;
    const { link } = await loadPublicGuide(publicId);
    return {
      title: `${link.document.title} · Zuvigo`,
      description: link.document.summary ?? undefined,
      robots: link.visibility === "PUBLIC" ? "index,follow" : "noindex,nofollow",
    };
  } catch {
    return { title: "Shared guide · Zuvigo" };
  }
}

export default async function PublicSharePage({ params }: Props) {
  const { publicId } = await params;
  let data;
  try {
    data = await loadPublicGuide(publicId);
  } catch {
    notFound();
  }

  const { link, brand, stepsWithUrls, pageBlocks } = data;

  return (
    <div className="min-h-full bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="h-7 max-w-[160px] object-contain" />
          ) : brand.showBranding ? (
            <Link href="/" className="font-heading text-sm font-semibold tracking-tight">
              Zuvigo
            </Link>
          ) : (
            <span className="font-heading text-sm font-semibold tracking-tight">Guide</span>
          )}
          <span className="text-caption">Shared guide</span>
        </div>
      </header>

      <PublicGuideArticle
        title={link.document.title}
        summary={link.document.summary}
        kind={link.document.kind}
        pageBlocks={pageBlocks}
        stepsWithUrls={stepsWithUrls}
        brand={brand}
      />
    </div>
  );
}
