"use client";

import { Check, Laptop, Moon, Sun, X } from "lucide-react";
import { OverlayPanel } from "@/components/overlay-panel";
import { useTheme } from "@/components/theme/theme-provider";
import type { ThemePreference } from "@/components/theme/theme";
import { Button, cn } from "@/components/ui";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}[] = [
  {
    value: "light",
    label: "Light",
    description: "Always use the light workspace.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use soft charcoal surfaces and muted lavender accents.",
    icon: Moon,
  },
  {
    value: "system",
    label: "Use device setting",
    description: "Follow this device's appearance.",
    icon: Laptop,
  },
];

export function SettingsDialog({
  open,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const { preference, setPreference } = useTheme();

  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      side="right"
      labelledBy="settings-title"
      panelClassName="max-w-none sm:max-w-[440px] sm:rounded-l-[28px]"
      returnFocusRef={returnFocusRef}
    >
      <div className="flex min-h-full flex-col">
        <header className="flex min-h-24 items-center justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <p className="label-caps text-ink-3">Preferences</p>
            <h2 id="settings-title" className="mt-1 font-display text-2xl font-bold tracking-tight">
              Settings
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-full px-0"
            aria-label="Close settings"
          >
            <X size={18} aria-hidden />
          </Button>
        </header>
        <fieldset className="m-6 min-w-0">
          <legend className="font-display text-base font-bold text-ink">Appearance</legend>
          <p className="mt-2 text-sm leading-6 text-ink-2">
            Choose how Markwise looks on this device.
          </p>
          <div className="mt-5 grid gap-3">
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = option.value === preference;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[20px] border p-4 transition-colors focus-within:ring-2 focus-within:ring-brand-line focus-within:ring-offset-2 focus-within:ring-offset-surface",
                    selected
                      ? "border-brand-line bg-brand-soft"
                      : "border-border bg-surface hover:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name="appearance"
                    value={option.value}
                    checked={selected}
                    onChange={() => setPreference(option.value)}
                    aria-label={option.label}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
                  />
                  <Icon size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-[13px] leading-5 text-ink-2">
                      {option.description}
                    </span>
                  </span>
                  {selected ? (
                    <Check size={17} className="shrink-0 text-brand" aria-hidden />
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    </OverlayPanel>
  );
}
