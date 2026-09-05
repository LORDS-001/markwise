# Technical execution repair plan

**Goal:** Repair the technical-execution defects identified in the repository and hackathon review, keeping the existing lecturer workflow and credential-free seeded demo.

**Architecture:** Keep Next.js App Router, Gemini, and Supabase. Authenticate live lecturer operations, impose durable AI budgets, make diagnostic grading server-authoritative, and persist complete runs atomically. Expose database save failures and provide saved-session recovery. Avoid new hosted services.

**Authorization:** The user requested all technical-execution fixes after reviewing the findings. Continue implementation within that scope. The sandbox prevented creating a git worktree; work in the current checkout with disjoint file ownership. Preserve `.claude/` and the existing SQL setup generator; regenerate its output only after adding migrations. Do not deploy or modify a remote database.

**Global constraints:** Read installed Next.js guides before code changes. Keep credentials server-side. Demo must work with no credentials and make no paid calls. All live lecturer AI calls require verified Supabase user identity (anonymous Supabase accounts qualify). Student tokens authorize only their own diagnostic, never caller-supplied verdicts or marking rubrics. Migration files are additive: 0006 diagnostics, 0007 persistence, 0008 AI budgets. Use focused behavioral regression tests; root coordinates full-suite runs to avoid competing workers.

## Task 1: Authoritative diagnostics and safe server actions

Owner: diagnostics agent. Files: `app/actions.ts`, `lib/supabase/admin.ts`, optional `lib/db/diagnostics.ts`, `supabase/migrations/0006_secure_diagnostics.sql`, `app/d/[token]/page.tsx`, `app/outcome/page.tsx`, `lib/learning-change.ts`, related diagnostic/action/outcome tests.

- [x] Reproduce forged verdict capability, client-supplied rubric, ignored RPC errors, partial diagnostic completion, and submission-lockout failures with regression tests.
- [x] Add `getAdminClient(): SupabaseClient | null`, using `SUPABASE_SERVICE_ROLE_KEY` and the public project URL, with no persisted/auto-refreshed auth session and a browser guard. No secret in client config.
- [x] Revoke student/public execution of verdict writes. Use service-only atomic submission and grading RPCs, with valid token, stored pack, exactly two responses, text bounds, immutable attempts, and explicit error handling. Restrict ordinary diagnostic response RLS to lecturer SELECT.
- [x] For saved diagnostics, read rubric and misconception from trusted storage. Student lookup returns lesson/question prompts and status, never expected answers. Retry marking a saved ungraded attempt without resubmitting/replacing its text. Serialize/claim grading so retries cannot trigger concurrent paid work; never claim persistence succeeded if it failed.
- [x] Demo diagnostics use trusted seed data and a clear local/ungraded result with no Gemini calls. Preserve existing demo interaction.
- [x] Update student page to lock only after confirmed recording, display persisted verdicts on reload, and permit retry of ungraded saved attempts. Outcome uses remote responses for saved runs and local responses only for demo. Never classify incomplete or partly ungraded diagnostics as corrected.
- [x] Harden existing mutation actions: validate finite/bounded scores against stored max, verify batch confirmation has no unreviewed/flagged rows, inspect write errors. Reteach must use owned saved context/cluster and report failed pack persistence. Call the shared AI gate before any paid generation.

Shared interface from Task 3: `authorizeAiRequest(operation: "run" | "reteach" | "diagnostic", token?: string): Promise<{ok:true; supabase: SupabaseClient; userId:string} | {ok:false; error:string; status:number}>`. Diagnostic calls supply a validated real token; Task 3 enforces token/global budgets using the admin client. Avoid import cycles.

## Task 2: Atomic saved runs and coherent session state

Owner: persistence agent. Files: `lib/db/persist.ts`, `supabase/migrations/0007_atomic_runs.sql`, `components/session-provider.tsx`, `components/top-bar.tsx`, `components/app-navigation.tsx`, new `app/session-actions.ts`, new `app/sessions/page.tsx`, related persistence/session/navigation tests. Do not edit `app/actions.ts`, outcome, or student diagnostic pages (Task 1 owns them).

