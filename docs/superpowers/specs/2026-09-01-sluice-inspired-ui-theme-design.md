# Markwise Sluice-Inspired UI and Theme Design

Status: Approved in design review

Date: 2026-09-01

## Summary

Markwise will adopt a calmer, more compact visual system inspired by the Sluice interface while preserving Markwise's existing navy and cyan identity. The redesign will reduce visual competition, clarify what lecturers should do next, improve spacing and typography, and add Light, Dark, and Use device setting appearance options inside Settings.

The existing seven-stage workflow, route structure, grading behavior, client-side session behavior, and export behavior remain unchanged. This is a presentation and interaction-quality project, not a backend or model-pipeline project.

## Context

The current interface is polished but uses large cards, generous spacing, repeated explanatory copy, and multiple visually prominent panels on the same screen. This makes complex marking concepts feel denser than necessary. Settings and Help currently appear in the shell without a complete settings experience, and the CSS supports only a light appearance.

The Sluice reference is useful for its framed workspace, restrained surfaces, compact navigation, fine borders, sparse hierarchy, and controlled use of mono metadata. Markwise should borrow those structural qualities without copying Sluice's dark command-center aesthetic, animation, or typography wholesale.

## Goals

- Make the interface immediately understandable to a lecturer who is not interested in model internals.
- Preserve Markwise's navy and cyan brand colors.
- Establish consistent spacing, type hierarchy, surface treatment, and control sizing.
- Keep the seven primary workflow stages visible and easy to revisit.
- Give each screen one unmistakable primary action.
- Move optional technical explanations behind accessible disclosures.
- Provide persistent Light, Dark, and Use device setting appearance choices in Settings.
- Improve keyboard, focus, contrast, dialog, drawer, and reduced-motion behavior.
- Preserve all current route and domain behavior.

## Non-goals

- Connecting setup inputs to a real grading or clustering pipeline.
- Adding or changing Supabase persistence.
- Changing grading calculations, cluster mutations, review rules, or export contents.
- Replacing the seven-stage workflow with a different product model.
- Adding Sluice's boot animation, magnetic interactions, visual effects, or icon-only navigation.
- Rebranding Markwise or introducing a new display font.

## Design principles

### Lecturer-first hierarchy

Every page uses three layers:

1. The action or decision required now.
2. The evidence needed to make that decision.
3. Optional technical detail under a How it works disclosure.

Lecturer-facing evidence, confidence, review status, and next actions remain visible. Embedding, cosine similarity, thresholds, pipeline mechanics, and similar implementation explanations become optional.

### One primary action

Each view state has one visually dominant next action. Secondary actions use quieter treatments and are grouped near the content they affect. Sequential flows may change that dominant action after a state transition, such as Export moving from confirmation to download. Cluster detail may keep its correction tools together while Generate reteach pack remains the dominant onward action. Long pages use a consistent action area so the next step is not lost below the fold.

### Calm density

The redesign becomes more compact without becoming cramped. It uses smaller radii, shorter text blocks, restrained shadows, fine borders, and an 8-point spacing rhythm. Dense data surfaces retain enough row height and contrast for comfortable review.

### Familiar navigation

Desktop navigation remains compact and always labeled. An icon-only hover rail is rejected because stage names carry important meaning for infrequent users. Child routes remain visually associated with Map or Reteach.

## Information architecture

The main navigation remains:

1. Setup
2. Processing
3. Reveal
4. Map
5. Reteach
6. Scores
7. Export

Cluster detail stays subordinate to Map. Reteach detail stays subordinate to Reteach. Existing routes and navigation semantics are preserved.

Every main screen receives a standard page header with:

- a compact stage eyebrow or breadcrumb;
- a clear page title;
- a single-sentence description focused on the lecturer's task;
- an optional status or primary action aligned consistently.

## Visual system

### Typography

- Retain Manrope for interface and reading text.
- Retain IBM Plex Mono for compact metadata, labels, counters, and technical values.
- Do not add Oxanium or another display family.
- Tighten heading line-height and reduce unnecessary heading size variation.
- Keep body copy at readable sizes with shorter line lengths.
- Use uppercase mono text sparingly for metadata, not for long instructions.

### Color

The current brand anchors remain navy and cyan. All colors move behind semantic variables so components do not depend on light-only values.

Light appearance:

- a warm, quiet page ground;
- near-white shell and surface layers;
- navy primary text and primary actions;
- cyan accent and focus treatment;
- neutral blue-grey secondary text and borders;
- existing success, warning, and danger meanings with accessible contrast.

Dark appearance:

- deep navy page, shell, and surface layers rather than pure black;
- warm-white primary text;
- softer blue-grey secondary text and borders;
- cyan remains the accent and may carry primary emphasis where navy would disappear;
- success, warning, danger, and confidence colors are tuned independently for dark surfaces.

Color is never the only carrier of status. Text, icons, or labels accompany semantic colors.

### Spacing and geometry

