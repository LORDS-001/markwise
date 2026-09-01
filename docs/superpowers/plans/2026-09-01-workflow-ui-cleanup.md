# Markwise Lecturer Workflow UI Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Apply the approved lecturer-first hierarchy, compact spacing, truthful copy, responsive behavior, and dark-theme coverage to every Markwise workflow screen.

**Architecture:** Route behavior and session state stay in their existing client components. Each page consumes the existing Page wrapper plus the foundation plan's semantic tokens, Disclosure, ActionArea, PageHeader, and shared primitives; page-specific logic remains local. A small pure cluster-layout module replaces the fixed five-slot map so UI layout can be tested without changing cluster data.

**Tech Stack:** Next.js 16.3.3 App Router, React 19.2.8, strict TypeScript 5, Tailwind CSS 4, Vitest, jsdom, React Testing Library, Lucide React.

**Spec:** docs/superpowers/specs/2026-09-01-sluice-inspired-ui-theme-design.md

**Prerequisite:** Complete docs/superpowers/plans/2026-09-01-theme-shell-foundation.md and pass its foundation completion gate.

## Global Constraints

- Preserve the seven main routes and their current order.
- Keep cluster detail subordinate to Map and reteach detail subordinate to Reteach.
- Preserve all existing grading, cluster mutation, review, download, and navigation behavior.
- Do not connect setup fields to a backend, model pipeline, or new storage layer.
- Keep all route pages on their existing client boundary.
- Every page state has exactly one action rendered with the primary button treatment; all other action controls use secondary, ghost, danger, or quiet treatments. Export may change the primary action after confirmation.
- Essential lecturer evidence remains visible; model mechanics and advanced explanations move into accessible disclosures.
- Use the foundation plan's semantic colors, 4/8 spacing rhythm, 14-pixel cards, 10-pixel controls, Manrope body type, and IBM Plex Mono metadata.
- Do not promise cross-device batch persistence or claim page-local simulated processing continues after navigation.
- Use text or icons with every semantic color.
- Preserve loading, empty, not-found, merged, rejected, split, locked, and confirmation states.

---

### Task 1: Simplify Setup around one readiness decision

**Files:**

- Modify: app/page.tsx:35-464
- Create: tests/app/setup-page.test.tsx

**Interfaces:**

- Consumes: Page, Disclosure, ActionArea, shared Button/Card/Field primitives, SessionProvider.
- Produces: The same SetupPage default export and the same run(), loadDemo(), clearAll(), CSV, criteria, prediction, and local form behavior.

- [ ] **Step 1: Write the failing Setup hierarchy test**

Create tests/app/setup-page.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SetupPage from "@/app/page";
import { SessionProvider } from "@/components/session-provider";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

