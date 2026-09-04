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

All ten lecturer screens, the student diagnostic, the model pipeline, and
Supabase persistence are wired.

With no `GEMINI_API_KEY` the app runs on the seeded demo class alone, so the
deployed demo cannot be taken down by a missing variable. With a key, Run the
pipeline marks a real batch: extraction, embedding, agglomerative clustering,
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
| `/d/[token]`       | A student's own diagnostic. Not part of the shell  |

## The student's page

`/d/<token>` is the only route a student ever sees, and it shows one thing:
their own misconception, the lesson written against it, and the two questions
that test it. No navigation, no session, nobody else's work.

The rule is enforced in Postgres, not in the interface. A student has no
account and therefore no `auth.uid()`, so row level security cannot express
"your own row" for them; two `SECURITY DEFINER` functions do it instead, each
scoped to one token. There is no code path from a token to another student.

Answers are recorded before they are graded. A student cannot be asked to sit
the diagnostic twice, so a grader outage must not cost them the attempt.

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
   and fill in the URL and anon key from Project settings → API.
2. Run every migration in `supabase/migrations/` in order, in the SQL editor.
   `0004` and `0005` add the student diagnostic and its grading, including the
   two token-scoped functions that keep one student's page off another's data.
3. Enable anonymous sign-ins: Authentication → Sign In / Up → Anonymous.

Once the app is live, schedule `public.prune_abandoned_anonymous_users()` —
anonymous sign-in creates a user per visitor, and abandoned ones accumulate.
It only removes anonymous users with no sessions attached.

## The pipeline

Add `GEMINI_API_KEY` to `.env.local` (aistudio.google.com/apikey). Without it
the app stays on the demo class and the run endpoint returns 503 rather than
failing halfway.

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
