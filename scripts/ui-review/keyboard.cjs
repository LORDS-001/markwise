/* eslint-disable @typescript-eslint/no-require-imports */
const {
  DEFAULT_ORIGIN,
  closeBrowser,
  ensureOutputDir,
  evaluate,
  navigate,
  openPage,
  waitFor,
  writeJson,
} = require("./cdp-common.cjs");

const GROUP_NAMES = [
  "Skip link",
  "Desktop and mobile navigation",
  "Settings theme controls",
  "Setup workflow",
  "Processing workflow",
  "Reveal workflow",
  "Map workflow",
  "Cluster workflow",
  "Reteach workflow",
  "Scores workflow",
  "Export workflow",
];
const HYDRATION_READY_EXPRESSION =
  "document.readyState === 'complete' && !!document.querySelector('main#main')";
const SPLIT_MEMBER_TAB_OPTIONS = { shift: true };
const EXPORT_READY_TAB_OPTIONS = { shift: true };
const MERGE_RETURN_KEY = { key: "ArrowLeft", modifiers: 1, isSystemKey: true };
const REJECT_DESTINATION = "/map";
const SCORES_EVIDENCE_EXPRESSION = `document.activeElement.getAttribute('aria-expanded') === 'true' && (() => {
  const panel = document.querySelector('td[colspan="8"]');
  return !!panel && panel.textContent.includes('Marking scheme, criterion by criterion');
})()`;

const KEY_DEFINITIONS = {
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  Home: { key: "Home", code: "Home", windowsVirtualKeyCode: 36 },
  End: { key: "End", code: "End", windowsVirtualKeyCode: 35 },
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  KeyA: { key: "a", code: "KeyA", windowsVirtualKeyCode: 65 },
};

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
}

async function focusSnapshot(cdp) {
  return evaluate(cdp, `(() => {
    const element = document.activeElement;
    const rect = element?.getBoundingClientRect();
    const style = element ? getComputedStyle(element) : null;
    const labels = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? [...(element.labels || [])].map((label) => label.textContent?.trim()).filter(Boolean).join(" ")
      : "";
    const name = element?.getAttribute?.("aria-label") ||
      (element?.getAttribute?.("aria-labelledby") || "").split(/\\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ") ||
      labels || element?.textContent?.replace(/\\s+/g, " ").trim() || element?.getAttribute?.("title") || "";
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    const meaningfulOutline = style && style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    const meaningfulShadow = style && style.boxShadow !== "none";
    return {
      tag: element?.tagName || null,
      type: element?.getAttribute?.("type") || null,
      role: element?.getAttribute?.("role") || null,
      id: element?.id || null,
      name: name.slice(0, 180),
      href: element?.getAttribute?.("href") || null,
      value: "value" in (element || {}) ? element.value : null,
      checked: "checked" in (element || {}) ? element.checked : null,
      selected: element?.getAttribute?.("aria-selected"),
      ariaChecked: element?.getAttribute?.("aria-checked"),
      expanded: element?.getAttribute?.("aria-expanded"),
      disabled: !!element?.disabled,
      focusVisible: !!element?.matches?.(":focus-visible"),
      visibleFocusTreatment: !!element?.matches?.(":focus-visible") && !!(meaningfulOutline || meaningfulShadow),
      rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      visible: !!rect && rect.width > 0 && rect.height > 0 && style?.visibility !== "hidden" && style?.display !== "none",
      onScreen: !!rect && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight,
      dialogOpen: !!dialog,
      insideOpenDialog: !!dialog && !!dialog.contains(element),
      pathname: location.pathname,
      hash: location.hash,
    };
  })()`);
}

function recordFocus(context, snapshot, reason) {
  const focusableDocumentRoot = snapshot.tag === "BODY" || snapshot.tag === "HTML";
  invariant(snapshot.visible || focusableDocumentRoot, `${reason}: focused element is not visible: ${JSON.stringify(snapshot)}`);
  invariant(snapshot.onScreen || focusableDocumentRoot, `${reason}: focused element is offscreen: ${JSON.stringify(snapshot)}`);
  if (!focusableDocumentRoot) {
    invariant(snapshot.focusVisible, `${reason}: :focus-visible did not match: ${snapshot.name}`);
    invariant(snapshot.visibleFocusTreatment, `${reason}: no computed focus treatment: ${snapshot.name}`);
  }
  if (snapshot.dialogOpen) invariant(snapshot.insideOpenDialog, `${reason}: focus escaped modal: ${snapshot.name}`);
  context.focus.push({ reason, ...snapshot });
}