- Use a 4-pixel base with an 8-point spacing rhythm for most layout decisions.
- Use compact internal gaps for tightly related controls and larger gaps only between page sections.
- Reduce general card radii from approximately 20 pixels to 12-16 pixels.
- Use approximately 10-pixel radii for fields and compact controls.
- Keep pills fully rounded only where pill semantics are useful.
- Prefer hairline borders and subtle elevation to large shadows.
- Constrain reading widths while allowing tables, maps, and evidence panes to use the available workspace.

## Application shell

On large screens, the application sits inside a subtly framed workspace with approximately 12-16 pixels of outer breathing room, a fine border, and a large outer radius. The frame becomes full-bleed at smaller widths.

The desktop shell uses:

- a compact, always-labeled sidebar of approximately 224-232 pixels;
- a shorter header of approximately 64 pixels;
- clear active, completed, and available stage states;
- a quiet account area and Settings entry;
- consistent page padding that scales from mobile to wide desktop;
- a content maximum that prevents sparse screens from stretching excessively.

The header and sidebar should support the workflow rather than compete with page content. Decorative text is reduced, but course code, course title, and child-route context remain available wherever they orient the lecturer. Duplicate metadata may be consolidated only when that orientation is preserved.

On mobile, navigation uses a full-height drawer over a full-width page. The drawer traps focus, closes with Escape or the overlay, restores focus to its trigger, and prevents background scrolling while open.

## Settings and appearance

Selecting Settings opens a focused right-side panel on desktop and a full-width dialog on small screens. The panel is a real accessible dialog and includes an Appearance group with:

- Light
- Dark
- Use device setting

If no stored preference is available, Light is the initial fallback. The selected preference is stored locally on the device. Use device setting follows the operating-system preference and responds when that preference changes.

A small pre-paint bootstrap applies the resolved appearance before the React interface hydrates, preventing a light-to-dark flash and avoiding hydration mismatch. If storage or media-query APIs are unavailable, the app falls back safely without blocking rendering.

The dialog includes:

- an explicit title and close button;
- focus trapping;
- Escape and overlay dismissal;
- focus restoration to the Settings trigger;
- background scroll locking;
- visible keyboard focus;
- a clear selected state for the appearance control.

There is no redundant theme toggle in the main header. Appearance lives in Settings as requested.

## Shared component changes

The redesign should be implemented through shared primitives rather than one-off page styling. The expected component boundaries are:

- ThemeProvider: stores the selected mode, resolves system mode, applies the root data attribute, and exposes appearance controls.
- SettingsDialog: owns dialog presentation and keyboard behavior while consuming ThemeProvider state.
- Disclosure: presents optional How it works or advanced content with native, keyboard-accessible semantics.
- Page header and action area: normalize page hierarchy and primary-action placement.
- Existing Button, Card, CardHead, Badge, Stat, Progress, Segmented, Field, Input, Textarea, ConfidenceMeter, status, criteria, and expanded-evidence patterns: adopt semantic tokens, corrected geometry, deliberate wrapping or truncation, and consistent interaction states.
- AppShell: adopts the framed workspace and integrates the functional Settings entry.

The current shell responsibilities should be split into focused modules for desktop navigation, mobile navigation, top-bar behavior, and Settings so the two focus-managed overlays do not compete for state. The public AppShell and Page APIs should remain clear.

## Screen designs

### Setup

Present one clear setup form in the order a lecturer naturally thinks: assessment context, question and marking scheme, student responses, then optional prediction. Keep essential validation beside the affected field. Move advanced grading guidance into a disclosure. Replace competing summary panels with a compact Ready to process summary and one Run action.

### Processing

Make progress, current stage, and completion state the visual center. Show the stage list in a compact scan-friendly form. Move explanations of embeddings, similarity, thresholds, and clustering mechanics into How processing works. Preserve the current simulated processing behavior and navigation.

### Reveal

Prioritize the lecturer's prediction, the discovered misconception, and the evidence that explains the comparison. Reduce decorative metrics and repeated explanatory copy. Match, partial match, or miss remains explicit in both text and color.

### Map

Show prioritized misconception clusters and the ranking control first. Keep the visual bubble map as a useful supporting view but reduce its decorative prominence. Cluster size, spread, damage, and review state remain visible; algorithmic detail moves into a disclosure. The visual layout must never reuse one fixed coordinate for overflow clusters. It should calculate non-overlapping positions for the current count or fall back to the complete ranked list when the canvas cannot present every cluster clearly.

### Cluster detail

Order content as misconception definition, supporting evidence, affected students, downstream damage, and recommended response. Rename, merge, split, and reject remain available but become visually secondary to evidence review. Selection controls must be fully keyboard-operable. Existing not-found, merged, rejected, and newly split route states remain understandable and navigable.

### Reteach

Lead with the generated teaching response and diagnostic material. Group copy and download actions, plus any existing secondary actions, in one predictable control area. Keep empty-pack states clear and actionable without presenting them as errors.

### Scores

