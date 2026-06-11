// Config loading + validation. config.yaml is the user-facing control surface;
// "subscribing" to an author is adding an entry here and committing.

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const sourceName = z.enum(["hardcover", "googlebooks"]);

const emailSchema = z.object({
  provider: z.enum(["resend", "console"]).default("resend"),
  from: z.string().min(1),
  to: z.string().min(1),
});

const settingsSchema = z.object({
  allowed_languages: z.array(z.string()).default(["en"]),
  release_lead_window_days: z.number().int().min(0).default(7),
  retire_after_runs: z.number().int().min(1).default(14),
  enabled_sources: z.array(sourceName).default(["hardcover", "googlebooks"]),
  email: emailSchema,
  junk_title_patterns: z.array(z.string()).default([]),
});

const authorSchema = z.object({
  author_key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "author_key must be a lowercase slug ([a-z0-9-])"),
  name: z.string().min(1),
  hardcover_id: z.number().int().optional(),
  google_query: z.string().optional(),
  primary_author_names: z.array(z.string()).optional(),
});

export const configSchema = z.object({
  settings: settingsSchema,
  authors: z.array(authorSchema).min(1),
});

export type Settings = z.infer<typeof settingsSchema>;
export type AuthorConfig = z.infer<typeof authorSchema>;
export type Config = z.infer<typeof configSchema>;

export function loadConfig(path = "config.yaml"): Config {
  const raw = parseYaml(readFileSync(path, "utf8"));
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid ${path}:\n${parsed.error.toString()}`);
  }
  const config = parsed.data;
  const keys = new Set<string>();
  for (const a of config.authors) {
    if (keys.has(a.author_key)) {
      throw new Error(`Duplicate author_key "${a.author_key}" in ${path}`);
    }
    keys.add(a.author_key);
  }
  return config;
}
