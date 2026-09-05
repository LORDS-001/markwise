"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { getBrowserClient } from "@/lib/supabase/client";
import type {
  Cluster,
  ReteachPack,
  ReviewStatus,
  SortMode,
  StudentAnswer,
} from "@/lib/types";
import type { PipelineInput, PipelineResult } from "@/lib/pipeline/types";

export interface PendingRun {
  input: PipelineInput;
  prediction: string;
  courseCode?: string;
  courseTitle?: string;
}

export type RunContext = Omit<PipelineInput, "answers">;

const DEMO_CONTEXT: RunContext = {
  question: SESSION.question,
  scheme:
    "Full marks require the reactance computed from X_L = 2πfL, the impedance combined in quadrature as Z = √(R² + X_L²), the current from I = V/Z, the phase angle from φ = arctan(X_L/R) stated as the angle between supply voltage and current, and correct units throughout.",
  criteria: CRITERIA,
  subject: SESSION.subject,
  level: SESSION.level,
};

interface CourseIdentity {
  code: string;
  title: string;
}

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
  blockedCount: number;
  flaggedCount: number;
  isDemo: boolean;
  sessionId: string | null;
  context: RunContext;
  pendingRun: PendingRun | null;
  reteachPacks: Record<string, ReteachPack>;
  totalAnswers: number;
  courseCode: string;
  courseTitle: string;
  saving: boolean;
  saveError: string | null;
  flushChanges: () => Promise<boolean>;
  retrySave: () => Promise<boolean>;
  previewDemo: () => void;
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
    course?: CourseIdentity,
    prediction?: string,
  ) => void;
  setReteachPack: (clusterId: string, pack: ReteachPack) => void;
}

const Ctx = createContext<SessionState | null>(null);
const STORAGE_PREFIX = "markwise:run:";
const LEGACY_STORAGE_KEY = "markwise:run";

interface StoredRun {
  answers: StudentAnswer[];
  clusters: Cluster[];
  reteachPacks: Record<string, ReteachPack>;
  context: RunContext;
  prediction: string;
  sessionId: string | null;
  courseCode: string;
  courseTitle: string;
  ownerKey: string;
  saveState?: "clean" | "pending" | "failed";
  saveError?: string | null;
}

type ActionResult = { ok: boolean; error?: string } | void;

function requireSuccess(result: ActionResult) {
  if (result && !result.ok) throw new Error(result.error ?? "The change could not be saved.");
}

