"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ClipboardList,
  FileSpreadsheet,
  ImageIcon,
  Info,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
  Users,
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
  Progress,
  Textarea,
  cn,
} from "@/components/ui";
import { useSession } from "@/components/session-provider";
import {
  answersFromCsv,
  answersFromPaste,
} from "@/lib/pipeline/parse-answers";
import type { RawAnswer } from "@/lib/pipeline/types";
import { createDemoSetupDraft, createEmptySetupDraft, type SetupDraft } from "@/lib/setup-draft";

type InputMode = "paste" | "csv" | "photo";

const ANSWER_INPUT_MODES = [
  { id: "paste", label: "Paste", icon: ClipboardList },
  { id: "csv", label: "CSV upload", icon: FileSpreadsheet },
  { id: "photo", label: "Photos", icon: ImageIcon },
] as const;

export default function SetupPage({ liveEnabled = false }: { liveEnabled?: boolean }) {
  const router = useRouter();
  const {
    setupDraft, setSetupDraft, startRun, previewDemo,
    setPrediction: setRunPrediction, isDemo: activeRunIsDemo, flushChanges,
  } = useSession();
  const {
    courseCode, courseTitle, question, scheme, criteria, subject, level,
    mode, paste, csvName, csvAnswers, prediction, isDemo: sampleDraft,
  } = setupDraft;

  function setField<K extends keyof SetupDraft>(key: K, value: SetStateAction<SetupDraft[K]>) {
    setSetupDraft((current) => ({
      ...current,
      [key]: typeof value === "function"
        ? (value as (previous: SetupDraft[K]) => SetupDraft[K])(current[key])
        : value,
      isDemo: false,
    }));
  }

  const setQuestion = (value: string) => setField("question", value);
  const setScheme = (value: string) => setField("scheme", value);
  const setCriteria = (value: SetStateAction<SetupDraft["criteria"]>) => setField("criteria", value);
  const setSubject = (value: string) => setField("subject", value);
  const setLevel = (value: string) => setField("level", value);
  const setMode = (value: InputMode) => setField("mode", value);
  const setPaste = (value: string) => setField("paste", value);
  const setPrediction = (value: string) => setField("prediction", value);
  const setCsvName = (value: string | null) => setField("csvName", value);
  const setCsvAnswers = (value: RawAnswer[]) => setField("csvAnswers", value);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const csvRows = csvAnswers.length;
  const fileRef = useRef<HTMLInputElement>(null);
  const csvReadGenerationRef = useRef(0);
  const activeCsvReaderRef = useRef<FileReader | null>(null);
  const answerTabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Counted the same way the pipeline will read them, so the number shown on
  // screen is the number of answers that actually get marked.
  const answerCount = useMemo(() => {
    if (mode === "csv") return csvRows;
    if (mode === "photo") return 0;
    return answersFromPaste(paste).length;
  }, [mode, paste, csvRows]);

  const maxScore = criteria.reduce((sum, c) => sum + c.marks, 0);
  const namedCriteria = criteria.filter((c) => c.label.trim().length > 0).length;
  const validMarks = criteria.filter((c) => c.label.trim()).every(
    (c) => Number.isInteger(c.marks) && c.marks > 0 && c.marks <= 1000,
  );
  const ready =
    courseCode.trim().length > 0 && courseCode.trim().length <= 100 &&
    courseTitle.trim().length > 0 && courseTitle.trim().length <= 300 &&
    subject.trim().length > 0 &&
    level.trim().length > 0 &&
    question.trim().length > 0 &&
    scheme.trim().length > 0 &&
    namedCriteria > 0 &&
    validMarks &&
    maxScore > 0 &&
    answerCount > 1;

  const readinessChecks = [
    { label: "Course code and title", complete: !!courseCode.trim() && !!courseTitle.trim() },
    { label: "Subject and level", complete: !!subject.trim() && !!level.trim() },
    { label: "Question added", complete: !!question.trim() },
    { label: "Marking scheme added", complete: !!scheme.trim() },
    { label: "Valid marking criteria", complete: namedCriteria > 0 && validMarks && maxScore > 0 },
    { label: "At least two answers", complete: answerCount > 1 },
  ];
  const completedChecks = readinessChecks.filter((item) => item.complete).length;

  const invalidateCsvRead = useCallback(() => {
    csvReadGenerationRef.current += 1;
    const reader = activeCsvReaderRef.current;
    activeCsvReaderRef.current = null;
    if (!reader) return;

    try {
      reader.abort();
    } catch {
      // A reader may finish between invalidation and abort. It is already stale.
    }
  }, []);

  useEffect(() => () => invalidateCsvRead(), [invalidateCsvRead]);

  function clearCsvFileSelection() {
    if (fileRef.current) fileRef.current.value = "";
  }

  function loadDemo() {
    invalidateCsvRead();
    setSetupDraft(createDemoSetupDraft());
    setCsvError(null);
    setRunError(null);
    clearCsvFileSelection();
  }

  function clearAll() {
    invalidateCsvRead();
    setSetupDraft(createEmptySetupDraft());
    setCsvError(null);
    setRunError(null);
    clearCsvFileSelection();
  }

  function onFile(file: File | undefined) {
    invalidateCsvRead();
    if (!file) return;
    setCsvError(null);
    setCsvName(null);
    setCsvAnswers([]);
    if (!/\.csv$/i.test(file.name)) {
      clearCsvFileSelection();
      setCsvError("That file isn't a .csv. Export your sheet as CSV and try again.");
      return;
    }
    const reader = new FileReader();
    const generation = csvReadGenerationRef.current;
    activeCsvReaderRef.current = reader;
    const isCurrentRead = () =>
      csvReadGenerationRef.current === generation && activeCsvReaderRef.current === reader;
    reader.onload = () => {
      if (!isCurrentRead()) return;

      try {
        const text = String(reader.result ?? "");
        const parsed = answersFromCsv(text);
        if (!isCurrentRead()) return;
        activeCsvReaderRef.current = null;
        setCsvName(file.name);
        setCsvAnswers(parsed);
        if (parsed.length === 0) {
          setCsvError(
            "No answers were found. The file needs two columns: a student identifier and the answer text.",
          );
        }
      } catch {
        if (!isCurrentRead()) return;
        invalidateCsvRead();
        clearCsvFileSelection();
        setCsvError("That file couldn't be read. Try re-exporting it as CSV.");
      }
    };
    reader.onerror = () => {
      if (!isCurrentRead()) return;
      invalidateCsvRead();
      clearCsvFileSelection();
      setCsvError("That file couldn't be read. Try re-exporting it as CSV.");
    };
    reader.readAsText(file);
  }

  function moveAnswerTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (index - 1 + ANSWER_INPUT_MODES.length) % ANSWER_INPUT_MODES.length;
        break;
      case "ArrowRight":
        nextIndex = (index + 1) % ANSWER_INPUT_MODES.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = ANSWER_INPUT_MODES.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    setMode(ANSWER_INPUT_MODES[nextIndex].id);
    answerTabRefs.current[nextIndex]?.focus();
  }

  async function run() {
    if (!ready || starting || (!sampleDraft && !liveEnabled)) return;
    setRunError(null);
    setStarting(true);
    try {
    if (!activeRunIsDemo && !(await flushChanges())) {
      setRunError("Your current session has unsaved edits. Save those changes before starting another session.");
      return;
    }
    if (sampleDraft) {
      setRunPrediction(prediction);
      previewDemo();
      router.push("/processing");
      return;
    }
    const answers = mode === "csv" ? csvAnswers : answersFromPaste(paste);
    if (answers.length < 2) return;

    startRun({
      input: {
        question: question.trim(),
        scheme: scheme.trim(),
        // A criterion with no description cannot be awarded against, and an
        // unnamed one on the export would read as an unexplained deduction.
        criteria: criteria
          .filter((c) => c.label.trim().length > 0)
          .map((c) => ({ ...c, label: c.label.trim() })),
        subject: subject.trim(),
        level: level.trim(),
        answers,
      },
      prediction,
      courseCode: courseCode.trim(),
      courseTitle: courseTitle.trim(),
    });
    router.push("/processing");
    } catch {
      setRunError("The session could not be started. Your draft is still here; please try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Page
      eyebrow="Step 1 of 8"
      title="Set up this marking session"
      lead="Add the assessment context, marking scheme, and student responses. Required fields are marked."
      asidePosition="left"
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={clearAll} disabled={starting}>
            <Plus size={15} strokeWidth={1.9} aria-hidden />
            New marking session
          </Button>
          <Button variant="secondary" size="sm" onClick={loadDemo} disabled={starting}>
            <RotateCcw size={15} strokeWidth={1.9} aria-hidden />
            Load demo class
          </Button>
        </>
      }
      aside={
        <>
          <Card className="overflow-hidden border-brand-line bg-brand-soft">
            <div className="relative px-5 pb-6 pt-5 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <span className="label-caps text-brand">Your marking workspace</span>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-brand-line bg-surface/60 text-brand">
                  <BookOpen size={20} strokeWidth={1.6} aria-hidden />
                </span>
              </div>
              <p className="mt-7 text-[13px] font-medium text-ink-2 [overflow-wrap:anywhere]">{courseCode.trim() || "New course"}</p>
              <h2 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-[-0.035em] text-ink [overflow-wrap:anywhere]">
                {courseTitle.trim() || "Your marking session"}
              </h2>
              <p className="mt-3 min-h-5 text-[13px] leading-relaxed text-ink-2 break-words">
                {level.trim() || "Add the assessment level to get started."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-line bg-surface/50 px-5 py-4 sm:px-6">
              <span className="inline-flex items-center gap-2 text-[12px] font-medium text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                {sampleDraft ? "Sample workspace" : "Course draft"}
              </span>
              <span className="text-[12px] text-ink-2">One question per session</span>
            </div>
          </Card>

          <dl className="grid grid-cols-2 gap-3">
            <OverviewMetric label="Answers detected" value={`${answerCount}`} icon={<Users size={17} strokeWidth={1.7} aria-hidden />} accent />
            <OverviewMetric label="Marking criteria" value={`${namedCriteria}`} icon={<ClipboardList size={17} strokeWidth={1.7} aria-hidden />} />
            <OverviewMetric label="Marks available" value={`${maxScore}`} icon={<Check size={17} strokeWidth={1.8} aria-hidden />} />
            <OverviewMetric label="Prediction" value={prediction.trim() ? "Entered" : "Skipped"} icon={<Sparkles size={17} strokeWidth={1.7} aria-hidden />} compact />
          </dl>

          <Card>
            <CardHead title={sampleDraft ? "Ready to preview" : "Ready to analyse"} hint="Check the required inputs." />
            <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
              <div>
                <div className="mb-2.5 flex items-center justify-between gap-3 text-[12px]">
                  <span className="font-medium text-ink-2">Session readiness</span>
                  <span className="tnum font-semibold text-ink">{completedChecks} of {readinessChecks.length}</span>
                </div>
                <Progress value={(completedChecks / readinessChecks.length) * 100} label="Session readiness" />
              </div>
              <ul className="flex flex-col gap-3">
                {readinessChecks.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5 text-[13px] text-ink-2">
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                        item.complete ? "border-ok-line bg-ok-soft text-ok" : "border-border-strong bg-surface",
                      )}
                    >
                      {item.complete ? <Check size={12} strokeWidth={2.4} aria-hidden /> : null}
                      <span className="sr-only">{item.complete ? "Complete:" : "Needed:"}</span>
                    </span>
                    {item.label}
                  </li>
                ))}
              </ul>
              <div>
                <Button className="w-full !px-3" size="lg" disabled={!ready || starting || (!sampleDraft && !liveEnabled)} onClick={() => void run()}>
                  {starting ? "Preparing session…" : sampleDraft ? "Preview sample analysis" : "Analyse class answers"}
                  <ArrowUpRight size={17} strokeWidth={1.9} className="shrink-0" aria-hidden />
                </Button>
                {!ready ? (
                  <p className="mt-2 text-center text-[12px] leading-snug text-ink-3">
                    {validMarks ? "Add the course details, subject, level, question, marking scheme, and at least two answers." : "Criterion marks must be whole numbers from 1 to 1,000."}
                  </p>
                ) : (
                  <p className="mt-2 text-center text-[12px] leading-snug text-ink-3">
                    {sampleDraft ? "This opens the EEE 301 sample results. No answers are sent for analysis." : liveEnabled ? "Your answer text and marking scheme are sent to Gemini for analysis. Results are saved to your account." : "Your draft is ready, but live analysis must be enabled before it can be marked."}
                  </p>
                )}
              </div>
              {!sampleDraft && !liveEnabled ? (
                <p className="text-[13px] leading-relaxed text-ink-2">
                  Live analysis is not available in this installation yet. You can prepare your course here or load the demo to explore sample results. Your entries will not be replaced with demo results.
                </p>
              ) : null}
              {runError ? <p role="alert" className="text-[13px] text-crit">{runError}</p> : null}
            </div>
          </Card>

          {sampleDraft ? <Card className="bg-surface/60">
            <div className="px-5 py-5 flex gap-3">
              <Info size={17} strokeWidth={1.9} className="text-brand shrink-0 mt-0.5" aria-hidden />
              <div className="text-[13px] leading-relaxed text-ink">
                <p className="font-semibold mb-1">This demo class is pseudonymised</p>
                <p className="text-ink-2">
                  This sample uses 40 pseudonymised volunteer answers. Names are replaced with
                  initials and student numbers are invented.
                </p>
              </div>
            </div>
          </Card> : null}
        </>
      }
    >
      {/* --- Assessment context ---------------------------------------- */}
      <Card>
        <CardHead
          title="Assessment context"
          hint="Identify the course, then set the subject and level for this marking session."
        />
        <div className="grid gap-5 px-4 py-5 sm:grid-cols-2 sm:px-6 sm:py-6">
          <Field label="Course code" required htmlFor="course-code" hint="Used to identify this session and its exports.">
            <Input id="course-code" required maxLength={100} value={courseCode} onChange={(e) => setField("courseCode", e.target.value)} placeholder="e.g. CSC201" />
          </Field>
          <Field label="Course title" required htmlFor="course-title">
            <Input id="course-title" required maxLength={300} value={courseTitle} onChange={(e) => setField("courseTitle", e.target.value)} placeholder="e.g. Data Structures" />
          </Field>
          <Field label="Subject" required htmlFor="subject" hint="Used to judge which later topics a belief will break.">
            <Input
              id="subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Computer Science — data structures"
            />
          </Field>
          <Field label="Level" required htmlFor="level" hint="Sets the expected depth of the answer.">
            <Input
              id="level"
              required
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="e.g. 200 level (Year 2)"
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
        <div className="px-4 py-5 sm:px-6 sm:py-6">
          <Field label="Question text" required htmlFor="question">
            <Textarea
              id="question"
              required
              rows={4}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter the question exactly as students received it…"
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
        <div className="flex flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6">
          <Field label="Model answer or scheme" required htmlFor="scheme">
            <Textarea
              id="scheme"
              required
              rows={4}
              value={scheme}
              onChange={(e) => setScheme(e.target.value)}
              placeholder="Describe what a full-mark answer contains…"
            />
          </Field>

          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">Criteria</span>
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

            <ul className="flex flex-col gap-3">
              {criteria.map((c, i) => (
                <li key={c.id} className="grid grid-cols-[20px_minmax(0,1fr)_96px_36px] items-center gap-2 rounded-[16px] bg-surface-2 p-2.5 sm:bg-transparent sm:p-0">
                  <span className="label-caps text-ink-3 tnum">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Input
                    aria-label={`Criterion ${i + 1} description`}
                    value={c.label}
                    placeholder="e.g. Impedance combined in quadrature"
                    className="col-span-3 min-w-0 flex-1 sm:col-span-1"
                    onChange={(e) =>
                      setCriteria((prev) =>
                        prev.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)),
                      )
                    }
                  />
                  <span className="col-span-2 pl-1 text-[12px] text-ink-2 sm:hidden" aria-hidden>Marks</span>
                  <Input
                    aria-label={`Marks for criterion ${i + 1}`}
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
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
                    className="min-w-0 !w-full tnum text-center"
                  />
                  <button
                    onClick={() => setCriteria((prev) => prev.filter((x) => x.id !== c.id))}
                    disabled={criteria.length === 1}
                    aria-label={`Remove criterion ${i + 1}`}
                    className="grid place-items-center w-9 h-9 shrink-0 rounded-[12px] text-ink-3 hover:text-crit hover:bg-crit-soft disabled:opacity-30 disabled:pointer-events-none transition-colors"
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
          className="mx-4 mt-4 grid grid-cols-3 gap-1 rounded-[16px] bg-surface-2 p-1 sm:mx-6 sm:mt-5"
        >
          {ANSWER_INPUT_MODES.map((t, index) => {
            const active = mode === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                ref={(node) => {
                  answerTabRefs.current[index] = node;
                }}
                id={`answer-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`answer-panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setMode(t.id)}
                onKeyDown={(event) => moveAnswerTab(event, index)}
                className={cn(
                  "flex min-w-0 flex-wrap items-center justify-center gap-1.5 rounded-[12px] px-1.5 py-2.5 text-[12px] font-medium transition-colors sm:px-3 sm:text-[13px]",
                  active
                    ? "bg-surface text-ink shadow-[0_1px_4px_rgba(20,18,31,0.06)]"
                    : "text-ink-2 hover:bg-surface/60 hover:text-ink",
                )}
              >
                <Icon size={15} strokeWidth={1.9} className="shrink-0" aria-hidden />
                <span>{t.label}</span>
                {t.id === "photo" ? (
                  <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] text-ink-2">soon</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="px-4 py-5 sm:px-6 sm:py-6">
          <div
            id="answer-panel-paste"
            role="tabpanel"
            aria-labelledby="answer-tab-paste"
            hidden={mode !== "paste"}
          >
            <Field
              label="Answers"
              required={mode === "paste"}
              hint="Format: student ID, a pipe, then the answer. One per line."
              htmlFor="paste"
              counter={`${answerCount} lines`}
            >
              <Textarea
                id="paste"
                required={mode === "paste"}
                rows={9}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                className="text-[13px]"
                placeholder={"STUDENT001 | The student's answer…\nSTUDENT002 | Another student's answer…"}
              />
            </Field>
          </div>

          <div
            id="answer-panel-csv"
            role="tabpanel"
            aria-labelledby="answer-tab-csv"
            hidden={mode !== "csv"}
          >
            <Field label="CSV file" required={mode === "csv"} htmlFor="answers-csv">
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center gap-2 border border-dashed border-control-border bg-surface-2 rounded-[20px] px-4 py-10 text-center hover:border-brand hover:bg-brand-soft transition-colors sm:px-6"
                >
                  <Upload size={22} strokeWidth={1.7} className="text-ink-3" aria-hidden />
                  <span className="text-[14px] font-medium">Choose a CSV file</span>
                  <span className="text-[13px] text-ink-2 max-w-[42ch]">
                    Two columns: student identifier and answer text. The header row is skipped.
                  </span>
                </button>
                <input
                  ref={fileRef}
                  id="answers-csv"
                  type="file"
                  accept=".csv,text/csv"
                  required={mode === "csv" && csvRows === 0}
                  aria-required={mode === "csv"}
                  className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                {csvName ? (
                  <div className="flex min-w-0 items-center gap-2 text-[13px]" role="status">
                    <FileSpreadsheet size={16} strokeWidth={1.9} className="shrink-0 text-brand" aria-hidden />
                    <span className="min-w-0 flex-1 font-medium truncate">{csvName}</span>
                    <Badge tone="ok">{csvRows} rows</Badge>
                  </div>
                ) : null}
                {csvError ? (
                  <div
                    className="rounded-[12px] border border-crit-line bg-crit-soft px-4 py-3 text-[13px] text-crit"
                    role="alert"
                    aria-labelledby="csv-error-title"
                    aria-describedby="csv-error-explanation"
                  >
                    <h3 id="csv-error-title" className="font-semibold">
                      CSV upload failed
                    </h3>
                    <p id="csv-error-explanation" className="mt-1">
                      {csvError}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      onClick={() => fileRef.current?.click()}
                    >
                      Choose another CSV
                    </Button>
                  </div>
                ) : null}
              </div>
            </Field>
          </div>

          <div
            id="answer-panel-photo"
            role="tabpanel"
            aria-labelledby="answer-tab-photo"
            hidden={mode !== "photo"}
          >
            <div className="flex flex-col items-center gap-2 border border-dashed border-border-strong rounded-[20px] bg-surface-2 px-4 py-10 text-center sm:px-6">
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
          </div>
        </div>
      </Card>

      {/* --- Prediction ------------------------------------------------ */}
      <Card className="border-brand-line bg-brand-soft/40">
        <div className="flex flex-col gap-3 px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center gap-2">
            <span className="label-caps text-brand">Before you run it</span>
            <Badge tone="brand">Optional</Badge>
          </div>
          <label
            htmlFor="prediction"
            className="font-display text-[20px] sm:text-[22px] font-bold leading-tight tracking-[-0.025em]"
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

function OverviewMetric({
  label,
  value,
  icon,
  accent,
  compact,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("min-w-0 rounded-[22px] border p-4", accent ? "border-brand-line bg-brand-soft" : "border-border bg-surface")}>
      <dt className="text-[12px] leading-snug text-ink-2">
        <span className={cn("mb-4 grid h-9 w-9 place-items-center rounded-[12px] text-ink", accent ? "bg-surface/60" : "bg-surface-2")}>
          {icon}
        </span>
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1.5 break-words font-display font-bold leading-tight tracking-[-0.035em] text-ink tnum",
          compact ? "text-[20px]" : "text-[28px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
