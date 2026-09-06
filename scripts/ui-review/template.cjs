/* eslint-disable @typescript-eslint/no-require-imports */
// Run against a production build with a fresh Chrome profile:
// node --import tsx scripts/ui-review/template.cjs 9225
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ANSWERS, CLUSTERS, RETEACH_PACKS } = require("../../lib/mock.ts");
const { ROUTES } = require("./matrix.cjs");
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

const BRAND = "#14121f";
const BRAND_RGB = "rgb(20, 18, 31)";
const READY = "document.readyState === 'complete' && !!document.querySelector('h1')";
const DIAGNOSTIC_KEY = "markwise:diagnostics";
const student = ANSWERS.find((answer) =>
  answer.diagnosticToken && answer.clusterId &&
  CLUSTERS.some((cluster) => cluster.id === answer.clusterId && !cluster.isOther) &&
  RETEACH_PACKS[answer.clusterId]?.diagnostics.length === 2,
);
assert.ok(student, "The seeded class must include a two-question student diagnostic");

const EXTRA_ROUTES = [
  { id: "sessions", path: "/sessions" },
  { id: "outcome", path: "/outcome" },
  { id: "student", path: `/d/${student.diagnosticToken}` },
];

function isExpectedBlockedNetwork(message, origin) {
  if (
    message.source !== "network" || message.level !== "error" ||
    typeof message.text !== "string" || !/\bERR_NAME_NOT_RESOLVED\b/.test(message.text) ||
    typeof message.url !== "string" || !message.url.trim()
  ) return false;
  try {
    const requestUrl = new URL(message.url);
    return ["http:", "https:"].includes(requestUrl.protocol) &&
      requestUrl.origin !== new URL(origin).origin;
  } catch {
    return false;
  }
}

function buildCases() {
  const cases = new Map();
  const add = (route, width, appearance, capture = false) => {
    const id = `${route.id}-${width}-${appearance}`;
    cases.set(id, {
      id,
      route,
      width,
      height: width >= 1024 ? 1000 : 900,
      appearance,
      capture: capture || cases.get(id)?.capture || false,
    });
  };
  for (const route of [...ROUTES, ...EXTRA_ROUTES]) {
    for (const appearance of ["light", "dark"]) add(route, 320, appearance, appearance === "light");
  }
  for (const route of EXTRA_ROUTES) {
    for (const width of [390, 768, 1024, 1440]) {
      for (const appearance of ["light", "dark"]) {
        add(route, width, appearance, appearance === "light" && [390, 1440].includes(width));
      }
    }
  }
  for (const width of [390, 1440]) add(ROUTES.find((route) => route.id === "setup"), width, "light", true);
  return [...cases.values()];
}

async function collectState(cdp) {
  return evaluate(cdp, `(async () => {
    await document.fonts.ready;
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((element) => ({
      tag: element.tagName,
      text: element.textContent.trim().slice(0, 100),
      fontFamily: getComputedStyle(element).fontFamily,
    }));
    const logos = [...document.querySelectorAll('svg[viewBox="0 0 100 96"]')].filter(visible).map((svg) => {
      const paints = [...svg.querySelectorAll('path,rect')].flatMap((element) => {
        const style = getComputedStyle(element);
        return [style.fill, style.stroke].filter((paint) => paint !== 'none' && paint !== 'rgba(0, 0, 0, 0)');
      });
      const backgrounds = [];
      for (let element = svg.parentElement; element && backgrounds.length < 6; element = element.parentElement) {
        const color = getComputedStyle(element).backgroundColor;
        if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
          backgrounds.push({ tag: element.tagName, color });
        }
      }
      return { paints, backgrounds };
    });
    const controls = [...document.querySelectorAll('input:not([type="file"]),textarea,button')].filter(visible);
    const clippedControls = controls.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.right > innerWidth + 1;
    }).map((element) => ({
      name: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 70) || element.id,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
    }));
    return {
      pathname: location.pathname,
      theme: document.documentElement.dataset.theme,
      h1Count: document.querySelectorAll('h1').length,
      headings,
      bodyFont: getComputedStyle(document.body).fontFamily,
      fontFaces: [...document.fonts].map((face) => ({ family: face.family, status: face.status, weight: face.weight })),
      primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().toLowerCase(),
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      logos,
      clippedControls,
    };
  })()`);
}