- [x] Add regressions for missing diagnostic tokens, duplicate student references/reordered returned rows, incomplete persistence, lost course metadata, UUID Other-bucket rejection, failed saves, and restoration.
- [x] Persist a whole run in one transactional RPC under the authenticated owner. Use unique client-generated UUIDs/correlation per answer, not student references or returned row order. Return generated diagnostic tokens correctly. Include course metadata; no partial ready sessions after failure.
- [x] Harden `loadRun` to reject query errors rather than silently fabricate an empty run, and return tokens and course identity. Expose owned session list/load actions in `app/session-actions.ts`.
- [x] Add a small saved-sessions page and navigation entry for recovering runs, including loading/error/empty states. Reuse existing page/UI primitives.
- [x] Preserve course metadata separately from pendingRun; restore it across refresh. Make real/demo labels truthful. Keep demo defaults.
- [x] Fix local cluster reassignment to use actual Other ID; keep answers/members consistent, invalidate stale reteach packs, and serialize mirrored writes. Do not rely on side effects inside React state updater functions. Show failed save status; do not silently report edits synchronized.
- [x] Save snapshot identity should be account-scoped when known; never restore another account's cached answers. Keep no-auth tests and demo behavior usable.

## Task 3: Bounded live AI and consistent model outputs

Owner: pipeline agent. Files: `app/api/run/route.ts`, new `lib/server/ai-access.ts`, `supabase/migrations/0008_ai_budgets.sql`, `lib/pipeline/*`, relevant route/pipeline tests. Do not edit `app/actions.ts` (coordinate the gate interface above).

- [x] Add regressions for unauthenticated/oversized/malformed runs, durable quota failures, invalid criteria/numeric values, model correctness contradictions, malformed reteach packs, and embedding failures.
- [x] Implement the shared gate using verified request-cookie identity for lecturer operations and server-only token resolution for diagnostics. Require configured persistence/admin client for paid operations; return actionable 503 otherwise. Use atomic service-only DB quotas for per-principal and global limits so new accounts or multiple processes cannot bypass total budget. Fixed conservative limits in SQL; return 429 without paying for work. Demo never calls gate or Gemini.
- [x] Enforce at most 100 answers, 10,000 chars per answer, 20,000 chars each question/scheme, 50 unique criteria with finite positive bounded marks, and 1 MiB streamed request-body cap (including missing/false Content-Length). Validate optional metadata and catch malformed values into 400. Authenticate before processing and persist with the same user/client.
- [x] Keep NDJSON progress. Handle client cancellation and total run budget cleanly; do not expose provider response bodies/secrets to clients. Use anonymized correlation references in extraction prompts, not real student identifiers.
- [x] Normalize `isCorrect` consistently with awarded criteria and full score; contradictory extraction must require review instead of becoming a confident correct answer. Validate signatures/evidence, embedding dimensions/finite vectors, and exactly five nonempty lesson sections/two nonempty diagnostics. Preserve meaningful fallback for embedding outage (unclustered review records with an explicit warning, never invented semantic groups).
- [x] Fix circular threshold evaluation: externally supplied human labels required when tuning exported results; don't treat pipeline output as independent ground truth.

## Task 4: Integration and verification

Owner: root. Files: build/test config, auth-provider as required, export page as required, docs/env example, setup.sql, focused integration tests.

- [x] Diagnose Vitest fork startup timeouts with focused reproduction; use a verified pool configuration, not blanket test timeout increases.
- [x] Migrate deprecated middleware convention to proxy using installed docs. Verify build and runtime.
- [x] Exercise migrations in a local PostgreSQL-compatible test harness if available; verify role grants, atomicity, bounds, and quotas. Do not apply remote SQL.
- [x] Update environment/setup docs and regenerate consolidated SQL, preserving the pre-existing setup header/generator.
- [x] Run typecheck, lint, complete tests, production build, and browser smoke tests of demo plus focused mocked live integration. Perform independent review; fix regressions and report any external verification that cannot be performed.

## Progress

- Baseline: typecheck and lint passed; 246 tests passed, four test files failed worker startup. No failing assertions reported.
- Worktree creation blocked by sandbox; current checkout used.
- Task boundaries are disjoint; shared gate and admin-client signatures defined above. Root resolves integration conflicts.

- All four tasks completed. Independent review and final production browser checks passed; see [verification results](2026-09-05-technical-execution-results.md) for exact test outcomes and remaining hosted activation steps.
