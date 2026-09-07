/* eslint-disable @typescript-eslint/no-require-imports */
// A production check of custom drafts and explicitly requested sample results.
// Custom analysis is never activated; /api/run is intercepted as a safety net.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_ORIGIN, openPage, navigate, evaluate, waitFor, closeBrowser,
  ensureOutputDir, writeJson,
} = require("./cdp-common.cjs");

const WIDTHS = [320, 390, 1024, 1440];
const FIELD_IDS = ["course-code", "course-title", "subject", "level", "question", "scheme", "paste", "prediction"];
const CUSTOM_FIELDS = {
  "course-code": "CSC201",
  "course-title": "Data Structures",
  subject: "Computer Science",
  level: "200 level",
  question: "Explain the difference between a stack and a queue.",
  scheme: "Name last-in first-out and first-in first-out, with a correct example.",
  paste: "CSC001 | A stack removes its latest item first.\nCSC002 | A queue removes its earliest item first.",
  prediction: "They may reverse the removal order.",
};
const READY = "document.readyState === 'complete' && !!document.querySelector('#course-code')";
const waitFrames = (cdp) => evaluate(cdp, "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))");

async function clickButton(cdp, name) {
  await waitFor(cdp, `!![...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(name)} && !button.disabled)`);
  await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(name)} && !item.disabled);
    button.scrollIntoView({ block: 'center' });
    button.click();
    return true;
  })()`);
  await waitFrames(cdp);
}

async function replaceInput(cdp, selector, text) {
  await evaluate(cdp, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error('Missing input: ' + ${JSON.stringify(selector)});
    input.scrollIntoView({ block: 'center' });
    input.focus();
    input.select();
    return true;
  })()`);
  await cdp.send("Input.insertText", { text });
  await waitFrames(cdp);
}

async function clickNavigation(cdp, href) {
  const desktop = await evaluate(cdp, "document.querySelector('aside[class~=\"lg:block\"]').getBoundingClientRect().width > 0");
  if (!desktop) {
    await evaluate(cdp, "document.querySelector('button[aria-label=\"Open navigation\"]').click(); true");
    await waitFor(cdp, "!!document.querySelector('[role=dialog][aria-label=Navigation]')");
  }
  const scope = desktop ? 'aside[class~="lg:block"]' : '[role="dialog"][aria-label="Navigation"]';
  await evaluate(cdp, `(() => {
    const link = document.querySelector(${JSON.stringify(scope + ' nav[aria-label="Session steps"] a[href="' + href + '"]')});
    if (!link) throw new Error('Missing navigation link');
    link.click();
    return true;
  })()`);
  await waitFor(cdp, `location.pathname === ${JSON.stringify(href)} && !!document.querySelector('main#main h1')`);
  if (href === "/") await waitFor(cdp, READY);
  await waitFrames(cdp);
}

async function setupState(cdp) {
  return evaluate(cdp, `(() => {
    const main = document.querySelector('main#main');
    const action = [...main.querySelectorAll('button')].find(button => /^(Analyse class answers|Preview sample analysis)$/.test(button.textContent.trim()));
    return {
      fields: Object.fromEntries(${JSON.stringify(FIELD_IDS)}.map(id => [id, document.getElementById(id)?.value])),
      codeLimit: document.querySelector('#course-code').maxLength,
      titleLimit: document.querySelector('#course-title').maxLength,
      action: action?.textContent.trim(),
      disabled: action?.disabled,
      liveUnavailable: main.innerText.includes('Live analysis is not available in this installation yet.'),
      mainText: main.innerText,
      sidebar: document.querySelector('aside[class~="lg:block"]').textContent,
      breadcrumb: document.querySelector('nav[aria-label=Breadcrumb]').textContent,
      criterion: main.querySelector('input[aria-label="Criterion 1 description"]').value,
      tab: main.querySelector('[role=tab][aria-selected=true]')?.id,
    };
  })()`);
}

