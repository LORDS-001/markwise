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
    description: "Use deep navy surfaces with cyan accents.",
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
      panelClassName="max-w-none sm:max-w-[400px]"
      returnFocusRef={returnFocusRef}
    >
      <div className="flex min-h-full flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-5">
          <div>
            <p className="label-caps text-brand">Preferences</p>
            <h2 id="settings-title" className="font-display text-[18px] font-bold">
              Settings
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="min-h-9 min-w-9 px-0"
            aria-label="Close settings"
          >
            <X size={18} aria-hidden />
          </Button>
        </header>
        <fieldset className="p-5">
          <legend className="text-[14px] font-bold text-ink">Appearance</legend>
          <p className="mt-1 text-[12.5px] text-ink-2">
            Choose how Markwise looks on this device.
          </p>
          <div className="mt-4 grid gap-2">
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = option.value === preference;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[12px] border p-3.5",
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
                    className="mt-1 accent-[var(--brand)]"
                  />
                  <Icon size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">
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
