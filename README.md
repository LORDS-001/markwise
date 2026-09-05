# Markwise

See what your class misunderstood. Fix it. Measure the change.

A learning-intelligence tool for lecturers. Upload a batch of answers to one
question; Markwise extracts the false belief behind each mistake, clusters
those beliefs, ranks the misconceptions actually spreading through the class,
writes a targeted reteach lesson, sends each affected student a diagnostic
built against their own misconception, and then reports whether the belief
survived.

The loop is the product: **before → intervention → after**. Provisional scores
fall out of the same pass as a byproduct, and stay secondary to the diagnosis.

## Status

The lecturer workflow, saved-session history, student diagnostic, model
pipeline, and Supabase persistence are implemented.

With no `GEMINI_API_KEY` the app runs on the seeded demo class alone, so the
deployed demo remains available without credentials. With Gemini and secure
Supabase persistence configured, Run the pipeline marks a real batch: extraction, embedding, agglomerative clustering,
labelling, and prerequisite damage ranking, with live stage progress.

Reteach packs are generated per cluster on request, and each affected student
gets an unguessable link to a diagnostic built from that pack. The outcome
screen reports how many still hold the belief afterwards.

That figure is deliberately conservative: students who did not answer count as
pending rather than corrected, an answer too thin to judge counts as unclear,
and the share still holding the belief is measured against answers that were
actually decided. Dividing by absentees would show a misconception collapsing
because people did not turn up.

Handwritten-script OCR is still not supported — typed and CSV input are the
guaranteed path.

## Screens

| Route              | Screen                                            |
| ------------------ | ------------------------------------------------- |
| `/`                | Setup — question, scheme, answers, prediction      |
| `/processing`      | Live run with real stage names                     |
| `/reveal`          | Prediction beside the actual top cluster           |
| `/map`             | Bubble map, positioned by embedding proximity      |
| `/clusters/[id]`   | Evidence, roster, rename / merge / split / reject  |
| `/reteach`         | Cluster picker                                     |
| `/reteach/[id]`    | Micro-lesson and two-question diagnostic           |
| `/outcome`         | Before and after — did the reteach land?           |
| `/scores`          | Dense review table, inline edit, export gate       |
| `/export`          | Format, preview, confirm, download                 |
| `/sessions`        | Recover a saved batch from the current account    |
| `/d/[token]`       | A student's own diagnostic. Not part of the shell  |

## The student's page

`/d/<token>` is the only route a student ever sees, and it shows one thing:
their own misconception, the lesson written against it, and the two questions
that test it. No navigation, no session, nobody else's work.

Student lookup is scoped to an unguessable token and returns question prompts,
the lesson, and that student's recorded result. Expected answers stay on the
server. Only the server's service-role client can record an attempt or write
a verdict; the public database roles cannot grade themselves.

Both responses and the trusted rubric are saved in one transaction before
grading. A grader outage leaves the attempt available for a marking retry,
using the original text rather than asking the student to submit again.
Saved outcomes are read from the database. The credential-free sample uses
browser storage and does not call Gemini or claim automatic grading.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · lucide-react ·
SheetJS (.xlsx) · docx (.docx) · Gemini (extraction, labelling, pedagogy) ·
Supabase (Postgres, pgvector, RLS)

Clustering is agglomerative average-linkage on cosine distance, written by
hand in `lib/pipeline/cluster.ts` — the number of misconceptions in a class is
unknown ahead of time and is the thing being discovered, so k-means would
presuppose the answer.

Design tokens live in `app/globals.css`; both light and dark themes are defined
token-level. Shared primitives are in `components/ui.tsx`, the shell and page
scaffold in `components/shell.tsx`, and cross-screen state in
`components/session-provider.tsx`.

## Accounts

Anonymous-first. A visitor gets a real Supabase user on arrival — no form —
so the whole product is usable before anyone is asked for anything. Row level
security keys off `auth.uid()`, which an anonymous user has just like a
permanent one.

Email is requested at the export step, where the provenance footer already
asks for the lecturer's name, and it is always optional. Linking calls
`updateUser`, which keeps the same user id and therefore the same rows —
`signInWithOtp` would mint a new user and strand the batch.