function assertBlank(state) {
  for (const id of FIELD_IDS) assert.equal(state.fields[id], "", `${id} must start blank`);
  assert.equal(state.criterion, "");
  assert.equal(state.action, "Analyse class answers");
  assert.equal(state.disabled, true);
  assert.equal(state.tab, "answer-tab-paste");
}

async function geometry(cdp, width, state, capture) {
  await evaluate(cdp, "document.fonts.ready.then(() => true)");
  const bounds = await evaluate(cdp, `(() => {
    const main = document.querySelector('main#main');
    const page = main.firstElementChild;
    const header = main.parentElement.querySelector('header');
    const headerBefore = header.getBoundingClientRect().top;
    main.scrollTop = main.scrollHeight;
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const clippedControls = [...main.querySelectorAll('input:not([type=file]),textarea,button')].filter(visible).filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.right > innerWidth + 1;
    }).map(element => element.id || element.getAttribute('aria-label') || element.textContent.trim());
    return {
      horizontalOverflow: Math.max(main.scrollWidth - main.clientWidth, document.documentElement.scrollWidth - innerWidth),
      blankOverflow: main.scrollHeight - Math.max(main.clientHeight, page.offsetTop + page.offsetHeight),
      bottomGap: main.scrollHeight > main.clientHeight + 1 ? main.getBoundingClientRect().bottom - page.getBoundingClientRect().bottom : 0,
      documentOverflow: document.documentElement.scrollHeight - innerHeight,
      headerMovement: header.getBoundingClientRect().top - headerBefore,
      clippedControls,
    };
  })()`);
  assert.ok(bounds.horizontalOverflow <= 1, `${width}px ${state}: horizontal overflow`);
  assert.ok(bounds.blankOverflow <= 2, `${width}px ${state}: ${bounds.blankOverflow}px blank scroll space`);
  assert.ok(Math.abs(bounds.bottomGap) <= 2, `${width}px ${state}: content does not end at the scroll boundary`);
  assert.ok(bounds.documentOverflow <= 1, `${width}px ${state}: document scrolls outside the workspace`);
  assert.ok(Math.abs(bounds.headerMovement) <= 1, `${width}px ${state}: top bar moved`);
  assert.deepEqual(bounds.clippedControls, [], `${width}px ${state}: controls escape the viewport`);
  await evaluate(cdp, "document.querySelector('main#main').scrollTop = 0; true");
  await waitFrames(cdp);
  let screenshot;
  if (capture) {
    screenshot = `course-${state}-${width}.png`;
    const image = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(path.join(ensureOutputDir("screenshots"), screenshot), Buffer.from(image.data, "base64"));
  }
  return { width, state, ...bounds, screenshot };
}

