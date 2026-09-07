"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { AppNavigation } from "@/components/app-navigation";
import { OverlayPanel } from "@/components/overlay-panel";
import { PageHeader } from "@/components/page-structure";
import { SettingsDialog } from "@/components/settings-dialog";
import { TopBar } from "@/components/top-bar";

/**
 * Routes that are not part of the lecturer's session and must not be wrapped
 * in its navigation.
 *
 * A student opening their diagnostic has no account and no business seeing the
 * session's progress, its other screens, or that any of it exists — PRD v2
 * §5 step 7. Rendering the shell around their page would put the whole
 * lecturer interface one click away.
 */
function isStandaloneRoute(pathname: string): boolean {
  return pathname.startsWith("/d/");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsReturnRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current && !window.location.hash) {
      mainRef.current.scrollTop = 0;
      mainRef.current.scrollLeft = 0;
    }
  }, [pathname]);

  function openSettings(returnTarget: HTMLElement | null) {
    settingsReturnRef.current = returnTarget;
    setSettingsOpen(true);
  }

  if (isStandaloneRoute(pathname)) return <>{children}</>;

  return (
    <div className="h-dvh overflow-hidden bg-shell">
      <a
        href="#main"
        onClick={() => mainRef.current?.focus()}
        className="sr-only focus:not-sr-only focus:absolute focus:z-[70] focus:left-4 focus:top-4 focus:bg-surface focus:text-ink focus:border focus:border-brand focus:rounded-[10px] focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <div className="h-full min-h-0 overflow-hidden bg-shell lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="relative hidden h-full min-h-0 bg-nav text-nav-ink lg:block">
          <AppNavigation onOpenSettings={(trigger) => openSettings(trigger)} />
        </aside>

        <OverlayPanel
          open={navOpen}
          onClose={() => setNavOpen(false)}
          side="left"
          ariaLabel="Navigation"
          panelClassName="max-w-[288px] border-nav bg-nav text-nav-ink"
        >
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full text-nav-ink transition-colors hover:bg-nav-hover"
            aria-label="Close navigation"
          >
            <X size={18} aria-hidden />
          </button>
          <AppNavigation
            onNavigate={() => setNavOpen(false)}
            onOpenSettings={() => {
              setNavOpen(false);
              openSettings(navigationTriggerRef.current);
            }}
          />
        </OverlayPanel>

        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <TopBar
            onOpenNavigation={() => setNavOpen(true)}
            navigationTriggerRef={navigationTriggerRef}
          />
          <main
            ref={mainRef}
            id="main"
            tabIndex={-1}
            className={`relative min-h-0 min-w-0 flex-1 overscroll-y-contain scroll-py-4 ${
              navOpen || settingsOpen ? "overflow-hidden" : "overflow-y-auto"
            }`}
          >
            {children}
          </main>
        </div>

        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          returnFocusRef={settingsReturnRef}
        />
      </div>
    </div>
  );
}

export function Page({
  eyebrow,
  title,
  lead,
  actions,
  aside,
  asidePosition = "right",
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  asidePosition?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1360px] px-4 py-7 sm:px-7 sm:py-9 lg:px-8 xl:px-10 xl:py-10">
      <PageHeader eyebrow={eyebrow} title={title} lead={lead} actions={actions} />
      {aside ? (
        <div
          className={`grid min-w-0 items-start gap-6 xl:gap-8 ${
            asidePosition === "left"
              ? "xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]"
              : "xl:grid-cols-[minmax(0,1fr)_300px]"
          }`}
        >
          {asidePosition === "left" ? (
            <aside className="flex min-w-0 flex-col gap-5">{aside}</aside>
          ) : null}
          <div className="flex min-w-0 flex-col gap-6">{children}</div>
          {asidePosition === "right" ? (
            <aside className="flex min-w-0 flex-col gap-5">{aside}</aside>
          ) : null}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
      )}
    </div>
  );
}
