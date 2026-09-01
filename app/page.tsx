"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  FileSpreadsheet,
  ImageIcon,
  Info,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Disclosure } from "@/components/disclosure";
import { Page } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Field,
  Input,
  Textarea,
  cn,
} from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { ANSWERS, CRITERIA, SESSION } from "@/lib/mock";

type InputMode = "paste" | "csv" | "photo";

const DEMO_PASTE = ANSWERS.map((a) => `${a.studentId} | ${a.answer}`).join("\n");

export default function SetupPage() {
  const router = useRouter();
  const { prediction, setPrediction, setProcessed } = useSession();

  const [question, setQuestion] = useState(SESSION.question);
  const [scheme, setScheme] = useState(
    "Full marks require the reactance computed from X_L = 2πfL, the impedance combined in quadrature as Z = √(R² + X_L²), the current from I = V/Z, the phase angle from φ = arctan(X_L/R) stated as the angle between supply voltage and current, and correct units throughout.",
  );
  const [criteria, setCriteria] = useState(
    CRITERIA.map((c) => ({ ...c })),
  );
  const [subject, setSubject] = useState(SESSION.subject);
  const [level, setLevel] = useState(SESSION.level);
  const [mode, setMode] = useState<InputMode>("paste");
  const [paste, setPaste] = useState(DEMO_PASTE);
  const [csvName, setCsvName] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState(0);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const answerCount = useMemo(() => {
    if (mode === "csv") return csvRows;
    return paste.split("\n").filter((l) => l.trim().length > 0).length;
  }, [mode, paste, csvRows]);

  const maxScore = criteria.reduce((sum, c) => sum + c.marks, 0);
  const ready =
    question.trim().length > 0 && scheme.trim().length > 0 && answerCount > 1;

  function loadDemo() {
    setQuestion(SESSION.question);
    setScheme(
      "Full marks require the reactance computed from X_L = 2πfL, the impedance combined in quadrature as Z = √(R² + X_L²), the current from I = V/Z, the phase angle from φ = arctan(X_L/R) stated as the angle between supply voltage and current, and correct units throughout.",
    );
    setCriteria(CRITERIA.map((c) => ({ ...c })));
    setSubject(SESSION.subject);
    setLevel(SESSION.level);
    setMode("paste");
    setPaste(DEMO_PASTE);
    setPrediction(SESSION.prediction ?? "");
    setCsvName(null);
    setCsvRows(0);
    setCsvError(null);
  }

  function clearAll() {
    setQuestion("");
    setScheme("");
    setCriteria([{ id: "c-1", label: "", marks: 1 }]);
    setSubject("");
    setLevel("");
    setPaste("");
    setPrediction("");
    setCsvName(null);
    setCsvRows(0);
    setCsvError(null);
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    setCsvError(null);
    if (!/\.csv$/i.test(file.name)) {
      setCsvError("That file isn't a .csv. Export your sheet as CSV and try again.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        setCsvName(file.name);
        setCsvRows(Math.max(0, rows.length - 1));
      } catch {
        setCsvError("That file couldn't be read. Try re-exporting it as CSV.");
      }
    };
    reader.onerror = () =>
      setCsvError("That file couldn't be read. Try re-exporting it as CSV.");
    reader.readAsText(file);
  }

  function run() {
    if (!ready) return;
    setProcessed(false);
    router.push("/processing");
  }

  return (
    <Page
      eyebrow="Step 1 of 7"
      title="Set up this marking session"
      lead="Add the assessment context, marking scheme, and student responses. Required fields are marked."
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <Trash2 size={15} strokeWidth={1.9} aria-hidden />
            Clear
          </Button>
          <Button variant="secondary" size="sm" onClick={loadDemo}>
            <RotateCcw size={15} strokeWidth={1.9} aria-hidden />
            Load demo class
          </Button>
        </>
      }
      aside={
        <>
          <Card>
            <CardHead title="Ready to preview" hint="Check the required inputs." />
            <div className="flex flex-col gap-5 px-5 py-5">
              <dl className="flex flex-col gap-3 text-[13.5px]">
                <Row label="Answers detected" value={answerCount ? `${answerCount}` : "—"} ok={answerCount > 1} />
                <Row label="Marking criteria" value={`${criteria.length}`} ok={criteria.length > 0} />
                <Row label="Marks available" value={`${maxScore}`} ok={maxScore > 0} />
                <Row
                  label="Prediction"
                  value={prediction.trim() ? "Entered" : "Skipped"}
                  ok={prediction.trim().length > 0}
                  muted={!prediction.trim()}
                />
              </dl>
              <div>
                <Button className="w-full" size="lg" disabled={!ready} onClick={run}>
                  <Sparkles size={17} strokeWidth={1.9} aria-hidden />
                  Preview sample analysis
                </Button>
                {!ready ? (
                  <p className="mt-2 text-center text-[12px] leading-snug text-ink-3">
                    Add a question, a marking scheme, and at least two answers.
                  </p>
                ) : (
                  <p className="mt-2 text-center text-[12px] leading-snug text-ink-3">
                    This prototype opens sample results. Nothing is submitted.
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card className="bg-brand-soft border-brand-line">
            <div className="px-5 py-4 flex gap-3">
              <Info size={17} strokeWidth={1.9} className="text-brand shrink-0 mt-0.5" aria-hidden />
              <div className="text-[13px] text-ink">
                <p className="font-semibold mb-1">This demo class is pseudonymised</p>
                <p className="text-ink-2">
                  This sample uses 40 pseudonymised volunteer answers. Names are replaced with
                  initials and student numbers are invented.
                </p>
              </div>
            </div>
          </Card>
        </>
      }
    >
      {/* --- Assessment context ---------------------------------------- */}
      <Card>
        <CardHead
          title="Assessment context"
          hint="Set the subject and level for this marking session."
        />
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
          <Field label="Subject" required htmlFor="subject" hint="Used to judge which later topics a belief will break.">
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Electrical Engineering — AC circuit analysis"
            />
          </Field>
          <Field label="Level" required htmlFor="level" hint="Sets the expected depth of the answer.">
            <Input
              id="level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="300 level (Year 3)"
            />
          </Field>
        </div>
      </Card>

      {/* --- Question ------------------------------------------------- */}
      <Card>
        <CardHead
          title="The question"
          hint="One question per session. Paste it exactly as the students saw it."
        />
        <div className="px-5 py-5">
          <Field label="Question text" required htmlFor="question">
            <Textarea
              id="question"
              rows={4}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="A series RL circuit with R = 30 Ω and L = 0.10 H is connected across a 240 V, 50 Hz supply…"
            />
          </Field>
        </div>
      </Card>

      {/* --- Marking scheme ------------------------------------------- */}
      <Card>
        <CardHead
          title="Marking scheme"
          hint="Every provisional score is awarded against these named criteria, never as a bare number."
          action={<Badge tone="brand">{maxScore} marks</Badge>}
        />
        <div className="px-5 py-5 flex flex-col gap-5">
          <Field label="Model answer or scheme" required htmlFor="scheme">
            <Textarea
              id="scheme"
              rows={4}
              value={scheme}
              onChange={(e) => setScheme(e.target.value)}
              placeholder="Describe what a full-mark answer contains…"
            />
          </Field>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold">Criteria</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCriteria((prev) => [
                    ...prev,
                    { id: `c-${Date.now().toString(36)}`, label: "", marks: 1 },
                  ])
                }
              >
                <Plus size={15} strokeWidth={2} aria-hidden />
                Add criterion
              </Button>
            </div>

            <ul className="flex flex-col gap-2">
              {criteria.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="label-caps text-ink-3 w-5 shrink-0 tnum">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Input
                    aria-label={`Criterion ${i + 1} description`}
                    value={c.label}
                    placeholder="e.g. Impedance combined in quadrature"
                    className="min-w-0 flex-1"
                    onChange={(e) =>
                      setCriteria((prev) =>
                        prev.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    aria-label={`Marks for criterion ${i + 1}`}
                    type="number"
                    min={0}
                    max={100}
                    value={c.marks}
                    onChange={(e) =>
                      setCriteria((prev) =>
                        prev.map((x) =>
                          x.id === c.id
                            ? { ...x, marks: Math.max(0, Number(e.target.value) || 0) }
                            : x,
                        ),
                      )
                    }
                    className="w-[74px] shrink-0 tnum text-center"
                  />
                  <button
                    onClick={() => setCriteria((prev) => prev.filter((x) => x.id !== c.id))}
                    disabled={criteria.length === 1}
                    aria-label={`Remove criterion ${i + 1}`}
                    className="grid place-items-center w-9 h-9 shrink-0 rounded-[10px] text-ink-3 hover:text-crit hover:bg-crit-soft disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <X size={16} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>

            <Disclosure
              title="Advanced marking guidance"
              description="How criteria and scheme detail affect the preview"
            >
              <p>
                Use one criterion for each independently awarded mark. Include accepted
                alternatives, required units, and method marks in the marking scheme.
              </p>
            </Disclosure>
          </div>
        </div>
      </Card>

      {/* --- Answers --------------------------------------------------- */}
      <Card>
        <CardHead
          title="Student answers"
          hint="One answer per line, or upload the sheet you already have."
          action={
            answerCount > 0 ? (
              <Badge tone={answerCount > 1 ? "ok" : "warn"}>{answerCount} detected</Badge>
            ) : null
          }
        />

        <div
          role="tablist"
          aria-label="Answer input method"
          className="flex gap-1 px-5 pt-4 border-b border-border"
        >
          {(
            [
              { id: "paste", label: "Paste", icon: ClipboardList },
              { id: "csv", label: "CSV upload", icon: FileSpreadsheet },
              { id: "photo", label: "Photos", icon: ImageIcon },
            ] as const
          ).map((t) => {
            const active = mode === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setMode(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-[13.5px] font-medium border-b-2 -mb-px transition-colors",
                  active
                    ? "border-brand text-brand"
                    : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                <Icon size={15} strokeWidth={1.9} aria-hidden />
                {t.label}
                {t.id === "photo" ? (
                  <span className="label-caps text-ink-3 ml-0.5">soon</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="px-5 py-5">
          {mode === "paste" ? (
            <Field
              label="Answers"
              hint="Format: student ID, a pipe, then the answer. One per line."
              htmlFor="paste"
              counter={`${answerCount} lines`}
            >
              <Textarea
                id="paste"
                rows={9}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                className="font-mono text-[13px]"
                placeholder={"EEE/022/0103 | Z = R = 30 Ω so I = 240/30 = 8 A…"}
              />
            </Field>
          ) : null}

          {mode === "csv" ? (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-2 border-2 border-dashed border-border-strong rounded-[16px] px-6 py-10 text-center hover:border-brand hover:bg-brand-soft/40 transition-colors"
              >
                <Upload size={22} strokeWidth={1.7} className="text-ink-3" aria-hidden />
                <span className="text-[14px] font-medium">Choose a CSV file</span>
                <span className="text-[13px] text-ink-2 max-w-[42ch]">
                  Two columns: student identifier and answer text. The header row is skipped.
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              {csvName ? (
                <div className="flex items-center gap-2 text-[13.5px]">
                  <FileSpreadsheet size={16} strokeWidth={1.9} className="text-brand" aria-hidden />
                  <span className="font-medium truncate">{csvName}</span>
                  <Badge tone="ok">{csvRows} rows</Badge>
                </div>
              ) : null}
              {csvError ? (
                <p className="text-[13px] text-crit" role="alert">
                  {csvError}
                </p>
              ) : null}
            </div>
          ) : null}

          {mode === "photo" ? (
            <div className="flex flex-col items-center gap-2 border border-dashed border-border-strong rounded-[16px] px-6 py-10 text-center">
              <ImageIcon size={22} strokeWidth={1.7} className="text-ink-3" aria-hidden />
              <p className="text-[14px] font-medium">Handwritten scripts aren&apos;t supported yet</p>
              <p className="text-[13px] text-ink-2 max-w-[46ch]">
                Photo OCR is on the roadmap. Typed and CSV input are the guaranteed path — use
                one of those for now.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setMode("csv")}>
                Upload a CSV instead
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {/* --- Prediction ------------------------------------------------ */}
      <Card className="border-brand-line bg-brand-soft/40">
        <div className="flex flex-col gap-3 px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="label-caps text-brand">Before you run it</span>
            <Badge tone="brand">Optional</Badge>
          </div>
          <label
            htmlFor="prediction"
            className="font-display text-[21px] sm:text-[24px] font-semibold leading-tight"
          >
            What do you think most of them got wrong?
          </label>
          <p className="text-[13.5px] text-ink-2 max-w-[62ch]">
            One line. You&apos;ll see it beside the actual top misconception when the run
            finishes. Skip it if you&apos;d rather not guess.
          </p>
          <Input
            id="prediction"
            value={prediction}
            onChange={(e) => setPrediction(e.target.value)}
            placeholder="They'll mix up the formula for reactance…"
            className="bg-surface text-[15px] h-11"
          />
        </div>
      </Card>

    </Page>
  );
}

function Row({
  label,
  value,
  ok,
  muted,
}: {
  label: string;
  value: string;
  ok?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd
        className={cn(
          "font-semibold tnum",
          muted ? "text-ink-3" : ok ? "text-ink" : "text-ink-3",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
