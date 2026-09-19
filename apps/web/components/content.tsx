import { cn } from "@/lib/utils";

type ContentProps = {
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
};

/** Shared content column — same horizontal rhythm across app pages. */
export function Content({ children, className, narrow }: ContentProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6",
        narrow ? "max-w-2xl" : "max-w-[1200px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
