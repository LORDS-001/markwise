"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Check,
  CircleHelp,
  Download,
  Eye,
  FileText,
  Network,
  Settings,
  Table2,
  User,
  Waves,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MarkwiseLogo } from "@/components/logo";
import { useSession } from "@/components/session-provider";
import { cn } from "@/components/ui";
import { SESSION, TOTAL_ANSWERS } from "@/lib/mock";

export const STEPS = [
  { href: "/", label: "Setup", icon: FileText, blurb: "Question & answers" },
  {
    href: "/processing",
    label: "Processing",
    icon: Waves,
    blurb: "Prepare sample analysis",
  },
  { href: "/reveal", label: "Reveal", icon: Eye, blurb: "Your guess vs. actual" },
  { href: "/map", label: "Misconception map", icon: Network, blurb: "Clusters by spread" },
  { href: "/reteach", label: "Reteach packs", icon: BookOpen, blurb: "Lesson & diagnostic" },
  { href: "/scores", label: "Score review", icon: Table2, blurb: "Provisional marks" },
  { href: "/export", label: "Export", icon: Download, blurb: "xlsx & docx" },
] as const;

export function resolveStep(pathname: string) {
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
  const { processed, reviewedCount, needsAttention, exportReady, confirmed } = useSession();

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
          count: TOTAL_ANSWERS - reviewedCount,
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-4"
      >
        <span className="min-w-0">
          <MarkwiseLogo className="max-w-full" />
          <span className="mt-0.5 block truncate text-[11px] leading-tight text-ink-3">
            {SESSION.courseCode} · {SESSION.courseTitle}
          </span>
        </span>
      </Link>

      <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-3" aria-label="Session steps">
        <p className="label-caps px-2 pb-2 text-ink-3">This session</p>
        <ul className="flex flex-col gap-1">
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
                    "group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors",
                    active
                      ? "bg-brand-soft text-brand"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon size={16} strokeWidth={1.9} className="shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-tight">
                      {step.label}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-[11px] leading-tight",
                        active ? "text-brand/75" : "text-ink-3",
                      )}
                    >
                      {step.blurb}
                    </span>
                  </span>

                  {state.count && state.count > 0 ? (
                    <span
                      className={cn(
                        "tnum shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold",
                        state.warn
                          ? "border-warn-line bg-warn-soft text-warn"
                          : "border-border bg-surface-2 text-ink-2",
                      )}
                      title={`${state.count} still to review`}
                    >
                      {state.count}
                    </span>
                  ) : state.done ? (
                    <Check
                      size={14}
                      strokeWidth={2.4}
                      className="shrink-0 text-ok"
                      aria-label="done"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border px-3 py-3">
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Help is not available yet"
          className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-ink-3"
        >
          <CircleHelp size={16} strokeWidth={1.9} aria-hidden />
          Help &amp; shortcuts
        </button>
        <button
          type="button"
          onClick={(event) => onOpenSettings(event.currentTarget)}
          className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Settings size={16} strokeWidth={1.9} aria-hidden />
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
      className="relative grid h-8 w-8 place-items-center rounded-full border border-border bg-surface-2 text-[11px] font-bold text-ink-2"
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