async function press(cdp, context, keyName, modifiers = 0) {
  const definition = KEY_DEFINITIONS[keyName];
  invariant(definition, `Unknown key ${keyName}`);
  const shift = Boolean(modifiers & 8);
  const control = Boolean(modifiers & 2);
  const alt = Boolean(modifiers & 1);
  const meta = Boolean(modifiers & 4);
  const base = {
    ...definition,
    modifiers,
    isSystemKey: alt,
    autoRepeat: false,
    isKeypad: false,
  };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
  if (definition.text && !control && !alt && !meta) {
    await cdp.send("Input.dispatchKeyEvent", { type: "char", ...base, text: definition.text });
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  await delay(30);
  const after = await focusSnapshot(cdp);
  context.keys.push({ key: keyName, shift, control, after: { name: after.name, tag: after.tag, role: after.role, pathname: after.pathname } });
  if (keyName === "Tab") recordFocus(context, after, shift ? "Shift+Tab" : "Tab");
  return after;
}

function printableKeyPayload(character) {
  const key = character;
    const code = /^[a-z]$/i.test(character) ? `Key${character.toUpperCase()}` : /^\d$/.test(character) ? `Digit${character}` : character === " " ? "Space" : "Unidentified";
    const virtualKey = character.length === 1 ? character.toUpperCase().charCodeAt(0) : 0;
  const keyEvent = { key, code, windowsVirtualKeyCode: virtualKey };
  return { keyEvent, charEvent: { ...keyEvent, text: character } };
}

async function typeText(cdp, context, value) {
  for (const character of value) {
    const { keyEvent, charEvent } = printableKeyPayload(character);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...keyEvent });
    await cdp.send("Input.dispatchKeyEvent", { type: "char", ...charEvent });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...keyEvent });
    context.keys.push({ key: character, textInput: true });
  }
  await delay(40);
}

function replacementPlan(value) {
  return value === "" ? ["KeyA", "Backspace"] : ["KeyA", "Text"];
}

async function replaceText(cdp, context, value) {
  await press(cdp, context, "KeyA", 2);
  if (replacementPlan(value).includes("Backspace")) {
    await press(cdp, context, "Backspace");
  } else {
    await typeText(cdp, context, value);
  }
}

function focusSignature(snapshot) {
  return [
    snapshot.tag,
    snapshot.role,
    snapshot.id,
    snapshot.name,
    snapshot.href,
    snapshot.rect?.left,
    snapshot.rect?.top,
  ].join("|");
}

async function tabTo(cdp, context, predicate, label, options = {}) {
  const shift = options.shift ? 8 : 0;
  const maximum = options.maximum || 100;
  const seen = new Set();
  for (let index = 0; index < maximum; index += 1) {
    const current = await focusSnapshot(cdp);
    if (predicate(current)) {
      recordFocus(context, current, `matched ${label}`);
      return current;
    }
    const signature = focusSignature(current);
    if (seen.has(signature) && index > 1) throw new Error(`Focus wrapped before ${label}; current ${JSON.stringify(current)}`);
    seen.add(signature);
    const next = await press(cdp, context, "Tab", shift);
    if (predicate(next)) return next;
  }
  throw new Error(`Could not reach ${label} within ${maximum} Tab stops`);
}

async function assertEval(cdp, context, label, expression) {
  const result = await evaluate(cdp, expression);
  invariant(Boolean(result), `${label} failed; value ${JSON.stringify(result)}`);
  context.assertions.push({ label, pass: true, value: result });
  return result;
}

function assertObserved(context, label, value) {
  invariant(Boolean(value), `${label} failed; value ${JSON.stringify(value)}`);
  context.assertions.push({ label, pass: true, value });
  return value;
}

