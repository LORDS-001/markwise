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
import { Badge, Button, cn } from "@/components/ui";

export function TopBar({
  onOpenNavigation,
  navigationTriggerRef,
}: {
  onOpenNavigation: () => void;
  navigationTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const pathname = usePathname();
  const {
    needsAttention,
    reviewedCount,
    totalAnswers,
    courseCode,
    isDemo,
    sessionId,
    saving,
    saveError,
    retrySave,
    setupDraft,
  } = useSession();
  const parent = resolveStep(pathname);
  const current =
    parent === "/sessions"
      ? { href: "/sessions", label: "Saved sessions" }
      : (STEPS.find((step) => step.href === parent) ?? STEPS[0]);
  const isChild = isChildRoute(pathname);
  const isSetup = pathname === "/";
  const visibleCourseCode = isSetup ? setupDraft.courseCode.trim() : courseCode;
  const runLabel = isSetup ? (setupDraft.isDemo ? "Sample workspace" : "Course draft") : isDemo ? "Demo class" : sessionId ? "Saved session" : "Unsaved run";

  return (
    <header className="relative z-30 flex min-h-[76px] min-w-0 shrink-0 items-center gap-3 border-b border-border/70 bg-surface/95 px-4 py-3 backdrop-blur sm:px-7 lg:px-8 xl:px-10">
      <button
        ref={navigationTriggerRef}
        type="button"
        onClick={onOpenNavigation}
        className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-ink transition-colors hover:bg-surface-2 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={20} strokeWidth={1.9} aria-hidden />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2 text-[13px] leading-5">
          {parent !== "/sessions" && visibleCourseCode ? (
            <>
              <li className="hidden max-w-28 truncate text-ink-3 sm:block" title={visibleCourseCode}>
                {visibleCourseCode}
              </li>
              <li className="hidden shrink-0 text-ink-3 sm:block" aria-hidden>
                <ChevronRight size={13} />
              </li>
            </>
          ) : null}
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

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {!isSetup && needsAttention > 0 ? (
          <Link href="/scores" className="hidden rounded-full lg:block">
            <Badge tone="warn">
              <AlertTriangle size={12} strokeWidth={2.2} aria-hidden />
              {needsAttention} need attention
            </Badge>
          </Link>
        ) : !isSetup && reviewedCount === totalAnswers ? (
          <Badge tone="ok" className="hidden lg:inline-flex">
            <Check size={12} strokeWidth={2.4} aria-hidden />
            All reviewed
          </Badge>
        ) : null}

        {saveError ? (
          <span title={saveError}>
            <Badge tone="crit" className="hidden md:inline-flex">
              <AlertTriangle size={12} strokeWidth={2.2} aria-hidden />
              Save failed
            </Badge>
          </span>
        ) : saving ? (
          <Badge className="hidden md:inline-flex">Saving…</Badge>
        ) : (
          <Badge tone={isDemo || sessionId ? "brand" : "warn"} className="hidden md:inline-flex">
            {runLabel}
          </Badge>
        )}

        {!isDemo && !sessionId ? (
          <Button variant="secondary" size="sm" disabled={saving} onClick={() => void retrySave()}>
            {saving ? "Saving…" : "Retry save"}
          </Button>
        ) : null}

        <AccountChip />
      </div>
    </header>
  );
}