Use a compact review toolbar, visible review progress, straightforward filters, and restrained semantic status styling. Preserve the responsive desktop table and mobile card pattern. Keep row-level evidence and rationale close to the score decision without crowding the main list.

### Export

Reduce the page to review completion, format selection, export preview, lecturer confirmation, and one clear download action. Keep account linking secondary and ensure copy does not overstate persistence beyond current behavior. Preserve the existing client-side XLSX and DOCX generation.

## Responsive behavior

- Wide desktop: framed shell, labeled sidebar, generous data workspace.
- Standard desktop and tablet: tighter page padding and columns that collapse before text becomes narrow.
- Mobile: full-bleed shell, drawer navigation, single-column forms and cards, full-width primary actions where helpful.
- Dense tables retain horizontal overflow or switch to the existing mobile-card presentation.
- Sticky regions must not obscure content or compete with mobile browser chrome.
- Long course titles, lecturer names, labels, and error messages must wrap or truncate intentionally.

## Accessibility

The target is WCAG 2.1 AA for the redesigned interface.

- Preserve and verify the skip link.
- Use semantic headings in a consistent hierarchy.
- Apply aria-current to active navigation.
- Provide visible focus states in both appearances.
- Ensure dialogs and drawers have correct labels, focus containment, dismissal, and restoration.
- Make disclosures, segmented controls, maps, checkboxes, and row actions keyboard-operable.
- Maintain sufficient contrast for text, controls, borders needed for comprehension, and focus rings.
- Combine color with labels or icons for every status.
- Respect reduced-motion preferences and avoid adding decorative animation.
- Announce blocking errors and important asynchronous completion states appropriately.

## State, data, and failure handling

Appearance is the only new persistent UI state in this project. It remains local to the browser and does not imply account synchronization.

No domain data shape or server flow changes are part of this design. Existing in-memory session state, seeded data, authentication behavior, processing simulation, cluster edits, review behavior, and generated exports remain as implemented. Existing domain pages and providers remain client-side; they should not migrate across server/client boundaries merely to support the visual redesign.

If initialization partially fails after load, appearance degrades to the device setting when available and then to Light. Storage failures do not prevent changing the theme for the current tab. Media-query listeners are attached only for Use device setting and are cleaned up correctly.

Existing loading, empty, validation, and error states receive the same visual hierarchy and theme coverage as normal states. Copy adjusted during the redesign must describe actual current behavior. In particular, it must not promise cross-device batch persistence or claim that the current page-local processing simulation continues after navigation.

## Verification strategy

Use focused automated tests rather than broad snapshot coverage. Reuse existing test infrastructure if present; otherwise add the smallest practical setup needed for theme, Settings, and disclosure checks. Tests should cover:

- resolving Light, Dark, and Use device setting;
- reading and writing a valid stored preference;
- safe handling of missing or invalid storage values;
- reacting to operating-system appearance changes;
- Settings dialog open, close, Escape, focus trap, and focus restoration behavior;
- disclosure keyboard behavior and accessible naming;
- key shared component states in both themes where practical.

Final verification includes:

- lint with zero new warnings;
- strict TypeScript checking;
- the focused automated tests;
- a production Next.js build;
- route-by-route visual checks in Light and Dark at desktop, tablet, and mobile widths;
- keyboard-only traversal of navigation, Settings, disclosures, forms, map interactions, score review, and export;
- contrast, overflow, reduced-motion, empty-state, loading-state, and error-state review;
- visual review against this spec's shell, spacing, hierarchy, and theme requirements while retaining Markwise branding.

## Implementation sequence

1. Establish theme utilities, semantic CSS tokens, pre-paint initialization, and focused tests.
2. Refine shared UI primitives and add the disclosure, page-header, and action-area patterns.
3. Rework AppShell, responsive navigation, and Settings dialog.
4. Apply the information hierarchy to Setup, Processing, and Reveal.
5. Apply it to Map and cluster detail.
6. Apply it to Reteach, Scores, and Export.
7. Complete responsive, theme, accessibility, and regression verification across every route.

## Acceptance criteria

- Markwise retains its navy and cyan visual identity and existing font families.
- On desktop, the UI uses the framed workspace, labeled sidebar, shorter header, semantic color tokens, and reduced decorative surfaces defined in this spec, without adding Sluice-specific branding, boot animation, magnetic interactions, or icon-only navigation.
- Navigation remains labeled and the seven primary stages remain intact.
- Every primary screen state exposes exactly one visually dominant next action in its header or action area and uses a shorter task-focused introduction.
- Optional technical explanations are available through accessible disclosures rather than competing with core decisions.
- Shared primitives use the same tokenized spacing, typography, radii, border, wrapping, truncation, and focus-state rules across routes.
- Light, Dark, and Use device setting work from Settings, persist locally, and do not flash incorrectly on initial paint.
- Settings and mobile navigation meet the approved keyboard and focus behavior.
- All current route behavior, grading behavior, edits, reviews, and exports continue to work.
- The project passes the agreed automated and manual verification checks.