it("presents one truthful primary action and optional advanced guidance", () => {
  const { container } = render(
    <SessionProvider>
      <SetupPage />
    </SessionProvider>,
  );
  expect(
    screen.getByRole("heading", { level: 1, name: "Set up this marking session" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Preview sample analysis" }),
  ).toBeEnabled();
  expect(screen.getByText("Advanced marking guidance")).toBeVisible();
  expect(container.querySelectorAll('button[data-variant="primary"]')).toHaveLength(1);
});
~~~

- [ ] **Step 2: Run the Setup test and verify RED**

Run:

~~~powershell
npm run test:run -- tests/app/setup-page.test.tsx
~~~

Expected: FAIL because the current primary action is Run the pipeline and no Advanced marking guidance disclosure exists.

- [ ] **Step 3: Reorder and tighten the Setup page**

Keep the existing form state and handlers. Apply these exact content and hierarchy changes:

| Area | Required result |
| --- | --- |
| Page lead | “Add the assessment context, marking scheme, and student responses. Required fields are marked.” |
| Header actions | Keep Clear as ghost and Load demo class as secondary. |
| Main order | Assessment context; question; marking scheme and criteria; student responses; optional prediction. |
| Card spacing | CardHead px-5 py-4; bodies px-5 py-5; section gaps 20 pixels. |
| Readiness card | Title Ready to preview; hint Check the required inputs. |
| Primary action | Preview sample analysis. |
| Primary note | “This prototype opens sample results. Nothing is submitted.” |
| Demo note | Keep pseudonymisation disclosure visible but reduce it to two short sentences. |

Keep criteria visible because they are part of the lecturer's decision. Put only criteria mechanics and extraction advice inside:

~~~tsx
<Disclosure
  title="Advanced marking guidance"
  description="How criteria and scheme detail affect the preview"
>
  <p>
    Use one criterion for each independently awarded mark. Include accepted
    alternatives, required units, and method marks in the marking scheme.
  </p>
</Disclosure>
~~~

Change run() only by leaving its behavior intact and changing the visible action label:

~~~tsx
<Button className="w-full" size="lg" disabled={!ready} onClick={run}>
  <Sparkles size={17} strokeWidth={1.9} aria-hidden />
  Preview sample analysis
</Button>
~~~

Remove the invented runtime estimate. Retain the validation message when ready is false.

- [ ] **Step 4: Make the mobile reading order explicit**

At widths below xl, render the readiness summary after the form content so the primary action concludes the setup sequence. At xl and above, keep it in the sticky aside. Do not duplicate the primary button in the DOM. Use CSS grid ordering on the existing Page content rather than rendering a second action.

The compact ready-state note must remain:

~~~tsx
<p className="mt-2 text-center text-[12px] leading-snug text-ink-3">
  This prototype opens sample results. Nothing is submitted.
</p>
~~~

- [ ] **Step 5: Verify GREEN and preserve form behavior**

Run:

~~~powershell
npm run test:run -- tests/app/setup-page.test.tsx
npm run typecheck
npm run lint
~~~

Manually verify Clear, Load demo class, criteria add/remove, paste/CSV/photo tabs, CSV error handling, prediction, disabled readiness, and navigation to /processing.

- [ ] **Step 6: Commit Setup cleanup**

~~~powershell
git add app/page.tsx tests/app/setup-page.test.tsx
git commit -m "feat: simplify lecturer setup flow"
~~~

---

### Task 2: Clarify Processing and Reveal without changing simulation logic

**Files:**

- Modify: app/processing/page.tsx:20-259
- Modify: app/reveal/page.tsx:30-272
- Create: tests/app/processing-page.test.tsx
- Create: tests/app/reveal-page.test.tsx

**Interfaces:**

- Consumes: Existing requestAnimationFrame simulation, SessionProvider, Disclosure, Page, Progress, Card, Badge.
- Produces: Existing ProcessingPage and RevealPage default exports with unchanged state transitions and navigation destinations.

- [ ] **Step 1: Write the failing Processing copy and disclosure test**

Create tests/app/processing-page.test.tsx:

~~~tsx
import { useLayoutEffect, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import ProcessingPage from "@/app/processing/page";
import { SessionProvider, useSession } from "@/components/session-provider";

function UnprocessedSession({ children }: { children: ReactNode }) {
  const { processed, setProcessed } = useSession();
  useLayoutEffect(() => {
    setProcessed(false);
  }, [setProcessed]);
  return processed ? null : children;
}

it("keeps optional processing mechanics collapsed during an active preview", async () => {
  render(
    <SessionProvider>
      <UnprocessedSession>
        <ProcessingPage />
      </UnprocessedSession>
    </SessionProvider>,
  );
  expect(
    await screen.findByRole("heading", { level: 1, name: "Preparing the sample analysis" }),
  ).toBeVisible();
  const summary = screen.getByText("How processing works");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(
    screen.getByText("Keep this page open while the preview is prepared."),
  ).toBeVisible();
});
~~~

- [ ] **Step 2: Write the failing Reveal hierarchy test**

Create tests/app/reveal-page.test.tsx:

~~~tsx
import { useEffect, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import RevealPage from "@/app/reveal/page";
import { SessionProvider, useSession } from "@/components/session-provider";

function ReadySession({ children }: { children: ReactNode }) {
  const { setPrediction, setProcessed } = useSession();
  useEffect(() => {
    setPrediction("Students may add resistance and reactance directly.");
    setProcessed(true);
  }, [setPrediction, setProcessed]);
  return children;
}

it("puts the lecturer comparison before supporting explanation", async () => {
  render(
    <SessionProvider>
      <ReadySession>
        <RevealPage />
      </ReadySession>
    </SessionProvider>,
  );
  expect(
    await screen.findByRole("heading", { level: 1, name: "Compare your prediction" }),
  ).toBeVisible();
  expect(screen.getByText("Your prediction")).toBeVisible();
  expect(screen.getByText("What the sample shows")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "View misconception map" }),
  ).toBeVisible();
});
~~~

- [ ] **Step 3: Run both route tests and verify RED**

Run:

~~~powershell
npm run test:run -- tests/app/processing-page.test.tsx tests/app/reveal-page.test.tsx
~~~

Expected: FAIL on the new headings, truthful processing note, disclosure, and reveal hierarchy.

- [ ] **Step 4: Refactor Processing presentation**

Do not alter the timing constants, requestAnimationFrame lifecycle, processed state write, or route destinations. Use:

- In progress title: Preparing the sample analysis
- In progress lead: Keep this page open while the preview is prepared.
- Completed title: Sample analysis ready
- Completed lead: Review how your prediction compares with the sample evidence.
- Completed primary action: Compare my prediction

Make progress/current stage the first Card. Put counters into one compact three-column definition list. Render stage rows at 48-56 pixels high with one status icon, stage label, and short status sentence.

Wrap the current-stage label and completion message in a polite aria-live region so the page announces meaningful state changes without announcing every timer tick.

Move embedding, similarity, threshold, and clustering copy into:

~~~tsx
<Disclosure
  title="How processing works"
  description="Optional detail about the analysis stages"
>
  <ol className="grid gap-3">
    <li><strong className="text-ink">Extract:</strong> isolate the reasoning in each response.</li>
    <li><strong className="text-ink">Compare:</strong> group responses with similar reasoning patterns.</li>
    <li><strong className="text-ink">Prioritise:</strong> rank patterns by spread and likely mark loss.</li>
  </ol>
</Disclosure>
~~~

Remove You can leave this page — the run continues. Do not describe the timer as a background job.
Qualify stage counters as sample-answer progress rather than results computed from the lecturer's current setup fields.

- [ ] **Step 5: Refactor Reveal presentation**

Use title Compare your prediction and lead See whether the misconception you expected appears in the sample evidence. Put the two comparison panes in the first Card, with exact headings Your prediction and What the sample shows. Place the explicit Match, Partial match, or Miss verdict immediately below the comparison.

Keep runners-up as a compact secondary list. Put token comparison mechanics in:

~~~tsx
<Disclosure
  title="How the comparison is decided"
  description="Optional detail about matching phrases"
>
  <p>
    The preview compares meaningful phrases in the prediction with the leading
    misconception label and its evidence signatures.
  </p>
</Disclosure>
~~~

Rewrite the three verdict descriptions to refer to the sample evidence instead of claiming they describe the lecturer's newly entered class.

When prediction is absent or processed is false, retain the existing route guards but use Preview sample analysis instead of Run the pipeline. The sole primary onward action is View misconception map.

- [ ] **Step 6: Verify GREEN and simulation completion**

Run:

~~~powershell
npm run test:run -- tests/app/processing-page.test.tsx tests/app/reveal-page.test.tsx
npm run test:run
npm run typecheck
npm run lint
~~~

Manually let the processing timer finish once and verify the completed state, session processed flag, and /reveal navigation.

- [ ] **Step 7: Commit Processing and Reveal**

~~~powershell
git add app/processing/page.tsx app/reveal/page.tsx tests/app/processing-page.test.tsx tests/app/reveal-page.test.tsx
git commit -m "feat: clarify processing and reveal hierarchy"
~~~

---

### Task 3: Make the misconception map responsive to cluster count

**Files:**

- Create: lib/cluster-layout.ts
- Create: tests/lib/cluster-layout.test.ts
- Modify: app/map/page.tsx:21-354
- Create: tests/app/map-page.test.tsx

**Interfaces:**

- Consumes: Active cluster id, spread value, and tone from existing session state.
- Produces:
  - BubbleDatum = { id: string; weight: number }
  - BubblePlacement = { id: string; cx: number; cy: number; radius: number }
  - MAX_BUBBLES = 12
  - canRenderBubbleMap(count: number): boolean
  - placeBubbles(items: BubbleDatum[], width: number, height: number): BubblePlacement[]

- [ ] **Step 1: Write failing layout tests**

Create tests/lib/cluster-layout.test.ts:

~~~typescript
import { describe, expect, it } from "vitest";
import {
  MAX_BUBBLES,
  canRenderBubbleMap,
  placeBubbles,
} from "@/lib/cluster-layout";

describe("cluster bubble layout", () => {
  it("places every supported cluster at a unique non-overlapping point", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: "cluster-" + index,
      weight: index + 1,
    }));
    const placed = placeBubbles(items, 760, 380);
    expect(placed).toHaveLength(items.length);
    expect(new Set(placed.map((item) => item.cx + ":" + item.cy)).size).toBe(items.length);

    for (let left = 0; left < placed.length; left += 1) {
      for (let right = left + 1; right < placed.length; right += 1) {
        const dx = placed[left].cx - placed[right].cx;
        const dy = placed[left].cy - placed[right].cy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        expect(distance).toBeGreaterThanOrEqual(
          placed[left].radius + placed[right].radius,
        );
      }
    }
  });

  it("uses the ranked-list fallback above the readable map limit", () => {
    expect(canRenderBubbleMap(MAX_BUBBLES)).toBe(true);
    expect(canRenderBubbleMap(MAX_BUBBLES + 1)).toBe(false);
  });
});
~~~

