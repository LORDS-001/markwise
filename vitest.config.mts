import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
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
     * Two workers still parallelise the run while leaving headroom. Raise it
     * on a bigger machine; the suite is not order-dependent.
     */
    maxWorkers: 2,
    /*
     * jsdom setup alone can take a second or two under that contention, which
     * eats most of the 5s default before a test body starts.
     */
    testTimeout: 15_000,
  },
});
