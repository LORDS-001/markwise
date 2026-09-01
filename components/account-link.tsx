"use client";

import { useState } from "react";
import { Check, Mail, TriangleAlert } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button, Input, cn } from "@/components/ui";

/**
 * Email capture, placed at the confirm step rather than in front of the app.
 *
 * By this point the lecturer has already been asked for their name, because
 * the exported files carry "confirmed by [name] on [date]". Asking for an
 * address in the same breath has a reason attached — keeping the record they
 * just confirmed — instead of being a gate they pay before seeing anything.
 *
 * It is always optional. Export works without it.
 */
export function AccountLink() {
  const { status, email, pendingEmail, linking, error, linkEmail, dismissError } = useAuth();
  const [draft, setDraft] = useState("");

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.trim());

  if (status === "loading") {
    return (
      <div
        role="region"
        aria-label="Account connection"
        className="rounded-[14px] border border-border bg-surface-2 px-4 py-3"
      >
        <div className="h-3.5 w-40 rounded-full bg-surface-3" />
      </div>
    );
  }

  if (status === "linked" && email) {
    return (
      <div
        role="region"
        aria-label="Account connection"
        className="flex items-start gap-2.5 rounded-[14px] border border-ok-line bg-ok-soft px-4 py-3"
      >
        <Check size={15} strokeWidth={2.4} className="text-ok shrink-0 mt-0.5" aria-hidden />
        <p className="text-[12.5px] text-ink-2">
          Signed in as <span className="font-semibold text-ink">{email}</span>. Batch results are
          not synced in this preview.
        </p>
      </div>
    );
  }

  if (pendingEmail) {
    return (
      <div
        role="region"
        aria-label="Account connection"
        className="flex items-start gap-2.5 rounded-[14px] border border-brand-line bg-brand-soft px-4 py-3"
      >
        <Mail size={15} strokeWidth={2} className="text-brand shrink-0 mt-0.5" aria-hidden />
        <p className="text-[12.5px] text-ink-2">
          Check <span className="font-semibold text-ink">{pendingEmail}</span> and click the link
          to finish. You can export now either way.
        </p>
      </div>
    );
  }

  const demo = status === "demo";

  return (
    <div
      role="region"
      aria-label="Account connection"
      className={cn(
        "rounded-[14px] border px-4 py-3.5 flex flex-col gap-2.5",
        demo ? "border-border bg-surface-2" : "border-border bg-surface-2",
      )}
    >
      <div>
        <p className="text-[12.5px] font-bold text-ink">Connect an email</p>
        <p className="text-[12.5px] text-ink-2 mt-0.5 leading-snug">
          Use an email for your Markwise identity. This demo batch remains in this tab.
        </p>
      </div>

      {!demo ? (
        <>
          <div className="flex gap-2">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) dismissError();
              }}
              placeholder="you@university.edu"
              aria-label="Email address"
              className="h-9 text-[13px]"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!valid || linking}
              onClick={() => void linkEmail(draft.trim())}
              className="shrink-0"
            >
              {linking ? "Sending…" : "Connect email"}
            </Button>
          </div>
          <p className="text-[11.5px] text-ink-3">Optional — export works without it.</p>
        </>
      ) : null}

      {error ? (
        <p className="text-[12px] text-crit flex items-start gap-1.5" role="alert">
          <TriangleAlert size={13} strokeWidth={2} className="shrink-0 mt-0.5" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
