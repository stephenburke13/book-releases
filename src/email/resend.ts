// Resend provider. Sends one digest email per run. The send is the pipeline's
// commit point — state is only persisted after this resolves successfully.

import { Resend } from "resend";
import type { Digest, EmailProvider } from "./base.js";

export class ResendProvider implements EmailProvider {
  readonly name = "resend";
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
    private readonly to: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(digest: Digest): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: this.to,
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.name}: ${error.message}`);
    }
  }
}
