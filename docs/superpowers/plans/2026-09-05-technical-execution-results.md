# Technical execution fixes

The identified execution defects have been repaired across grading, persistence,
AI admission, session recovery, authentication, and the browser workflow.

## Changes

- Student tokens expose lesson content and question prompts without expected
  answers or other students' identities. Two responses and the trusted rubric
  are stored atomically. Service-only, fenced grading claims prevent forged
  verdicts and stale retry workers from overwriting results.
- Complete runs save in one database transaction with explicit row correlation
  and generated diagnostic tokens. Same-session foreign keys prevent invalid
  answer/cluster relationships. Failed saves can retry without another AI run.
- Saved sessions restore course metadata and predictions. Browser snapshots are
  account-scoped and retain pending/failed-save status. Edits are serialized;
  confirmation and reteach generation wait for successful persistence.
- Paid AI requires verified authentication and atomic per-principal/global
  budgets. Requests, criteria, scores, embeddings and generated packs are
  validated. Input identifiers are pseudonymized in model prompts. Admission
  accounts for configured RPM and a 270-second deadline; cluster labeling and
  damage assessment share one call.
- Setup distinguishes a genuinely local demo from configured live analysis.
  Streaming handles React Strict Mode, interrupted results and final partial
  chunks. Export confirms only successful writes and preserves relevant errors.
- Next.js uses the current proxy convention and forwards refreshed cookies.
  Auth failures recover without leaving account controls stuck.
- Demo diagnostic responses restore after refresh. Failed browser storage
  writes leave the form retryable and do not claim the answers were saved.

## Verification

- Full suite: 402 tests executed; 401 passed and one export-error persistence
  regression failed. The regression was fixed; the final affected-file rerun
  passed all 42 tests across seven files.
- All 11 PostgreSQL migration integration tests passed, including default
  function grants, ownership, rollback, token correlation, cross-session
  foreign keys, immutable attempts, fenced workers and durable AI budgets.
- Production build, TypeScript check, ESLint and Git whitespace check passed.
- Production keyboard runner: 11/11 workflow groups, 723 dispatched keys,
  411 focus checks, 57 state assertions and four downloads.
- Independent review found no remaining Critical or Important issues after
  corrections. Its minor retry-payload duplication finding was also fixed.
- Final diagnostic/outcome regression run: 20/20 tests passed, including demo
  response restoration and blocked browser storage.
- Final production browser smoke: 6/6 mobile/desktop layouts passed; diagnostic
  submission and reload passed with zero runtime exceptions. The production
  build was rerun successfully after the final demo fixes.

The database harness executes the application migrations in PGlite with actual
PostgreSQL roles and Supabase-style default grants. It substitutes an array for
the unused vector column; it does not exercise hosted PostgREST or pgvector.
Browser checks blocked external hostnames. No paid Gemini requests or hosted
database migrations were performed.

## Activating live operation

The local environment currently lacks `SUPABASE_SERVICE_ROLE_KEY`. Set that
server-only variable and apply migrations `0006`, `0007`, and `0008` in order
to an existing installation through `0005`. For a new empty project, the
regenerated `supabase/setup.sql` contains all eight migrations.

The sample remains available while live configuration is incomplete. Hosted
Supabase/PostgREST and provider integration still require a deployment check
with the new migrations and service-role configuration.