function savedRun(value: unknown, ownerKey: string): StoredRun | null {
  if (!value || typeof value !== "object") return null;
  const run = value as Partial<StoredRun>;
  if (!Array.isArray(run.answers) || run.answers.length === 0) return null;
  if (!Array.isArray(run.clusters) || !run.context || run.ownerKey !== ownerKey) return null;
  return {
    answers: run.answers,
    clusters: run.clusters,
    reteachPacks: run.reteachPacks ?? {},
    context: run.context,
    prediction: run.prediction ?? "",
    sessionId: run.sessionId ?? null,
    courseCode: run.courseCode ?? "",
    courseTitle: run.courseTitle ?? "",
    ownerKey,
    saveState: run.saveState ?? "clean",
    saveError: run.saveError ?? null,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const browserClient = useMemo(() => getBrowserClient(), []);
  const [storageOwnerKey, setStorageOwnerKey] = useState<string | null>(
    browserClient ? null : "local",
  );
  const [answers, setAnswersState] = useState<StudentAnswer[]>(ANSWERS);
  const [clusters, setClustersState] = useState<Cluster[]>(CLUSTERS);
  const [prediction, setPrediction] = useState(SESSION.prediction ?? "");
  const [sortMode, setSortMode] = useState<SortMode>("spread");
  const [processed, setProcessed] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedBy, setConfirmedBy] = useState("Dr. A. Daniel");
  const [isDemo, setIsDemo] = useState(true);
  const [sessionId, setSessionIdState] = useState<string | null>(null);
  const [context, setContext] = useState<RunContext>(DEMO_CONTEXT);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const [reteachPacks, setReteachPacksState] =
    useState<Record<string, ReteachPack>>(RETEACH_PACKS);
  const [courseCode, setCourseCode] = useState(SESSION.courseCode);
  const [courseTitle, setCourseTitle] = useState(SESSION.courseTitle);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [snapshotSaveState, setSnapshotSaveState] =
    useState<"clean" | "pending" | "failed">("clean");

  const answersRef = useRef(answers);
  const clustersRef = useRef(clusters);
  const packsRef = useRef(reteachPacks);
  const sessionIdRef = useRef(sessionId);
  const isDemoRef = useRef(true);
  const editQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingWritesRef = useRef(0);
  const failedWritesRef = useRef(false);
  const initialSaveInFlightRef = useRef(false);
  const initialSavePromiseRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const clusterAliasesRef = useRef(new Map<string, string>());
  const stateGenerationRef = useRef(0);

  const resolveClusterId = useCallback((id: string) => {
    let current = id;
    const seen = new Set<string>();
    while (clusterAliasesRef.current.has(current) && !seen.has(current)) {
      seen.add(current);
      current = clusterAliasesRef.current.get(current)!;
    }
    return current;
  }, []);

  const replaceAnswers = useCallback(
    (next: StudentAnswer[] | ((current: StudentAnswer[]) => StudentAnswer[])) => {
      const value = typeof next === "function" ? next(answersRef.current) : next;
      answersRef.current = value;
      setAnswersState(value);
      return value;
    },
    [],
  );
  const replaceClusters = useCallback(
    (next: Cluster[] | ((current: Cluster[]) => Cluster[])) => {
      const value = typeof next === "function" ? next(clustersRef.current) : next;
      clustersRef.current = value;
      setClustersState(value);
      return value;
    },
    [],
  );
  const replacePacks = useCallback(
    (
      next:
        | Record<string, ReteachPack>
        | ((current: Record<string, ReteachPack>) => Record<string, ReteachPack>),
    ) => {
      const value = typeof next === "function" ? next(packsRef.current) : next;
      packsRef.current = value;
      setReteachPacksState(value);
      return value;
    },
    [],
  );
  const replaceSessionId = useCallback((next: string | null) => {
    sessionIdRef.current = next;
    setSessionIdState(next);
  }, []);

  const resetToDemo = useCallback(() => {
    stateGenerationRef.current += 1;
    clusterAliasesRef.current.clear();
    replaceAnswers(ANSWERS);
    replaceClusters(CLUSTERS);
    replacePacks(RETEACH_PACKS);
    replaceSessionId(null);
    setContext(DEMO_CONTEXT);
    setPrediction(SESSION.prediction ?? "");
    setCourseCode(SESSION.courseCode);
    setCourseTitle(SESSION.courseTitle);
    setPendingRun(null);
    setProcessed(true);
    setConfirmed(false);
    setIsDemo(true);
    isDemoRef.current = true;
    setSaveError(null);
    setSnapshotSaveState("clean");
    failedWritesRef.current = false;
  }, [replaceAnswers, replaceClusters, replacePacks, replaceSessionId]);

  useEffect(() => {
    if (!browserClient) return;
    let cancelled = false;
    let currentAccount: string | null = null;
    const applyAccount = (id: string | null) => {
      if (cancelled) return;
      if (currentAccount && currentAccount !== id) resetToDemo();
      currentAccount = id;
      setStorageOwnerKey(id ? `user:${id}` : null);
    };

    void browserClient.auth
      .getUser()
      .then(({ data }) => applyAccount(data.user?.id ?? null))
      .catch(() => applyAccount(null));
    const { data: subscription } = browserClient.auth.onAuthStateChange((_event, next) => {
      applyAccount(next?.user.id ?? null);
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [browserClient, resetToDemo]);

  useEffect(() => {
    if (!storageOwnerKey) return;
    const key = `${STORAGE_PREFIX}${storageOwnerKey}`;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(key);
      if (!raw && storageOwnerKey === "local") {
        const legacy = window.sessionStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy) as Omit<StoredRun, "ownerKey">;
          raw = JSON.stringify({ ...parsed, ownerKey: "local" });
        }
      }
    } catch {
      return;
    }
    if (!raw) return;

    try {
      const run = savedRun(JSON.parse(raw), storageOwnerKey);
      if (!run) return;
      stateGenerationRef.current += 1;
      clusterAliasesRef.current.clear();
      /* eslint-disable react-hooks/set-state-in-effect -- storage is unavailable during SSR */
      replaceAnswers(run.answers);
      replaceClusters(run.clusters);
      replacePacks(run.reteachPacks);
      replaceSessionId(run.sessionId);
      setContext(run.context);
      setPrediction(run.prediction);
      setCourseCode(run.courseCode);
      setCourseTitle(run.courseTitle);
      setIsDemo(false);
      isDemoRef.current = false;
      setProcessed(true);
      setPendingRun(null);
      if (run.saveState && run.saveState !== "clean") {
        failedWritesRef.current = true;
        setSnapshotSaveState("failed");
        setSaveError(
          run.saveError ??
            "Some local edits were not confirmed by the database. Reopen the saved copy before exporting.",
        );
      } else {
        failedWritesRef.current = false;
        setSnapshotSaveState("clean");
        setSaveError(null);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // The seeded demo remains available when browser storage is blocked.
      }
    }
  }, [storageOwnerKey, replaceAnswers, replaceClusters, replacePacks, replaceSessionId]);

  const enqueueMirror = useCallback(
    (
      apply: (
        actions: typeof import("@/app/actions"),
        sessionActions: typeof import("@/app/session-actions"),
      ) => Promise<ActionResult>,
    ) => {
      if (!sessionIdRef.current) return;
      const generation = stateGenerationRef.current;
      pendingWritesRef.current += 1;
      setSaving(true);
      setSnapshotSaveState("pending");
      const queued = editQueueRef.current
        .then(async () => {
          const [actions, sessionActions] = await Promise.all([
            import("@/app/actions"),
            import("@/app/session-actions"),
          ]);
          requireSuccess(await apply(actions, sessionActions));
        })
        .catch((error: unknown) => {
          if (stateGenerationRef.current === generation) {
            failedWritesRef.current = true;
            setSnapshotSaveState("failed");
            setSaveError(error instanceof Error ? error.message : "The change could not be saved.");
          }
        })
        .finally(() => {
          pendingWritesRef.current -= 1;
          if (pendingWritesRef.current === 0 && stateGenerationRef.current === generation) {
            setSaving(false);
            if (!failedWritesRef.current) setSnapshotSaveState("clean");
          }
        });
      editQueueRef.current = queued;
    },
    [],
  );

  const flushChanges = useCallback(async () => {
    await editQueueRef.current;
    await initialSavePromiseRef.current;
    return isDemoRef.current || (!failedWritesRef.current && !!sessionIdRef.current);
  }, []);

  const setScore = useCallback(
    (answerId: string, score: number) => {
      if (initialSaveInFlightRef.current) return;
      if (!Number.isFinite(score)) return;
      const current = answersRef.current.find((answer) => answer.id === answerId);
      if (!current) return;
      const nextScore = Math.max(0, Math.min(current.maxScore, Math.round(score)));
      const status = nextScore === current.provisionalScore ? current.status : "edited";
      replaceAnswers((items) =>
        items.map((answer) =>
          answer.id === answerId
            ? { ...answer, provisionalScore: nextScore, status }
            : answer,
        ),
      );
      setConfirmed(false);
      enqueueMirror(async (actions) => actions.saveScoreAction({ answerId, score: nextScore, status }));
    },
    [enqueueMirror, replaceAnswers],
  );

  const setStatus = useCallback(
    (answerId: string, status: ReviewStatus) => {
      if (initialSaveInFlightRef.current) return;
      if (!answersRef.current.some((answer) => answer.id === answerId)) return;
      replaceAnswers((items) =>
        items.map((answer) => (answer.id === answerId ? { ...answer, status } : answer)),
      );
      setConfirmed(false);
      enqueueMirror(async (actions) => actions.saveStatusAction({ answerIds: [answerId], status }));
    },
    [enqueueMirror, replaceAnswers],
  );

  const acceptAbove = useCallback(
    (threshold: number) => {
      if (initialSaveInFlightRef.current) return;
      const ids = answersRef.current
        .filter((answer) => answer.status === "unreviewed" && answer.confidence >= threshold)
        .map((answer) => answer.id);
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      replaceAnswers((items) =>
        items.map((answer) =>
          idSet.has(answer.id) ? { ...answer, status: "accepted" } : answer,
        ),
      );
      setConfirmed(false);
      enqueueMirror(async (actions) =>
        actions.saveStatusAction({ answerIds: ids, status: "accepted" }),
      );
    },
    [enqueueMirror, replaceAnswers],
  );

  const resetReview = useCallback(() => {
    if (initialSaveInFlightRef.current) return;
    const ids = answersRef.current.map((answer) => answer.id);
    replaceAnswers((items) => items.map((answer) => ({ ...answer, status: "unreviewed" })));
    setConfirmed(false);
    if (ids.length > 0) {
      enqueueMirror(async (actions) =>
        actions.saveStatusAction({ answerIds: ids, status: "unreviewed" }),
      );
    }
  }, [enqueueMirror, replaceAnswers]);

  const invalidateLocalPacks = useCallback(
    (ids: string[]) => {
      const stale = new Set(ids);
      replacePacks((items) =>
        Object.fromEntries(Object.entries(items).filter(([id]) => !stale.has(id))),
      );
    },
    [replacePacks],
  );

  const renameCluster = useCallback(
    (clusterId: string, label: string) => {
      if (initialSaveInFlightRef.current) return;
      if (!clustersRef.current.some((cluster) => cluster.id === clusterId)) return;
      replaceClusters((items) =>
        items.map((cluster) => (cluster.id === clusterId ? { ...cluster, label } : cluster)),
      );
      invalidateLocalPacks([clusterId]);
      enqueueMirror(async (actions, sessionActions) => {
        const remoteClusterId = resolveClusterId(clusterId);
        requireSuccess(await actions.renameClusterAction({ clusterId: remoteClusterId, label }));
        return sessionActions.invalidateReteachPacksAction({ clusterIds: [remoteClusterId] });
      });
    },
    [enqueueMirror, invalidateLocalPacks, replaceClusters, resolveClusterId],
  );

  const rejectCluster = useCallback(
    (clusterId: string) => {
      if (initialSaveInFlightRef.current) return;
      const current = clustersRef.current.find((cluster) => cluster.id === clusterId);
      const other = clustersRef.current.find((cluster) => cluster.isOther);
      if (!current || current.isOther || !other) return;
      const movedIds = [...current.memberIds];
      const moved = new Set(movedIds);
      replaceClusters((items) =>
        items
          .filter((cluster) => cluster.id !== clusterId)
          .map((cluster) =>
            cluster.id === other.id
              ? { ...cluster, memberIds: Array.from(new Set([...cluster.memberIds, ...movedIds])) }
              : cluster,
          ),
      );
      replaceAnswers((items) =>
        items.map((answer) =>
          moved.has(answer.id) ? { ...answer, clusterId: other.id } : answer,
        ),
      );
      invalidateLocalPacks([clusterId, other.id]);
      enqueueMirror(async (actions, sessionActions) => {
        const remoteClusterId = resolveClusterId(clusterId);
        const remoteOtherId = resolveClusterId(other.id);
        requireSuccess(
          await actions.reassignAnswersAction({ answerIds: movedIds, clusterId: remoteOtherId }),
        );
        requireSuccess(
          await sessionActions.invalidateReteachPacksAction({
            clusterIds: [remoteClusterId, remoteOtherId],
          }),
        );
        return actions.deleteClusterAction({ clusterId: remoteClusterId });
      });
    },
    [enqueueMirror, invalidateLocalPacks, replaceAnswers, replaceClusters, resolveClusterId],
  );

  const mergeCluster = useCallback(
    (sourceId: string, targetId: string) => {
      if (initialSaveInFlightRef.current) return;
      if (sourceId === targetId) return;
      const source = clustersRef.current.find((cluster) => cluster.id === sourceId);
      const target = clustersRef.current.find((cluster) => cluster.id === targetId);
      if (!source || !target) return;
      const movedIds = [...source.memberIds];
      const moved = new Set(movedIds);
      const mergedSeverity = Math.max(target.severity, source.severity);
      const mergedDownstream = Array.from(new Set([...target.downstream, ...source.downstream]));
      replaceClusters((items) =>
        items
          .filter((cluster) => cluster.id !== sourceId)
          .map((cluster) =>
            cluster.id === targetId
              ? {
                  ...cluster,
                  memberIds: Array.from(new Set([...cluster.memberIds, ...movedIds])),
                  severity: mergedSeverity,
                  downstream: mergedDownstream,
                }
              : cluster,
          ),
      );
      replaceAnswers((items) =>
        items.map((answer) =>
          moved.has(answer.id) ? { ...answer, clusterId: targetId } : answer,
        ),
      );
      invalidateLocalPacks([sourceId, targetId]);
      enqueueMirror(async (actions, sessionActions) => {
        const remoteSourceId = resolveClusterId(sourceId);
        const remoteTargetId = resolveClusterId(targetId);
        requireSuccess(
          await actions.reassignAnswersAction({ answerIds: movedIds, clusterId: remoteTargetId }),
        );
        requireSuccess(
          await sessionActions.updateClusterShapeAction({
            clusterId: remoteTargetId,
            severity: mergedSeverity,
            downstream: mergedDownstream,
          }),
        );
        requireSuccess(
          await sessionActions.invalidateReteachPacksAction({
            clusterIds: [remoteSourceId, remoteTargetId],
          }),
        );
        return actions.deleteClusterAction({ clusterId: remoteSourceId });
      });
    },
    [enqueueMirror, invalidateLocalPacks, replaceAnswers, replaceClusters, resolveClusterId],
  );

  const splitOut = useCallback(
    (clusterId: string, answerIds: string[], label: string) => {
      if (initialSaveInFlightRef.current) return;
      if (answerIds.length === 0) return;
      const current = clustersRef.current.find((cluster) => cluster.id === clusterId);
      if (!current) return;
      const selected = new Set(answerIds.filter((id) => current.memberIds.includes(id)));
      if (selected.size === 0) return;
      const localId = `cl-split-${globalThis.crypto.randomUUID()}`;
      const usedTones = new Set(clustersRef.current.map((cluster) => cluster.tone));
      const tone = ([1, 2, 3, 4, 5, 6] as const).find((value) => !usedTones.has(value)) ?? 6;
      const sourceIndex = clustersRef.current.findIndex((cluster) => cluster.id === clusterId);
      const spec: Omit<Cluster, "id" | "memberIds"> = {
        tone,
        label,
        why: `Split out by the lecturer from “${current.label}”.`,
        severity: current.severity,
        downstream: [...current.downstream],
        isOther: false,
      };
      const movedIds = [...selected];
      replaceClusters((items) => {
        const updated = items.map((cluster) =>
          cluster.id === clusterId
            ? { ...cluster, memberIds: cluster.memberIds.filter((id) => !selected.has(id)) }
            : cluster,
        );
        updated.splice(sourceIndex + 1, 0, { ...spec, id: localId, memberIds: movedIds });
        return updated.filter((cluster) => cluster.isOther || cluster.memberIds.length > 0);
      });
      replaceAnswers((items) =>
        items.map((answer) =>
          selected.has(answer.id) ? { ...answer, clusterId: localId } : answer,
        ),
      );
      invalidateLocalPacks([clusterId]);
      const targetSessionId = sessionIdRef.current;
      const generation = stateGenerationRef.current;
      enqueueMirror(async (actions, sessionActions) => {
        if (!targetSessionId) return;
        const created = await actions.createClusterAction({
          sessionId: targetSessionId,
          cluster: spec,
          rank: sourceIndex + 1,
        });
        requireSuccess(created);
        if (!created.clusterId) throw new Error("The split cluster could not be saved.");
        clusterAliasesRef.current.set(localId, created.clusterId);
        requireSuccess(
          await actions.reassignAnswersAction({
            answerIds: movedIds,
            clusterId: created.clusterId,
          }),
        );
        requireSuccess(
          await sessionActions.invalidateReteachPacksAction({
            clusterIds: [resolveClusterId(clusterId)],
          }),
        );
        if (stateGenerationRef.current !== generation) return;
        replaceClusters((items) =>
          items.map((cluster) =>
            cluster.id === localId ? { ...cluster, id: created.clusterId! } : cluster,
          ),
        );
        replaceAnswers((items) =>
          items.map((answer) =>
            answer.clusterId === localId ? { ...answer, clusterId: created.clusterId } : answer,
          ),
        );
      });
    },
    [enqueueMirror, invalidateLocalPacks, replaceAnswers, replaceClusters, resolveClusterId],
  );

  const startRun = useCallback((run: PendingRun) => {
    if (initialSaveInFlightRef.current) return;
    setPendingRun(run);
    setPrediction(run.prediction);
    setCourseCode(run.courseCode?.trim() ?? "");
    setCourseTitle(run.courseTitle?.trim() ?? "");
    setProcessed(false);
    setConfirmed(false);
  }, []);

  const applyRun = useCallback(
    (
      result: PipelineResult,
      newSessionId: string | null,
      runContext: RunContext,
      course?: CourseIdentity,
      runPrediction?: string,
    ) => {
      stateGenerationRef.current += 1;
      clusterAliasesRef.current.clear();
      replaceAnswers(result.answers);
      replaceClusters(result.clusters);
      replacePacks(result.reteachPacks ?? {});
      replaceSessionId(newSessionId);
      setContext(runContext);
      if (course) {
        setCourseCode(course.code);
        setCourseTitle(course.title);
      }
      if (runPrediction !== undefined) setPrediction(runPrediction);
      setIsDemo(false);
      isDemoRef.current = false;
      setProcessed(true);
      setConfirmed(false);
      setPendingRun(null);
      if (newSessionId) {
        setSaveError(null);
        setSnapshotSaveState("clean");
        failedWritesRef.current = false;
      } else {
        setSaveError("This run has not been saved. Retry without rerunning the analysis.");
        setSnapshotSaveState("failed");
        failedWritesRef.current = true;
      }
    },
    [replaceAnswers, replaceClusters, replacePacks, replaceSessionId],
  );

  const previewDemo = useCallback(() => {
    stateGenerationRef.current += 1;
    clusterAliasesRef.current.clear();
    replaceAnswers(ANSWERS);
    replaceClusters(CLUSTERS);
    replacePacks(RETEACH_PACKS);
    replaceSessionId(null);
    setContext(DEMO_CONTEXT);
    setCourseCode(SESSION.courseCode);
    setCourseTitle(SESSION.courseTitle);
    setPendingRun(null);
    setProcessed(false);
    setConfirmed(false);
    setIsDemo(true);
    isDemoRef.current = true;
    failedWritesRef.current = false;
    setSnapshotSaveState("clean");
    setSaveError(null);
  }, [replaceAnswers, replaceClusters, replacePacks, replaceSessionId]);

  const retrySave = useCallback(async () => {
    if (isDemo || sessionIdRef.current) return true;
    if (initialSaveInFlightRef.current) return initialSavePromiseRef.current;

    const generation = stateGenerationRef.current;
    const input: Omit<PipelineInput, "answers"> = {
      question: context.question,
      scheme: context.scheme,
      criteria: context.criteria,
      subject: context.subject,
      level: context.level,
    };
    const result: PipelineResult = {
      answers: answersRef.current,
      clusters: clustersRef.current,
      reteachPacks: packsRef.current,
      maxScore:
        answersRef.current[0]?.maxScore ??
        context.criteria.reduce((total, criterion) => total + criterion.marks, 0),
    };
    initialSaveInFlightRef.current = true;
    setSaving(true);
    setConfirmed(false);
    setSaveError(null);
    setSnapshotSaveState("pending");

    const attempt = import("@/app/session-actions")
      .then((actions) =>
        actions.saveCompletedRunAction({
          input,
          result,
          prediction,
          course: { code: courseCode, title: courseTitle },
        }),
      )
      .then((saved) => {
        if (!saved.ok) throw new Error(saved.error);
        if (stateGenerationRef.current !== generation) return true;
        replaceAnswers(saved.result.answers);
        replaceClusters(saved.result.clusters);
        replacePacks(saved.result.reteachPacks ?? {});
        replaceSessionId(saved.sessionId);
        failedWritesRef.current = false;
        setSnapshotSaveState("clean");
        setSaveError(null);
        return true;
      })
      .catch((error: unknown) => {
        if (stateGenerationRef.current === generation) {
          failedWritesRef.current = true;
          setSnapshotSaveState("failed");
          setSaveError(error instanceof Error ? error.message : "The run could not be saved.");
        }
        return false;
      })
      .finally(() => {
        initialSaveInFlightRef.current = false;
        if (stateGenerationRef.current === generation) setSaving(false);
      });
    initialSavePromiseRef.current = attempt;
    return attempt;
  }, [
    isDemo,
    context,
    prediction,
    courseCode,
    courseTitle,
    replaceAnswers,
    replaceClusters,
    replacePacks,
    replaceSessionId,
  ]);

  const setReteachPack = useCallback(
    (clusterId: string, pack: ReteachPack) => {
      if (initialSaveInFlightRef.current) return;
      replacePacks((items) => ({ ...items, [clusterId]: pack }));
    },
    [replacePacks],
  );

  useEffect(() => {
    if (isDemo || !storageOwnerKey) return;
    const run: StoredRun = {
      answers,
      clusters,
      reteachPacks,
      context,
      prediction,
      sessionId,
      courseCode,
      courseTitle,
      ownerKey: storageOwnerKey,
      saveState: snapshotSaveState,
      saveError,
    };
    try {
      window.sessionStorage.setItem(
        `${STORAGE_PREFIX}${storageOwnerKey}`,
        JSON.stringify(run),
      );
    } catch {
      // Remote persistence remains authoritative when browser storage is
      // blocked or full; Saved sessions can still recover the run.
    }
  }, [
    isDemo,
    storageOwnerKey,
    answers,
    clusters,
    reteachPacks,
    context,
    prediction,
    sessionId,
    courseCode,
    courseTitle,
    snapshotSaveState,
    saveError,
  ]);

  const criterionLabel = useCallback(
    (id: string) => context.criteria.find((criterion) => criterion.id === id)?.label ?? id,
    [context.criteria],
  );
  const updatePrediction = useCallback((value: string) => {
    if (initialSaveInFlightRef.current) return;
    setPrediction(value);
  }, []);
  const reviewedCount = useMemo(
    () => answers.filter((answer) => answer.status !== "unreviewed").length,
    [answers],
  );
  const needsAttention = useMemo(
    () =>
      answers.filter(
        (answer) => answer.status === "unreviewed" && answer.confidence < CONFIDENCE_THRESHOLD,
      ).length,
    [answers],
  );
  const flaggedCount = useMemo(
    () => answers.filter((answer) => answer.status === "flagged").length,
    [answers],
  );
  const blockedCount = useMemo(
    () =>
      answers.filter(
        (answer) => answer.status === "unreviewed" || answer.status === "flagged",
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
      exportReady: answers.length > 0 && blockedCount === 0,
      blockedCount,
      flaggedCount,
      isDemo,
      sessionId,
      context,
      pendingRun,
      reteachPacks,
      totalAnswers: answers.length,
      courseCode,
      courseTitle,
      saving,
      saveError,
      flushChanges,
      retrySave,
      previewDemo,
      criterionLabel,
      setScore,
      setStatus,
      acceptAbove,
      resetReview,
      renameCluster,
      rejectCluster,
      mergeCluster,
      splitOut,
      setPrediction: updatePrediction,
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
      blockedCount,
      flaggedCount,
      isDemo,
      sessionId,
      context,
      pendingRun,
      reteachPacks,
      courseCode,
      courseTitle,
      saving,
      saveError,
      flushChanges,
      retrySave,
      previewDemo,
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
      updatePrediction,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