async function waitForObserved(predicate, label, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await delay(80);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function activate(cdp, context, key = "Enter") {
  return press(cdp, context, key);
}

async function waitPath(cdp, pathname) {
  return waitFor(cdp, `location.pathname === ${JSON.stringify(pathname)}`, 20_000);
}

function named(pattern) {
  return (snapshot) => pattern.test(snapshot.name);
}

function isRadioSnapshot(snapshot) {
  return snapshot.role === "radio" || (snapshot.tag === "INPUT" && snapshot.type === "radio");
}

function historyEntryForPath(entries, pathname) {
  return [...entries].reverse().find((entry) => {
    try {
      return new URL(entry.url).pathname === pathname;
    } catch {
      return false;
    }
  });
}

function visibleStatusCountExpression(label) {
  return `(() => [...document.querySelectorAll('button')].filter((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return button.textContent.trim() === ${JSON.stringify(label)} &&
      rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }).length)()`;
}

async function runKeyboard(options = {}) {
  const debugPort = Number(options.debugPort || process.argv[2] || 9222);
  const outputName = options.outputName || process.argv[3] || "chrome-keyboard.json";
  const origin = options.origin || process.env.UI_REVIEW_ORIGIN || DEFAULT_ORIGIN;
  const cdp = await openPage(debugPort);
  const downloadsDirectory = ensureOutputDir("downloads");
  const downloads = [];
  cdp.on("Browser.downloadWillBegin", (event) => downloads.push({ suggestedFilename: event.suggestedFilename, url: event.url }));
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadsDirectory, eventsEnabled: true });
  await cdp.send("Emulation.setEmulatedMedia", { media: "screen", features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "no-preference" }] });
  const groups = [];
  let activeContext;

  async function group(name, work) {
    invariant(name === GROUP_NAMES[groups.length], `Unexpected group order: ${name}`);
    const context = { name, pass: false, keys: [], focus: [], assertions: [], startedAt: new Date().toISOString() };
    activeContext = context;
    try {
      await work(context);
      invariant(context.keys.length > 0, `${name} dispatched no keyboard events`);
      invariant(context.focus.length > 0, `${name} captured no focus evidence`);
      invariant(context.assertions.length > 0, `${name} captured no resulting state assertion`);
      context.pass = true;
    } catch (error) {
      context.error = error.stack || String(error);
      groups.push(context);
      throw error;
    }
    groups.push(context);
  }

  try {
    await group("Skip link", async (context) => {
      await setViewport(cdp, 1440, 1000);
      await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
      await navigate(cdp, `${origin}/`, "document.readyState === 'complete' && !!document.querySelector('main#main')");
      let focus = await press(cdp, context, "Tab");
      invariant(focus.href === "#main", `native first focus was not skip link: ${JSON.stringify(focus)}`);
      await activate(cdp, context);
      await assertEval(cdp, context, "native no-JS skip preserves fragment navigation", "location.hash === '#main' && document.querySelectorAll('main#main[tabindex=\"-1\"]').length === 1");
      await cdp.send("Emulation.setScriptExecutionDisabled", { value: false });
      await navigate(cdp, `${origin}/`);
      focus = await press(cdp, context, "Tab");
      invariant(focus.href === "#main", "hydrated first focus was not skip link");
      await activate(cdp, context);
      await waitFor(cdp, "document.activeElement === document.querySelector('main#main')");
      await assertEval(cdp, context, "hydrated skip focus assist targets real main", "document.activeElement === document.querySelector('main#main') && location.hash === '#main'");
    });

    await group("Desktop and mobile navigation", async (context) => {
      await setViewport(cdp, 1440, 1000);
      await navigate(cdp, `${origin}/`);
      await tabTo(cdp, context, named(/^Score review/), "desktop Score review");
      await activate(cdp, context);
      await waitPath(cdp, "/scores");
      await assertEval(cdp, context, "desktop navigation activation", "location.pathname === '/scores'");

      await setViewport(cdp, 390, 844);
      await navigate(cdp, `${origin}/`);
      await press(cdp, context, "Tab");
      const trigger = await press(cdp, context, "Tab");
      invariant(/Open navigation/.test(trigger.name), `mobile trigger missing: ${JSON.stringify(trigger)}`);
      await activate(cdp, context);
      const initial = await waitFor(cdp, "document.querySelector('[role=dialog]') && document.activeElement?.getAttribute('aria-label')");
      invariant(initial === "Close navigation", `drawer initial focus ${initial}`);
      await press(cdp, context, "Tab", 8);
      await assertEval(cdp, context, "mobile drawer reverse wrap remains contained", "document.querySelector('[role=dialog]').contains(document.activeElement) && /Settings/.test(document.activeElement.textContent)");
      await press(cdp, context, "Escape");
      await assertEval(cdp, context, "mobile drawer Escape restores trigger", "!document.querySelector('[role=dialog]') && document.activeElement?.getAttribute('aria-label') === 'Open navigation'");
      await activate(cdp, context);
      await tabTo(cdp, context, named(/^Misconception map/), "mobile map navigation");
      await activate(cdp, context);
      await waitPath(cdp, "/map");
      await assertEval(cdp, context, "mobile navigation link activates and closes drawer", "location.pathname === '/map' && !document.querySelector('[role=dialog]')");
    });

    await group("Settings theme controls", async (context) => {
      await setViewport(cdp, 1440, 1000);
      await navigate(cdp, `${origin}/`);
      await evaluate(cdp, "localStorage.setItem('markwise-theme','system'); location.reload(); true");
      await waitFor(cdp, HYDRATION_READY_EXPRESSION);
      await tabTo(cdp, context, named(/^Settings$/), "Settings trigger");
      await activate(cdp, context);
      await tabTo(cdp, context, named(/^Use device setting$/), "checked system radio");
      await assertEval(cdp, context, "system radio is seeded checked", "document.activeElement.checked && document.activeElement.value === 'system'");
      await press(cdp, context, "ArrowUp");
      await assertEval(cdp, context, "ArrowUp selects Dark", "document.activeElement.value === 'dark' && document.activeElement.checked && document.documentElement.dataset.theme === 'dark'");
      await press(cdp, context, "ArrowUp");
      await assertEval(cdp, context, "ArrowUp selects Light", "document.activeElement.value === 'light' && document.activeElement.checked && document.documentElement.dataset.theme === 'light'");
      await press(cdp, context, "ArrowDown");
      await assertEval(cdp, context, "ArrowDown returns Dark", "document.activeElement.value === 'dark' && document.activeElement.checked");
      await press(cdp, context, "ArrowDown");
      await assertEval(cdp, context, "ArrowDown returns System", "document.activeElement.value === 'system' && document.activeElement.checked");
      await press(cdp, context, "Tab");
      await assertEval(cdp, context, "settings forward wrap remains contained", "document.activeElement?.getAttribute('aria-label') === 'Close settings' && document.querySelector('[role=dialog]').contains(document.activeElement)");
      await press(cdp, context, "Escape");
      await assertEval(cdp, context, "settings Escape restores trigger", "!document.querySelector('[role=dialog]') && /Settings/.test(document.activeElement.textContent)");
    });

    await group("Setup workflow", async (context) => {
      await setViewport(cdp, 1440, 1000);
      await navigate(cdp, `${origin}/`);
      await tabTo(cdp, context, named(/^Subject/), "Subject field");
      await replaceText(cdp, context, "Circuit analysis");
      await tabTo(cdp, context, named(/^Level/), "Level field");
      await replaceText(cdp, context, "300 level");
      await tabTo(cdp, context, named(/Add criterion/), "Add criterion");
      const beforeCriteria = await evaluate(cdp, "document.querySelectorAll('input[aria-label^=\"Criterion \"]').length");
      await activate(cdp, context);
      await assertEval(cdp, context, "criterion added", `document.querySelectorAll('input[aria-label^="Criterion "]').length === ${beforeCriteria + 1}`);
      await tabTo(cdp, context, named(/Advanced marking guidance/), "advanced disclosure");
      await activate(cdp, context);
      await assertEval(cdp, context, "advanced guidance expanded", "document.activeElement.closest('details')?.open === true");
      await tabTo(cdp, context, named(/^Paste/), "active answer tab");
      await press(cdp, context, "ArrowRight");
      await assertEval(cdp, context, "Setup ArrowRight activates CSV tab", "document.activeElement.getAttribute('role') === 'tab' && /CSV upload/.test(document.activeElement.textContent) && document.activeElement.getAttribute('aria-selected') === 'true'");
      await press(cdp, context, "ArrowRight");
      await assertEval(cdp, context, "Setup ArrowRight activates Photos tab", "document.activeElement.getAttribute('aria-selected') === 'true' && /Photos/.test(document.activeElement.textContent)");
      await press(cdp, context, "ArrowLeft");
      await press(cdp, context, "ArrowLeft");
      await assertEval(cdp, context, "Setup roving tabs return to Paste", "document.activeElement.id === 'answer-tab-paste' && document.activeElement.getAttribute('tabindex') === '0'");
      await tabTo(cdp, context, named(/What do you think/), "prediction field");
      await replaceText(cdp, context, "Students add reactance directly.");
      await tabTo(cdp, context, named(/Preview sample analysis/), "Setup primary");
      await activate(cdp, context);
      await waitPath(cdp, "/processing");
      await assertEval(cdp, context, "Setup primary starts active processing", "location.pathname === '/processing' && /Preparing the sample analysis/.test(document.querySelector('h1')?.textContent)");
    });

    await group("Processing workflow", async (context) => {
      await tabTo(cdp, context, named(/How processing works/), "processing disclosure");
      await activate(cdp, context);
      await assertEval(cdp, context, "processing disclosure expands", "document.activeElement.closest('details')?.open === true");
      await waitFor(cdp, "/Sample analysis ready/.test(document.querySelector('h1')?.textContent || '')", 15_000);
      await tabTo(cdp, context, named(/Compare my prediction/), "completed onward link");
      await activate(cdp, context);
      await waitPath(cdp, "/reveal");
      await assertEval(cdp, context, "completed processing continues to Reveal", "location.pathname === '/reveal' && /Compare your prediction/.test(document.querySelector('h1')?.textContent)");
    });

    await group("Reveal workflow", async (context) => {
      await tabTo(cdp, context, named(/View misconception map/), "Reveal map link");
      await assertEval(cdp, context, "comparison content precedes map action", "document.body.innerText.includes('Your prediction') && document.body.innerText.includes('What the sample shows')");
      await activate(cdp, context);
      await waitPath(cdp, "/map");
      await assertEval(cdp, context, "Reveal continues to map", "location.pathname === '/map'");
    });

    await group("Map workflow", async (context) => {
      await tabTo(cdp, context, named(/^By spread$/), "Map active sort radio");
      await press(cdp, context, "ArrowRight");
      await assertEval(cdp, context, "Map ArrowRight selects damage", "document.activeElement.getAttribute('role') === 'radio' && document.activeElement.getAttribute('aria-checked') === 'true' && /By damage/.test(document.activeElement.textContent)");
      await press(cdp, context, "ArrowLeft");
      await assertEval(cdp, context, "Map ArrowLeft returns spread", "/By spread/.test(document.activeElement.textContent) && document.activeElement.getAttribute('aria-checked') === 'true'");
      await tabTo(cdp, context, (item) => item.href?.startsWith("/clusters/") && /Impedance and resistance/.test(item.name), "Map cluster link");
      await activate(cdp, context);
      await waitPath(cdp, "/clusters/cl-impedance");
      for (let index = 1; index <= 10; index += 1) {
        await tabTo(cdp, context, named(/^Split$/), `Split action ${index}`);
        await activate(cdp, context);
        await tabTo(
          cdp,
          context,
          (item) => item.tag === "INPUT" && /Select/.test(item.name),
          `split member ${index}`,
          SPLIT_MEMBER_TAB_OPTIONS,
        );
        await activate(cdp, context, "Space");
        await tabTo(cdp, context, named(/^New cluster name$/), `split name ${index}`);
        await typeText(cdp, context, `Fallback ${index}`);
        await tabTo(cdp, context, named(/^Split 1 selected$/), `split confirm ${index}`);
        await activate(cdp, context);
        await waitFor(cdp, "!document.querySelector('input[aria-label=\"New cluster name\"]')");
      }
      await tabTo(cdp, context, named(/^Misconception map/), "Map navigation after splits");
      await activate(cdp, context);
      await waitPath(cdp, "/map");
      await assertEval(cdp, context, "actual 13-cluster fallback is keyboard reachable", "document.body.innerText.includes('Map hidden at this cluster count') && document.querySelectorAll('a[href^=\"/clusters/\"]').length >= 13");
      await tabTo(cdp, context, (item) => item.href?.startsWith("/clusters/") && /Fallback/.test(item.name), "fallback ranked cluster link");
      await activate(cdp, context);
      await assertEval(cdp, context, "fallback cluster link activates", "location.pathname.startsWith('/clusters/')");
    });

    await group("Cluster workflow", async (context) => {
      await navigate(cdp, `${origin}/clusters/cl-phase`);
      await tabTo(cdp, context, named(/^Rename$/), "Rename action");
      await activate(cdp, context);
      await tabTo(cdp, context, named(/^Cluster name$/), "Cluster name");
      await replaceText(cdp, context, "Phase relationship model");
      await tabTo(cdp, context, named(/^Save$/), "Rename save");
      await activate(cdp, context);
      await assertEval(cdp, context, "cluster rename persists", "/Phase relationship model/.test(document.querySelector('h1')?.textContent)");
      await tabTo(cdp, context, named(/^Split$/), "Cluster split action");
      await activate(cdp, context);
      await tabTo(
        cdp,
        context,
        (item) => item.tag === "INPUT" && /Select/.test(item.name),
        "Cluster split member",
        SPLIT_MEMBER_TAB_OPTIONS,
      );
      await activate(cdp, context, "Space");
      await tabTo(cdp, context, named(/^New cluster name$/), "Cluster split name");
      await typeText(cdp, context, "Phase subset");
      await tabTo(cdp, context, named(/^Split 1 selected$/), "Cluster split confirm");
      await activate(cdp, context);
      await assertEval(cdp, context, "cluster split changes roster", "!document.body.innerText.includes('Split 1 selected')");
      await tabTo(cdp, context, named(/^Merge$/), "Cluster merge action");
      await activate(cdp, context);
      await tabTo(cdp, context, isRadioSnapshot, "Cluster merge target");
      await activate(cdp, context, "Space");
      await tabTo(cdp, context, named(/Merge into selected/), "Cluster merge confirm");
      await activate(cdp, context);
      await waitPath(cdp, "/clusters/cl-impedance");
      await assertEval(cdp, context, "cluster merge navigates to selected target", "location.pathname === '/clusters/cl-impedance'");
      await press(cdp, context, MERGE_RETURN_KEY.key, MERGE_RETURN_KEY.modifiers);
      await delay(250);
      if ((await evaluate(cdp, "location.pathname")) !== "/clusters/cl-phase") {
        const history = await cdp.send("Page.getNavigationHistory");
        const sourceEntry = historyEntryForPath(history.entries, "/clusters/cl-phase");
        invariant(sourceEntry, "Merged source route is absent from browser history");
        await cdp.send("Page.navigateToHistoryEntry", { entryId: sourceEntry.id });
        context.historyTraversal = {
          attemptedKey: "Alt+ArrowLeft",
          rendererHandledShortcut: false,
          cdpHistoryEntryId: sourceEntry.id,
        };
        assertObserved(
          context,
          "headless browser history exposes merged-source fallback",
          context.historyTraversal,
        );
      }
      await waitPath(cdp, "/clusters/cl-phase");
      await waitFor(cdp, "/This cluster no longer exists/.test(document.querySelector('h1')?.textContent || '')");
      await assertEval(cdp, context, "merged cluster fallback", "document.body.innerText.includes('It was merged or rejected') && !!document.querySelector('a[href=\"/map\"]')");
      await navigate(cdp, `${origin}/clusters/cl-impedance`);
      await tabTo(cdp, context, named(/^Reject$/), "Cluster reject action");
      await activate(cdp, context);
      await tabTo(cdp, context, named(/Reject this cluster/), "Cluster reject confirmation");
      await activate(cdp, context);
      await waitPath(cdp, REJECT_DESTINATION);
      await assertEval(
        cdp,
        context,
        "cluster rejection returns to the current map without the rejected cluster",
        "location.pathname === '/map' && !document.body.innerText.includes('Impedance and resistance are the same quantity')",
      );
    });

    await group("Reteach workflow", async (context) => {
      await navigate(cdp, `${origin}/reteach/cl-arithmetic`);
      await tabTo(cdp, context, named(/^Copy lesson$/), "Copy lesson");
      await activate(cdp, context);
      await assertEval(cdp, context, "copy action reports completion", "document.body.innerText.includes('Copied')");
      await tabTo(cdp, context, named(/^Download Markdown$/), "Markdown download");
      const beforeMarkdown = downloads.length;
      await activate(cdp, context);
      await waitForObserved(() => downloads.length > beforeMarkdown, "Markdown browser download");
      assertObserved(context, "Markdown download event", downloads.at(-1)?.suggestedFilename.endsWith(".md"));
      await tabTo(cdp, context, named(/^Download roster CSV$/), "Roster CSV download");
      const beforeRoster = downloads.length;
      await activate(cdp, context);
      await waitForObserved(() => downloads.length > beforeRoster, "roster browser download");
      assertObserved(context, "roster CSV download event", downloads.at(-1)?.suggestedFilename.endsWith(".csv"));
    });

    await group("Scores workflow", async (context) => {
      await navigate(cdp, `${origin}/scores`);
      await tabTo(cdp, context, named(/^Confidence$/), "Scores active sort radio");
      await press(cdp, context, "ArrowRight");
      await assertEval(cdp, context, "Scores selects Score sort", "document.activeElement.getAttribute('aria-checked') === 'true' && document.activeElement.textContent.trim() === 'Score'");
      await press(cdp, context, "ArrowRight");
      await assertEval(cdp, context, "Scores selects Cluster sort", "document.activeElement.getAttribute('aria-checked') === 'true' && document.activeElement.textContent.trim() === 'Cluster'");
      await press(cdp, context, "ArrowLeft");
      await press(cdp, context, "ArrowLeft");
      await assertEval(cdp, context, "Scores returns Confidence sort", "document.activeElement.getAttribute('aria-checked') === 'true' && document.activeElement.textContent.trim() === 'Confidence'");
      await tabTo(cdp, context, named(/^Search responses$/), "Scores search", { shift: true });
      await typeText(cdp, context, "EEE/022/0103");
      await assertEval(cdp, context, "Scores search isolates a specific row", "document.querySelectorAll('tbody > tr[data-review-row]').length === 1 && document.body.innerText.includes('EEE/022/0103')");
      await tabTo(cdp, context, named(/^Score for A\.O\.$/), "specific score input");
      await replaceText(cdp, context, "7");
      await assertEval(cdp, context, "score edit produces specific Edited transition", "document.activeElement.value === '7' && document.activeElement.closest('tr').innerText.includes('Edited')");
      await tabTo(cdp, context, named(/^Edited$/), "Edited status");
      await activate(cdp, context);
      await tabTo(cdp, context, named(/^Flag for a second look$/), "specific flag action");
      const flaggedCount = visibleStatusCountExpression("Flagged");
      const beforeFlagged = await evaluate(cdp, flaggedCount);
      await activate(cdp, context);
      await assertEval(cdp, context, "specific row becomes flagged", `${flaggedCount} === ${beforeFlagged + 1}`);
      await tabTo(cdp, context, named(/^Flagged$/), "Flagged status");
      await activate(cdp, context);
      await tabTo(cdp, context, named(/^Accept$/), "specific accept action");
      const acceptedCount = visibleStatusCountExpression("Accepted");
      const beforeAccepted = await evaluate(cdp, acceptedCount);
      await activate(cdp, context);
      await assertEval(cdp, context, "specific row becomes accepted", `${acceptedCount} === ${beforeAccepted + 1}`);
      await tabTo(cdp, context, named(/^Search responses$/), "return to search", { shift: true });
      await replaceText(cdp, context, "");
      await tabTo(cdp, context, named(/Only unreviewed/), "status filter");
      await activate(cdp, context, "Space");
      await assertEval(cdp, context, "Scores status filter shows only unresolved rows", "document.activeElement.checked && document.querySelectorAll('tr[data-review-row]:not([data-review-row=\"unreviewed\"])').length === 0");
      await activate(cdp, context, "Space");
      await assertEval(cdp, context, "Scores status filter clears", "document.activeElement.checked === false");
      await tabTo(cdp, context, named(/^Expand answer$/), "evidence expansion");
      await activate(cdp, context);
      await assertEval(cdp, context, "Scores evidence expands", SCORES_EVIDENCE_EXPRESSION);
      await tabTo(cdp, context, named(/^Accept high-confidence$/), "bulk accept", { shift: true });
      await activate(cdp, context);
      await assertEval(cdp, context, "bulk acceptance changes exact review count", "!document.body.innerText.includes('Accept high-confidence') && document.querySelectorAll('tr[data-review-row=\"accepted\"]').length > 1");
      let safety = 50;
      while (!(await evaluate(cdp, "!![...document.querySelectorAll('a')].find((link) => /Continue to export/.test(link.textContent))"))) {
        invariant(safety-- > 0, "Could not complete remaining score review");
        await tabTo(cdp, context, named(/^Accept$/), "remaining row Accept");
        await activate(cdp, context);
      }
      await assertEval(cdp, context, "Scores reaches export-ready state", "document.querySelectorAll('tr[data-review-row=\"unreviewed\"]').length === 0 && !![...document.querySelectorAll('a')].find((link) => /Continue to export/.test(link.textContent))");
      await tabTo(cdp, context, named(/Continue to export/), "Continue to export", EXPORT_READY_TAB_OPTIONS);
      await activate(cdp, context);
      await waitPath(cdp, "/export");
    });

    await group("Export workflow", async (context) => {
      await tabTo(cdp, context, named(/^Confirmed by$/), "reviewer input");
      await assertEval(cdp, context, "blank reviewer keeps confirmation disabled", "!![...document.querySelectorAll('button')].find((button) => /Confirm reviewer/.test(button.textContent) && button.disabled)");
      await replaceText(cdp, context, "Prof. Keyboard Reviewer");
      await tabTo(cdp, context, named(/^Confirm reviewer$/), "confirm reviewer");
      await tabTo(cdp, context, (item) => item.tag === "INPUT" && /\.xlsx/.test(item.name), "checked XLSX radio");
      await assertEval(cdp, context, "XLSX is initially checked", "document.activeElement.checked && document.activeElement.value === 'xlsx'");
      await press(cdp, context, "ArrowRight");
      await assertEval(cdp, context, "native ArrowRight selects DOCX", "document.activeElement.checked && document.activeElement.value === 'docx'");
      await press(cdp, context, "ArrowLeft");
      await assertEval(cdp, context, "native ArrowLeft returns XLSX", "document.activeElement.checked && document.activeElement.value === 'xlsx'");
      await tabTo(cdp, context, named(/^Confirm reviewer$/), "confirm reviewer return", { shift: true });
      await activate(cdp, context);
      await assertEval(cdp, context, "Export confirmation unlocks download", "document.body.innerText.includes('Download reviewed results') && !![...document.querySelectorAll('button')].find((button) => /Download XLSX/.test(button.textContent))");
      await tabTo(cdp, context, named(/^Download XLSX$/), "XLSX download");
      const beforeXlsx = downloads.length;
      await activate(cdp, context);
      await waitFor(cdp, "!![...document.querySelectorAll('button')].find((button) => /Download XLSX/.test(button.textContent) && !button.disabled)", 20_000);
      await waitForObserved(() => downloads.length > beforeXlsx, "XLSX browser download");
      assertObserved(context, "XLSX download event", downloads.at(-1)?.suggestedFilename.endsWith(".xlsx"));
      await tabTo(cdp, context, named(/Reopen for edits/), "reopen", { shift: true });
      await tabTo(cdp, context, (item) => item.tag === "INPUT" && /\.xlsx/.test(item.name), "XLSX radio after confirmation");
      await press(cdp, context, "ArrowRight");
      await assertEval(cdp, context, "DOCX selected for second export", "document.activeElement.checked && document.activeElement.value === 'docx'");
      await tabTo(cdp, context, named(/^Download DOCX$/), "DOCX download");
      const beforeDocx = downloads.length;
      await activate(cdp, context);
      await waitFor(cdp, "!![...document.querySelectorAll('button')].find((button) => /Download DOCX/.test(button.textContent) && !button.disabled)", 20_000);
      await waitForObserved(() => downloads.length > beforeDocx, "DOCX browser download");
      assertObserved(context, "DOCX download event", downloads.at(-1)?.suggestedFilename.endsWith(".docx"));
      await assertEval(cdp, context, "demo account state remains truthful", "document.querySelector('[aria-label=\"Account connection\"]')?.innerText.includes('Demo preview') && !document.querySelector('[aria-label=\"Account connection\"] input[type=email]')");
    });

    await delay(500);
    const report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      origin,
      totals: {
        groups: groups.length,
        passed: groups.filter((item) => item.pass).length,
        failed: groups.filter((item) => !item.pass).length,
        keyDispatches: groups.reduce((sum, item) => sum + item.keys.length, 0),
        focusChecks: groups.reduce((sum, item) => sum + item.focus.length, 0),
        stateAssertions: groups.reduce((sum, item) => sum + item.assertions.length, 0),
        downloads: downloads.length,
      },
      downloads,
      groups,
      limitations: [
        "The production demo configuration exposes no account email form. The runner records the keyboard-reachable Demo preview state and does not fabricate account-link capability.",
        "The no-JavaScript skip check proves native fragment navigation; the separate hydrated check proves the focus assist moves focus to the server-rendered main target.",
        "Headless Chrome's renderer-targeted Input API did not execute the browser-chrome Alt+Left shortcut. The Cluster group records the real attempted system key, then uses CDP browser history to expose and assert the merged-source fallback created by keyboard actions.",
      ],
    };
    const reportPath = writeJson(outputName, report);
    invariant(report.totals.groups === 11 && report.totals.passed === 11, `Keyboard runner did not pass 11/11; see ${reportPath}`);
    return report;
  } catch (error) {
    const report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      origin,
      totals: {
        groups: groups.length,
        passed: groups.filter((item) => item.pass).length,
        failed: groups.filter((item) => !item.pass).length,
        keyDispatches: groups.reduce((sum, item) => sum + item.keys.length, 0),
        focusChecks: groups.reduce((sum, item) => sum + item.focus.length, 0),
        stateAssertions: groups.reduce((sum, item) => sum + item.assertions.length, 0),
      },
      downloads,
      groups,
      activeGroup: activeContext?.name,
      error: error.stack || String(error),
    };
    writeJson(outputName, report);
    throw error;
  } finally {
    await closeBrowser(cdp);
  }
}

if (require.main === module) {
  runKeyboard().then((report) => {
    process.stdout.write(`keyboard: ${report.totals.passed}/${report.totals.groups}; keys ${report.totals.keyDispatches}; focus ${report.totals.focusChecks}; downloads ${report.totals.downloads}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  EXPORT_READY_TAB_OPTIONS,
  GROUP_NAMES,
  HYDRATION_READY_EXPRESSION,
  KEY_DEFINITIONS,
  MERGE_RETURN_KEY,
  REJECT_DESTINATION,
  SCORES_EVIDENCE_EXPRESSION,
  SPLIT_MEMBER_TAB_OPTIONS,
  focusSignature,
  historyEntryForPath,
  isRadioSnapshot,
  printableKeyPayload,
  replacementPlan,
  visibleStatusCountExpression,
  runKeyboard,
};
