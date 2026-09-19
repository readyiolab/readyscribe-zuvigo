import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1100px 560px at 85% 10%, oklch(0.93 0.025 85 / 0.85), transparent 55%), linear-gradient(165deg, oklch(0.992 0.004 95), oklch(0.96 0.012 90))",
        }}
      />

      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-tr from-sky-500 to-indigo-600 text-white text-xs font-bold shadow-xs">
            R
          </span>
          <span>ReadyScribe</span>
          <span className="ml-1 text-[11px] font-normal text-muted-foreground hidden sm:inline">by Readyio PL</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }))}>
            Sign in
          </Link>
          <Link href="/signup" className={cn(buttonVariants())}>
            Get started
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pb-16 pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-20">
        <div className="max-w-xl space-y-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
            Readyio PL Product Suite
          </div>
          <p className="font-heading text-5xl font-bold tracking-tight text-foreground sm:text-6xl sm:leading-[1.05]">
            ReadyScribe
          </p>
          <h1 className="max-w-lg text-xl font-medium leading-snug text-foreground/90 sm:text-2xl">
            Capture any browser workflow. Publish a polished guide.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            Turn clicks, inputs, and screenshots into editable step-by-step SOPs your team can
            share.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/signup" className={cn(buttonVariants({ size: "lg" }))}>
              Start capturing
            </Link>
            <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Sign in
            </Link>
          </div>
        </div>

        <div aria-hidden className="relative mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex h-10 items-center gap-2 border-b border-border bg-muted/40 px-4">
              <span className="size-2 rounded-full bg-border" />
              <span className="size-2 rounded-full bg-border" />
              <span className="size-2 rounded-full bg-border" />
              <span className="ml-2 text-[11px] text-muted-foreground">Onboarding · ReadyScribe</span>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Guide
                </p>
                <p className="mt-1 font-heading text-base font-semibold tracking-tight">
                  Invite a teammate
                </p>
              </div>
              {[
                ["Open Settings", "Click the workspace menu, then Settings."],
                ["Invite by email", "Enter their work email and choose a role."],
                ["Share the link", "They join with one click — no password paste."],
              ].map(([title, body], i) => (
                <div key={title} className="flex gap-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
                    {i + 1}
                  </div>
                  <div className="min-w-0 space-y-1 pt-0.5">
                    <p className="text-sm font-medium leading-tight">{title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
                    <div className="mt-2 h-14 rounded-lg border border-dashed border-border bg-muted/30" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