- [ ] **Step 2: Run the layout test and verify RED**

Run:

~~~powershell
npm run test:run -- tests/lib/cluster-layout.test.ts
~~~

Expected: FAIL because lib/cluster-layout.ts does not exist.

- [ ] **Step 3: Implement the bounded grid placement**

Create lib/cluster-layout.ts:

~~~typescript
export type BubbleDatum = {
  id: string;
  weight: number;
};

export type BubblePlacement = {
  id: string;
  cx: number;
  cy: number;
  radius: number;
};

export const MAX_BUBBLES = 12;

export function canRenderBubbleMap(count: number) {
  return count > 0 && count <= MAX_BUBBLES;
}

export function placeBubbles(
  items: BubbleDatum[],
  width: number,
  height: number,
): BubblePlacement[] {
  if (items.length === 0) return [];
  const columns = Math.ceil(Math.sqrt((items.length * width) / height));
  const rows = Math.ceil(items.length / columns);
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const maxRadius = Math.max(12, (Math.min(cellWidth, cellHeight) - 16) / 2);
  const minWeight = Math.min(...items.map((item) => item.weight));
  const maxWeight = Math.max(...items.map((item) => item.weight));
  const range = Math.max(1, maxWeight - minWeight);

  return items.map((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const scale = (item.weight - minWeight) / range;
    const minRadius = Math.min(24, maxRadius);
    return {
      id: item.id,
      cx: cellWidth * (column + 0.5),
      cy: cellHeight * (row + 0.5),
      radius: minRadius + (maxRadius - minRadius) * scale,
    };
  });
}
~~~

