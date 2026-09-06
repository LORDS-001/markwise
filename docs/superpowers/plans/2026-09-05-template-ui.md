# Template UI implementation plan

**Goal:** Apply the user's dashboard reference to every Markwise screen, using Inter body text, Manrope headings, and #14121F for the primary color and logo.

**Design:** A rounded desktop workspace on a pale gray canvas, a permanent dark navigation rail, a quiet top bar, and generous white/lavender panels. The setup screen pairs a course/session overview with the existing assessment form. Existing dark/system appearance remains usable with corresponding neutral surfaces. The logo stays #14121F on a light backing. Mobile navigation remains a focus-trapped drawer; content stacks without horizontal page overflow.

**Scope:** Restyle the existing product. Preserve data, grading, persistence, diagnostic privacy, navigation destinations, and current form behaviors. Use existing vector assets and lucide icons. No decorative controls without actions or invented statistics. The user supplied the design direction and authorized implementation. Continue in the existing checkout as in the preceding repair task; preserve .claude and local credentials. Do not publish this redesign as part of implementation.

## Tasks

- [x] Root: replace global colors and typography, load Inter/Manrope through Next font, update logo/favicon, and restyle shared buttons, cards, statistics, headers, fields, and segmented controls. Keep readable contrast, distinct semantic statuses, and visible focus treatment.
- [x] Shell agent: restyle shell, sidebar, top bar, and appearance settings. Preserve focus restoration, standalone student route isolation, saved-session links, and save status. Add optional left-side Page aside arrangement for setup without breaking existing Page callers.
- [x] Setup agent: restyle setup with a pale session overview, real input counts, rounded form panels, and a course card inspired by the reference. Preserve all input IDs, labels, validation, tabs, CSV behavior and action handlers.
- [x] Route audit agent: adjust route-specific typography and long control layouts, refresh standalone diagnostics, and make step numbering consistent with the existing eight-route navigation. Do not alter application logic or shared primitives.
- [x] Root: run typecheck/lint and relevant existing component tests. Build production. Exercise route/theme/viewport matrix and keyboard workflows in real browsers, verify loaded fonts and logo color, and inspect screenshots. Include sessions, outcomes, and diagnostics omitted by the existing matrix. Fix observed regressions and record exact verification evidence.

## Ownership and shared contract

Root owns app/globals.css, app/layout.tsx, app/icon.svg, components/logo.tsx, components/ui.tsx and components/page-structure.tsx. Shell agent owns components/shell.tsx, app-navigation.tsx, top-bar.tsx and settings-dialog.tsx. Setup agent owns components/setup-page.tsx. Route agent owns other app route JSX only. Agents do not mutate files outside their ownership or run competing full checks.

Existing surface, ink, semantic and category CSS token names remain. New navigation tokens are --nav (#14121F), --nav-ink, --nav-muted, --nav-hover, --nav-active, and --nav-active-ink, exposed as Tailwind colors. Font utilities font-sans/body and label-caps use Inter; font-display and all headings use Manrope. The legacy font-mono utility maps to Inter for consistent body typography. The Page optional asidePosition property accepts left or right, default right.

## Acceptance

No observed runtime or hydration errors, unexpected horizontal page overflow, obscured actions, lost controls, incorrect font roles, or unreadable contrast in tested views. Required body font and heading font must actually load in the browser. Check 390, 768, 1024, and 1440 widths plus a narrow 320px pass; preserve keyboard navigation, dialog traps, reduced motion and dark/system appearance. Report verification scope accurately rather than claiming absolute freedom from all possible UI defects.

Completed. See [verification results](2026-09-05-template-ui-results.md) for exact test outcomes, final browser checks, and review scope.
