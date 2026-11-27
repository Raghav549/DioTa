import { randomBytes } from "node:crypto";

/**
 * The Upgrade plan: ₹199 for 30 days, paid by UPI from the DioTa Android app.
 *
 * The payee is kept on the server (UPI_PAYEE_VPA overrides the default) and is never shown in the
 * app's UI text: the app only receives a ready-made upi://pay link when the user taps Upgrade, and
 * hands it to the phone's UPI apps.
 */
export const PLAN_PRICE_PAISE = 19_900;
export const PLAN_DAYS = 30;
/** A payment must be confirmed within this long after it was started. */
export const ORDER_TTL_MS = 30 * 60_000;

const VPA_RE = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$/i;

function payee(): string {
  const v = process.env.UPI_PAYEE_VPA?.trim();
  return v && VPA_RE.test(v) ? v : "raghavkashyap2229@oksbi";
}

/** Our reference for one payment attempt (unguessable). */
export const newRef = () => `DT${randomBytes(10).toString("hex").toUpperCase()}`;

/** upi://pay?pa=<payee>&pn=DioTa&am=199.00&cu=INR */
export function upiUrl() {
  const amount = (PLAN_PRICE_PAISE / 100).toFixed(2);
  return `upi://pay?pa=${payee()}&pn=DioTa&am=${amount}&cu=INR`;
}

/** UPI transaction ids / bank approval references: plain, bounded tokens only. */
export const UPI_TOKEN_RE = /^[A-Za-z0-9._-]{4,80}$/;