- [ ] **Step 4: Write the failing Map fallback test**

Create tests/app/map-page.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import MapPage from "@/app/map/page";

const state = vi.hoisted(() => {
  const clusters = Array.from({ length: 13 }, (_, index) => ({
    id: "cluster-" + index,
    label: "Misconception " + (index + 1),
    why: "Students use addition where the method requires a combined value.",
    memberIds: ["answer-" + index],
    severity: 2,
    downstream: [],
    isOther: false,
    tone: (index % 6) + 1,
  }));
  return {
    session: {
      answers: [],
      clusters,
      prediction: "",
      sortMode: "spread",
      processed: true,
      confirmed: false,
      confirmedBy: "",
      reviewedCount: 0,
      needsAttention: 0,
      exportReady: false,
      setScore: vi.fn(),
      setStatus: vi.fn(),
      acceptAbove: vi.fn(),
      resetReview: vi.fn(),
      renameCluster: vi.fn(),
      rejectCluster: vi.fn(),
      mergeCluster: vi.fn(),
      splitOut: vi.fn(),
      setPrediction: vi.fn(),
      setSortMode: vi.fn(),
      setProcessed: vi.fn(),
      setConfirmed: vi.fn(),
      setConfirmedBy: vi.fn(),
    },
  };
});

vi.mock("@/components/session-provider", () => ({
  useSession: () => state.session,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

it("falls back to the complete ranked list when the bubble map is too dense", () => {
  render(<MapPage />);
  expect(screen.getByText("Map hidden at this cluster count")).toBeVisible();
  expect(screen.getAllByRole("link", { name: /Misconception/i })).toHaveLength(13);
});
~~~

- [ ] **Step 5: Run the Map test and verify RED**

Run:

~~~powershell
npm run test:run -- tests/app/map-page.test.tsx
~~~

Expected: FAIL because the current five-slot map reuses the final coordinate and does not switch to the ranked-list fallback when cluster count exceeds MAX_BUBBLES.

- [ ] **Step 6: Rebuild Map hierarchy around the tested layout**

Remove the fixed SLOTS array. Derive placements with placeBubbles for active clusters only. Render the SVG only when canRenderBubbleMap(activeClusters.length) is true. Otherwise render:

~~~tsx
<Card className="border-dashed bg-surface-2">
  <div className="px-5 py-6 text-center">
    <Network size={20} className="mx-auto text-ink-3" aria-hidden />
    <h2 className="mt-2 text-[14px] font-bold text-ink">
      Map hidden at this cluster count
    </h2>
    <p className="mx-auto mt-1 max-w-[48ch] text-[12.5px] text-ink-2">
      Use the complete ranked list below to review every misconception clearly.
    </p>
  </div>
</Card>
~~~

Add Network to the existing lucide-react import for the fallback Card.

Put the ranking Segmented control beside the page heading on wide screens and above the ranked list on mobile. Make the ranked list the primary content; keep every cluster link keyboard-accessible and labelled with its misconception, spread, and average loss. Move the spread-versus-damage explanation into a Disclosure titled How prioritisation works.

Use demo-qualified lead copy: Explore the misconception patterns in the sample class, ranked by the measure you choose. Do not claim these patterns came from the lecturer's current setup fields.

- [ ] **Step 7: Verify GREEN**

Run:

~~~powershell
npm run test:run -- tests/lib/cluster-layout.test.ts tests/app/map-page.test.tsx
npm run test:run
npm run typecheck
npm run lint
~~~

Manually verify 0, 1, 4, 8, 12, and 13-cluster arrangements by temporarily supplying test data in the component test only; do not alter lib/mock.ts.

- [ ] **Step 8: Commit Map cleanup**

~~~powershell
git add lib/cluster-layout.ts app/map/page.tsx tests/lib/cluster-layout.test.ts tests/app/map-page.test.tsx
git commit -m "feat: make misconception map scale safely"
~~~

---

### Task 4: Put cluster evidence first and fix keyboard selection

**Files:**

- Modify: app/clusters/[id]/page.tsx:38-536
- Create: tests/app/cluster-detail-page.test.tsx

**Interfaces:**

- Consumes: Existing renameCluster, mergeCluster, splitOut, rejectCluster, cluster and answer data.
- Produces: The same cluster mutation calls and route guards, with native checkbox behavior driving picked student ids.

- [ ] **Step 1: Write the failing keyboard selection regression test**

Create tests/app/cluster-detail-page.test.tsx:

~~~tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ClusterDetailPage from "@/app/clusters/[id]/page";
import { SessionProvider } from "@/components/session-provider";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "cl-impedance" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

it("updates split selection through the checkbox itself", async () => {
  const user = userEvent.setup();
  render(
    <SessionProvider>
      <ClusterDetailPage />
    </SessionProvider>,
  );
  await user.click(screen.getByRole("button", { name: /^split$/i }));
  const checkbox = screen.getAllByRole("checkbox")[0];
  fireEvent.change(checkbox, { target: { checked: true } });
  expect(checkbox).toBeChecked();
});
~~~

- [ ] **Step 2: Run the regression test and verify RED**

Run:

~~~powershell
npm run test:run -- tests/app/cluster-detail-page.test.tsx
~~~

Expected: FAIL because the current checkbox onChange is empty and only the surrounding row click mutates picked.

- [ ] **Step 3: Fix native selection before changing layout**

Use one selection function for row click and input change:

~~~tsx
function setAnswerPicked(answerId: string, selected: boolean) {
  setPicked((current) => {
    if (selected) return current.includes(answerId) ? current : [...current, answerId];
    return current.filter((id) => id !== answerId);
  });
}
~~~

Wire the checkbox directly:

~~~tsx
<input
  type="checkbox"
  checked={picked.includes(m.id)}
  onClick={(event) => event.stopPropagation()}
  onChange={(event) => setAnswerPicked(m.id, event.target.checked)}
  aria-label={"Select " + m.initials + " for split"}
/>
~~~

The row click may call setAnswerPicked with the inverse current state, but it must not double-toggle when the checkbox is activated.

- [ ] **Step 4: Reorder the detail screen**

Use this visible order:

1. Misconception label, active/rejected state, and Generate reteach pack primary action.
2. Compact spread, average loss, and affected-student stats.
3. Verbatim evidence list.
4. Affected-student roster and downstream damage.
5. Rename, merge, split, and reject in a secondary Edit cluster Card.

Keep the existing mutation confirmation and route changes. Use a Disclosure titled Why these responses belong together for signatures and technical rationale. Use ActionArea for split mode so Cancel remains secondary and Split N selected is the only dominant action in that state.

For missing, rejected, or merged ids, keep the existing fallback route behavior and provide one clear Back to misconception map action. For newly split clusters without a reteach pack, preserve the current explanatory state.

- [ ] **Step 5: Verify GREEN and all mutation paths**

Run:

~~~powershell
npm run test:run -- tests/app/cluster-detail-page.test.tsx
npm run test:run
npm run typecheck
npm run lint
~~~

Manually verify rename, merge, split with keyboard only, reject, merged-id fallback, rejected-id fallback, and Back to misconception map in both themes.

- [ ] **Step 6: Commit cluster detail cleanup**

~~~powershell
git add app/clusters/[id]/page.tsx tests/app/cluster-detail-page.test.tsx
git commit -m "fix: make cluster review evidence-first and accessible"
~~~

---

### Task 5: Tighten Reteach selection and lesson actions

**Files:**

- Modify: app/reteach/page.tsx:11-99
- Modify: app/reteach/[id]/page.tsx:29-297
- Create: tests/app/reteach-pages.test.tsx

**Interfaces:**

- Consumes: Existing RETEACH_PACKS, active clusters, copy, Markdown download, and roster CSV download behavior.
- Produces: Existing route exports and download handlers with a compact lesson-first hierarchy.

- [ ] **Step 1: Write the failing Reteach action-group test**

Create tests/app/reteach-pages.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ReteachIndexPage from "@/app/reteach/page";
import ReteachPackPage from "@/app/reteach/[id]/page";
import { SessionProvider } from "@/components/session-provider";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "cl-arithmetic" }),
}));