A course is a folder inside an account, not an identity of its own.

## Develop

```bash
npm install
npm run dev
```

Supabase is optional. With no credentials the app runs on the seeded demo
class alone, so a missing env var can never take the deployed demo down.

To connect it:

1. Create a project at supabase.com, then copy `.env.example` to `.env.local`
   and fill in the URL and anon key from Project settings → API. Add
   `SUPABASE_SERVICE_ROLE_KEY` for server-authoritative grading and AI budgets.
   Keep this key server-side; never use a `NEXT_PUBLIC_` prefix for it.
2. Run every migration in `supabase/migrations/` in order, in the SQL editor.
   Existing installations through `0005` need `0006`, `0007`, and `0008`:
   these secure diagnostics, make run saves atomic, and enforce AI budgets.
   For a new empty project, `supabase/setup.sql` contains the full sequence.
3. Enable anonymous sign-ins: Authentication → Sign In / Up → Anonymous.

Once the app is live, schedule `public.prune_abandoned_anonymous_users()` —
anonymous sign-in creates a user per visitor, and abandoned ones accumulate.
It only removes anonymous users with no sessions attached.

## The pipeline

Add `GEMINI_API_KEY` to `.env.local` (aistudio.google.com/apikey). Without it
the app stays on the demo class and the run endpoint returns 503 rather than
failing halfway.

Live web operations also require the Supabase URL, anon key, service-role key,
all migrations, and a verified account session. Anonymous Supabase accounts
qualify, so this does not add a signup form. Missing security configuration
disables paid web calls while leaving the sample class available.

The run endpoint accepts 2–100 answers, at most 10,000 characters per answer,
whole positive criterion marks, and at most 1 MiB for the request. It bounds processing time and reports
degraded clustering explicitly. Student identifiers are replaced with
correlation labels in model prompts; answer text itself is sent to Gemini.

Daily limits are enforced atomically in Postgres, across server processes:
3 runs and 12 reteach generations per account, and 2 grading attempts per
student token. Service-wide limits are 60 runs, 240 reteach generations, and
600 diagnostic grading attempts per UTC day. Change the constants in a new
migration when intentionally changing these budgets. `GEMINI_RPM` separately
paces provider requests within each process. The run has a 270-second deadline,
with batch admission checked against configured RPM before consuming AI quota.
The default 15 RPM admits the 40-answer class; batches of 50 or more require
splitting or a higher RPM supported by your provider quota. Label and damage
assessment share one model call per cluster. A slow provider can still exceed
the deadline and reports a recoverable error.

Setup shows a local sample preview when secure live configuration is absent.
Configured deployments label the live action explicitly and explain what is
sent to Gemini. If saving a completed analysis fails, **Retry save** stores the
existing result without another model run. Pending or failed edits remain
marked unsaved across refresh; saved-session recovery offers an explicit way
to discard local edits and reopen the database copy.

`npm run pipeline` runs the whole thing as a bare console script with no UI,
which is how the extraction prompt and the distance threshold get tuned:

```bash
npm run pipeline                       # the seeded 40
npm run pipeline -- --csv answers.csv  # your own batch
npm run pipeline -- --json out.json    # dump the full result
```

Read the printed signatures first. If they describe answers ("used the wrong
formula") rather than state beliefs ("believes reactance does not oppose
current"), fix the prompt in `lib/pipeline/prompts.ts` before touching the
threshold — descriptions will not cluster no matter what the threshold is.

## Demo data

The seeded class is 40 answers to one EEE 301 question. Names are replaced with
initials and student numbers are invented.

## Verification

```bash
npm run test:run
npm run typecheck
npm run lint
npm run build
```

The suite includes an in-memory PostgreSQL harness for migrations, permissions,
atomic batch saves, diagnostic attempts, and quotas. It does not connect to a
Supabase project. The harness substitutes an array for the unused pgvector
storage column; pgvector itself and hosted Supabase/PostgREST behavior need
deployment checks. Function permission tests include
[Supabase's default role grants](https://supabase.com/docs/guides/database/functions#function-privileges).
Vitest uses one worker thread to avoid Windows fork-startup failures and
memory contention in the UI tests.
