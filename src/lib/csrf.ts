/** CSRF defence: same-origin check plus a custom header that cross-site forms cannot send. */
export function csrfOk(req: Request): boolean {
  if (req.headers.get("x-dt-csrf") !== "1") return false;
  if (req.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin).host;
    return o === req.headers.get("host") || o === req.headers.get("x-forwarded-host");
  } catch {
    return false;
  }
}
