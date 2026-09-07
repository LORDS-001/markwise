/**
 * Request pacing and cancellation, shared by both providers.
 *
 * This lives outside gemini.ts because Claude needs exactly the same
 * treatment: a rolling-window limiter, and an abort path that stops work
 * before it is paid for rather than after. Two copies would drift, and the
 * copy that drifted would be the one nobody was testing.
 */

export class CancelledError extends Error {
  constructor(message = "AI request was cancelled.") {
    super(message);
    this.name = "CancelledError";
  }
}

/** Throws the caller's own abort reason where there is one, so context survives. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new CancelledError();
  }
}

export async function abortableDelay(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(
        signal?.reason instanceof Error ? signal.reason : new CancelledError(),
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/**
 * A rolling-window limiter. Injectable clock and sleep so the pacing can be
 * asserted against a budget in a test without spending four minutes doing it.
 */
export function createRequestLimiter(options: {
  requestsPerMinute: () => number;
  now: () => number;
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}): (signal?: AbortSignal) => Promise<void> {
  const recentRequests: number[] = [];
  return async (signal?: AbortSignal) => {
    for (;;) {
      throwIfAborted(signal);
      const now = options.now();
      const limit = options.requestsPerMinute();

      while (recentRequests.length > 0 && now - recentRequests[0] >= 60_000) {
        recentRequests.shift();
      }

      if (recentRequests.length < limit) {
        recentRequests.push(now);
        return;
      }

      const waitMs = 60_000 - (now - recentRequests[0]) + 50;
      await options.sleep(waitMs, signal);
    }
  };
}

/** Rolling window plus the 50 ms of slack createRequestLimiter adds. */
export const RATE_WINDOW_MS = 60_050;
