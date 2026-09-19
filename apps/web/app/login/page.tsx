"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicMode, setMagicMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (magicMode) {
        const res = await fetch("/api/auth/sign-in/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, callbackURL: "/dashboard" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? "Failed to send magic link");
        }
        setMessage("Check your email for a magic link.");
        return;
      }

      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Invalid credentials");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function signInGoogle() {
    window.location.href = "/api/auth/sign-in/social?provider=google&callbackURL=/dashboard";
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 480px at 50% -20%, oklch(0.94 0.02 85 / 0.8), transparent 55%), oklch(0.985 0.004 95)",
        }}
      />
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center px-6">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-tr from-sky-500 to-indigo-600 text-white text-xs font-bold shadow-xs">
            R
          </span>
          <span>ReadyScribe</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">Welcome back to your workspace</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {!magicMode && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : magicMode ? "Send magic link" : "Sign in"}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={signInGoogle}>
              Continue with Google
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMagicMode((v) => !v)}
            >
              {magicMode ? "Use password instead" : "Use magic link instead"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
