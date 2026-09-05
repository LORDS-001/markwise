"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Clock3, FolderOpen, RefreshCw } from "lucide-react";
import {
  listSessionsAction,
  loadSessionAction,
  type SavedSessionSummary,
} from "@/app/session-actions";
import { useSession } from "@/components/session-provider";
import { Page } from "@/components/shell";
import { Button, Card, EmptyState, buttonClass } from "@/components/ui";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sessions: SavedSessionSummary[] };

export default function SessionsPage() {
  const router = useRouter();
  const { applyRun, flushChanges } = useSession();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const result = await listSessionsAction();
      setList(
        result.ok
          ? { status: "ready", sessions: result.sessions }
          : { status: "error", message: result.error },
      );
    } catch {
      setList({ status: "error", message: "Saved sessions are unavailable." });
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadList(); });
    return () => { active = false; };
  }, [loadList]);

  const refresh = useCallback(() => {
    setList({ status: "loading" });
    void loadList();
  }, [loadList]);

  const open = useCallback(
    async (sessionId: string, discardUnsaved = false) => {
      setOpening(sessionId);
      setOpenError(null);
      setDiscardTarget(null);
      try {
        if (!discardUnsaved && !(await flushChanges())) {
          setOpenError("Your latest edits have not been saved. You can stay here or reopen the saved copy and discard those local edits.");
          setDiscardTarget(sessionId);
          return;
        }
        const loaded = await loadSessionAction({ sessionId });
        if (!loaded.ok) {
          setOpenError(loaded.error);
          return;
        }
        applyRun(
          loaded.run.result,
          sessionId,
          loaded.run.input,
          loaded.run.course,
          loaded.run.prediction,
        );
        router.replace("/reveal");
      } catch {
        setOpenError("The saved session could not be opened. Try again.");
      } finally {
        setOpening(null);
      }
    },
    [applyRun, flushChanges, router],
  );

  return (
    <Page
      eyebrow="Saved work"
      title="Saved sessions"
      lead="Return to a completed class analysis and continue reviewing it."
    >
      {openError ? (
        <div className="rounded-[12px] border border-crit-line bg-crit-soft px-4 py-3 text-[13px] text-crit" role="alert">
          <p>{openError}</p>
          {discardTarget ? (
            <Button
              variant="danger"
              size="sm"
              className="mt-3"
              onClick={() => void open(discardTarget, true)}
            >
              Open saved copy and discard local edits
            </Button>
          ) : null}
        </div>
      ) : null}

      {list.status === "loading" ? (
        <Card>
          <EmptyState
            icon={<RefreshCw size={25} className="animate-spin" aria-hidden />}
            title="Loading saved sessions…"
            body="Checking the sessions owned by this account."
          />
        </Card>
      ) : list.status === "error" ? (
        <Card>
          <div role="alert">
            <EmptyState
              icon={<FolderOpen size={26} aria-hidden />}
              title="Saved sessions could not be loaded"
              body={list.message}
              action={
                <Button variant="secondary" onClick={refresh}>
                  Try again
                </Button>
              }
            />
          </div>
        </Card>
      ) : list.sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderOpen size={26} aria-hidden />}
            title="No saved sessions yet"
            body="Run a live class analysis while signed in and it will appear here."
            action={
              <Link href="/" className={buttonClass("primary", "md")}>
                Start a run
                <ArrowRight size={16} aria-hidden />
              </Link>
            }
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {list.sessions.map((session) => (
              <li key={session.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-brand">
                    {[session.courseCode, session.courseTitle].filter(Boolean).join(" · ") || "Unfiled course"}
                  </span>
                  <span className="mt-1 block truncate text-[14px] font-medium">{session.question}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-3">
                    <Clock3 size={13} aria-hidden />
                    {new Date(session.createdAt).toLocaleString()}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  onClick={() => void open(session.id)}
                  disabled={opening !== null}
                  aria-label={`Open session: ${session.question}`}
                >
                  {opening === session.id ? "Opening…" : "Open session"}
                  <ArrowRight size={15} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
