import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git worktrees are complete checkouts of this same repo, build output and
    // dependencies included. Linting one from its parent reports every problem
    // twice and buries the real ones — each checkout lints itself.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
