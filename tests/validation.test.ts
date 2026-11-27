import { describe, expect, it } from "vitest";
import { csrfOk } from "@/lib/csrf";
import { passwordOk } from "@/lib/rules";
import { appPatchSchema, methodSchema, signupSchema, vaultItemSchema } from "@/lib/validation";

const req = (h: Record<string, string>) => new Request("http://app.test/api/x", { method: "POST", headers: h });

describe("CSRF protection", () => {
  it("rejects requests without the custom header", () => {
    expect(csrfOk(req({ origin: "http://app.test", host: "app.test" }))).toBe(false);
  });
  it("rejects cross-site origins", () => {
    expect(csrfOk(req({ "x-dt-csrf": "1", origin: "http://evil.test", host: "app.test" }))).toBe(false);
  });
  it("accepts same-origin requests", () => {
    expect(csrfOk(req({ "x-dt-csrf": "1", origin: "http://app.test", host: "app.test" }))).toBe(true);
    expect(csrfOk(req({ "x-dt-csrf": "1", "sec-fetch-site": "same-origin" }))).toBe(true);
  });
  it("rejects a missing origin", () => {
    expect(csrfOk(req({ "x-dt-csrf": "1" }))).toBe(false);
  });
});

describe("input validation", () => {
  it("enforces password strength", () => {
    expect(passwordOk("short1!A")).toBe(false);
    expect(passwordOk("alllowercase123!")).toBe(false);
    expect(passwordOk("Str0ng-Passw0rd!")).toBe(true);
  });
  const valid = { name: "Asha Rao", email: "ASHA@Example.com", password: "Str0ng-Passw0rd!", consentTerms: true, consentPrivacy: true };
  it("normalises and accepts a valid signup", () => {
    const r = signupSchema.parse(valid);
    expect(r.email).toBe("asha@example.com");
  });
  it("requires consent", () => {
    expect(signupSchema.safeParse({ ...valid, consentPrivacy: false }).success).toBe(false);
  });
  it("rejects injection-style and malformed input", () => {
    expect(signupSchema.safeParse({ ...valid, email: "a@b.c' OR 1=1 --" }).success).toBe(false);
    expect(appPatchSchema.safeParse({ permissions: ["root"] }).success).toBe(false);
    expect(vaultItemSchema.safeParse({ label: "", content: "x" }).success).toBe(false);
  });
  it("validates payment methods", () => {
    expect(methodSchema.safeParse({ kind: "upi", upi: "name@bank" }).success).toBe(true);
    expect(methodSchema.safeParse({ kind: "upi", upi: "not a upi" }).success).toBe(false);
    expect(methodSchema.safeParse({ kind: "bank", holder: "A B", account: "123456789012", ifsc: "hdfc0001234" }).success).toBe(true);
    expect(methodSchema.safeParse({ kind: "bank", holder: "A B", account: "12ab", ifsc: "XXXX" }).success).toBe(false);
  });
});
