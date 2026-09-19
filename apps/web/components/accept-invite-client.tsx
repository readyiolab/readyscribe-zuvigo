"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/button-link";

type InviteInfo = {
  email: string;
  role: string;
  workspaceName: string;
  expiresAt: string;
};

type Props = {
  token: string;
  signedInEmail: string | null;
};

export function AcceptInviteClient({ token, signedInEmail }: Props) {
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/invites/${token}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error?.message ?? "Invite not found");
        }
        if (!cancelled) setInvite(data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/invites/${token}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setAccepting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading invite…</p>;
  }

  if (!invite) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error ?? "Invite not found"}</p>
        <ButtonLink href="/login" variant="outline">
          Sign in
        </ButtonLink>
      </div>
    );
  }

  const emailMatch =
    signedInEmail && signedInEmail.toLowerCase() === invite.email.toLowerCase();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Join {invite.workspaceName}
        </h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          You&apos;ve been invited as <span className="font-medium text-foreground">{invite.role}</span>{" "}
          ({invite.email}).
        </p>
      </div>

      {!signedInEmail ? (
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/login?callbackURL=${encodeURIComponent(`/invite/${token}`)}`}>
            Sign in to accept
          </ButtonLink>
          <ButtonLink
            href={`/signup?callbackURL=${encodeURIComponent(`/invite/${token}`)}`}
            variant="outline"
          >
            Create account
          </ButtonLink>
        </div>
      ) : !emailMatch ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">
            Signed in as {signedInEmail}. Sign in as {invite.email} to accept.
          </p>
          <ButtonLink href={`/login?callbackURL=${encodeURIComponent(`/invite/${token}`)}`} variant="outline">
            Switch account
          </ButtonLink>
        </div>
      ) : (
        <div className="space-y-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button onClick={() => void accept()} disabled={accepting}>
            {accepting ? "Joining…" : "Accept invite"}
          </Button>
        </div>
      )}
    </div>
  );
}
