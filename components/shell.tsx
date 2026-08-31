"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  Eye,
  FileText,
  Menu,
  Network,
  Settings,
  Table2,
  Waves,
  X,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { MarkwiseMark } from "@/components/logo";
import { SESSION, TOTAL_ANSWERS } from "@/lib/mock";
import { Badge, cn } from "@/components/ui";

/* --------------------------------------------------------------------- */
/*  Step definitions — the session flow, in order                         */
/* --------------------------------------------------------------------- */

const STEPS = [
  { href: "/", label: "Setup", icon: FileText, blurb: "Question & answers" },
  { href: "/processing", label: "Processing", icon: Waves, blurb: "Run the pipeline" },
  { href: "/reveal", label: "Reveal", icon: Eye, blurb: "Your guess vs. actual" },
  { href: "/map", label: "Misconception map", icon: Network, blurb: "Clusters by spread" },
  { href: "/reteach", label: "Reteach packs", icon: BookOpen, blurb: "Lesson & diagnostic" },
  { href: "/scores", label: "Score review", icon: Table2, blurb: "Provisional marks" },
  { href: "/export", label: "Export", icon: Download, blurb: "xlsx & docx" },
] as const;

/** Child routes belong to a parent step, so the rail and breadcrumb keep their
 *  bearings on `/clusters/[id]` and `/reteach/[id]`. */
function resolveStep(pathname: string) {
  if (pathname.startsWith("/clusters")) return "/map";
  const match = STEPS.find((s) =>
    s.href === "/" ? pathname === "/" : pathname.startsWith(s.href),
  );
  return match?.href ?? "/";
}

