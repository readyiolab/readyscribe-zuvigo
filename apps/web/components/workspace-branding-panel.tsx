"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckIcon, Loader2Icon, SparklesIcon, EyeIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Brand = {
  logoUrl: string | null;
  clickColor: string;
  showBranding: boolean;
};

type Props = {
  workspaceId: string;
  canManage: boolean;
};

const COLOR_PRESETS = [
  { label: "Rose", value: "#f43f5e" },
  { label: "Sky", value: "#0284c7" },
  { label: "Emerald", value: "#10b981" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Indigo", value: "#6366f1" },
];

export function WorkspaceBrandingPanel({ workspaceId, canManage }: Props) {
  const [brand, setBrand] = useState<Brand>({
    logoUrl: null,
    clickColor: "#f43f5e",
    showBranding: true,
  });
  const [logoInput, setLogoInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/branding`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBrand(data);
        setLogoInput(data.logoUrl ?? "");
      }
    })();
  }, [workspaceId]);

  async function save() {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/branding`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: logoInput.trim() ? logoInput.trim() : null,
          clickColor: brand.clickColor,
          showBranding: brand.showBranding,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      setBrand(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-xs text-muted-foreground">
        Only workspace owners and administrators can customize branding.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Settings Column */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`logo-${workspaceId}`} className="text-xs font-medium">
            Logo URL <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id={`logo-${workspaceId}`}
            placeholder="https://example.com/logo.png"
            value={logoInput}
            onChange={(e) => setLogoInput(e.target.value)}
            className="h-9 text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Appears at the top of shared guides, PDFs, and exported documents.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`color-${workspaceId}`} className="text-xs font-medium">
            Click highlight color
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setBrand((b) => ({ ...b, clickColor: preset.value }))}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-all",
                  brand.clickColor.toLowerCase() === preset.value.toLowerCase()
                    ? "border-foreground bg-surface shadow-2xs text-foreground"
                    : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted",
                )}
              >
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: preset.value }}
                />
                <span className="text-[11px]">{preset.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id={`color-${workspaceId}`}
              type="color"
              value={brand.clickColor}
              onChange={(e) => setBrand((b) => ({ ...b, clickColor: e.target.value }))}
              className="h-8 w-10 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
            />
            <Input
              value={brand.clickColor}
              onChange={(e) => setBrand((b) => ({ ...b, clickColor: e.target.value }))}
              className="h-8 w-28 font-mono text-xs"
            />
          </div>
        </div>

        <div className="pt-1">
          <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer rounded-lg border border-border/70 p-3 hover:bg-muted/20 transition-colors">
            <input
              type="checkbox"
              checked={brand.showBranding}
              onChange={(e) => setBrand((b) => ({ ...b, showBranding: e.target.checked }))}
              className="mt-0.5 rounded border-input text-primary focus:ring-ring"
            />
            <div>
              <p className="font-medium">Show ReadyScribe branding</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Display the subtle “Made with ReadyScribe” watermark on exported guides and public shares.
              </p>
            </div>
          </label>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            onClick={() => void save()}
            disabled={loading}
            className="h-9 gap-2 text-xs shadow-xs"
          >
            {loading ? (
              <>
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                <span>Saving…</span>
              </>
            ) : saved ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                <span>Saved successfully</span>
              </>
            ) : (
              <span>Save branding</span>
            )}
          </Button>
        </div>
      </div>

      {/* Live Preview Column */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <EyeIcon className="h-3.5 w-3.5" />
          <span>Live Guide Preview</span>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs space-y-3">
          {/* Mock guide header */}
          <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
            <div className="flex items-center gap-2">
              {logoInput.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoInput.trim()}
                  alt="Logo preview"
                  className="h-5 max-w-[90px] object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-linear-to-tr from-sky-500 to-indigo-600 text-[10px] font-bold text-white">
                  R
                </div>
              )}
              <span className="text-[11px] font-semibold text-foreground truncate">
                Customer Onboarding Guide
              </span>
            </div>
            {brand.showBranding ? (
              <span className="text-[9px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Made with ReadyScribe
              </span>
            ) : null}
          </div>

          {/* Mock step screenshot with click target */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                1
              </span>
              <span className="text-xs font-semibold text-foreground">Click the “Submit” button</span>
            </div>

            <div className="relative h-32 rounded-lg bg-muted/40 border border-border/60 overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(#00000010_1px,transparent_1px)] [background-size:12px_12px]" />
              <div className="relative flex items-center gap-2 rounded-md bg-background px-3 py-1.5 border border-border shadow-2xs">
                <span className="text-xs font-medium text-foreground">Submit Application</span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-2.5 -top-2.5 h-8 w-8 rounded-full border-[3px] shadow-[0_0_0_4px_rgba(0,0,0,0.06)] animate-pulse"
                  style={{ borderColor: brand.clickColor }}
                />
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-normal">
            Click highlights automatically use your brand color across screenshots and exported PDFs.
          </p>
        </div>
      </div>
    </div>
  );
}
