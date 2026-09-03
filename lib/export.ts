import type { Cluster, Criterion, StudentAnswer } from "./types";

export interface ExportRow {
  studentId: string;
  initials: string;
  score: number;
  max: number;
  percentage: number;
  misconception: string;
  criteriaMissed: string;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  unreviewed: "Unreviewed",
  accepted: "Accepted",
  edited: "Edited by lecturer",
  flagged: "Flagged",
};

/**
 * Flattens a run into the rows both export formats share.
 *
 * `criteria` is this run's own scheme. Resolving ids against the seeded demo
 * scheme instead printed the raw id for every lecturer who wrote their own
 * criteria — which reads on a registry spreadsheet as an unexplained
 * deduction, in the one artefact that leaves the building.
 */
export function buildRows(
  answers: StudentAnswer[],
  clusters: Cluster[],
  criteria: Criterion[] = [],
): ExportRow[] {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const labelOf = new Map(criteria.map((c) => [c.id, c.label]));
  return answers.map((a) => ({
    studentId: a.studentId,
    initials: a.initials,
    score: a.provisionalScore,
    max: a.maxScore,
    percentage: Math.round((a.provisionalScore / a.maxScore) * 1000) / 10,
    misconception: a.clusterId
      ? (byId.get(a.clusterId)?.label ?? "Unassigned")
      : "None — answer correct",
    criteriaMissed: a.criteriaMissed
      .map((id) => labelOf.get(id) ?? id)
      .join("; "),
    status: STATUS_LABEL[a.status] ?? a.status,
  }));
}

export interface ClassStats {
  mean: number;
  median: number;
  passRate: number;
  distribution: { band: string; count: number }[];
}

export function classStats(rows: ExportRow[]): ClassStats {
  const scores = rows.map((r) => r.score).sort((a, b) => a - b);
  const n = Math.max(1, scores.length);
  const mean = scores.reduce((s, x) => s + x, 0) / n;
  const median =
    scores.length === 0
      ? 0
      : scores.length % 2
        ? scores[(scores.length - 1) / 2]
        : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2;
  const passRate = (rows.filter((r) => r.percentage >= 40).length / n) * 100;

  // Bands are derived from the paper's own maximum rather than fixed to 0-10.
  // Fixed bands silently dropped every score above ten, so a 20-mark paper
  // exported a distribution that did not add up to the size of the class.
  const max = Math.max(1, ...rows.map((r) => r.max));
  const BAND_COUNT = 5;
  const bands = Array.from({ length: BAND_COUNT }, (_, i) => {
    const lo = Math.round((max * i) / BAND_COUNT) + (i === 0 ? 0 : 1);
    const hi = Math.round((max * (i + 1)) / BAND_COUNT);
    return { band: lo === hi ? `${lo}` : `${lo}–${hi}`, lo, hi };
  });

  return {
    mean,
    median,
    passRate,
    distribution: bands.map((b, i) => ({
      band: b.band,
      // The top band absorbs anything at or above its floor, so a score can
      // never fall outside every band and vanish from the summary.
      count: rows.filter((r) =>
        i === bands.length - 1
          ? r.score >= b.lo
          : r.score >= b.lo && r.score <= b.hi,
      ).length,
    })),
  };
}

export function provenanceLine(lecturer: string) {
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `Scores generated with AI assistance and confirmed by ${lecturer} on ${date}.`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------- .xlsx -------------------------------- */

export async function downloadXlsx(
  rows: ExportRow[],
  stats: ClassStats,
  meta: { courseCode: string; question: string; lecturer: string },
) {
  const XLSX = await import("xlsx");

  const header = [
    "Student ID",
    "Name",
    "Score",
    "Max",
    "Percentage",
    "Misconception cluster",
    "Criteria missed",
    "Review status",
  ];

  const body = rows.map((r) => [
    r.studentId,
    r.initials,
    r.score,
    r.max,
    r.percentage,
    r.misconception,
    r.criteriaMissed,
    r.status,
  ]);

  const summary = [
    [],
    ["Class summary"],
    ["Mean", Number(stats.mean.toFixed(2))],
    ["Median", stats.median],
    ["Pass rate (%)", Number(stats.passRate.toFixed(1))],
    ["Students", rows.length],
    [],
    ["Distribution", ...stats.distribution.map((d) => d.band)],
    ["Count", ...stats.distribution.map((d) => d.count)],
    [],
    [provenanceLine(meta.lecturer)],
  ];

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body, ...summary]);
  sheet["!cols"] = [
    { wch: 16 }, { wch: 8 }, { wch: 7 }, { wch: 6 },
    { wch: 11 }, { wch: 52 }, { wch: 46 }, { wch: 18 },
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Scores");
  XLSX.writeFile(book, `${meta.courseCode.replace(/\s+/g, "-")}-scores.xlsx`);
}

/* ------------------------------- .docx -------------------------------- */

export async function downloadDocx(
  rows: ExportRow[],
  stats: ClassStats,
  meta: {
    courseCode: string;
    courseTitle: string;
    question: string;
    lecturer: string;
    topMisconceptions: { label: string; count: number; pct: number }[];
  },
) {
  const {
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    HeadingLevel,
    WidthType,
    AlignmentType,
    BorderStyle,
  } = await import("docx");

  const cell = (text: string, bold = false) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold, size: 19 })],
        }),
      ],
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
    });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell("Student ID", true),
          cell("Name", true),
          cell("Score", true),
          cell("%", true),
          cell("Misconception", true),
          cell("Status", true),
        ],
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [
              cell(r.studentId),
              cell(r.initials),
              cell(`${r.score}/${r.max}`),
              cell(`${r.percentage}`),
              cell(r.misconception),
              cell(r.status),
            ],
          }),
      ),
    ],
  });

  const topList = meta.topMisconceptions
    .map((m) => `“${m.label}” (${m.count} students, ${m.pct.toFixed(0)}%)`)
    .join("; ");

  const summaryText =
    `${rows.length} answers were marked for ${meta.courseCode} — ${meta.courseTitle}. ` +
    `The class mean was ${stats.mean.toFixed(1)} out of ${rows[0]?.max ?? 10}, with a median of ${stats.median} ` +
    `and a pass rate of ${stats.passRate.toFixed(0)}%. ` +
    (topList
      ? `The misconceptions found were: ${topList}. Reteaching should begin with the largest of these, using the five-minute lesson and two-question diagnostic generated for it.`
      : `No shared misconceptions were found in this batch.`);

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `${meta.courseCode} — Score record`,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [new TextRun({ text: meta.courseTitle, italics: true, size: 22 })],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [new TextRun({ text: "Question", bold: true, size: 21 })],
          }),
          new Paragraph({ children: [new TextRun({ text: meta.question, size: 20 })] }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Class summary", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ children: [new TextRun({ text: summaryText, size: 20 })] }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Results", heading: HeadingLevel.HEADING_2 }),
          table,
          new Paragraph({ text: "" }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: provenanceLine(meta.lecturer),
                italics: true,
                size: 17,
                color: "666666",
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${meta.courseCode.replace(/\s+/g, "-")}-scores.docx`);
}
