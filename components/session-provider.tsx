"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ANSWERS,
  CLUSTERS,
  CONFIDENCE_THRESHOLD,
  CRITERIA,
  RETEACH_PACKS,
  SESSION,
} from "@/lib/mock";
import type {
  Cluster,
  ReteachPack,
  ReviewStatus,
  SortMode,
  StudentAnswer,
} from "@/lib/types";
import type { PipelineInput, PipelineResult } from "@/lib/pipeline/types";

/** The setup screen's output, held until the processing screen consumes it. */
export interface PendingRun {
  input: PipelineInput;
  prediction: string;
  courseCode?: string;
  courseTitle?: string;
}

/** Everything the reteach and export screens need about the run's origin. */
export type RunContext = Omit<PipelineInput, "answers">;

const DEMO_CONTEXT: RunContext = {
  question: SESSION.question,
  scheme:
    "Full marks require the reactance computed from X_L = 2πfL, the impedance combined in quadrature as Z = √(R² + X_L²), the current from I = V/Z, the phase angle from φ = arctan(X_L/R) stated as the angle between supply voltage and current, and correct units throughout.",
  criteria: CRITERIA,
  subject: SESSION.subject,
  level: SESSION.level,
};

interface SessionState {
  answers: StudentAnswer[];
  clusters: Cluster[];
  prediction: string;
  sortMode: SortMode;
  processed: boolean;
  confirmed: boolean;
  confirmedBy: string;

  reviewedCount: number;
  needsAttention: number;
  exportReady: boolean;

  /** True while the screens are showing the seeded demo class. */
  isDemo: boolean;
  /** The row id of a persisted run, or null when nothing was saved. */
  sessionId: string | null;
  context: RunContext;
  pendingRun: PendingRun | null;
  reteachPacks: Record<string, ReteachPack>;

  /**
   * This run's own size. Every percentage on every screen divides by it, so a
   * batch of 12 must not be scored against the demo class's 40.
   */
  totalAnswers: number;
  courseCode: string;
  courseTitle: string;
  /** Resolves a criterion id against this run's scheme, not the demo's. */
  criterionLabel: (id: string) => string;

  setScore: (answerId: string, score: number) => void;
  setStatus: (answerId: string, status: ReviewStatus) => void;
  acceptAbove: (threshold: number) => void;
  resetReview: () => void;

  renameCluster: (clusterId: string, label: string) => void;
  rejectCluster: (clusterId: string) => void;
  mergeCluster: (sourceId: string, targetId: string) => void;
  splitOut: (clusterId: string, answerIds: string[], label: string) => void;

  setPrediction: (value: string) => void;
  setSortMode: (mode: SortMode) => void;
  setProcessed: (value: boolean) => void;
  setConfirmed: (value: boolean) => void;
  setConfirmedBy: (value: string) => void;

  startRun: (run: PendingRun) => void;
  applyRun: (
    result: PipelineResult,
    sessionId: string | null,
    context: RunContext,
  ) => void;
  setReteachPack: (clusterId: string, pack: ReteachPack) => void;
}

const Ctx = createContext<SessionState | null>(null);

const STORAGE_KEY = "markwise:run";

