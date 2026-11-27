import { configuredOrigin } from "@/lib/origin";

/**
 * CSRF defence in depth:
 *  - a custom header (cross-site forms and simple requests cannot send it without a CORS preflight,
 *    and this app never answers preflights), and
 *  - a same-origin check using Sec-Fetch-Site / Origin.
 */
export function csrfOk(req: Request): boolean {
  if (req.headers.get("x-dt-csrf") !== "1") return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return site === "same-origin";
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  const fixed = configuredOrigin();
  if (fixed && o.origin === fixed) return true;
  return o.host === req.headers.get("host") || o.host === req.headers.get("x-forwarded-host");
}
