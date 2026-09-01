import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function Disclosure({
  title,
  description,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details
      className={cn(
        "group rounded-[var(--r-card)] border border-border bg-surface",
        className,
      )}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-left marker:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-ink-3 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border px-4 py-4 text-[13px] leading-relaxed text-ink-2">
        {children}
      </div>
    </details>
  );
}
