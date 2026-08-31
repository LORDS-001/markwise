# Markwise

Mark the scripts. See what the class got wrong.

A marking assistant for lecturers. Upload a batch of answers to one question;
Markwise extracts the false belief behind each mistake, clusters those beliefs,
and ranks the misconceptions actually spreading through the class. Provisional
scores fall out of the same pass as a byproduct.

## Status

Frontend UI for all eight screens, running on seeded demo data, plus
anonymous-first auth. The model pipeline (extraction, embedding, clustering,
labelling, damage ranking) is not wired yet — `lib/mock.ts` stands in for it.

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
SheetJS (.xlsx) · docx (.docx)

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
2. Run `supabase/migrations/0001_init.sql` in the SQL editor.
3. Enable anonymous sign-ins: Authentication → Sign In / Up → Anonymous.

Once the app is live, schedule `public.prune_abandoned_anonymous_users()` —
anonymous sign-in creates a user per visitor, and abandoned ones accumulate.
It only removes anonymous users with no sessions attached.

## Demo data

The seeded class is 40 answers to one EEE 301 question. Names are replaced with
initials and student numbers are invented.
