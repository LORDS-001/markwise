/* eslint-disable @typescript-eslint/no-require-imports */
// Checks actual browser geometry, including hidden labels in nested scrollers.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_ORIGIN, openPage, navigate, evaluate, waitFor, closeBrowser, ensureOutputDir } = require("./cdp-common.cjs");

(async () => {
  const cdp = await openPage(Number(process.argv[2] || 9229));
  const cases = [];
  const runtimeErrors = [];
  let failure = null;
  cdp.on("Runtime.exceptionThrown", (event) => runtimeErrors.push(event.exceptionDetails));
  try {
    for (const width of [1440, 1024, 320]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await navigate(cdp, DEFAULT_ORIGIN + "/scores", "document.readyState === 'complete' && !!document.querySelector('main tbody tr')");
      await evaluate(cdp, "document.fonts.ready.then(() => true)");
      const rowCount = await evaluate(cdp, "document.querySelectorAll('main tbody tr[data-review-row]').length");
      const studentId = await evaluate(cdp, "document.querySelector('main tbody tr td div').textContent.trim()");

      const check = async (state) => {
        const result = await evaluate(cdp, `(() => {
          const main = document.querySelector('main#main');
          const page = main.firstElementChild;
          const table = main.querySelector('table');
          const viewport = table.parentElement;
          main.scrollTop = main.scrollHeight;
          viewport.scrollTop = viewport.scrollHeight;
          const tableVisible = viewport.getBoundingClientRect().height > 0;
          const lastRow = table.querySelector('tbody tr:last-child');
          const expectedHeight = Math.max(main.clientHeight, page.offsetHeight);
          return {
            scrollHeight: main.scrollHeight,
            expectedHeight,
            blankOverflow: main.scrollHeight - expectedHeight,
            bottomGap: main.scrollHeight > main.clientHeight + 1
              ? main.getBoundingClientRect().bottom - page.getBoundingClientRect().bottom : 0,
            horizontalOverflow: Math.max(main.scrollWidth - main.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth),
            documentHeight: document.documentElement.scrollHeight,
            tableVisible,
            lastRowFits: !tableVisible || !lastRow || Math.abs(lastRow.getBoundingClientRect().bottom - (viewport.getBoundingClientRect().top + viewport.clientHeight)) <= 2,
            headerTop: main.parentElement.querySelector('header').getBoundingClientRect().top,
          };
        })()`);
        cases.push({ width, state, ...result });
        assert.ok(result.blankOverflow <= 2, `${width}px ${state}: ${result.blankOverflow}px blank scroll space after page content`);
        assert.ok(Math.abs(result.bottomGap) <= 2, `${width}px ${state}: page bottom must end at the scroll boundary`);
        assert.ok(result.horizontalOverflow <= 1, `${width}px ${state}: horizontal page overflow`);
        assert.equal(result.documentHeight, 900);
        assert.equal(result.headerTop, 0);
        assert.ok(result.lastRowFits, `${width}px ${state}: table scrolling must end at the last score row`);
        if (width === 1440 && state === "initial") {
          const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
          fs.writeFileSync(path.join(ensureOutputDir(), "scores-scroll-bottom.png"), Buffer.from(screenshot.data, "base64"));
        }
      };
      const setQuery = async (query, count) => {
        await evaluate(cdp, `(() => {
          const input = document.querySelector('input[aria-label="Search responses"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(query)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`);
        await waitFor(cdp, `document.querySelectorAll('main tbody tr[data-review-row]').length === ${count}`);
      };

      await check("initial");
      await evaluate(cdp, "[...document.querySelectorAll('main [data-review-row] button[aria-expanded=\"false\"]')].find(button => button.getBoundingClientRect().width > 0).click(); true");
      await waitFor(cdp, "!!document.querySelector('main [data-review-row] button[aria-expanded=\"true\"]')");
      await check("expanded-answer");
      await evaluate(cdp, "[...document.querySelectorAll('main [data-review-row] button[aria-expanded=\"true\"]')].find(button => button.getBoundingClientRect().width > 0).click(); true");
      await setQuery(studentId, 1);
      await check("one-result");
      await setQuery("no-matching-response-for-scroll-review", 0);
      await check("empty-results");
      await setQuery("", rowCount);
      await check("restored-results");
      await evaluate(cdp, "document.querySelector('main details summary').click(); true");
      await waitFor(cdp, "!!document.querySelector('main details[open]')");
      await check("expanded-confidence-explanation");
    }
    assert.deepEqual(runtimeErrors, []);
    process.stdout.write(`${cases.length}/18 Score review scroll checks passed; no blank overflow or runtime exceptions.\n`);
  } catch (error) {
    failure = error.stack || String(error);
    throw error;
  } finally {
    fs.writeFileSync(path.join(ensureOutputDir(), "scores-scroll.json"), JSON.stringify({ cases, runtimeErrors, failure }, null, 2));
    await closeBrowser(cdp);
  }
})().catch((error) => {
  process.stderr.write((error.stack || String(error)) + "\n");
  process.exitCode = 1;
});
