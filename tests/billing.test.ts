import { describe, expect, it } from "vitest";
import { LIMITS, MB, planOf, stateFor } from "@/lib/storage";
import { PLAN_PRICE_PAISE, UPI_TOKEN_RE, newRef, upiUrl } from "@/lib/billing";
import { upiConfirmSchema } from "@/lib/validation";

describe("storage quota", () => {
  const free = { plan: "free", planUntil: null };
  it("warns from 20 MB and is full at 50 MB on the free plan", () => {
    expect(stateFor(free, 19 * MB)).toMatchObject({ warn: false, full: false, limit: 50 * MB });
    expect(stateFor(free, 20 * MB)).toMatchObject({ warn: true, full: false });
    expect(stateFor(free, 50 * MB)).toMatchObject({ warn: true, full: true });
  });
  it("gives 1 GB while the Upgrade is paid, and lapses after planUntil", () => {
    const pro = { plan: "pro", planUntil: new Date(Date.now() + 864e5) };
    expect(planOf(pro)).toBe("pro");
    expect(stateFor(pro, 60 * MB)).toMatchObject({ plan: "pro", full: false, limit: LIMITS.pro.limit });
    expect(planOf({ plan: "pro", planUntil: new Date(Date.now() - 1000) })).toBe("free");
  });
});

describe("upgrade payment", () => {
  it("builds the exact UPI link for ₹199", () => {
    expect(PLAN_PRICE_PAISE).toBe(19_900);
    expect(upiUrl()).toBe("upi://pay?pa=raghavkashyap2229@oksbi&pn=DioTa&am=199.00&cu=INR");
  });
  it("makes unguessable refs the confirm schema accepts", () => {
    const ref = newRef();
    expect(ref).toMatch(/^DT[0-9A-F]{20}$/);
    expect(newRef()).not.toBe(ref);
    expect(upiConfirmSchema.parse({ ref, status: "SUCCESS" })).toMatchObject({ status: "success", txnId: "" });
    expect(() => upiConfirmSchema.parse({ ref: "x", status: "success" })).toThrow();
  });
  it("accepts only plain UPI reference tokens", () => {
    expect(UPI_TOKEN_RE.test("AXI1234567890")).toBe(true);
    expect(UPI_TOKEN_RE.test("a b<script>")).toBe(false);
  });
});
