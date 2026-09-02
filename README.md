# Markwise

Mark the scripts. See what the class got wrong.

A marking assistant for lecturers. Upload a batch of answers to one question;
Markwise extracts the false belief behind each mistake, clusters those beliefs,
and ranks the misconceptions actually spreading through the class. Provisional
scores fall out of the same pass as a byproduct.

## Status

All eight screens, the model pipeline, and Supabase persistence are wired.

With no `GEMINI_API_KEY` the app runs on the seeded demo class alone, so the
deployed demo cannot be taken down by a missing variable. With a key, Run the
pipeline marks a real batch: extraction, embedding, agglomerative clustering,
labelling, and prerequisite damage ranking, with live stage progress.

Reteach packs are generated per cluster on request. Handwritten-script OCR is
still not supported — typed and CSV input are the guaranteed path.

## Screens

| Route              | Screen                                            |
| ------------------ | ------------------------------------------------- |
| `/`                | Setup — question, scheme, answers, prediction      |
| `/processing`      | Staged run with real stage names                   |
| `/reveal`          | Prediction beside the actual top cluster           |
| `/map`             | Bubble map, sortable by spread or damage           |
| `/clusters/[id]`   | Evidence, roster, rename / merge / split / reject  |
| `/reteach`         | Cluster picker                                     |
| `/reteach/[id]`    | Micro-lesson and two-question diagnostic           |
| `/scores`          | Dense review table, inline edit, export gate       |
| `/export`          | Format, preview, confirm, download                 |

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
2. Run the migrations in `supabase/migrations/` in order, in the SQL editor.
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
