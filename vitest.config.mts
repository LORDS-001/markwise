import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    clearMocks: true,
    /*
     * A jsdom fork per core is more than a 4-core, 8GB machine can hold: the
     * workers contend for memory, and tests that pass comfortably on their own
     * start timing out — a different one each run, which reads as flakiness in
     * the suite rather than the resource starvation it actually is.
     *
     * A single worker leaves headroom for the application and editor. The
     * suite stays isolated per file and does not depend on execution order.
     */
    // Threads avoid Windows child-process startup timeouts; one worker leaves
    // enough memory for the larger jsdom workflows.
    pool: "threads",
    maxWorkers: 1,
    /*
     * jsdom setup alone can take a second or two under that contention, which
     * eats most of the 5s default before a test body starts.
     */
    testTimeout: 15_000,
  },
});
