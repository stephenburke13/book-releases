// Console provider: prints the would-be email instead of sending. Used by
// --dry-run and as the configured provider when you want zero side effects.

import type { Digest, EmailProvider } from "./base.js";

export class ConsoleProvider implements EmailProvider {
  readonly name = "console";
  constructor(private readonly to: string) {}

  async send(digest: Digest): Promise<void> {
    console.log("─".repeat(60));
    console.log(`To:      ${this.to}`);
    console.log(`Subject: ${digest.subject}`);
    console.log("─".repeat(60));
    console.log(digest.text);
    console.log("─".repeat(60));
  }
}