it("presents the cluster choices under one page heading", () => {
  render(
    <SessionProvider>
      <ReteachIndexPage />
    </SessionProvider>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Choose a misconception to reteach",
  );
  expect(screen.getAllByRole("link", { name: /View pack/i }).length).toBeGreaterThan(0);
});

it("groups the existing copy and download actions in one labelled region", () => {
  render(
    <SessionProvider>
      <ReteachPackPage />
    </SessionProvider>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  const actions = screen.getByRole("region", { name: "Page actions" });
  expect(actions).toContainElement(screen.getByRole("button", { name: /copy lesson/i }));
  expect(screen.getByRole("button", { name: /copy lesson/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /download markdown/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /download roster csv/i })).toBeVisible();
});
~~~

- [ ] **Step 2: Run the Reteach tests and verify RED**

Run:

~~~powershell
npm run test:run -- tests/app/reteach-pages.test.tsx
~~~

Expected: FAIL on the new index heading, current generation claim, and normalized action names.

- [ ] **Step 3: Refine the Reteach index**

Use title Choose a misconception to reteach and lead Open a sample teaching pack for one of the prioritised patterns. Render each cluster as one compact link row with rank, label, affected count, average loss, and a View pack affordance. Do not repeat the algorithm explanation in every row.

Replace generated-content claims with:

~~~tsx
<Disclosure
  title="What each pack contains"
  description="A short lesson and a diagnostic check"
>
  <p>
    Each sample pack includes an explanation, a worked example, a quick
    diagnostic, and the affected-student roster.
  </p>
</Disclosure>
~~~

- [ ] **Step 4: Refine the Reteach detail**

Put the micro-lesson title, objective, explanation, and worked example before diagnostics. Use one ActionArea directly below the page header with these exact existing behaviors:

- Copy lesson invokes the existing Clipboard API handler.
- Download Markdown invokes the existing Markdown Blob handler.
- Download roster CSV invokes the existing CSV Blob handler.

Use the exact accessible names asserted by the test. Keep feedback such as Copied in a polite aria-live region. Render the diagnostics as numbered compact Cards with answer/reveal separation. Keep the no-pack route state and Back to reteach packs action.

- [ ] **Step 5: Verify GREEN and download behavior**

Run:

~~~powershell
npm run test:run -- tests/app/reteach-pages.test.tsx
npm run test:run
npm run typecheck
npm run lint
~~~

Manually verify copied Markdown, downloaded Markdown, roster CSV, no-pack state, long lesson text, and mobile wrapping.

- [ ] **Step 6: Commit Reteach cleanup**

~~~powershell
git add app/reteach/page.tsx app/reteach/[id]/page.tsx tests/app/reteach-pages.test.tsx
git commit -m "feat: simplify reteach pack review"
~~~

---

### Task 6: Compact the score-review workspace

**Files:**

- Modify: app/scores/page.tsx:38-555
- Create: tests/app/scores-page.test.tsx

**Interfaces:**

- Consumes: Existing sort, filter, acceptAbove, setScore, setStatus, answer expansion, criteria, and exportReady behavior.
- Produces: The same ScoresPage route and review actions, plus an accessible table caption and compact responsive toolbar.

- [ ] **Step 1: Write the failing score-workspace semantics test**

Create tests/app/scores-page.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import ScoresPage from "@/app/scores/page";
import { SessionProvider } from "@/components/session-provider";

it("labels the review table and keeps progress ahead of technical detail", () => {
  render(
    <SessionProvider>
      <ScoresPage />
    </SessionProvider>,
  );
  expect(
    screen.getByRole("heading", { level: 1, name: "Review provisional scores" }),
  ).toBeVisible();
  expect(screen.getByText("Student score review")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toBeVisible();
  expect(screen.getByText("How confidence is used")).toBeVisible();
});
~~~

- [ ] **Step 2: Run the Scores test and verify RED**

Run:

~~~powershell
npm run test:run -- tests/app/scores-page.test.tsx
~~~

Expected: FAIL on the new heading, table caption, and confidence disclosure.

- [ ] **Step 3: Rebuild the review header and toolbar**

Use title Review provisional scores and lead Check low-confidence or flagged responses, then confirm the class for export. Put review progress directly under the header in a compact Card containing reviewed count, remaining count, needs-attention count, and Progress.

Use one toolbar row with:

- text search or current filter control;
- status filter;
- sort control;
- one dominant action chosen by state:
  - Accept high-confidence while eligible unreviewed rows remain;
  - Continue to export after exportReady becomes true.

All other controls use secondary, quiet, or ghost variants. Do not create a second primary button in the table.

- [ ] **Step 4: Compact the desktop table and mobile cards**

Add this caption inside the table:

~~~tsx
<caption className="sr-only">Student score review</caption>
~~~

Use 44-52 pixel default table rows, tabular numbers, a sticky header inside the existing horizontal scroller, and deliberate truncation for response excerpts. Keep expanded evidence full-width and readable. Keep the existing mobile-card branch; group score and status controls before evidence expansion.

Add accessible names to every row score input:

~~~tsx
aria-label={"Score for " + answer.initials}
~~~

Keep ConfidenceMeter's text label and pair every flagged/accepted status color with its existing status word or icon. Put threshold and confidence mechanics inside:

~~~tsx
<Disclosure
  title="How confidence is used"
  description="Why some responses need lecturer attention"
>
  <p>
    Confidence helps prioritise review. It does not replace the lecturer's
    score decision, and every provisional mark remains editable.
  </p>
</Disclosure>
~~~

- [ ] **Step 5: Verify GREEN and review state transitions**

Run:

~~~powershell
npm run test:run -- tests/app/scores-page.test.tsx
npm run test:run
npm run typecheck
npm run lint
~~~

Manually verify sorting, every filter, bulk acceptance, editing a score, flagging, accepting, expanding evidence, responsive table/card switching, reviewed progress, and export unlocking.

- [ ] **Step 6: Commit Scores cleanup**

~~~powershell
git add app/scores/page.tsx tests/app/scores-page.test.tsx
git commit -m "feat: compact the score review workspace"
~~~

---

### Task 7: Simplify Export and correct account-persistence claims

**Files:**

- Modify: app/export/page.tsx:38-391
- Modify: components/account-link.tsx:18-112
- Modify: components/auth-provider.tsx:109
- Create: tests/components/account-link.test.tsx
- Create: tests/components/auth-provider.test.tsx
- Create: tests/app/export-page.test.tsx

**Interfaces:**

- Consumes: Existing confirmation, format selection, downloadXlsx, downloadDocx, account link, and exportReady behavior.
- Produces: The same download files and confirmation behavior; account UI describes identity linking without promising batch persistence.

- [ ] **Step 1: Write failing account-state tests**

Create tests/components/account-link.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AccountLink } from "@/components/account-link";
import { AuthProvider } from "@/components/auth-provider";

vi.mock("@/lib/supabase/client", () => ({
  getBrowserClient: () => null,
}));

it("exposes the optional account state as a named region", () => {
  render(
    <AuthProvider>
      <AccountLink />
    </AuthProvider>,
  );
  expect(
    screen.getByRole("region", { name: "Account connection" }),
  ).toBeVisible();
});
~~~

Create tests/components/auth-provider.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/components/auth-provider";

vi.mock("@/lib/supabase/client", () => ({
  getBrowserClient: () => null,
}));

function Probe() {
  const { error, linkEmail } = useAuth();
  return (
    <>
      <button
        onClick={async () => {
          await linkEmail("lecturer@example.edu");
        }}
      >
        Connect
      </button>
      <output>{error}</output>
    </>
  );
}

it("reports unavailable linking without claiming session persistence", async () => {
  const user = userEvent.setup();
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Connect" }));
  expect(screen.getByText("Account linking is unavailable in this preview.")).toBeVisible();
});
~~~

- [ ] **Step 2: Write the failing Export hierarchy test**

Create tests/app/export-page.test.tsx:

~~~tsx
import { useEffect, useRef, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ExportPage from "@/app/export/page";
import { AuthProvider } from "@/components/auth-provider";
import { SessionProvider, useSession } from "@/components/session-provider";

vi.mock("@/lib/supabase/client", () => ({
  getBrowserClient: () => null,
}));

function ReviewedSession({ children }: { children: ReactNode }) {
  const { answers, setStatus } = useSession();
  const prepared = useRef(false);
  useEffect(() => {
    if (prepared.current) return;
    prepared.current = true;
    answers.forEach((answer) => setStatus(answer.id, "accepted"));
  }, [answers, setStatus]);
  return children;
}

it("orders confirmation, format, preview, and one next action", async () => {
  const { container } = render(
    <AuthProvider>
      <SessionProvider>
        <ReviewedSession>
          <ExportPage />
        </ReviewedSession>
      </SessionProvider>
    </AuthProvider>,
  );
  expect(
    await screen.findByRole("heading", { level: 1, name: "Export reviewed results" }),
  ).toBeVisible();
  expect(screen.getByText("Choose a format")).toBeVisible();
  expect(screen.getByText("Preview")).toBeVisible();
  expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
});
~~~

- [ ] **Step 3: Run all three tests and verify RED**

Run:

~~~powershell
npm run test:run -- tests/components/account-link.test.tsx tests/components/auth-provider.test.tsx tests/app/export-page.test.tsx
~~~

Expected: FAIL because AccountLink has no named region, the Supabase fallback message is inaccurate, and Export does not yet expose the new sequential hierarchy.

- [ ] **Step 4: Correct account-linking copy only**

Do not add storage or change authentication calls. In AccountLink use:

- Heading: Connect an email
- Body: Use an email for your Markwise identity. This demo batch remains in this tab.
- Linked state: Signed in as EMAIL. Batch results are not synced in this preview.
- Submit action: Connect email

Keep current validation, loading, success, and error mechanics. In AuthProvider replace Connect Supabase to keep this session across devices. with Account linking is unavailable in this preview.

Apply role="region" and aria-label="Account connection" to the loading, linked, pending, demo, and anonymous root states. Manually verify all five states because the wording is human-facing prose rather than logic: loading skeleton, connected email, pending confirmation, disconnected demo, and available anonymous linking.

- [ ] **Step 5: Rebuild Export as a sequential confirmation flow**

Use title Export reviewed results and lead Confirm the reviewer, choose a format, and download the reviewed sample. Preserve the locked state when exportReady is false.

In the ready state, use this order:

1. Compact review-complete summary.
2. Lecturer confirmation.
3. Choose a format.
4. Preview.
5. AccountLink as a visually secondary optional section.
6. One download action after confirmation.

Before confirmation, Confirm reviewer is the only primary action. After confirmation, Download XLSX or Download DOCX is the only primary action based on the selected format. Format cards remain radios, not primary buttons. Use exact section headings Choose a format and Preview.

Keep downloadXlsx, downloadDocx, buildRows, filenames, document contents, and Blob behavior unchanged. Correct the preview column label from Name to Initials because the data contains initials.

- [ ] **Step 6: Verify GREEN and real downloads**

Run:

~~~powershell
npm run test:run -- tests/components/account-link.test.tsx tests/components/auth-provider.test.tsx tests/app/export-page.test.tsx
npm run test:run
npm run typecheck
npm run lint
~~~

Manually verify locked state, reviewer validation, confirmation, both format choices, XLSX download, DOCX download, initials preview, account link validation, and mobile overflow.

- [ ] **Step 7: Commit Export and account-copy cleanup**

~~~powershell
git add app/export/page.tsx components/account-link.tsx components/auth-provider.tsx tests/components/account-link.test.tsx tests/components/auth-provider.test.tsx tests/app/export-page.test.tsx
git commit -m "feat: simplify export and correct persistence copy"
~~~

---

### Task 8: Complete cross-route visual and accessibility verification

**Files:**

- Modify only when a failing check identifies a concrete defect:
  - app/globals.css
  - components/ui.tsx
  - components/shell.tsx
  - components/app-navigation.tsx
  - components/top-bar.tsx
  - components/settings-dialog.tsx
  - components/overlay-panel.tsx
  - app/page.tsx
  - app/processing/page.tsx
  - app/reveal/page.tsx
  - app/map/page.tsx
  - app/clusters/[id]/page.tsx
  - app/reteach/page.tsx
  - app/reteach/[id]/page.tsx
  - app/scores/page.tsx
  - app/export/page.tsx
- Add one focused regression test beside the relevant existing test file for every defect fixed in this task.

**Interfaces:**

- Consumes: The complete theme/shell foundation and Tasks 1-7.
- Produces: A verified, buildable UI with no new domain behavior.

- [ ] **Step 1: Run the automated completion gate**

Run:

~~~powershell
npm run lint
npm run typecheck
npm run test:run
npm run build
~~~

Expected: all four commands exit 0 with pristine test output. If a command fails, use superpowers:systematic-debugging, write or refine the smallest reproducing test, verify RED, implement the minimal correction, and rerun the full gate.

- [ ] **Step 2: Start the production build for visual review**

Run:

~~~powershell
npm run start -- -p 3017
~~~

Review these routes:

- /
- /processing
- /reveal
- /map
- /clusters/cl-impedance
- /reteach
- /reteach/cl-arithmetic
- /scores
- /export

Use these viewport sizes:

- 1440 by 1000
- 1024 by 900
- 768 by 1024
- 390 by 844

- [ ] **Step 3: Verify both appearances and responsive constraints**

For every route and viewport:

- select Light in Settings and hard-reload;
- select Dark in Settings and hard-reload;
- select Use device setting and test both operating-system preferences;
- confirm no first-paint theme flash;
- confirm text, borders, focus rings, semantic states, SVG labels, inputs, and overlays remain legible;
- confirm long course names, labels, error messages, and excerpts wrap or truncate intentionally;
- confirm the desktop frame disappears below the desktop breakpoint;
- confirm no horizontal page overflow outside intentional table scrollers.

Capture review screenshots in .next/ui-review for all nine routes at 1440 by 1000 in Light and Dark, plus Setup, Map, Scores, and Export at 390 by 844 in Light and Dark. Compare the captures as a set for shell alignment, section rhythm, heading scale, primary-action hierarchy, and semantic-color consistency. Keep .next outputs untracked.

If a defect appears, first add a failing semantic, layout-helper, or interaction test that reproduces it. Then make the smallest production correction and rerun the focused test.

- [ ] **Step 4: Complete keyboard-only traversal**

Without a pointing device, traverse:

1. Skip link to main content.
2. Desktop navigation and mobile navigation.
3. Settings open, three appearance radios, Escape, overlay close, and focus restoration.
4. Setup fields, tabs, criteria controls, disclosure, and primary action.
5. Processing disclosure and completed onward action.
6. Reveal comparison and map action.
7. Map sorting, cluster links, and fallback list.
8. Cluster rename, merge, split selection, reject, and fallback states.
9. Reteach copy/download controls.
10. Scores filters, sorting, score inputs, statuses, evidence expansion, and export action.
11. Export confirmation, format radios, account form, and download action.

Expected: focus is always visible, never escapes an open modal panel, follows a meaningful order, and returns to the trigger after dismissal.

- [ ] **Step 5: Inspect empty, error, and transition states**

Verify:

- Setup not ready and invalid CSV.
- Processing in progress and completed.
- Reveal without prediction and before processing.
- Map with zero clusters and more than twelve clusters in component tests.
- Cluster not found, rejected, merged, and split mode.
- Reteach before processing and missing pack.
- Scores with attention items, partially reviewed, and export ready.
- Export locked, validation error, confirmed, account error, and downloading.

Every state must contain a clear heading, a short explanation, and no more than one action using the primary button treatment.

- [ ] **Step 6: Rerun verification after visual fixes**

Run:

~~~powershell
npm run lint
npm run typecheck
npm run test:run
npm run build
git diff --check
git status --short
~~~

Expected: all verification commands exit 0; git diff --check emits no output; git status lists only intentional final verification fixes and their regression tests.

- [ ] **Step 7: Close the production server and confirm the working tree**

Stop the npm run start process with Ctrl+C. Every defect found in Steps 3-5 must already have been committed with its focused regression test and explicit file paths immediately after that test returned GREEN. Run git status --short once more; expected output is empty. Do not create an empty verification commit.