function isChildRoute(pathname: string) {
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

/* --------------------------------------------------------------------- */
/*  Rail                                                                  */
/* --------------------------------------------------------------------- */

function RailContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const stepState = useStepState();

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-5 h-[72px] shrink-0 border-b border-border"
      >
        <MarkwiseMark className="h-8 w-auto shrink-0" title="Markwise" />
        <span className="min-w-0">
          <span className="font-display block text-[17px] font-extrabold leading-tight">
            Markwise
          </span>
          <span className="block text-[11px] text-ink-3 leading-tight truncate mt-0.5">
            {SESSION.courseCode} · {SESSION.courseTitle}
          </span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto scroll-thin px-3 py-5" aria-label="Session steps">
        <p className="label-caps text-ink-3 px-3 pb-3">This session</p>
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
                    "group relative flex items-center gap-3 rounded-[14px] pl-3 pr-2.5 py-2.5 transition-colors",
                    active
                      ? "bg-brand-soft text-brand"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon size={17} strokeWidth={1.9} className="shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-tight truncate">
                      {step.label}
                    </span>
                    <span
                      className={cn(
                        "block text-[11px] leading-tight truncate mt-0.5",
                        active ? "text-brand/70" : "text-ink-3",
                      )}
                    >
                      {step.blurb}
                    </span>
                  </span>

                  {state.count && state.count > 0 ? (
                    <span
                      className={cn(
                        "shrink-0 tnum text-[11px] font-semibold rounded-full px-1.5 py-0.5 border",
                        state.warn
                          ? "bg-warn-soft text-warn border-warn-line"
                          : "bg-surface-2 text-ink-2 border-border",
                      )}
                      title={`${state.count} still to review`}
                    >
                      {state.count}
                    </span>
                  ) : state.done ? (
                    <Check size={15} strokeWidth={2.4} className="shrink-0 text-ok" aria-label="done" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border px-3 py-3 flex flex-col gap-1">
        <button className="flex items-center gap-3 rounded-[14px] px-3 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors">
          <CircleHelp size={17} strokeWidth={1.9} aria-hidden />
          Help &amp; shortcuts
        </button>
        <button className="flex items-center gap-3 rounded-[14px] px-3 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors">
          <Settings size={17} strokeWidth={1.9} aria-hidden />
          Settings
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/*  Top bar                                                               */
/* --------------------------------------------------------------------- */

function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const pathname = usePathname();
  const { needsAttention, reviewedCount } = useSession();

  const parent = resolveStep(pathname);
  const current = STEPS.find((s) => s.href === parent) ?? STEPS[0];
  const isChild = isChildRoute(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-3 border-b border-border bg-surface/85 backdrop-blur px-4 sm:px-7">
      <button
        onClick={onOpenNav}
        className="lg:hidden grid place-items-center w-9 h-9 -ml-1 rounded-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
        aria-label="Open navigation"
      >
        <Menu size={20} strokeWidth={1.9} />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-[13px] min-w-0">
          <li className="hidden sm:block text-ink-3 shrink-0">{SESSION.courseCode}</li>
          <li className="hidden sm:block text-ink-3 shrink-0" aria-hidden>
            <ChevronRight size={13} />
          </li>
          <li className="min-w-0">
            <span
              className={cn("truncate block", isChild ? "text-ink-3" : "font-medium text-ink")}
            >
              {isChild ? (
                <Link href={current.href} className="hover:text-brand transition-colors">
                  {current.label}
                </Link>
              ) : (
                current.label
              )}
            </span>
          </li>
          {isChild ? (
            <>
              <li className="text-ink-3 shrink-0" aria-hidden>
                <ChevronRight size={13} />
              </li>
              <li className="font-medium text-ink truncate">Detail</li>
            </>
          ) : null}
        </ol>
      </nav>

      <div className="flex items-center gap-2 shrink-0">
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

        <span
          className="grid place-items-center w-8 h-8 rounded-full bg-surface-3 text-ink-2 text-[12px] font-semibold border border-border"
          title="Dr. A. Daniel"
        >
          AD
        </span>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------------- */
/*  Shell                                                                 */
/* --------------------------------------------------------------------- */

export function AppShell({ children }: { children: ReactNode }) {
  // Every link inside the drawer closes it via `onNavigate`, so there is no
  // route-change effect to keep in sync here.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[268px_minmax(0,1fr)]">
      <aside className="hidden lg:block sticky top-0 h-dvh border-r border-border bg-surface">
        <RailContent />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "lg:hidden fixed inset-0 z-50 transition-opacity duration-200",
          navOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!navOpen}
      >
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setNavOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-[270px] max-w-[85vw] bg-surface border-r border-border shadow-[var(--shadow-lg)] transition-transform duration-200",
            navOpen ? "translate-x-0" : "-translate-x-full",
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            onClick={() => setNavOpen(false)}
            className="absolute right-2 top-4 grid place-items-center w-9 h-9 rounded-[12px] text-ink-2 hover:bg-surface-2 z-10"
            aria-label="Close navigation"
          >
            <X size={19} strokeWidth={1.9} />
          </button>
          <RailContent onNavigate={() => setNavOpen(false)} />
        </div>
      </div>

      <div className="flex min-w-0 flex-col">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/*  Page scaffold — every screen uses this                                */
/* --------------------------------------------------------------------- */

export function Page({
  eyebrow,
  title,
  lead,
  actions,
  aside,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between mb-8 lg:mb-10">
        <div className="min-w-0">
          {eyebrow ? <div className="label-caps text-brand mb-3">{eyebrow}</div> : null}
          <h1 className="font-display text-[30px] sm:text-[40px] font-extrabold leading-[1.06]">
            {title}
          </h1>
          {lead ? (
            <p className="text-[14.5px] leading-relaxed text-ink-2 mt-3.5 max-w-[66ch]">{lead}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>

      {aside ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-7 items-start">
          <div className="min-w-0 flex flex-col gap-6">{children}</div>
          <aside className="min-w-0 flex flex-col gap-5 xl:sticky xl:top-[96px]">{aside}</aside>
        </div>
      ) : (
        <div className="flex flex-col gap-6">{children}</div>
      )}
    </div>
  );
}
