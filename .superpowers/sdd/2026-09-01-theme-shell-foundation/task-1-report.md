# Task 1 Report: Theme contract and test harness

## Implementation summary

Added the Next-documented Vitest/jsdom/React Testing Library harness, deterministic media-query helper, seven theme-domain contract tests, and the minimal storage/system-resolution/DOM-application/inline-bootstrap theme module.

## Files

- Modified `package.json` and `package-lock.json` with test, test:run, and typecheck scripts plus test dependencies.
- Added `vitest.config.mts`, `vitest.setup.ts`, `tests/match-media.ts`, `tests/components/theme/theme.test.ts`, and `components/theme/theme.ts`.

## Commands and results

- `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths @testing-library/user-event @testing-library/jest-dom --no-audit --no-fund` — passed; one dependency deprecation warning (`tsconfck`) from npm.
- `npm run test:run -- tests/components/theme/theme.test.ts` — passed: 1 file, 7 tests.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `git diff --check` — passed.

## TDD evidence

RED: ran the focused test before creating `components/theme/theme.ts`; Vitest failed during worker startup/collection with `Failed to start forks worker` and timeout, so it did not reach the expected missing-module assertion. A retry with threads produced the same worker timeout.

GREEN: after adding the minimal module, the focused test completed successfully with 7/7 tests passing.

## Self-review

The implementation is limited to the requested Task 1 files and interfaces. Storage and media-query access are guarded; only `markwise-theme` is read/written; the bootstrap defaults to light and resolves `system` before paint. `git diff --check`, typecheck, lint, and focused tests are clean.

## Concerns

The mandated RED could not be observed as a module-resolution failure because Vitest workers intermittently took roughly 60 seconds and timed out before collection. GREEN is reliable and passes. npm reported the upstream `tsconfck` deprecation warning during installation.
