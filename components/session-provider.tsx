"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ANSWERS,
  CLUSTERS,
  CONFIDENCE_THRESHOLD,
  SESSION,
  TOTAL_ANSWERS,
} from "@/lib/mock";
import type { Cluster, ReviewStatus, SortMode, StudentAnswer } from "@/lib/types";

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
}

const Ctx = createContext<SessionState | null>(null);

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

  const setScore = useCallback((answerId: string, score: number) => {
    setAnswers((prev) =>
      prev.map((a) =>
        a.id === answerId
          ? {
              ...a,
              provisionalScore: Math.max(0, Math.min(a.maxScore, score)),
              status: score === a.provisionalScore ? a.status : "edited",
            }
          : a,
      ),
    );
  }, []);

  const setStatus = useCallback((answerId: string, status: ReviewStatus) => {
    setAnswers((prev) =>
      prev.map((a) => (a.id === answerId ? { ...a, status } : a)),
    );
  }, []);

  const acceptAbove = useCallback((threshold: number) => {
    setAnswers((prev) =>
      prev.map((a) =>
        a.status === "unreviewed" && a.confidence >= threshold
          ? { ...a, status: "accepted" }
          : a,
      ),
    );
  }, []);

  const resetReview = useCallback(() => {
    setAnswers((prev) => prev.map((a) => ({ ...a, status: "unreviewed" })));
    setConfirmed(false);
  }, []);

  const renameCluster = useCallback((clusterId: string, label: string) => {
    setClusters((prev) =>
      prev.map((c) => (c.id === clusterId ? { ...c, label } : c)),
    );
  }, []);

  /** Rejecting sends the members to the one-off bucket; nothing is deleted. */
  const rejectCluster = useCallback((clusterId: string) => {
    setClusters((prev) => {
      const target = prev.find((c) => c.id === clusterId);
      if (!target || target.isOther) return prev;
      return prev
        .map((c) =>
          c.isOther
            ? { ...c, memberIds: [...c.memberIds, ...target.memberIds] }
            : c,
        )
        .filter((c) => c.id !== clusterId);
    });
    setAnswers((prev) =>
      prev.map((a) =>
        a.clusterId === clusterId ? { ...a, clusterId: "cl-other" } : a,
      ),
    );
  }, []);

  const mergeCluster = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setClusters((prev) => {
      const source = prev.find((c) => c.id === sourceId);
      const target = prev.find((c) => c.id === targetId);
      if (!source || !target) return prev;
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
  }, []);

  const splitOut = useCallback(
    (clusterId: string, answerIds: string[], label: string) => {
      if (answerIds.length === 0) return;
      const newId = `cl-split-${Date.now().toString(36)}`;
      setClusters((prev) => {
        const source = prev.find((c) => c.id === clusterId);
        if (!source) return prev;
        const remaining = source.memberIds.filter(
          (id) => !answerIds.includes(id),
        );
        const usedTones = new Set(prev.map((c) => c.tone));
        const tone = ([1, 2, 3, 4, 5, 6] as const).find(
          (t) => !usedTones.has(t),
        );
        const next: Cluster = {
          id: newId,
          tone: tone ?? 6,
          label,
          why: "Split out by the lecturer from “" + source.label + "”.",
          memberIds: answerIds,
          severity: source.severity,
          downstream: source.downstream,
          isOther: false,
        };
        const updated = prev.map((c) =>
          c.id === clusterId ? { ...c, memberIds: remaining } : c,
        );
        const insertAt = updated.findIndex((c) => c.id === clusterId) + 1;
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
    },
    [],
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
      exportReady: reviewedCount === TOTAL_ANSWERS,
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
      setScore,
      setStatus,
      acceptAbove,
      resetReview,
      renameCluster,
      rejectCluster,
      mergeCluster,
      splitOut,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
