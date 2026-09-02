# Production UI review runners

These tracked Node scripts regenerate the Task 8 browser evidence after `next build`. Generated JSON, browser profiles, downloads, HTML, and PNG files stay under the ignored `.next/ui-review` directory so a build can erase outputs without erasing the procedure.

## Prerequisites

- Node.js 22 or newer. The runners use the native `fetch` and `WebSocket` implementations.
- A successful production build and a production server listening on `http://127.0.0.1:3017`.
- Chromium or Google Chrome and Microsoft Edge, each launched headlessly with a fresh remote-debugging port and a profile beneath `.next/ui-review/profiles`.
- No Playwright, browser download, or browser-profile dependency is required.

From the repository root in PowerShell:

```powershell
npm ci
npm run build
npm run start -- -p 3017
```

Leave the production server running. In another PowerShell window, regenerate the Chrome matrix and its 26 required captures:

```powershell
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
Start-Process -FilePath $chrome -WindowStyle Hidden -ArgumentList '--headless=new','--disable-extensions','--remote-debugging-port=9222',"--user-data-dir=$PWD\.next\ui-review\profiles\chrome-matrix",'about:blank'
node scripts/ui-review/matrix.cjs chrome 9222 chrome-matrix.json
```

The matrix runner sends `Browser.close`, so launch a new Chrome process for the keyboard workflow:

```powershell
Start-Process -FilePath $chrome -WindowStyle Hidden -ArgumentList '--headless=new','--disable-extensions','--remote-debugging-port=9224',"--user-data-dir=$PWD\.next\ui-review\profiles\chrome-keyboard",'about:blank'
node scripts/ui-review/keyboard.cjs 9224 chrome-keyboard.json
```

Run the check-only matrix in Edge:

```powershell
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
Start-Process -FilePath $edge -WindowStyle Hidden -ArgumentList '--headless=new','--disable-extensions','--disable-component-extensions-with-background-pages','--remote-debugging-port=9223',"--user-data-dir=$PWD\.next\ui-review\profiles\edge-matrix",'about:blank'
node scripts/ui-review/matrix.cjs edge 9223 edge-matrix.json
```

The runners themselves are cross-platform. On macOS or Linux, launch the installed Chrome/Edge binary with the same `--headless=new`, extension-isolation, `--remote-debugging-port`, and `--user-data-dir` arguments, then pass the selected port to the same Node commands. Extension isolation matters on managed Edge installations because wallet extensions can inject unrelated console/runtime errors into otherwise clean application pages.

Set `UI_REVIEW_ORIGIN` to review a different already-running origin. Set `UI_REVIEW_OUTPUT` to change the ignored output directory. Both default to the Task 8 production values shown above.

## Matrix contract

`matrix.cjs` runs nine routes at four viewports under four appearance cases, producing 144 cases per browser:

- routes: Setup, Processing, Reveal, Map, Cluster detail, Reteach index, Reteach detail, Scores, and Export;
- viewports: `1440x1000`, `1024x900`, `768x1024`, and `390x844`;
- appearances: explicit Light under dark OS media, explicit Dark under light OS media, System resolved light, and System resolved dark.

Every case records and asserts the exact pathname; theme mutation trace, first animation-frame theme, settled `data-theme`, and native `color-scheme`; one server-rendered `main#main` and skip target; visible shell and H1 geometry; desktop/mobile frame breakpoint; page-level horizontal overflow; visible-content signal; runtime exceptions and console warnings/errors. Setup additionally checks every visible control and each criterion row, description input, and marks input against viewport bounds.

Computed browser colors are measured for the current semantic-token contract rather than copied from source text:

- `--ink-3` on `--ground`, `--shell`, `--surface`, `--surface-2`, `--surface-3`, and all four semantic soft surfaces must be at least `4.5:1`;
- `--control-border` on the three supported input surfaces must be at least `3:1`;
- every `--on-c0` through `--on-c6` foreground on its corresponding `--c0` through `--c6` cluster color must be at least `4.5:1`.

A separate production case emulates `prefers-reduced-motion: reduce`, proves the media query resolves, samples visible controls, and requires computed transition and animation durations to be no more than `0.001s`.

