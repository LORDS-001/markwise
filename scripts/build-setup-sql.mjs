/**
 * Rebuilds supabase/setup.sql from the numbered migrations.
 *
 * The concatenation exists so a new project can be set up with one paste
 * instead of five. Regenerate it whenever a migration is added or changed,
 * or the one-paste path silently stops matching the real schema.
 *
 *   node scripts/build-setup-sql.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

const header = readFileSync("supabase/setup.sql", "utf8").split("\n/* ====")[0];

const body = files
  .map(
    (name) =>
      `\n\n/* ================================================================\n   ${name}\n   ================================================================ */\n\n` +
      readFileSync(join(DIR, name), "utf8"),
  )
  .join("");

writeFileSync("supabase/setup.sql", header + body, "utf8");
console.log(`setup.sql rebuilt from ${files.length} migrations`);
