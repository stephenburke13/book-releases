import { describe, expect, it } from "vitest";
import { confirmToken, manageToken, signToken, verifyToken } from "../lib/tokens";

const SECRET = "test-signing-secret";

describe("tokens", () => {
  it("round-trips a signed payload", async () => {
    const tok = await signToken({ sub: "abc", purpose: "manage" }, SECRET);
    const payload = await verifyToken(tok, SECRET, "manage");
    expect(payload).toMatchObject({ sub: "abc", purpose: "manage" });
  });

  it("rejects a wrong secret", async () => {
    const tok = await signToken({ sub: "abc", purpose: "manage" }, SECRET);
    expect(await verifyToken(tok, "other-secret", "manage")).toBeNull();
  });

  it("rejects a tampered body", async () => {
    const tok = await signToken({ sub: "abc", purpose: "manage" }, SECRET);
    const [body, sig] = tok.split(".");
    const tampered = `${body}x.${sig}`;
    expect(await verifyToken(tampered, SECRET, "manage")).toBeNull();
  });

  it("enforces the expected purpose", async () => {
    const tok = await confirmToken("abc", SECRET);
    expect(await verifyToken(tok, SECRET, "manage")).toBeNull();
    expect(await verifyToken(tok, SECRET, "confirm")).toMatchObject({ purpose: "confirm" });
  });

  it("rejects an expired token", async () => {
    const tok = await signToken({ sub: "abc", purpose: "confirm", exp: Date.now() - 1000 }, SECRET);
    expect(await verifyToken(tok, SECRET, "confirm")).toBeNull();
  });

  it("manage tokens do not expire", async () => {
    const tok = await manageToken("abc", SECRET);
    const payload = await verifyToken(tok, SECRET, "manage");
    expect(payload?.exp).toBeUndefined();
  });
});
