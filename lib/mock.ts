import { DISTANCE_THRESHOLD } from "./pipeline/cluster";
import type {
  Cluster,
  Criterion,
  ReteachPack,
  Session,
  Stage,
  StudentAnswer,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Seeded demo class                                                  */
/*  Real pilot answers are pseudonymised: initials only, invented IDs.  */
/* ------------------------------------------------------------------ */

export const CRITERIA: Criterion[] = [
  { id: "c-react", label: "Reactance term included", marks: 2 },
  { id: "c-quad", label: "Impedance combined in quadrature", marks: 3 },
  { id: "c-current", label: "Current obtained from V/Z", marks: 2 },
  { id: "c-phase", label: "Phase relationship addressed", marks: 2 },
  { id: "c-units", label: "Units stated throughout", marks: 1 },
];

export const SESSION: Session = {
  id: "demo-eee301",
  courseCode: "EEE 301",
  courseTitle: "Circuit Theory II",
  question:
    "A series RL circuit with R = 30 Ω and L = 0.10 H is connected across a 240 V, 50 Hz supply. Determine (a) the current drawn by the circuit and (b) the phase angle between the supply voltage and the current. Show your working.",
  criteria: CRITERIA,
  subject: "Electrical Engineering — AC circuit analysis",
  level: "300 level (Year 3)",
  maxScore: 10,
  prediction:
    "Most of them will forget to convert the frequency properly and mess up the 2πfL step.",
  isDemo: true,
  createdAt: "2026-08-31",
};

export const STAGES: Stage[] = [
  {
    id: "extract",
    label: "Reading answers against the marking scheme",
    detail: "One structured call per answer — false belief, evidence span, criteria awarded",
    weight: 46,
  },
  {
    id: "embed",
    label: "Embedding error signatures",
    detail: "Signatures only. Raw answers would cluster on writing style, not meaning",
    weight: 14,
  },
  {
    id: "cluster",
    label: "Clustering by cosine distance",
    detail: `Agglomerative, average linkage, threshold ${DISTANCE_THRESHOLD} — tuned on the pilot set`,
    weight: 12,
  },
  {
    id: "label",
    label: "Labelling each cluster",
    detail: "One canonical misconception per group, plus why students plausibly reach it",
    weight: 16,
  },
  {
    id: "damage",
    label: "Assessing downstream damage",
    detail: "Which later topics each false belief will break, and how badly",
    weight: 12,
  },
];

/* ------------------------------------------------------------------ */
/*  Answer templates, grouped by the belief behind them                */
/* ------------------------------------------------------------------ */

type Template = {
  answer: string;
  span: string;
  signature: string;
  score: number;
  met: string[];
  missed: string[];
  rationale: string;
};

const T_IMPEDANCE: Template[] = [
  {
    answer:
      "The opposition in the circuit is the resistance, so Z = R = 30 Ω. Therefore I = V/Z = 240/30 = 8 A. The phase angle is 0° because the current and the voltage rise together.",
    span: "The opposition in the circuit is the resistance, so Z = R = 30 Ω",
    signature: "believes impedance and resistance are interchangeable quantities",
    score: 2,
    met: ["c-current", "c-units"],
    missed: ["c-react", "c-quad", "c-phase"],
    rationale:
      "Applies I = V/Z correctly and states units, but substitutes R for Z, so no reactance or quadrature credit.",
  },
  {
    answer:
      "R = 30 ohm. Impedance is just another name for resistance so Z = 30 ohm. I = 240/30 = 8 A. Phase angle = 0 degrees.",
    span: "Impedance is just another name for resistance so Z = 30 ohm",
    signature: "believes impedance is a synonym for resistance in AC circuits",
    score: 2,
    met: ["c-current", "c-units"],
    missed: ["c-react", "c-quad", "c-phase"],
    rationale: "Correct division and units; the substitution step rests on a conceptual error.",
  },
  {
    answer:
      "X_L = 2 × 3.142 × 50 × 0.1 = 31.4 Ω. But the current only depends on the resistance, so I = 240/30 = 8 A. Angle = 46.3°.",
    span: "the current only depends on the resistance",
    signature:
      "believes reactance does not contribute to the opposition that limits current",
    score: 4,
    met: ["c-react", "c-units", "c-phase"],
    missed: ["c-quad", "c-current"],
    rationale:
      "Reactance recalled and computed correctly, then discarded at the point where it matters.",
  },
  {
    answer:
      "I = V/R = 240/30 = 8 amps. Z and R are the same thing for this circuit. φ = tan⁻¹(31.4/30) = 46.3°.",
    span: "Z and R are the same thing for this circuit",
    signature: "believes impedance and resistance are interchangeable quantities",
    score: 3,
    met: ["c-phase", "c-units"],
    missed: ["c-react", "c-quad", "c-current"],
    rationale: "Phase angle formula applied correctly despite the impedance error.",
  },
  {
    answer:
      "Since it is a series circuit the total opposition is the resistance, 30 Ω, giving I = 8 A. The inductor does not oppose current, it only stores energy.",
    span: "The inductor does not oppose current, it only stores energy",
    signature:
      "believes an inductor stores energy without opposing current flow in AC",
    score: 2,
    met: ["c-current", "c-units"],
    missed: ["c-react", "c-quad", "c-phase"],
    rationale: "States a physical justification for the error, which makes the belief explicit.",
  },
];

const T_ARITHMETIC: Template[] = [
  {
    answer:
      "X_L = 2πfL = 2(3.142)(50)(0.1) = 31.42 Ω. Z = R + X_L = 30 + 31.42 = 61.42 Ω. I = 240/61.42 = 3.91 A. φ = tan⁻¹(31.42/30) = 46.3°.",
    span: "Z = R + X_L = 30 + 31.42 = 61.42 Ω",
    signature:
      "believes reactance adds arithmetically to resistance rather than in quadrature",
    score: 6,
    met: ["c-react", "c-current", "c-phase", "c-units"],
    missed: ["c-quad"],
    rationale:
      "Every step correct except the combination rule; the method is otherwise complete.",
  },
  {
    answer:
      "Reactance = 31.4 Ω, resistance = 30 Ω, so total impedance = 61.4 Ω. I = 240/61.4 = 3.9 A. The angle is 46°.",
    span: "total impedance = 61.4 Ω",
    signature:
      "believes reactance adds arithmetically to resistance rather than in quadrature",
    score: 6,
    met: ["c-react", "c-current", "c-phase", "c-units"],
    missed: ["c-quad"],
    rationale: "Same scalar-addition error; all other criteria satisfied.",
  },
  {
    answer:
      "In a series circuit things add up, so Z = 30 + 31.4 = 61.4 Ω. Current = 3.91 A. Phase angle 46 degrees.",
    span: "In a series circuit things add up, so Z = 30 + 31.4 = 61.4 Ω",
    signature:
      "believes series AC quantities sum directly the way series resistances do",
    score: 5,
    met: ["c-react", "c-current", "c-phase"],
    missed: ["c-quad", "c-units"],
    rationale: "Reasoning stated explicitly; units omitted on the final answers.",
  },
  {
    answer:
      "X_L = 31.42 Ω. Adding this to R gives 61.42 Ω as the impedance, so the current is 240 ÷ 61.42 = 3.9 A lagging.",
    span: "Adding this to R gives 61.42 Ω as the impedance",
    signature:
      "believes reactance adds arithmetically to resistance rather than in quadrature",
    score: 6,
    met: ["c-react", "c-current", "c-phase", "c-units"],
    missed: ["c-quad"],
    rationale: "Recognises the lagging relationship but combines the terms as scalars.",
  },
];

const T_PHASE: Template[] = [
  {
    answer:
      "X_L = 31.42 Ω. Z = √(30² + 31.42²) = 43.44 Ω. I = 240/43.44 = 5.53 A. The phase angle is between the current and the resistance, = tan⁻¹(31.42/30) = 46.3°.",
    span: "The phase angle is between the current and the resistance",
    signature:
      "believes the phase angle is measured between current and resistance rather than between voltage and current",
    score: 8,
    met: ["c-react", "c-quad", "c-current", "c-units"],
    missed: ["c-phase"],
    rationale:
      "Numerically correct throughout; the quantity the angle describes is misidentified.",
  },
  {
    answer:
      "Z = 43.43 Ω and I = 5.53 A. φ = 46.3°, which is the angle the current makes with R in the impedance triangle.",
    span: "the angle the current makes with R in the impedance triangle",
    signature:
      "believes the phase angle relates the current to the resistance vector, not to the supply voltage",
    score: 8,
    met: ["c-react", "c-quad", "c-current", "c-units"],
    missed: ["c-phase"],
    rationale: "Right number, wrong referent — the impedance triangle is read as a phasor diagram.",
  },
  {
    answer:
      "Working: X_L = 31.4, Z = 43.4 Ω, I = 5.53 A. The angle is measured from the resistance axis to the current, giving 46.3°.",
    span: "The angle is measured from the resistance axis to the current",
    signature:
      "believes the phase angle is measured between current and resistance rather than between voltage and current",
    score: 8,
    met: ["c-react", "c-quad", "c-current", "c-units"],
    missed: ["c-phase"],
    rationale: "Consistent with the impedance-triangle reading of the phasor diagram.",
  },
];

const T_OTHER: Template[] = [
  {
    answer:
      "X_L = 2πfL = 2 × 3.142 × 50 × 0.1 = 31.42 Ω. Z = √(900 + 987.2) = 43.4 Ω. I = 240/43.4 = 5.5. I ran out of time here.",
    span: "I ran out of time here",
    signature: "no conceptual error identified — answer incomplete",
    score: 7,
    met: ["c-react", "c-quad", "c-current"],
    missed: ["c-phase", "c-units"],
    rationale: "Method sound as far as it goes; the phase part is simply absent.",
  },
  {
    answer:
      "L = 0.1 H = 100 mH, so X_L = 2πf × 100 = 31 420 Ω. Z is then about 31 420 Ω and I = 0.0076 A.",
    span: "L = 0.1 H = 100 mH, so X_L = 2πf × 100 = 31 420 Ω",
    signature: "carries a millihenry value into a formula expecting henries",
    score: 3,
    met: ["c-quad", "c-current"],
    missed: ["c-react", "c-phase", "c-units"],
    rationale: "Structure of the method is correct; a unit conversion invalidates every value.",
  },
  {
    answer:
      "Z = √(30² + 31.42²) = 43.44 Ω, I = V/Z = 240/43.44 = 5.53 mA, φ = 46.3°.",
    span: "I = V/Z = 240/43.44 = 5.53 mA",
    signature: "attaches a milliampere unit to an ampere-scale result",
    score: 8,
    met: ["c-react", "c-quad", "c-current", "c-phase"],
    missed: ["c-units"],
    rationale: "Fully correct method and phase treatment; the current unit is wrong by 10³.",
  },
  {
    answer:
      "The circuit is a series RL circuit connected to a 240 V, 50 Hz supply with R = 30 Ω and L = 0.1 H. We are asked for the current and the phase angle.",
    span: "We are asked for the current and the phase angle",
    signature: "no attempt at solution — question restated",
    score: 0,
    met: [],
    missed: ["c-react", "c-quad", "c-current", "c-phase", "c-units"],
    rationale: "The question is restated; no method is offered.",
  },
];

const T_CORRECT: Template[] = [
  {
    answer:
      "X_L = 2πfL = 2π(50)(0.10) = 31.42 Ω. Z = √(R² + X_L²) = √(900 + 987.2) = 43.44 Ω. I = V/Z = 240/43.44 = 5.52 A. φ = tan⁻¹(X_L/R) = tan⁻¹(31.42/30) = 46.3°, with the current lagging the supply voltage.",
    span: "",
    signature: "",
    score: 10,
    met: ["c-react", "c-quad", "c-current", "c-phase", "c-units"],
    missed: [],
    rationale: "All five criteria satisfied, including the direction of the phase relationship.",
  },
  {
    answer:
      "Inductive reactance X_L = 2πfL = 31.4 Ω. The impedance combines in quadrature: Z = √(30² + 31.4²) = 43.4 Ω. Current I = 240/43.4 = 5.53 A. Phase angle φ = arctan(31.4/30) = 46.3° lagging.",
    span: "",
    signature: "",
    score: 10,
    met: ["c-react", "c-quad", "c-current", "c-phase", "c-units"],
    missed: [],
    rationale: "Complete and correct, with the quadrature combination named explicitly.",
  },
  {
    answer:
      "X_L = 31.42 Ω; Z = √(30² + 31.42²) = 43.44 Ω; I = 5.52 A; φ = 46.3° (current lags voltage).",
    span: "",
    signature: "",
    score: 9,
    met: ["c-react", "c-quad", "c-current", "c-phase", "c-units"],
    missed: [],
    rationale: "Correct throughout, though the working is compressed to bare results.",
  },
  {
    answer:
      "Using phasors: Z = R + jX_L = 30 + j31.42 Ω, |Z| = 43.44 Ω, ∠Z = 46.3°. Then I = 240/43.44 = 5.52 A lagging the voltage by 46.3°.",
    span: "",
    signature: "",
    score: 10,
    met: ["c-react", "c-quad", "c-current", "c-phase", "c-units"],
    missed: [],
    rationale: "Complex-form solution; every criterion satisfied.",
  },
];

/* ------------------------------------------------------------------ */
/*  Clusters                                                           */
/* ------------------------------------------------------------------ */

/*
 * x and y are real projections of this class's own error signatures onto the
 * plane, produced by `npm run pipeline:demo-positions` — not decorative
 * coordinates. Baked in so the seeded demo shows the embedding-space map
 * (PRD §7.4) with no API key set, which is what keeps the live URL working
 * if an environment variable goes missing.
 *
 * Re-run that script if the seeded signatures change.
 */
const CLUSTER_SPEC: Omit<Cluster, "memberIds">[] = [
  {
    id: "cl-impedance",
    tone: 1,
    label: "Impedance and resistance are the same quantity",
    why: "Every circuit these students have solved before this term had a single number for opposition, called R. Nothing in that experience signals that AC introduces a second term at right angles to the first.",
    severity: 3,
    downstream: [
      "Series and parallel resonance",
      "Power factor correction",
      "Apparent vs. real power",
    ],
    isOther: false,
    x: 0.9233,
    y: 0.8912,
  },
  {
    id: "cl-arithmetic",
    tone: 2,
    label: "Reactance adds to resistance arithmetically, not in quadrature",
    why: "These students know reactance belongs in the answer and put it there. They carry over scalar addition from resistor networks, where series quantities genuinely do sum directly.",
    severity: 5,
    downstream: [
      "Phasor diagrams",
      "Complex power and the power triangle",
      "Three-phase load balancing",
      "Transmission line modelling",
    ],
    isOther: false,
    x: 1.0,
    y: 0.1088,
  },
  {
    id: "cl-phase",
    tone: 3,
    label: "The phase angle is between current and resistance, not voltage and current",
    why: "The formula arctan(X_L/R) contains R, so the angle is read as belonging to the resistance. The impedance triangle is being interpreted as though it were a phasor diagram.",
    severity: 4,
    downstream: ["Power factor correction", "Phasor diagrams"],
    isOther: false,
    x: 0.0,
    y: 0.4532,
  },
  {
    id: "cl-other",
    tone: 0,
    label: "Other / one-off errors",
    why: "Signatures that did not group with any other answer. Kept together so they stay reviewable without implying a shared cause.",
    severity: 1,
    downstream: [],
    isOther: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Build the class                                                    */
/* ------------------------------------------------------------------ */

const INITIALS = [
  "A.O.", "B.K.", "C.N.", "D.A.", "E.U.", "F.I.", "G.M.", "H.T.", "I.S.", "J.E.",
  "K.R.", "L.B.", "M.C.", "N.D.", "O.F.", "P.G.", "Q.H.", "R.J.", "S.L.", "T.P.",
  "U.V.", "V.W.", "W.Y.", "X.Z.", "Y.A.", "Z.B.", "A.C.", "B.D.", "C.E.", "D.F.",
  "E.G.", "F.H.", "G.I.", "H.J.", "I.K.", "J.L.", "K.M.", "L.N.", "M.O.", "N.P.",
];

/** Deterministic jitter so server and client render identical values. */
function jitter(i: number, span: number, offset = 0) {
  return ((i * 37 + offset * 13) % span) / span;
}

/**
 * A stable, token-shaped id for the seeded class.
 *
 * Real tokens come from the database and are 128 bits of CSPRNG, because they
 * are the only credential on a student's diagnostic. These are deterministic
 * on purpose: the demo has to work with no database at all, and a link that
 * changed on every reload could not be printed in a script or opened twice.
 * The class behind them is pseudonymous, so there is nothing here to protect.
 */
function demoToken(index: number): string {
  let hash = 0x9e3779b9 ^ (index * 0x85ebca6b);
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491) >>> 0;
    out += hash.toString(16).padStart(8, "0");
  }
  return out;
}

function buildClass(): { answers: StudentAnswer[]; clusters: Cluster[] } {
  const groups: { clusterId: string | null; templates: Template[]; count: number }[] = [
    { clusterId: "cl-impedance", templates: T_IMPEDANCE, count: 15 },
    { clusterId: "cl-arithmetic", templates: T_ARITHMETIC, count: 11 },
    { clusterId: "cl-phase", templates: T_PHASE, count: 6 },
    { clusterId: "cl-other", templates: T_OTHER, count: 4 },
    { clusterId: null, templates: T_CORRECT, count: 4 },
  ];

  const answers: StudentAnswer[] = [];
  const members: Record<string, string[]> = {};
  let i = 0;

  for (const group of groups) {
    for (let n = 0; n < group.count; n++) {
      const t = group.templates[n % group.templates.length];
      const id = `a-${String(i + 1).padStart(2, "0")}`;
      const isCorrect = group.clusterId === null;

      // Low confidence concentrates in the one-off bucket and on boundary scores.
      let confidence: number;
      if (group.clusterId === "cl-other") confidence = 0.41 + jitter(i, 20) * 0.22;
      else if (isCorrect) confidence = 0.9 + jitter(i, 9) * 0.09;
      else confidence = 0.71 + jitter(i, 27) * 0.27;

      const scoreShift = group.clusterId === null ? 0 : (i % 5 === 3 ? -1 : 0);
      const score = Math.max(0, Math.min(10, t.score + scoreShift));

      answers.push({
        id,
        studentId: `EEE/022/${String(103 + i * 2).padStart(4, "0")}`,
        initials: INITIALS[i % INITIALS.length],
        answer: t.answer,
        isCorrect,
        clusterId: group.clusterId,
        errorSignature: isCorrect ? null : t.signature,
        evidenceSpan: isCorrect ? null : t.span,
        confidence: Math.round(confidence * 100) / 100,
        provisionalScore: score,
        maxScore: 10,
        criteriaMet: t.met,
        criteriaMissed: t.missed,
        scoreRationale: t.rationale,
        status: "unreviewed",
        diagnosticToken: demoToken(i),
      });

      if (group.clusterId) {
        members[group.clusterId] = members[group.clusterId] ?? [];
        members[group.clusterId].push(id);
      }
      i++;
    }
  }

  const clusters: Cluster[] = CLUSTER_SPEC.map((spec) => ({
    ...spec,
    memberIds: members[spec.id] ?? [],
  }));

  return { answers, clusters };
}

const built = buildClass();

export const ANSWERS: StudentAnswer[] = built.answers;
export const CLUSTERS: Cluster[] = built.clusters;
export const CORRECT_ANSWERS = ANSWERS.filter((a) => a.isCorrect);
export const TOTAL_ANSWERS = ANSWERS.length;

/* ------------------------------------------------------------------ */
/*  Reteach packs                                                      */
/* ------------------------------------------------------------------ */

export const RETEACH_PACKS: Record<string, ReteachPack> = {
  "cl-arithmetic": {
    clusterId: "cl-arithmetic",
    lesson: [
      {
        heading: "The belief, said plainly",
        body: "You added the reactance to the resistance: Z = 30 + 31.4 = 61.4 Ω. Hold on to that number for a moment — we are going to find out exactly where it comes from and exactly where it fails.",
      },
      {
        heading: "Why it is a reasonable thing to believe",
        body: "For a whole year, every series circuit you met obeyed one rule: things in series add. Two 30 Ω resistors in series make 60 Ω. That rule has never once let you down, and reactance is measured in ohms, drawn in the same diagram, and sits in the same series loop. Adding it is not carelessness. It is the correct rule, applied one topic past its edge.",
      },
      {
        heading: "Where it breaks",
        body: "Resistors and inductors do not oppose current at the same instant. The voltage across a resistor peaks when the current peaks. The voltage across an inductor peaks a quarter-cycle earlier, when the current is still zero and rising fastest. Two peaks that never coincide cannot be added as plain numbers — you would be summing quantities that are never simultaneously at their maximum.\n\nThat quarter-cycle is 90°. Put R along one axis and X_L along a perpendicular axis, and the total is the hypotenuse: Z = √(R² + X_L²) = √(900 + 987) = 43.4 Ω, not 61.4 Ω.",
      },
      {
        heading: "The check that catches it every time",
        body: "Impedance can never exceed R + X_L, and can never be smaller than either one alone. If your Z equals the sum exactly, you have added two things that are 90° apart. Say out loud: \"do these two peak together?\" If no, it is a hypotenuse, not a sum.",
      },
    ],
    diagnostics: [
      {
        prompt:
          "A series RL circuit has R = 40 Ω and X_L = 30 Ω. Without a calculator, state whether the impedance is less than 50 Ω, exactly 50 Ω, or 70 Ω — and justify your choice in one sentence.",
        holderAnswers:
          "70 Ω — \"the two are in series, so they add.\" The scalar-addition belief produces this answer immediately and confidently.",
        correctedAnswers:
          "Exactly 50 Ω — recognising the 3–4–5 triangle, and justifying it by the 90° phase separation rather than by the arithmetic.",
      },
      {
        prompt:
          "A student computes the impedance of a series RL circuit and gets a value larger than R + X_L. Explain in one sentence why this result must be wrong, whatever the numbers were.",
        holderAnswers:
          "Cannot answer, or says the value is fine — with no ceiling on Z in mind, there is nothing for the result to violate.",
        correctedAnswers:
          "The hypotenuse of a right triangle is always shorter than the sum of the other two sides, so Z < R + X_L always.",
      },
    ],
  },
  "cl-impedance": {
    clusterId: "cl-impedance",
    lesson: [
      {
        heading: "The belief, said plainly",
        body: "You treated Z and R as the same quantity — that the opposition in this circuit is 30 Ω, and the inductor is along for the ride.",
      },
      {
        heading: "Why it is a reasonable thing to believe",
        body: "In every DC circuit you have solved, opposition to current was one number with one name. An inductor in a DC steady state really does behave like a piece of wire. If your mental model of an inductor was built in DC, it is not obviously wrong here — it is out of date.",
      },
      {
        heading: "Where it breaks",
        body: "An inductor opposes a *change* in current, and in a 50 Hz supply the current changes direction a hundred times a second. That opposition has a size: X_L = 2πfL = 31.4 Ω — larger, in this circuit, than the resistance itself. Ignoring it does not cause a small error. It gives 8 A instead of 5.5 A: a 45% overestimate of the current the circuit actually draws.",
      },
      {
        heading: "The one-line correction",
        body: "R opposes current. X_L opposes change in current. Z is what you get when you combine them, and only Z belongs in I = V/Z.",
      },
    ],
    diagnostics: [
      {
        prompt:
          "The same RL circuit is connected first to a 240 V DC supply, then to a 240 V, 50 Hz AC supply. Will the steady current be the same in both cases? Answer yes or no and give the reason.",
        holderAnswers:
          "Yes, the same — because they see one opposition, R, unchanged by the supply type.",
        correctedAnswers:
          "No: 8 A on DC, 5.5 A on AC, because X_L is zero at DC and 31.4 Ω at 50 Hz.",
      },
      {
        prompt:
          "The supply frequency is doubled to 100 Hz, everything else unchanged. Does the current increase, decrease, or stay the same?",
        holderAnswers:
          "Stays the same — frequency has no route into the answer if opposition is just R.",
        correctedAnswers:
          "Decreases, because X_L doubles to 62.8 Ω, raising Z and so lowering I.",
      },
    ],
  },
  "cl-phase": {
    clusterId: "cl-phase",
    lesson: [
      {
        heading: "The belief, said plainly",
        body: "Your arithmetic was right — 46.3° is the correct number. But you described it as the angle between the current and the resistance. It is the angle between the supply voltage and the current.",
      },
      {
        heading: "Why it is a reasonable thing to believe",
        body: "The formula is arctan(X_L / R). R is sitting right there in it, so the angle looks like it belongs to R. And the impedance triangle you drew has R along the bottom, which makes it look exactly like a phasor diagram with R as the reference.",
      },
      {
        heading: "Where it breaks",
        body: "The two diagrams have different axes. The impedance triangle plots ohms against ohms — R, X_L, Z. The phasor diagram plots voltages and currents against time. They happen to be similar triangles, which is why the same arctan works for both, and that coincidence is what makes this so easy to confuse.\n\nA phase angle is only ever between two things that vary with time. Resistance does not vary with time, so nothing can have a phase angle with respect to it.",
      },
      {
        heading: "The test",
        body: "Before naming any phase angle, ask: are both of these quantities waveforms? If one of them is a component value, you have named the wrong pair.",
      },
    ],
    diagnostics: [
      {
        prompt:
          "In a purely resistive AC circuit, what is the phase angle between voltage and current, and what is the angle 'between the current and the resistance'?",
        holderAnswers:
          "Attempts a number for the second part, treating resistance as something an angle can be measured against.",
        correctedAnswers:
          "0° for the first; the second question is not meaningful, because resistance is not a time-varying quantity.",
      },
      {
        prompt:
          "Sketch the phasor diagram for this circuit and label which quantity is taken as the reference and why.",
        holderAnswers: "Labels R as the reference phasor, importing the impedance triangle wholesale.",
        correctedAnswers:
          "Takes the current as the reference (common to both elements in series) and shows V lagging by 46.3°.",
      },
    ],
  },
  "cl-other": {
    clusterId: "cl-other",
    lesson: [
      {
        heading: "No shared belief to teach against",
        body: "These four answers did not group with each other. Each failed for its own reason — an incomplete attempt, a millihenry conversion, a unit slip, and a restatement of the question. A single reteach lesson would not fit them, and generating one would imply a pattern that is not there.",
      },
      {
        heading: "What to do instead",
        body: "Open the cluster, read the four answers, and handle them individually. If two of them turn out to share a cause you can see but the model did not, split them out into a named cluster and the reteach pack becomes available.",
      },
    ],
    diagnostics: [],
  },
};

/* ------------------------------------------------------------------ */
/*  Derived helpers                                                    */
/* ------------------------------------------------------------------ */

export function clusterById(id: string) {
  return CLUSTERS.find((c) => c.id === id);
}

export function answersFor(clusterId: string) {
  return ANSWERS.filter((a) => a.clusterId === clusterId);
}

export function spreadPct(cluster: Cluster) {
  return (cluster.memberIds.length / TOTAL_ANSWERS) * 100;
}

export function damageScore(cluster: Cluster) {
  return cluster.severity * cluster.memberIds.length;
}

export function criterionLabel(id: string) {
  return CRITERIA.find((c) => c.id === id)?.label ?? id;
}

export const CONFIDENCE_THRESHOLD = 0.7;