function checkState(state, item) {
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  check(state.pathname === item.route.path, `Unexpected route: ${state.pathname}`);
  check(state.theme === item.appearance, `Unexpected appearance: ${state.theme}`);
  check(state.horizontalOverflow <= 1, `Horizontal page overflow: ${state.horizontalOverflow}px`);
  check(state.h1Count === 1, `Expected one h1, found ${state.h1Count}`);
  check(state.headings.some((heading) => heading.tag === "H1"), "The main heading is hidden");
  check(/inter/i.test(state.bodyFont.split(",")[0]), `Body font: ${state.bodyFont}`);
  for (const heading of state.headings) {
    check(/manrope/i.test(heading.fontFamily.split(",")[0]), `${heading.tag} uses ${heading.fontFamily}: ${heading.text}`);
  }
  for (const family of ["Inter", "Manrope"]) {
    check(state.fontFaces.some((face) =>
      face.family.toLowerCase().includes(family.toLowerCase()) &&
      !/fallback/i.test(face.family) && face.status === "loaded",
    ), `${family} has no loaded font face`);
  }
  check(state.primary === BRAND, `Primary color: ${state.primary}`);
  // The mobile shell exposes its logo inside the closed drawer. Only visible
  // logos are checked here; desktop and standalone cases assert their presence.
  if (item.width >= 1024 || item.route.id === "student") check(state.logos.length > 0, "Expected a visible logo");
  for (const logo of state.logos) {
    check(logo.paints.length > 0 && logo.paints.every((paint) => paint === BRAND_RGB), `Logo colors: ${logo.paints.join(", ")}`);
    check(logo.backgrounds.length > 0, "Logo has no visible backing to inspect");
  }
  if (["setup", "student"].includes(item.route.id)) {
    check(state.clippedControls.length === 0, `Offscreen form controls: ${JSON.stringify(state.clippedControls)}`);
  }
  return failures;
}

async function capture(cdp, item) {
  const metrics = await cdp.send("Page.getLayoutMetrics");
  const height = Math.ceil(metrics.cssContentSize?.height || metrics.contentSize.height);
  const filename = `template-${item.route.id}-${item.width}-${item.appearance}.png`;
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: item.width, height, scale: 1 },
  });
  fs.writeFileSync(path.join(ensureOutputDir("screenshots"), filename), Buffer.from(result.data, "base64"));
  return { file: `screenshots/${filename}`, route: item.route.path, width: item.width, height, appearance: item.appearance };
}

async function checkDiagnostic(cdp, origin) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(cdp, `${origin}/d/${student.diagnosticToken}`, READY);
  // Remove only this fixture's earlier responses so the check is repeatable.
  // No scores or diagnostic verdicts are seeded into the browser.
  await evaluate(cdp, `(() => {
    const key = ${JSON.stringify(DIAGNOSTIC_KEY)};
    const rows = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify(rows.filter((row) => row.answerId !== ${JSON.stringify(student.id)})));
    return true;
  })()`);
  await cdp.send("Page.reload");
  await waitFor(cdp, "document.querySelectorAll('textarea:not(:disabled)').length === 2");
  const responses = [
    "I would combine resistance and reactance in quadrature before using the impedance to find current.",
    "The phase angle describes the supply voltage relative to current, so I would state both the angle and relationship.",
  ];
  await evaluate(cdp, `(() => {
    const answers = ${JSON.stringify(responses)};
    document.querySelectorAll('textarea').forEach((element, index) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element, answers[index]);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return true;
  })()`);
  await waitFor(cdp, "[...document.querySelectorAll('button')].some((button) => button.textContent.includes('Send my answers') && !button.disabled)");
  await evaluate(cdp, "[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Send my answers')).click()");
  await waitFor(cdp, "document.querySelectorAll('textarea:disabled').length === 2");
  const notice = await evaluate(cdp, "[...document.querySelectorAll('[role=status]')].map((element) => element.textContent).join(' ')");
  assert.match(notice, /saved on this device/i);
  assert.match(notice, /not automatically marked/i);
  await cdp.send("Page.reload");
  await waitFor(cdp, "document.querySelectorAll('textarea:disabled').length === 2");
  const restored = await evaluate(cdp, "[...document.querySelectorAll('textarea')].map((element) => element.value)");
  assert.deepEqual(restored, responses);
  const stored = await evaluate(cdp, `JSON.parse(localStorage.getItem(${JSON.stringify(DIAGNOSTIC_KEY)}) || '[]').filter((row) => row.answerId === ${JSON.stringify(student.id)})`);
  assert.equal(stored.length, 2);
  assert.ok(stored.every((row) => row.verdict === null), "Demo responses must remain ungraded");
  return { pass: true, savedResponses: stored.length, restoredResponses: restored.length, ungraded: true, notice };
}

