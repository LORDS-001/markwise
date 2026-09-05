# Task 1 implementation report: authoritative diagnostics

## Result

Saved diagnostics now accept only a token and exactly two bounded response
strings. A service-role RPC records both responses and an immutable snapshot of
the stored misconception and rubric in one transaction. The browser cannot
supply marking criteria or verdicts, and public roles cannot execute any
diagnostic write or grading function.

Grading uses a UUID-fenced claim. Only the active claim can complete or release
the attempt, stale workers cannot overwrite a newer result, and retries grade
the immutable saved text without resubmitting it. The AI quota gate runs only
after a claim is acquired and immediately before the paid grading call. Failed
submission writes return `recorded: false`; later gate, grader, verdict-write,
or readback failures preserve the truthful `recorded: true` state.

Student lookup returns lesson content, question prompts, status, and that
token's persisted responses/verdicts. It never returns holder/corrected answer
rubrics. Reload restores saved verdicts, failed recording leaves inputs open,
and an ungraded saved attempt offers a marking retry. Seeded diagnostics stay
local, make no Gemini call, and are explicitly labelled ungraded.

Saved outcome pages use database responses exclusively; browser storage is
used only by the credential-free demo. Learning-change classification requires
both questions to be present and graded before a student can count as
corrected.

Lecturer mutations now validate finite scores against the saved session max,
verify every row before batch confirmation, reject cross-session answer moves,
and check missing rows and database write errors. Paid reteach generation uses
the owned saved session, cluster, and members, passes through the AI gate, and
reports failed pack persistence. Generation waits for queued lecturer edits to
save first. A persisted Other bucket is resolved from its owned stored row and
returns its deterministic pack without a Gemini key or quota consumption.

## Database contract

Migration `0006_secure_diagnostics.sql` adds `diagnostic_attempts` and these
RPCs:

- Public read: `diagnostic_for_token(p_token text)`
- Service only: `submit_diagnostic_attempt(p_token text, p_responses jsonb)`
- Service only: `claim_diagnostic_grading(p_token text)`
- Service only: `complete_diagnostic_grading(p_token text, p_claim_id uuid, p_verdicts jsonb)`
- Service only: `release_diagnostic_grading(p_token text, p_claim_id uuid)`

The legacy per-question submission and caller-verdict functions are revoked
from `public`, `anon`, and `authenticated`. Diagnostic response and attempt RLS
allows lecturer-owned `SELECT` only.

## Verification

- Regression tests were observed failing against the old behavior before the
  implementation.
- Focused secure action, reteach, and admin tests: 20 passed.
- Focused student diagnostic, outcome, and learning-change tests: 34 passed.
- TypeScript typecheck: passed.
- Focused ESLint run: passed with no errors or warnings.
- PostgreSQL-compatible migration harness run by the root agent: 11 passed,
  covering ACLs, atomic run persistence, token mapping, rollback, same-session
  foreign keys, quota enforcement, fenced grading, and missing verdicts.

## Remaining integration work

The migrations have not been applied to a remote Supabase project, as required
by the plan. Root owns the final full suite, lint, production build, generated
setup SQL, and browser smoke checks after Tasks 2 and 3 settle.
