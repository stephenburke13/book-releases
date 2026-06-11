// Swappable email provider interface. The pipeline depends only on this, so the
// transactional provider (Resend) can be replaced without touching anything else.

export interface Digest {
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  send(digest: Digest): Promise<void>;
}
