"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function OverlayPanel({
  open,
  onClose,
  side,
  labelledBy,
  ariaLabel,
  panelClassName,
  returnFocusRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  labelledBy?: string;
  ariaLabel?: string;
  panelClassName?: string;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const returnFocus = returnFocusRef?.current ?? previous;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusable = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    (focusable()[0] ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = oldOverflow;
      returnFocus?.focus();
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45"
      data-testid="overlay-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 w-full overflow-y-auto border-border bg-surface shadow-[var(--shadow-panel)] outline-none",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
