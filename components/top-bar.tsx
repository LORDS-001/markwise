"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RefObject } from "react";
import { AlertTriangle, Check, ChevronRight, Menu } from "lucide-react";
import {
  AccountChip,
  isChildRoute,
  resolveStep,
  STEPS,
} from "@/components/app-navigation";
import { useSession } from "@/components/session-provider";
import { Badge, cn } from "@/components/ui";
import { SESSION, TOTAL_ANSWERS } from "@/lib/mock";

export function TopBar({
  onOpenNavigation,
  navigationTriggerRef,
}: {
  onOpenNavigation: () => void;
  navigationTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const pathname = usePathname();
  const { needsAttention, reviewedCount } = useSession();
  const parent = resolveStep(pathname);
  const current = STEPS.find((step) => step.href === parent) ?? STEPS[0];
  const isChild = isChildRoute(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
      <button
        ref={navigationTriggerRef}
        type="button"
        onClick={onOpenNavigation}
        className="-ml-1 grid h-9 w-9 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={20} strokeWidth={1.9} aria-hidden />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <li className="hidden shrink-0 text-ink-3 sm:block">{SESSION.courseCode}</li>
          <li className="hidden shrink-0 text-ink-3 sm:block" aria-hidden>
            <ChevronRight size={13} />
          </li>
          <li className="min-w-0">
            <span className={cn("block truncate", isChild ? "text-ink-3" : "font-medium text-ink")}>
              {isChild ? (
                <Link href={current.href} className="transition-colors hover:text-brand">
                  {current.label}
                </Link>
              ) : (
                current.label
              )}
            </span>
          </li>
          {isChild ? (
            <>
              <li className="shrink-0 text-ink-3" aria-hidden>
                <ChevronRight size={13} />
              </li>
              <li className="truncate font-medium text-ink">Detail</li>
            </>
          ) : null}
        </ol>
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        {needsAttention > 0 ? (
          <Link href="/scores" className="hidden sm:block">
            <Badge tone="warn">
              <AlertTriangle size={12} strokeWidth={2.2} aria-hidden />
              {needsAttention} need attention
            </Badge>
          </Link>
        ) : reviewedCount === TOTAL_ANSWERS ? (
          <Badge tone="ok" className="hidden sm:inline-flex">
            <Check size={12} strokeWidth={2.4} aria-hidden />
            All reviewed
          </Badge>
        ) : null}

        <Badge tone="brand" className="hidden md:inline-flex">
          Demo class
        </Badge>

        <AccountChip />
      </div>
    </header>
  );
}
