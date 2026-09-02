/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  DEFAULT_ORIGIN,
  OUTPUT_DIR,
  closeBrowser,
  ensureOutputDir,
  evaluate,
  navigate,
  openPage,
  writeJson,
} = require("./cdp-common.cjs");

const ROUTES = [
  { id: "setup", path: "/" },
  { id: "processing", path: "/processing" },
  { id: "reveal", path: "/reveal" },
  { id: "map", path: "/map" },
  { id: "cluster", path: "/clusters/cl-impedance" },
  { id: "reteach", path: "/reteach" },
  { id: "reteach-detail", path: "/reteach/cl-arithmetic" },
  { id: "scores", path: "/scores" },
  { id: "export", path: "/export" },
];

const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 1000, frame: "desktop" },
  { id: "laptop", width: 1024, height: 900, frame: "desktop" },
  { id: "tablet", width: 768, height: 1024, frame: "mobile" },
  { id: "mobile", width: 390, height: 844, frame: "mobile" },
];

const APPEARANCES = [
  { id: "light", preference: "light", media: "dark", expected: "light" },
  { id: "dark", preference: "dark", media: "light", expected: "dark" },
  { id: "system-light", preference: "system", media: "light", expected: "light" },
  { id: "system-dark", preference: "system", media: "dark", expected: "dark" },
];

const SUPPORTED_INK_SURFACES = [
  "ground",
  "shell",
  "surface",
  "surface-2",
  "surface-3",
  "brand-soft",
  "warn-soft",
  "crit-soft",
  "ok-soft",
];
const INPUT_SURFACES = ["surface", "surface-2", "surface-3"];
const CONTRAST_PAIRS = [
  ...SUPPORTED_INK_SURFACES.map((background) => ({
    foreground: "ink-3",
    background,
    minimum: 4.5,
  })),
  ...INPUT_SURFACES.map((background) => ({
    foreground: "control-border",
    background,
    minimum: 3,
  })),
  { foreground: "on-ok", background: "ok", minimum: 4.5 },
  ...Array.from({ length: 7 }, (_, tone) => ({
    foreground: `on-c${tone}`,
    background: `c${tone}`,
    minimum: 4.5,
  })),
];
const REDUCED_MOTION_ROUTE = "/";
const DESKTOP_ASIDE_SELECTOR = 'aside[class~="lg:block"]';

function shouldCaptureScreenshot({ route, viewport, appearance }) {
  const explicit = appearance.id === "light" || appearance.id === "dark";
  return explicit && (
    viewport.id === "desktop" ||
    (viewport.id === "mobile" && ["setup", "map", "scores", "export"].includes(route.id))
  );
}

