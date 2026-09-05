# Task 3 pipeline repair report

## Status

Implemented bounded, authenticated live AI access for runs, reteach generation,
and saved diagnostic grading while preserving the credential-free seeded demo.

- `authorizeAiRequest()` verifies cookie-bound Supabase identity for lecturer
  operations. Anonymous Supabase users count as authenticated. Diagnostic
  tokens are resolved only through the service client and are represented in
  quota storage by a SHA-256 digest.
- Migration 0008 adds service-role-only, UTC-daily quotas. One locked database
  transaction checks and increments per-principal and service-wide counters.
  The RPC signature is
  `authorize_ai_request(p_operation text, p_principal text)` returning
  `(allowed boolean, reason text, retry_after_seconds integer)`.
- The run route rejects bodies over 1 MiB while streaming the request, even
  without `Content-Length`. It validates question, scheme, answer, criterion,
  numeric, uniqueness, and optional metadata bounds before consuming quota or
  calling Gemini. Successful runs persist with the same authenticated client
  and user returned by the gate.
- Run work observes client cancellation and a 270-second total budget within
  Next's 300-second route ceiling. Runtime admission uses the configured RPM
  and worst-case request count before quota consumption. Provider
  bodies and malformed generated content are not copied into client errors.
  Save failures produce generic recovery guidance.
- Extraction prompts use per-run correlation references instead of supplied
  student identifiers. Correctness is accepted only when the model verdict,
  complete criterion award, and absence of a false-belief signature agree;
  contradictions are routed to review at low confidence.
- Embeddings must contain exactly 768 finite values. An embedding outage keeps
  affected answers in the unclustered review bucket and emits a separate NDJSON
  warning instead of inventing semantic groups or aborting the run.
- Generated reteach packs require exactly five nonempty lesson sections and two
  complete diagnostics. Invalid packs fail before persistence.
- Cluster labels and downstream damage are produced in one structured request.
  At the conservative default 15 RPM, the worst-case 40-answer run requires 61
  requests and reaches its final limiter window at 240.2 seconds. A 50-answer
  run can require 76 requests and is rejected before consuming service quota.
- Criterion marks must be positive whole numbers, matching the integer score
  contract used by atomic persistence.
- Exported threshold tuning requires a separate human-label JSON file and never
  treats pipeline cluster IDs as ground truth. The authored seeded fixture
  remains available as the local baseline.

## Verification

Regression tests were added before production changes and observed failing for
the missing behavior. Fresh focused verification after implementation:

```text
npx vitest run tests/app/run-route.test.ts tests/lib/pipeline/normalise.test.ts tests/lib/pipeline/reteach.test.ts tests/lib/pipeline/gemini.test.ts tests/lib/pipeline/run-resilience.test.ts tests/lib/pipeline/tuning.test.ts tests/lib/server/ai-access.test.ts --pool=threads --maxWorkers=1

Test Files  7 passed (7)
Tests       51 passed (51)
```

The runtime follow-up added deterministic virtual-clock coverage for 61
request starts, default 40-answer admission, configured-capacity refusal, and
fractional-mark rejection. Its fresh focused run passed 33 tests across three
files; the combined cluster-call regression also passes in its focused file.

`npm run typecheck` completed successfully after the implementation. Focused
ESLint reported no errors; its three unused catch-binding warnings were removed
afterward. The integration owner exercised migrations locally with PGlite and
reported all 11 quota/role/migration checks passing. No remote model or database
calls were made.

## Concerns and limits

- Quotas are conservative fixed UTC-daily request allowances rather than token
  metering. They protect the shared paid service across processes and new
  accounts, but deployment usage should be reviewed before changing the SQL
  limits.
- A diagnostic allowance is consumed only after the secure grading claim is
  acquired. Busy and already-graded attempts do not consume it; a failed model
  call does consume one allowance because provider work may already have been
  paid for.
- The run result is still returned when atomic persistence fails so completed
  analysis is not discarded. The warning is explicit, and recovery depends on
  keeping the current result open and retrying through the application flow.
