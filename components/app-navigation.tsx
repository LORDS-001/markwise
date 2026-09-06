"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Check,
  Download,
  Eye,
  FileText,
  History,
  Network,
  Settings,
  Table2,
  TrendingUp,
  User,
  Waves,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MarkwiseLogo } from "@/components/logo";
import { useSession } from "@/components/session-provider";
import { cn } from "@/components/ui";

export const STEPS = [
  { href: "/", label: "Setup", icon: FileText, blurb: "Question & answers" },
  {
    href: "/processing",
    label: "Processing",
    icon: Waves,
    blurb: "Analyse answers",
  },
  { href: "/reveal", label: "Reveal", icon: Eye, blurb: "Your guess vs. actual" },
  { href: "/map", label: "Misconception map", icon: Network, blurb: "Clusters by spread" },
  { href: "/reteach", label: "Reteach packs", icon: BookOpen, blurb: "Lesson & diagnostic" },
  { href: "/outcome", label: "Outcome", icon: TrendingUp, blurb: "Did it land?" },
  { href: "/scores", label: "Score review", icon: Table2, blurb: "Provisional marks" },
  { href: "/export", label: "Export", icon: Download, blurb: "xlsx & docx" },
] as const;

export function resolveStep(pathname: string) {
  if (pathname.startsWith("/sessions")) return "/sessions";
  if (pathname.startsWith("/clusters")) return "/map";
  const match = STEPS.find((step) =>
    step.href === "/" ? pathname === "/" : pathname.startsWith(step.href),
  );
  return match?.href ?? "/";
}

export function isChildRoute(pathname: string) {
  return /^\/clusters\/.+/.test(pathname) || /^\/reteach\/.+/.test(pathname);
}

function useStepState() {
  const {
    processed,
    reviewedCount,
    needsAttention,
    exportReady,
    confirmed,
    totalAnswers,
  } = useSession();

  return (href: string): { done: boolean; count?: number; warn?: boolean } => {
    switch (href) {
      case "/":
        return { done: true };
      case "/processing":
      case "/reveal":
      case "/map":
        return { done: processed };
      case "/scores":
        return {
          done: exportReady,
          count: totalAnswers - reviewedCount,
          warn: needsAttention > 0,
        };
      case "/export":
        return { done: confirmed };
      default:
        return { done: false };
    }
  };
}

export function AppNavigation({
  onNavigate,
  onOpenSettings,
}: {
  onNavigate?: () => void;
  onOpenSettings: (trigger: HTMLButtonElement) => void;
}) {
  const pathname = usePathname();
  const stepState = useStepState();
  const { courseCode, courseTitle, isDemo, setupDraft } = useSession();
  const isSetup = pathname === "/";
  const visibleCourseCode = isSetup ? setupDraft.courseCode.trim() : courseCode;
  const visibleCourseTitle = isSetup ? setupDraft.courseTitle.trim() : courseTitle;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-nav text-nav-ink">
      <div className="shrink-0 px-5 pb-5 pt-7">
        <Link
          href="/"
          onClick={onNavigate}
          className="inline-flex max-w-full rounded-2xl bg-[#f7f6fb] px-3.5 py-3"
          aria-label="Markwise home"
        >
          <MarkwiseLogo className="max-w-full" markClassName="h-7 w-auto" />
        </Link>
        <div className="mt-6 min-w-0 px-1">
          <p className="text-[13px] font-semibold leading-5 text-nav-ink [overflow-wrap:anywhere]">
            {visibleCourseCode || (isSetup ? "New marking session" : "Your workspace")}
          </p>
          <p className="mt-1 text-xs leading-5 text-nav-muted [overflow-wrap:anywhere]">
            {visibleCourseTitle || (isSetup ? "Add your course details" : isDemo ? "Demo class" : "Assessment workspace")}
          </p>
        </div>
      </div>

      <div className="shrink-0 px-3.5">
        <Link
          href="/sessions"
          onClick={onNavigate}
          aria-current={pathname.startsWith("/sessions") ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors",
            pathname.startsWith("/sessions")
              ? "bg-nav-active text-nav-active-ink"
              : "text-nav-ink hover:bg-nav-hover",
          )}
        >
          <History size={18} strokeWidth={1.7} className="shrink-0" aria-hidden />
          Saved sessions
        </Link>
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3.5 pb-5 pt-6" aria-label="Session steps">
        <p className="label-caps px-3 pb-3 text-nav-muted">This session</p>
        <ul className="flex flex-col gap-1.5">
          {STEPS.map((step) => {
            const active = resolveStep(pathname) === step.href;
            const state = stepState(step.href);
            const Icon = step.icon;

            return (
              <li key={step.href}>
                <Link
                  href={step.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors",
                    active
                      ? "bg-nav-active text-nav-active-ink"
                      : "text-nav-ink hover:bg-nav-hover",
                  )}
                >
                  <Icon size={18} strokeWidth={1.7} className="shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium leading-5">
                      {step.label}
                    </span>
                    <span className="sr-only">{step.blurb}</span>
                  </span>

                  {state.count && state.count > 0 ? (
                    <span
                      className={cn(
                        "tnum shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                        state.warn
                          ? "bg-warn-soft text-warn"
                          : "bg-nav-active text-nav-active-ink",
                      )}
                      title={`${state.count} still to review`}
                    >
                      {state.count}
                    </span>
                  ) : state.done ? (
                    <Check
                      size={14}
                      strokeWidth={2.4}
                      className={cn("shrink-0", active ? "text-nav-active-ink" : "text-nav-muted")}
                      aria-label="done"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex shrink-0 flex-col border-t border-nav-hover px-3.5 py-5">
        <button
          type="button"
          onClick={(event) => onOpenSettings(event.currentTarget)}
          className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-nav-ink transition-colors hover:bg-nav-hover"
        >
          <Settings size={18} strokeWidth={1.7} aria-hidden />
          Settings
        </button>
      </div>
    </div>
  );
}

export function AccountChip() {
  const { status, email } = useAuth();
  const saved = status === "linked" && !!email;
  const initials = saved ? email.slice(0, 2).toUpperCase() : null;
  const accountTitle = saved
    ? "Signed in as " + email
    : status === "demo"
      ? "Demo preview"
      : "Anonymous preview";

  return (
    <span
      className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xs font-semibold text-ink"
      title={accountTitle}
    >
      {initials ?? <User size={15} strokeWidth={2} aria-hidden />}
      {!saved && status !== "loading" ? (
        <span
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-warn"
          aria-hidden
        />
      ) : null}
      <span className="sr-only">{accountTitle}</span>
    </span>
  );
}
