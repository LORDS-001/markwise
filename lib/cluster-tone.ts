import type { Cluster } from "@/lib/types";

type ClusterTone = Cluster["tone"];

interface ClusterToneClasses {
  backgroundClass: string;
  foregroundClass: string;
}

const CLUSTER_TONE_CLASSES = {
  0: { backgroundClass: "bg-[var(--c0)]", foregroundClass: "text-on-c0" },
  1: { backgroundClass: "bg-[var(--c1)]", foregroundClass: "text-on-c1" },
  2: { backgroundClass: "bg-[var(--c2)]", foregroundClass: "text-on-c2" },
  3: { backgroundClass: "bg-[var(--c3)]", foregroundClass: "text-on-c3" },
  4: { backgroundClass: "bg-[var(--c4)]", foregroundClass: "text-on-c4" },
  5: { backgroundClass: "bg-[var(--c5)]", foregroundClass: "text-on-c5" },
  6: { backgroundClass: "bg-[var(--c6)]", foregroundClass: "text-on-c6" },
} as const satisfies Record<ClusterTone, ClusterToneClasses>;

export function clusterToneClasses(tone: ClusterTone): ClusterToneClasses {
  return CLUSTER_TONE_CLASSES[tone];
}
