# Markwise

Mark the scripts. See what the class got wrong.

A marking assistant for lecturers. Upload a batch of answers to one question;
Markwise extracts the false belief behind each mistake, clusters those beliefs,
and ranks the misconceptions actually spreading through the class. Provisional
scores fall out of the same pass as a byproduct.

## Status

Frontend UI for all eight screens, running on seeded demo data. The model
pipeline (extraction, embedding, clustering, labelling, damage ranking) is not
wired yet — `lib/mock.ts` stands in for it.

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

## Develop

```bash
npm install
npm run dev
```

## Demo data

The seeded class is 40 answers to one EEE 301 question. Names are replaced with
initials and student numbers are invented.
