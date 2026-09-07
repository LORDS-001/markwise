# Dashboard template redesign

The interface now follows the supplied reference: a dark navigation rail,
rounded workspace, pale canvas, white/lavender cards, and a session overview
beside the assessment form. The design applies across the lecturer workflow,
saved sessions, outcomes, and standalone student diagnostics.

## Typography and colors

- Inter for body text, fields, labels, and controls.
- Manrope for headings, display metrics, and the wordmark.
- `#14121F` for primary actions, the navigation background, logo, and favicon.
- The same logo sits on a light backing in both appearances. Semantic statuses
  and categorical graphics retain distinct, accessible colors.
- Next.js self-hosts both variable fonts. Browser checks inspect loaded font
  faces as well as computed font families.

## Usability fixes

- Long controls wrap within their available width, and card actions can wrap
  below headings. Text fields use 16px type on small screens.
- Criterion marks have a bounded 96px track that accommodates four digits and
  native number spinners. The description remains flexible.
- Chart percentages use readable text colors, with a distinct keyboard focus
  ring. Tall context panels scroll naturally so keyboard actions stay visible.
- The supplementary bubble chart is hidden below 640px, where its labels would
  be too small. Ranked cards retain the same values and cluster links.
- Step numbering follows all eight navigation steps. Score summaries display
  the assessment's actual maximum instead of assuming ten marks.
- Navigation drawers, appearance settings, form validation, score review,
  exports, diagnostic submission, and local response restoration are preserved.

## Verification

- Production build and its TypeScript check passed after the final mobile map
  adjustment. Full ESLint passed; the final changed page also passed scoped lint.
- The selected UI/theme run executed 99 tests: 96 initially passed. A stale
  width-class assertion was updated for the new bounded grid. A diagnostic
  typing timeout during concurrent build activity caused a second diagnostic
  failure. The affected files plus contrast tests then passed 41/41 without a
  competing build; no test timeouts were increased.
- Score review passed 16/16, including a new 20-mark assessment regression and
  an isolated session-storage fixture.
- The production matrix passed 144/144 route/viewport/appearance cases, all
  contrast checks, and reduced motion. It produced 26 screenshots.
- The template runner passed 50/50 cases, verified actual Inter/Manrope loading
  and exact primary/logo colors, and restored submitted demo diagnostics after
  refresh. It produced 20 screenshots with zero application console errors or
  runtime exceptions in explicit offline mode.
- Keyboard verification passed 11/11 groups: 750 key dispatches, 438 focus
  checks, 57 state assertions, and four downloads. The runner now traverses
  backward from the form to the overview action, matching the new DOM order.
- After the final mobile chart adjustment, the Map matrix passed 16/16, plus
  four Map viewport checks and three real-browser checks that four-digit marks
  fit, receive focus, and remain unobscured. No runtime exceptions were recorded.
- Browser runner contract tests passed 7/7; Git whitespace validation passed.
- Manual screenshot review covered desktop and mobile Setup, Map, Scores,
  Export, Reteach, dark appearance, and the standalone student diagnostic.

Local evidence is preserved in the ignored `out/template-review/` directory.
The tracked runners and commands are documented in `scripts/ui-review/README.md`.

Browser reviews intentionally block external hostnames. Explicit offline mode
retains expected cross-origin DNS failures separately; application exceptions,
same-origin network errors, and application console errors remain failures.
These runs exercise the local demo and UI recovery, not hosted Supabase or paid
Gemini integration. Credentials and hosted configuration were not changed.