async function runTemplate(options = {}) {
  const debugPort = Number(options.debugPort || process.argv[2] || 9225);
  const origin = options.origin || DEFAULT_ORIGIN;
  const offline = process.env.UI_REVIEW_OFFLINE === "1";
  const cdp = await openPage(debugPort);
  const requested = buildCases();
  const cases = [];
  const screenshots = [];
  const runtimeErrors = [];
  const consoleMessages = [];
  let activeCase = "initialization";
  let fatalError = null;
  let diagnostic = null;
  cdp.on("Runtime.exceptionThrown", (event) => runtimeErrors.push({
    case: activeCase,
    text: event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Runtime exception",
  }));
  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (!["error", "warning"].includes(event.type)) return;
    consoleMessages.push({ case: activeCase, source: "console", level: event.type, text: event.args?.map((arg) => arg.value ?? arg.description).join(" ") });
  });
  cdp.on("Log.entryAdded", (event) => {
    if (!["error", "warning"].includes(event.entry?.level)) return;
    consoleMessages.push({ case: activeCase, source: event.entry.source, level: event.entry.level, text: event.entry.text, url: event.entry.url });
  });

  try {
    for (const item of requested) {
      activeCase = item.id;
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: item.width, height: item.height, deviceScaleFactor: 1, mobile: false });
      await cdp.send("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [{ name: "prefers-color-scheme", value: item.appearance === "light" ? "dark" : "light" }],
      });
      const script = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `localStorage.setItem('markwise-theme', ${JSON.stringify(item.appearance)});`,
      });
      let state;
      let failures;
      let screenshot;
      try {
        await navigate(cdp, `${origin}${item.route.path}`, READY);
        await waitFor(cdp, `document.documentElement.dataset.theme === ${JSON.stringify(item.appearance)}`);
        state = await collectState(cdp);
        failures = checkState(state, item);
        if (item.capture) {
          screenshot = await capture(cdp, item);
          screenshots.push(screenshot);
        }
      } catch (error) {
        failures = [error.stack || String(error)];
      } finally {
        await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: script.identifier });
      }
      cases.push({ ...item, state, screenshot: screenshot?.file, failures, pass: failures.length === 0 });
      if (cases.length % 8 === 0 || cases.length === requested.length) {
        process.stdout.write(`Template layouts: ${cases.length}/${requested.length} checked, ${cases.filter((item) => !item.pass).length} failures\n`);
      }
    }
    activeCase = "diagnostic-save-reload";
    try {
      diagnostic = await checkDiagnostic(cdp, origin);
      process.stdout.write("Template diagnostic: saved, restored after reload, and remains ungraded\n");
    } catch (error) {
      diagnostic = { pass: false, error: error.stack || String(error) };
    }
  } catch (error) {
    fatalError = error.stack || String(error);
  } finally {
    await closeBrowser(cdp);
  }
  const expectedBlockedNetwork = offline
    ? consoleMessages.filter((message) => isExpectedBlockedNetwork(message, origin))
    : [];
  const consoleErrors = consoleMessages.filter((message) =>
    message.level === "error" && !(offline && isExpectedBlockedNetwork(message, origin)),
  );
  if (offline) {
    process.stdout.write(`Template offline review: ${expectedBlockedNetwork.length} external DNS-blocked network errors retained separately\n`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    metadata: { mode: offline ? "offline" : "strict" },
    origin,
    primary: BRAND,
    fonts: { body: "Inter", headings: "Manrope" },
    totals: {
      requested: requested.length,
      checked: cases.length,
      passed: cases.filter((item) => item.pass).length,
      failed: cases.filter((item) => !item.pass).length,
      screenshots: screenshots.length,
      runtimeErrors: runtimeErrors.length,
      consoleErrors: consoleErrors.length,
      totalConsoleErrors: consoleMessages.filter((message) => message.level === "error").length,
      expectedBlockedNetwork: expectedBlockedNetwork.length,
    },
    cases,
    screenshots,
    diagnostic,
    runtimeErrors,
    consoleMessages,
    expectedBlockedNetwork,
    fatalError,
  };
  const reportPath = writeJson("template-review.json", report);
  if (fatalError || report.totals.failed || cases.length !== requested.length || !diagnostic?.pass || runtimeErrors.length || consoleErrors.length) {
    throw new Error(`Template review failed. See ${reportPath}`);
  }
  return report;
}

if (require.main === module) {
  runTemplate().then((report) => {
    process.stdout.write(`Template review passed (${report.metadata.mode}): ${report.totals.passed}/${report.totals.checked} layouts, ${report.totals.screenshots} screenshots, diagnostic save/reload, no runtime or application console errors\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { buildCases, checkState, isExpectedBlockedNetwork, runTemplate };
