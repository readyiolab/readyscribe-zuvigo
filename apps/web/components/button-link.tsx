import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

/** Link styled like a Button — avoids Base UI button/anchor mismatch warnings. */
export function ButtonLink({
  href,
  children,
  variant = "default",
  size = "default",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  className?: string;
}) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </Link>
  );
}
