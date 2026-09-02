/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ORIGIN = process.env.UI_REVIEW_ORIGIN || "http://127.0.0.1:3017";
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.UI_REVIEW_OUTPUT || ".next/ui-review",
);

class CDP {
  constructor(webSocketUrl) {
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP WebSocket did not open")), 30_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      this.socket.addEventListener("error", (event) => {
        clearTimeout(timeout);
        reject(new Error(`CDP WebSocket error: ${event.type}`));
      });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const handlers = this.listeners.get(message.method) || [];
      handlers.forEach((handler) => handler(message.params || {}));
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) || [];
    handlers.push(handler);
    this.listeners.set(method, handlers);
    return () => this.listeners.set(method, handlers.filter((item) => item !== handler));
  }

  closeSocket() {
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

async function openPage(debugPort) {
  const response = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" },
  );
  if (!response.ok) throw new Error(`Could not create browser target: ${response.status}`);
  const target = await response.json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Log.enable"),
  ]);
  return cdp;
}

async function evaluate(cdp, expression, { awaitPromise = true, returnByValue = true } = {}) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(`Page evaluation failed: ${detail}`);
  }
  return result.result?.value;
}

async function waitFor(cdp, expression, timeoutMs = 15_000, intervalMs = 80) {
  const started = Date.now();
  let lastValue;
  while (Date.now() - started < timeoutMs) {
    lastValue = await evaluate(cdp, expression);
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${expression}; last value: ${JSON.stringify(lastValue)}`);
}

async function navigate(cdp, url, readyExpression = "document.readyState === 'complete' && !!document.querySelector('main#main')") {
  await cdp.send("Page.navigate", { url });
  await waitFor(cdp, readyExpression, 30_000);
  await new Promise((resolve) => setTimeout(resolve, 120));
}

function ensureOutputDir(...segments) {
  const directory = path.join(OUTPUT_DIR, ...segments);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function writeJson(filename, data) {
  ensureOutputDir();
  const target = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`);
  return target;
}

async function closeBrowser(cdp) {
  if (!cdp) return;
  try {
    await cdp.send("Browser.close");
  } catch {
    // The browser may have already closed the socket while processing Browser.close.
  } finally {
    cdp.closeSocket();
  }
}

module.exports = {
  CDP,
  DEFAULT_ORIGIN,
  OUTPUT_DIR,
  closeBrowser,
  ensureOutputDir,
  evaluate,
  navigate,
  openPage,
  waitFor,
  writeJson,
};
