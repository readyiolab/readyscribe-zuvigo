import { getOptionalPageSession } from "@/lib/session";
import { AcceptInviteClient } from "@/components/accept-invite-client";
import { ButtonLink } from "@/components/button-link";

type Props = { params: Promise<{ token: string }> };

export default async function InviteAcceptPage({ params }: Props) {
  const { token } = await params;
  const session = await getOptionalPageSession();

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <span className="font-heading text-sm font-semibold tracking-tight">Zuvigo</span>
        <ButtonLink href="/dashboard" variant="ghost" size="sm">
          Dashboard
        </ButtonLink>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-16">
        <AcceptInviteClient token={token} signedInEmail={session?.user.email ?? null} />
      </main>
    </div>
  );
}