interface StoredRun {
  answers: StudentAnswer[];
  clusters: Cluster[];
  reteachPacks: Record<string, ReteachPack>;
  context: RunContext;
  prediction: string;
  sessionId: string | null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<StudentAnswer[]>(ANSWERS);
  const [clusters, setClusters] = useState<Cluster[]>(CLUSTERS);
  const [prediction, setPrediction] = useState(SESSION.prediction ?? "");
  const [sortMode, setSortMode] = useState<SortMode>("spread");
  // The seeded demo class arrives already processed, so every screen has
  // something real to show on a cold visit. Running from setup resets this.
  const [processed, setProcessed] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedBy, setConfirmedBy] = useState("Dr. A. Daniel");

  const [isDemo, setIsDemo] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [context, setContext] = useState<RunContext>(DEMO_CONTEXT);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const [reteachPacks, setReteachPacks] =
    useState<Record<string, ReteachPack>>(RETEACH_PACKS);

  /**
   * A real run is restored after mount rather than during the first render.
   * Reading storage inline would make the server and client render different
   * markup, and React would throw a hydration mismatch on every reload that
   * follows a run.
   */
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing and blocked storage both land here. The demo class
      // is the correct fallback, so there is nothing to report.
      return;
    }
    if (!stored) return;

    try {
      const run = JSON.parse(stored) as StoredRun;
      if (!Array.isArray(run.answers) || run.answers.length === 0) return;
      /* eslint-disable react-hooks/set-state-in-effect --
       * Restoring after mount is the point, not an oversight. sessionStorage
       * does not exist during the server render, so reading it any earlier
       * would make the server and client produce different markup and throw a
       * hydration mismatch on every reload that follows a run. This runs once,
       * only when a stored run exists, and the cascading render it costs is
       * the price of correct hydration. */
      setAnswers(run.answers);
      setClusters(run.clusters ?? []);
      setReteachPacks(run.reteachPacks ?? {});
      setContext(run.context ?? DEMO_CONTEXT);
      setPrediction(run.prediction ?? "");
      setSessionId(run.sessionId ?? null);
      setIsDemo(false);
      setProcessed(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing further to do; the demo class stands.
      }
    }
  }, []);

  const persist = useCallback((run: StoredRun) => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(run));
    } catch {
      // Over quota or blocked. The run stays in memory for this visit.
    }
  }, []);

  /**
   * Mirrors a change to Supabase when the run was saved there.
   *
   * Imported lazily and only for a persisted run, so the seeded demo class
   * never pulls the server-action module into the client at all.
   */
  const mirror = useCallback(
    (apply: (actions: typeof import("@/app/actions")) => Promise<unknown>) => {
      if (!sessionId) return;
      void import("@/app/actions")
        .then(apply)
        .catch(() => {
          // The edit is already applied locally and stored for this visit.
          // Surfacing a database hiccup mid-review would cost more than it
          // saves; the lecturer's work is not lost either way.
        });
    },
    [sessionId],
  );

  const setScore = useCallback(
    (answerId: string, score: number) => {
      let saved: { score: number; status: ReviewStatus } | null = null;

      setAnswers((prev) =>
        prev.map((a) => {
          if (a.id !== answerId) return a;
          const next = {
            ...a,
            provisionalScore: Math.max(0, Math.min(a.maxScore, score)),
            status: (score === a.provisionalScore
              ? a.status
              : "edited") as ReviewStatus,
          };
          saved = { score: next.provisionalScore, status: next.status };
          return next;
        }),
      );

      mirror((actions) =>
        saved
          ? actions.saveScoreAction({ answerId, ...saved })
          : Promise.resolve({ ok: true }),
      );
    },
    [mirror],
  );

  const setStatus = useCallback(
    (answerId: string, status: ReviewStatus) => {
      setAnswers((prev) =>
        prev.map((a) => (a.id === answerId ? { ...a, status } : a)),
      );
      mirror((actions) =>
        actions.saveStatusAction({ answerIds: [answerId], status }),
      );
    },
    [mirror],
  );

  const acceptAbove = useCallback(
    (threshold: number) => {
      let affected: string[] = [];

      setAnswers((prev) => {
        affected = prev
          .filter((a) => a.status === "unreviewed" && a.confidence >= threshold)
          .map((a) => a.id);
        return prev.map((a) =>
          a.status === "unreviewed" && a.confidence >= threshold
            ? { ...a, status: "accepted" }
            : a,
        );
      });

      mirror((actions) =>
        affected.length > 0
          ? actions.saveStatusAction({ answerIds: affected, status: "accepted" })
          : Promise.resolve({ ok: true }),
      );
    },
    [mirror],
  );

  const resetReview = useCallback(() => {
    let ids: string[] = [];

    setAnswers((prev) => {
      ids = prev.map((a) => a.id);
      return prev.map((a) => ({ ...a, status: "unreviewed" }));
    });
    setConfirmed(false);

    mirror((actions) =>
      ids.length > 0
        ? actions.saveStatusAction({ answerIds: ids, status: "unreviewed" })
        : Promise.resolve({ ok: true }),
    );
  }, [mirror]);

  const renameCluster = useCallback(
    (clusterId: string, label: string) => {
      setClusters((prev) =>
        prev.map((c) => (c.id === clusterId ? { ...c, label } : c)),
      );
      mirror((actions) => actions.renameClusterAction({ clusterId, label }));
    },
    [mirror],
  );

  /** Rejecting sends the members to the one-off bucket; nothing is deleted. */
  const rejectCluster = useCallback(
    (clusterId: string) => {
      let movedIds: string[] = [];
      let otherId: string | null = null;

      setClusters((prev) => {
        const current = prev.find((c) => c.id === clusterId);
        if (!current || current.isOther) return prev;
        movedIds = current.memberIds;
        otherId = prev.find((c) => c.isOther)?.id ?? null;
        return prev
          .map((c) =>
            c.isOther
              ? { ...c, memberIds: [...c.memberIds, ...current.memberIds] }
              : c,
          )
          .filter((c) => c.id !== clusterId);
      });
      setAnswers((prev) =>
        prev.map((a) =>
          a.clusterId === clusterId ? { ...a, clusterId: "cl-other" } : a,
        ),
      );

      mirror(async (actions) => {
        if (movedIds.length > 0) {
          await actions.reassignAnswersAction({
            answerIds: movedIds,
            clusterId: otherId,
          });
        }
        return actions.deleteClusterAction({ clusterId });
      });
    },
    [mirror],
  );

  const mergeCluster = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      let movedIds: string[] = [];

      setClusters((prev) => {
        const source = prev.find((c) => c.id === sourceId);
        const target = prev.find((c) => c.id === targetId);
        if (!source || !target) return prev;
        movedIds = source.memberIds;
        return prev
          .map((c) =>
            c.id === targetId
              ? {
                  ...c,
                  memberIds: [...c.memberIds, ...source.memberIds],
                  severity: Math.max(c.severity, source.severity),
                  downstream: Array.from(
                    new Set([...c.downstream, ...source.downstream]),
                  ),
                }
              : c,
          )
          .filter((c) => c.id !== sourceId);
      });
      setAnswers((prev) =>
        prev.map((a) =>
          a.clusterId === sourceId ? { ...a, clusterId: targetId } : a,
        ),
      );

      mirror(async (actions) => {
        if (movedIds.length > 0) {
          await actions.reassignAnswersAction({
            answerIds: movedIds,
            clusterId: targetId,
          });
        }
        return actions.deleteClusterAction({ clusterId: sourceId });
      });
    },
    [mirror],
  );

  const splitOut = useCallback(
    (clusterId: string, answerIds: string[], label: string) => {
      if (answerIds.length === 0) return;
      const newId = `cl-split-${Date.now().toString(36)}`;

      // Chosen inside the updater, against the freshest cluster set. Picking a
      // tone from a snapshot taken outside would hand two splits made in the
      // same batch the same colour, because the first is not in that snapshot.
      let spec: Omit<Cluster, "id" | "memberIds"> | null = null;
      let rank = 0;

      setClusters((prev) => {
        const current = prev.find((c) => c.id === clusterId);
        if (!current) return prev;
        const remaining = current.memberIds.filter(
          (id) => !answerIds.includes(id),
        );
        const usedTones = new Set(prev.map((c) => c.tone));
        const tone = ([1, 2, 3, 4, 5, 6] as const).find(
          (t) => !usedTones.has(t),
        );
        const updated = prev.map((c) =>
          c.id === clusterId ? { ...c, memberIds: remaining } : c,
        );
        const insertAt = updated.findIndex((c) => c.id === clusterId) + 1;
        spec = {
          tone: tone ?? 6,
          label,
          why: "Split out by the lecturer from “" + current.label + "”.",
          severity: current.severity,
          downstream: current.downstream,
          isOther: false,
        };
        rank = insertAt;
        const next: Cluster = { ...spec, id: newId, memberIds: answerIds };
        return [
          ...updated.slice(0, insertAt),
          next,
          ...updated.slice(insertAt),
        ].filter((c) => c.memberIds.length > 0 || c.isOther);
      });
      setAnswers((prev) =>
        prev.map((a) =>
          answerIds.includes(a.id) ? { ...a, clusterId: newId } : a,
        ),
      );

      mirror(async (actions) => {
        // The updater above has run by now: React processes it during the
        // render this call schedules, which lands well before a dynamic
        // import resolves.
        if (!sessionId || !spec) return;
        const { clusterId: realId } = await actions.createClusterAction({
          sessionId,
          cluster: spec,
          rank,
        });
        if (!realId) return;
        // Re-key the optimistic cluster to the row that now backs it, so a
        // later rename or merge addresses the real row rather than a local id.
        setClusters((prev) =>
          prev.map((c) => (c.id === newId ? { ...c, id: realId } : c)),
        );
        setAnswers((prev) =>
          prev.map((a) =>
            a.clusterId === newId ? { ...a, clusterId: realId } : a,
          ),
        );
        return actions.reassignAnswersAction({ answerIds, clusterId: realId });
      });
    },
    // Deliberately not depending on `clusters`: everything this needs is read
    // from the updater's own `prev`. Depending on it would give the callback a
    // new identity after every split, restarting any effect keyed on it.
    [mirror, sessionId],
  );

  const startRun = useCallback((run: PendingRun) => {
    setPendingRun(run);
    setPrediction(run.prediction);
    setProcessed(false);
  }, []);

  const applyRun = useCallback(
    (
      result: PipelineResult,
      newSessionId: string | null,
      runContext: RunContext,
    ) => {
      setAnswers(result.answers);
      setClusters(result.clusters);
      setReteachPacks(result.reteachPacks ?? {});
      setSessionId(newSessionId);
      // Taken as an argument rather than read back out of pendingRun inside a
      // state updater: updaters must stay pure, and React would run that one
      // twice in development, calling setContext as a side effect each time.
      setContext(runContext);
      setIsDemo(false);
      setProcessed(true);
      setConfirmed(false);
      setPendingRun(null);
    },
    [],
  );

  const setReteachPack = useCallback((clusterId: string, pack: ReteachPack) => {
    setReteachPacks((prev) => ({ ...prev, [clusterId]: pack }));
  }, []);

  // Whatever changed, a real run is written back so a reload does not discard
  // a lecturer's marking. The demo class is never stored — it is regenerated
  // identically on every visit, and storing it would shadow a later real run.
  useEffect(() => {
    if (isDemo) return;
    persist({ answers, clusters, reteachPacks, context, prediction, sessionId });
  }, [
    isDemo,
    answers,
    clusters,
    reteachPacks,
    context,
    prediction,
    sessionId,
    persist,
  ]);

  const criterionLabel = useCallback(
    (id: string) => context.criteria.find((c) => c.id === id)?.label ?? id,
    [context.criteria],
  );

  const reviewedCount = useMemo(
    () => answers.filter((a) => a.status !== "unreviewed").length,
    [answers],
  );

  const needsAttention = useMemo(
    () =>
      answers.filter(
        (a) => a.status === "unreviewed" && a.confidence < CONFIDENCE_THRESHOLD,
      ).length,
    [answers],
  );

  const value = useMemo<SessionState>(
    () => ({
      answers,
      clusters,
      prediction,
      sortMode,
      processed,
      confirmed,
      confirmedBy,
      reviewedCount,
      needsAttention,
      // Counted against this run's own size, not a constant — a batch of 12
      // answers must be able to reach a reviewed state just as a batch of 40 can.
      exportReady: answers.length > 0 && reviewedCount === answers.length,
      isDemo,
      sessionId,
      context,
      pendingRun,
      reteachPacks,
      totalAnswers: answers.length,
      courseCode: isDemo ? SESSION.courseCode : (pendingRun?.courseCode ?? ""),
      courseTitle: isDemo ? SESSION.courseTitle : (pendingRun?.courseTitle ?? ""),
      criterionLabel,
      setScore,
      setStatus,
      acceptAbove,
      resetReview,
      renameCluster,
      rejectCluster,
      mergeCluster,
      splitOut,
      setPrediction,
      setSortMode,
      setProcessed,
      setConfirmed,
      setConfirmedBy,
      startRun,
      applyRun,
      setReteachPack,
    }),
    [
      answers,
      clusters,
      prediction,
      sortMode,
      processed,
      confirmed,
      confirmedBy,
      reviewedCount,
      needsAttention,
      isDemo,
      sessionId,
      context,
      pendingRun,
      reteachPacks,
      criterionLabel,
      setScore,
      setStatus,
      acceptAbove,
      resetReview,
      renameCluster,
      rejectCluster,
      mergeCluster,
      splitOut,
      startRun,
      applyRun,
      setReteachPack,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
