import { vi } from "vitest";

export function installMatchMedia(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const mediaQuery = {
    media: "(prefers-color-scheme: dark)",
    get matches() {
      return matches;
    },
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  } as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });

  return {
    setMatches(next: boolean) {
      matches = next;
      const event = { matches, media: mediaQuery.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
    listenerCount() {
      return listeners.size;
    },
  };
}