Chrome writes exactly 26 required route/theme screenshots and `chrome-screenshot-manifest.json`: all nine routes at `1440x1000` in Light and Dark, plus Setup, Map, Scores, and Export at `390x844` in Light and Dark. It also writes a reproducible `chrome-contact-sheet.html` and full-page `chrome-contact-sheet.png`. Edge is check-only and writes no captures.

## Keyboard contract

`keyboard.cjs` uses `Input.dispatchKeyEvent` for every activation and text entry. It records each dispatched key, every intermediate Tab/Shift+Tab stop, its accessible label and geometry, `:focus-visible` match and computed focus treatment, modal containment, and resulting state assertions. It fails if focus wraps before an expected target or escapes an open dialog.

Its JSON contains eleven ordered groups:

1. native no-JavaScript skip fragment behavior and the separate hydrated main-focus assist;
2. desktop navigation plus mobile drawer initial focus, wrap, Escape, restore, and link activation;
3. Settings native radio traversal from the checked preference using Arrow keys, trap, Escape, and restore;
4. Setup fields, criterion addition, disclosure, Arrow-key roving tabs, prediction, and primary action;
5. active Processing disclosure, completion, and onward action;
6. Reveal comparison and map action;
7. Map Arrow-key segmented sort, cluster link, a real thirteen-cluster mutation, fallback list, and fallback link;
8. Cluster rename, split, merge, reject, and missing-cluster treatment;
9. Reteach copy plus Markdown and roster downloads;
10. Scores search, all three Arrow-key segmented sorts, specific score/status transitions and counts, evidence, bulk and remaining review, and export readiness;
11. Export validation, native format-radio arrows, confirmation, XLSX and DOCX downloads, and the truthful keyboard-reachable demo account state.

The production demo has no email form. The runner records that limitation instead of fabricating an account-link branch; anonymous account validation/error behavior remains covered by component tests.

## Output schema and failure behavior

The default output tree is:

```text
.next/ui-review/
  chrome-matrix.json
  edge-matrix.json
  chrome-keyboard.json
  chrome-screenshot-manifest.json
  chrome-contact-sheet.html
  chrome-contact-sheet.png
  screenshots/                 # exactly 26 required PNGs
  downloads/                   # keyboard-triggered files
  profiles/                    # disposable browser profiles
```

Matrix JSON uses schema version 2 and contains `totals`, `contrastPairs`, `reducedMotion`, `contactSheet`, the 144 `cases`, and the screenshot manifest. Each case includes its route/viewport/appearance inputs, observed `state`, `failures`, console records, runtime exceptions, and optional screenshot path.

Keyboard JSON uses schema version 2 and contains `totals`, observed downloads, eleven `groups`, and truthful limitations. Each group includes `keys`, `focus`, and `assertions`. A failed run still writes the partial JSON with `activeGroup` and `error`, then exits nonzero. Both runners close the browser in `finally` with CDP `Browser.close`.

## Task 8 state-test audit

The production runners supplement rather than replace the focused component tests. The final audit found the requested states already covered as follows:

| Area | Required states | Focused coverage |
| --- | --- | --- |
| Setup | not ready; invalid CSV and recovery | `tests/app/setup-page.test.tsx` |
| Processing | active; completed | `tests/app/processing-page.test.tsx` |
| Reveal | missing prediction; not processed | `tests/app/reveal-page.test.tsx` |
| Map | zero active clusters; more than twelve clusters | `tests/app/map-empty-page.test.tsx`, `tests/app/map-page.test.tsx` |
| Cluster | not found; rejected; merged; split | `tests/app/cluster-detail-page.test.tsx` |
| Reteach | before processing; missing generated pack | `tests/app/reteach-pages.test.tsx` |
| Scores | initial attention; partial review; export ready | `tests/app/scores-page.test.tsx` |
| Export | locked; reviewer validation; confirmed; downloading; generation error | `tests/app/export-page.test.tsx` |
| Account in Export | demo, anonymous validation/linking, linked, pending, provider error | `tests/components/account-link.test.tsx`, `tests/components/auth-provider.test.tsx` |

Those tests assert state-specific headings or explanations and preserve no more than one primary treatment where the state presents an action. The audit intentionally did not duplicate already-strong tests. The runner configuration itself is guarded by `tests/scripts/ui-review-config.test.ts`, which fixes the 144-case/26-capture contract, contrast pairs, reduced-motion route, and eleven keyboard groups.