async function runCourseSession(options = {}) {
  const origin = options.origin || DEFAULT_ORIGIN;
  const cdp = await openPage(Number(options.debugPort || process.argv[2] || 9231));
  const cases = [];
  const runtimeErrors = [];
  const attemptedAnalysisRequests = [];
  let failure = null;
  cdp.on("Runtime.exceptionThrown", event => runtimeErrors.push(event.exceptionDetails));
  cdp.on("Fetch.requestPaused", event => {
    attemptedAnalysisRequests.push({ url: event.request.url, method: event.request.method });
    void cdp.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" }).catch(error => {
      runtimeErrors.push({ text: `Could not block unexpected analysis request: ${error.message}` });
    });
  });
  try {
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: `${origin}/api/run*`, requestStage: "Request" }] });
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    for (const width of WIDTHS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: width >= 1024 ? 1000 : 900, deviceScaleFactor: 1, mobile: false });
      await navigate(cdp, `${origin}/`, READY);
      if (width !== WIDTHS[0]) await clickButton(cdp, "New marking session");
      assertBlank(await setupState(cdp));
      cases.push(await geometry(cdp, width, "blank", true));

      const limits = await setupState(cdp);
      assert.equal(limits.codeLimit, 100);
      assert.equal(limits.titleLimit, 300);
      await replaceInput(cdp, "#course-code", "C".repeat(110));
      await replaceInput(cdp, "#course-title", "T".repeat(310));
      const maximums = await setupState(cdp);
      assert.equal(maximums.fields["course-code"].length, 100);
      assert.equal(maximums.fields["course-title"].length, 300);
      cases.push(await geometry(cdp, width, "maximum-course-length", false));

      for (const [id, value] of Object.entries(CUSTOM_FIELDS)) await replaceInput(cdp, `#${id}`, value);
      await replaceInput(cdp, 'input[aria-label="Criterion 1 description"]', "States both removal orders");
      const custom = await setupState(cdp);
      assert.deepEqual(custom.fields, CUSTOM_FIELDS);
      assert.ok(custom.mainText.includes("Data Structures") && custom.mainText.includes("CSC201"), "Overview must show the entered course");
      assert.ok(custom.sidebar.includes("CSC201") && custom.sidebar.includes("Data Structures"), "Navigation must show the entered course");
      assert.ok(custom.breadcrumb.includes("CSC201"), "Breadcrumb must show the entered course");
      assert.equal(custom.action, "Analyse class answers");
      assert.equal(custom.disabled, custom.liveUnavailable, "A ready custom draft must honor this installation's live availability");
      cases.push(await geometry(cdp, width, "custom", true));

      await clickNavigation(cdp, "/scores");
      await clickNavigation(cdp, "/");
      const restored = await setupState(cdp);
      assert.deepEqual(restored.fields, CUSTOM_FIELDS, "Navigation must preserve every entered draft field");
      assert.equal(restored.criterion, "States both removal orders");
      cases.push(await geometry(cdp, width, "returned-draft", false));

      await clickButton(cdp, "New marking session");
      assertBlank(await setupState(cdp));
      cases.push(await geometry(cdp, width, "reset", false));
      await clickButton(cdp, "Load demo class");
      let demo = await setupState(cdp);
      assert.equal(demo.fields["course-code"], "EEE 301");
      assert.equal(demo.action, "Preview sample analysis");
      assert.equal(demo.disabled, false, "Explicit sample preview is available without live AI");
      cases.push(await geometry(cdp, width, "sample", true));

      await replaceInput(cdp, "#course-title", "Edited sample course");
      assert.equal((await setupState(cdp)).action, "Analyse class answers", "Editing the sample must create a custom draft");
      await clickButton(cdp, "Load demo class");
      await evaluate(cdp, "document.querySelector('#answer-tab-csv').click(); true");
      await waitFor(cdp, "document.querySelector('#answer-tab-csv').getAttribute('aria-selected') === 'true'");
      assert.equal((await setupState(cdp)).action, "Analyse class answers", "Switching a sample input tab must create a custom draft");
      await clickButton(cdp, "Load demo class");
      demo = await setupState(cdp);
      assert.equal(demo.action, "Preview sample analysis");
      assert.equal(demo.disabled, false);
      await clickButton(cdp, "Preview sample analysis");
      await waitFor(cdp, "location.pathname === '/processing' && /Sample analysis ready/.test(document.querySelector('h1')?.textContent || '')", 20_000);
      assert.deepEqual(attemptedAnalysisRequests, [], "Free sample preview must not request live marking");
      assert.deepEqual(runtimeErrors, [], "No runtime exceptions are permitted");
    }
  } catch (error) {
    failure = error.stack || String(error);
    throw error;
  } finally {
    writeJson("course-session.json", { cases, runtimeErrors, attemptedAnalysisRequests, failure });
    await closeBrowser(cdp);
  }
  return { cases, runtimeErrors, attemptedAnalysisRequests };
}

if (require.main === module) {
  runCourseSession().then(report => {
    process.stdout.write(`${report.cases.length}/24 course session layout checks passed; custom drafts preserved; free sample preview made no analysis requests; no runtime exceptions.\n`);
  }).catch(error => {
    process.stderr.write((error.stack || String(error)) + "\n");
    process.exitCode = 1;
  });
}

module.exports = { WIDTHS, runCourseSession };