function rgbChannels(value) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Unsupported computed colour: ${value}`);
  return channels.map((channel) => channel / 255);
}

function luminance(value) {
  const [red, green, blue] = rgbChannels(value).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

function screenshotName(index, route, viewport, appearance) {
  return `${String(index).padStart(2, "0")}-${route.id}-${viewport.width}x${viewport.height}-${appearance.expected}.png`;
}

async function createContactSheet(cdp, screenshotManifest) {
  const outputDirectory = ensureOutputDir();
  const cards = screenshotManifest.map((item) => `
    <figure>
      <img src="${item.file.replaceAll("\\", "/")}" alt="" />
      <figcaption>${String(item.index).padStart(2, "0")} · ${item.route} · ${item.viewport} · ${item.appearance}</figcaption>
    </figure>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>Markwise UI review contact sheet</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; background: #d8dee4; color: #07101f; font: 13px/1.4 system-ui, sans-serif; }
      h1 { margin: 0 0 18px; font-size: 22px; }
      main { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
      figure { margin: 0; padding: 10px; border: 1px solid #aeb8c2; border-radius: 10px; background: white; }
      img { display: block; width: 100%; height: 250px; object-fit: contain; object-position: top center; background: #eef1f4; }
      figcaption { margin-top: 8px; min-height: 36px; font-weight: 600; overflow-wrap: anywhere; }
    </style>
    <h1>Markwise production UI review · 26 required Chrome captures</h1><main>${cards}</main>`;
  const htmlPath = path.join(outputDirectory, "chrome-contact-sheet.html");
  fs.writeFileSync(htmlPath, html);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 2400,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(cdp, pathToFileURL(htmlPath).href, "document.readyState === 'complete' && [...document.images].every((image) => image.complete && image.naturalWidth > 0)");
  const height = await evaluate(cdp, "document.documentElement.scrollHeight");
  const image = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 1600, height, scale: 1 },
  });
  const pngPath = path.join(outputDirectory, "chrome-contact-sheet.png");
  fs.writeFileSync(pngPath, Buffer.from(image.data, "base64"));
  return {
    html: path.relative(OUTPUT_DIR, htmlPath).replaceAll("\\", "/"),
    png: path.relative(OUTPUT_DIR, pngPath).replaceAll("\\", "/"),
    width: 1600,
    height,
    captures: screenshotManifest.length,
  };
}

function createThemeTraceSource(appearance) {
  return `(() => {
    try { localStorage.setItem("markwise-theme", ${JSON.stringify(appearance.preference)}); } catch {}
    window.__uiReviewThemeTrace = [];
    const record = (kind) => window.__uiReviewThemeTrace.push({
      kind,
      theme: document.documentElement.getAttribute("data-theme"),
      at: performance.now(),
    });
    const observeRoot = () => {
      if (!document.documentElement) {
        setTimeout(observeRoot, 0);
        return;
      }
      record("observer-start");
      new MutationObserver(() => record("mutation")).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    };
    observeRoot();
    requestAnimationFrame(() => record("first-animation-frame"));
  })();`;
}

async function installThemeTrace(cdp, appearance) {
  const source = createThemeTraceSource(appearance);
  return cdp.send("Page.addScriptToEvaluateOnNewDocument", { source });
}

async function collectPageState(cdp, contrastPairs) {
  return evaluate(cdp, `(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const geometry = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const horizontalFit = (element, tolerance = 1) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.left >= -tolerance && rect.right <= innerWidth + tolerance && rect.width <= innerWidth + tolerance;
    };
    const parseRgb = (value) => {
      const channels = value.match(/[\\d.]+/g)?.slice(0, 3).map(Number);
      return channels?.length === 3 ? channels.map((channel) => channel / 255) : null;
    };
    const luminance = (value) => {
      const channels = parseRgb(value);
      if (!channels) return null;
      const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const contrast = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      if (first === null || second === null) return null;
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const probe = document.createElement("span");
    probe.style.position = "fixed";
    probe.style.left = "-10000px";
    document.body.append(probe);
    const contrasts = ${JSON.stringify(contrastPairs)}.map((pair) => {
      probe.style.color = "var(--" + pair.foreground + ")";
      probe.style.backgroundColor = "var(--" + pair.background + ")";
      const computed = getComputedStyle(probe);
      const foreground = computed.color;
      const background = computed.backgroundColor;
      return { ...pair, foregroundValue: foreground, backgroundValue: background, ratio: contrast(foreground, background) };
    });
    probe.remove();

    const main = document.querySelector("main#main");
    const heading = main?.querySelector("h1");
    const shell = main?.closest(".bg-shell");
    const desktopAside = document.querySelector(${JSON.stringify(DESKTOP_ASIDE_SELECTOR)});
    const mobileNav = document.querySelector('button[aria-label="Open navigation"]');
    const setupDescriptions = [...document.querySelectorAll('input[aria-label^="Criterion "][aria-label$=" description"]')];
    const setupMarks = [...document.querySelectorAll('input[aria-label^="Marks for criterion "]')];
    const setupRows = setupDescriptions.map((description) => description.closest("li") || description.parentElement);
    const setupFields = location.pathname === "/" ? [...main.querySelectorAll("input, textarea, button")].filter(visible) : [];
    const headingRect = geometry(heading);
    return {
      pathname: location.pathname,
      themeTrace: window.__uiReviewThemeTrace || [],
      settledTheme: document.documentElement.getAttribute("data-theme"),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      main: { count: document.querySelectorAll("main#main").length, tabIndex: main?.tabIndex, visible: visible(main), geometry: geometry(main) },
      skip: { count: document.querySelectorAll('a[href="#main"]').length, text: document.querySelector('a[href="#main"]')?.textContent?.trim() },
      shell: { visible: visible(shell), geometry: geometry(shell) },
      heading: { text: heading?.textContent?.trim(), visible: visible(heading), geometry: headingRect, fontSize: heading ? parseFloat(getComputedStyle(heading).fontSize) : 0 },
      bodyTextLength: main?.innerText.trim().length || 0,
      frame: { desktopAsideVisible: visible(desktopAside), mobileNavVisible: visible(mobileNav) },
      setup: {
        fieldCount: setupFields.length,
        fieldsFit: setupFields.every((element) => horizontalFit(element)),
        descriptions: setupDescriptions.map(geometry),
        marks: setupMarks.map(geometry),
        rows: setupRows.map(geometry),
        descriptionsFit: setupDescriptions.every((element) => horizontalFit(element)),
        marksFit: setupMarks.every((element) => horizontalFit(element)),
        rowsFit: setupRows.every((element) => horizontalFit(element)),
      },
      contrasts,
    };
  })()`);
}

async function runReducedMotionCheck(cdp, origin) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });
  await navigate(cdp, `${origin}${REDUCED_MOTION_ROUTE}`);
  const result = await evaluate(cdp, `(() => {
    const seconds = (value) => Math.max(...value.split(",").map((part) => {
      const trimmed = part.trim();
      return trimmed.endsWith("ms") ? parseFloat(trimmed) / 1000 : parseFloat(trimmed) || 0;
    }));
    const sampled = [...document.querySelectorAll("button, input, textarea, [role=tab], [role=radio], [role=progressbar]")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none";
      })
      .slice(0, 100)
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          tag: element.tagName,
          name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80),
          transitionDuration: style.transitionDuration,
          animationDuration: style.animationDuration,
          transitionSeconds: seconds(style.transitionDuration),
          animationSeconds: seconds(style.animationDuration),
        };
      });
    return {
      mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      sampleCount: sampled.length,
      maximumTransitionSeconds: Math.max(0, ...sampled.map((item) => item.transitionSeconds)),
      maximumAnimationSeconds: Math.max(0, ...sampled.map((item) => item.animationSeconds)),
      sampled,
    };
  })()`);
  result.pass = result.mediaMatches && result.sampleCount > 0 &&
    result.maximumTransitionSeconds <= 0.001 && result.maximumAnimationSeconds <= 0.001;
  return result;
}

async function runMatrix(options = {}) {
  const browser = options.browser || process.argv[2] || "chrome";
  const debugPort = Number(options.debugPort || process.argv[3] || 9222);
  const outputName = options.outputName || process.argv[4] || `${browser}-matrix.json`;
  const origin = options.origin || process.env.UI_REVIEW_ORIGIN || DEFAULT_ORIGIN;
  const captureScreenshots = options.captureScreenshots ?? browser.toLowerCase().includes("chrome");
  const cdp = await openPage(debugPort);
  const cases = [];
  const screenshotManifest = [];
  const consoleMessages = [];
  const runtimeErrors = [];
  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (["error", "warning"].includes(event.type)) {
      consoleMessages.push({ type: event.type, text: event.args?.map((arg) => arg.value || arg.description).join(" ") });
    }
  });
  cdp.on("Runtime.exceptionThrown", (event) => runtimeErrors.push(
    event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Runtime exception",
  ));
  cdp.on("Log.entryAdded", (event) => {
    if (["error", "warning"].includes(event.entry?.level)) consoleMessages.push({ type: event.entry.level, text: event.entry.text });
  });

  let screenshotIndex = 0;
  try {
    for (const route of ROUTES) {
      for (const viewport of VIEWPORTS) {
        for (const appearance of APPEARANCES) {
          consoleMessages.length = 0;
          runtimeErrors.length = 0;
          await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 1,
            mobile: viewport.id === "mobile",
          });
          await cdp.send("Emulation.setEmulatedMedia", {
            media: "screen",
            features: [
              { name: "prefers-color-scheme", value: appearance.media },
              { name: "prefers-reduced-motion", value: "no-preference" },
            ],
          });
          const script = await installThemeTrace(cdp, appearance);
          await navigate(cdp, `${origin}${route.path}`);
          await new Promise((resolve) => setTimeout(resolve, 80));
          const state = await collectPageState(cdp, CONTRAST_PAIRS);
          await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: script.identifier });

          const failures = [];
          const traceThemes = state.themeTrace.map((entry) => entry.theme).filter(Boolean);
          const firstPaint = state.themeTrace.find((entry) => entry.kind === "first-animation-frame")?.theme;
          assert(state.pathname === route.path, `pathname ${state.pathname} !== ${route.path}`, failures);
          assert(firstPaint === appearance.expected, `first paint theme ${firstPaint} !== ${appearance.expected}`, failures);
          assert(traceThemes.every((theme) => theme === appearance.expected), `theme flash trace ${JSON.stringify(traceThemes)}`, failures);
          assert(state.settledTheme === appearance.expected, `settled theme ${state.settledTheme}`, failures);
          assert(state.colorScheme.includes(appearance.expected), `color-scheme ${state.colorScheme}`, failures);
          assert(state.main.count === 1 && state.main.tabIndex === -1 && state.main.visible, "main#main contract", failures);
          assert(state.skip.count === 1 && state.skip.text === "Skip to content", "skip-link contract", failures);
          assert(state.shell.visible, "shell is not visible", failures);
          assert(state.heading.visible && state.heading.geometry?.width >= 80 && state.heading.geometry?.height >= 20 && state.heading.fontSize >= 20, "H1 visibility/size", failures);
          assert(state.bodyTextLength >= 80, `insufficient visible content (${state.bodyTextLength})`, failures);
          assert(state.overflow <= 1, `page horizontal overflow ${state.overflow}px`, failures);
          assert(viewport.frame === "desktop" ? state.frame.desktopAsideVisible && !state.frame.mobileNavVisible : !state.frame.desktopAsideVisible && state.frame.mobileNavVisible, `frame breakpoint ${JSON.stringify(state.frame)}`, failures);
          if (route.path === "/") {
            assert(state.setup.fieldCount > 0 && state.setup.fieldsFit, "visible Setup control offscreen/clipped", failures);
            assert(state.setup.descriptions.length > 0 && state.setup.descriptionsFit, "criterion description geometry", failures);
            assert(state.setup.marks.length > 0 && state.setup.marksFit, "criterion marks geometry", failures);
            assert(state.setup.rows.length > 0 && state.setup.rowsFit, "criterion row geometry", failures);
          }
          for (const contrast of state.contrasts) {
            assert(contrast.ratio !== null && contrast.ratio + 1e-8 >= contrast.minimum, `contrast --${contrast.foreground} on --${contrast.background}: ${contrast.ratio?.toFixed(2)} < ${contrast.minimum}`, failures);
          }
          assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join(" | ")}`, failures);
          assert(consoleMessages.length === 0, `console warnings/errors: ${consoleMessages.map((item) => item.text).join(" | ")}`, failures);

          const combination = { route, viewport, appearance };
          let screenshot;
          if (captureScreenshots && shouldCaptureScreenshot(combination)) {
            screenshotIndex += 1;
            const filename = screenshotName(screenshotIndex, route, viewport, appearance);
            const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
            const directory = ensureOutputDir("screenshots");
            fs.writeFileSync(path.join(directory, filename), Buffer.from(result.data, "base64"));
            screenshot = `screenshots/${filename}`;
            screenshotManifest.push({ index: screenshotIndex, route: route.path, viewport: `${viewport.width}x${viewport.height}`, appearance: appearance.expected, file: screenshot });
          }
          cases.push({
            id: `${route.id}-${viewport.id}-${appearance.id}`,
            pass: failures.length === 0,
            failures,
            route,
            viewport,
            appearance,
            state,
            consoleMessages: [...consoleMessages],
            runtimeErrors: [...runtimeErrors],
            screenshot,
          });
        }
      }
    }

    const contactSheet = captureScreenshots
      ? await createContactSheet(cdp, screenshotManifest)
      : null;
    const reducedMotion = await runReducedMotionCheck(cdp, origin);
    const report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      browser,
      origin,
      totals: {
        cases: cases.length,
        passed: cases.filter((item) => item.pass).length,
        failed: cases.filter((item) => !item.pass).length,
        screenshots: screenshotManifest.length,
      },
      reducedMotion,
      contactSheet,
      contrastPairs: CONTRAST_PAIRS,
      cases,
      screenshots: screenshotManifest,
    };
    const reportPath = writeJson(outputName, report);
    if (captureScreenshots) writeJson("chrome-screenshot-manifest.json", screenshotManifest);
    if (cases.some((item) => !item.pass) || !reducedMotion.pass) {
      throw new Error(`${browser} UI review failed: ${report.totals.failed} matrix failures; reduced motion ${reducedMotion.pass ? "passed" : "failed"}. See ${reportPath}`);
    }
    return report;
  } finally {
    await closeBrowser(cdp);
  }
}

if (require.main === module) {
  runMatrix().then((report) => {
    process.stdout.write(`${report.browser}: ${report.totals.passed}/${report.totals.cases}; screenshots ${report.totals.screenshots}; reduced motion pass\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  APPEARANCES,
  CONTRAST_PAIRS,
  DESKTOP_ASIDE_SELECTOR,
  INPUT_SURFACES,
  REDUCED_MOTION_ROUTE,
  ROUTES,
  SUPPORTED_INK_SURFACES,
  VIEWPORTS,
  contrastRatio,
  createThemeTraceSource,
  runMatrix,
  shouldCaptureScreenshot,
};
