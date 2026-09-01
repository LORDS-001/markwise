"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { AppNavigation } from "@/components/app-navigation";
import { OverlayPanel } from "@/components/overlay-panel";
import { PageHeader } from "@/components/page-structure";
import { SettingsDialog } from "@/components/settings-dialog";
import { TopBar } from "@/components/top-bar";

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsReturnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.getElementById("main")?.setAttribute("tabindex", "-1");
  }, []);

  function openSettings(returnTarget: HTMLElement | null) {
    settingsReturnRef.current = returnTarget;
    setSettingsOpen(true);
  }

  return (
    <div className="min-h-dvh bg-ground lg:p-4">
      <div className="min-h-dvh overflow-hidden bg-shell lg:grid lg:min-h-[calc(100dvh-2rem)] lg:grid-cols-[228px_minmax(0,1fr)] lg:rounded-[var(--r-shell)] lg:border lg:border-border-strong">
        <aside className="hidden border-r border-border bg-surface lg:block">
          <AppNavigation onOpenSettings={(trigger) => openSettings(trigger)} />
        </aside>

        <OverlayPanel
          open={navOpen}
          onClose={() => setNavOpen(false)}
          side="left"
          ariaLabel="Navigation"
          panelClassName="max-w-[280px]"
        >
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2 hover:text-ink"
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

        <div className="flex min-w-0 flex-col">
          <TopBar
            onOpenNavigation={() => setNavOpen(true)}
            navigationTriggerRef={navigationTriggerRef}
          />
          <main className="min-w-0 flex-1">{children}</main>
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
    <div className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9">
      <PageHeader eyebrow={eyebrow} title={title} lead={lead} actions={actions} />
      {aside ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
          <div className="flex min-w-0 flex-col gap-5">{children}</div>
          <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[80px]">{aside}</aside>
        </div>
      ) : (
        <div className="flex flex-col gap-5">{children}</div>
      )}
    </div>
  );
}
