import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function PageHeader({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-5 lg:mb-8">
      <div className="min-w-0">
        {eyebrow ? <div className="label-caps mb-2 text-brand">{eyebrow}</div> : null}
        <h1 className="font-display text-[28px] font-bold leading-[1.2] sm:text-[32px]">
          {title}
        </h1>
        {lead ? (
          <p className="mt-2.5 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">
            {lead}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function ActionArea({
  children,
  note,
  className,
}: {
  children: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Page actions"
      className={cn(
        "flex flex-col gap-4 rounded-[var(--r-card)] border border-border bg-surface px-5 py-5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {note ? <div className="min-w-0 max-w-[58ch] text-[13px] text-ink-2">{note}</div> : <span />}
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{children}</div>
    </section>
  );
}
