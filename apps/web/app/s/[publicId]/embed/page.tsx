import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadPublicGuide, PublicGuideArticle } from "@/components/public-guide-body";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { publicId } = await params;
    const { link } = await loadPublicGuide(publicId);
    return {
      title: link.document.title,
      robots: "noindex,nofollow",
    };
  } catch {
    return { title: "Embedded guide" };
  }
}

export default async function PublicEmbedPage({ params }: Props) {
  const { publicId } = await params;
  let data;
  try {
    data = await loadPublicGuide(publicId);
  } catch {
    notFound();
  }

  const { link, brand, stepsWithUrls, pageBlocks } = data;

  if (link.passwordHash || link.visibility === "WORKSPACE" || link.visibility === "PRIVATE") {
    return (
      <div className="flex min-h-full items-center justify-center bg-canvas px-6 py-16 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          This guide cannot be embedded with the current share settings. Use an “Anyone with the
          link” share without a password.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-canvas">
      <PublicGuideArticle
        title={link.document.title}
        summary={link.document.summary}
        kind={link.document.kind}
        pageBlocks={pageBlocks}
        stepsWithUrls={stepsWithUrls}
        brand={brand}
        embed
      />
    </div>
  );
}
