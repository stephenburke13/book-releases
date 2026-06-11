// CLI entry point.
//
//   tsx src/main.ts run                 normal run: fetch, diff, email, save state
//   tsx src/main.ts run --dry-run       print would-be email, send nothing, save nothing
//   tsx src/main.ts run --only hardcover restrict to one source (debugging)
//
// --seed is accepted as an alias for a normal run: a normal run already seeds any
// not-yet-seeded author/source silently, so no separate step is needed.

import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { run } from "./pipeline.js";
import type { SourceName } from "./models.js";

/** Minimal .env loader so local runs don't need extra tooling. */
function loadDotEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadDotEnv();

  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      seed: { type: "boolean", default: false },
      only: { type: "string" },
    },
  });

  const command = positionals[0] ?? "run";
  if (command !== "run") {
    console.error(`Unknown command "${command}". Usage: tsx src/main.ts run [--dry-run] [--only <source>]`);
    process.exit(2);
  }

  const only = values.only as SourceName | undefined;
  if (only && only !== "hardcover" && only !== "googlebooks") {
    console.error(`--only must be "hardcover" or "googlebooks".`);
    process.exit(2);
  }

  await run({ dryRun: values["dry-run"], onlySource: only });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
