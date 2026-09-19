import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
