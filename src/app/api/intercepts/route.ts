import { ApiError, authRoute, readBody } from "@/lib/api";
import { isAppSlug } from "@/lib/catalog";
import { listIntercepts, storeIntercepts } from "@/lib/intercepts";
import { rateLimit } from "@/lib/security";
import { storageState } from "@/lib/storage";
import { interceptBatchSchema } from "@/lib/validation";

/** Latest blocked attempts (home stream, app dossier). `?app=<slug>` filters to one app. */
export const GET = authRoute(async ({ req, user }) => {
  const app = req.nextUrl.searchParams.get("app");
  if (app !== null && !isAppSlug(app)) throw new ApiError("invalid_input");
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 30));
  return { intercepts: await listIntercepts(user.id, { app: app ?? undefined, limit }) };
});

/** Blocked attempts reported by the DioTa Android app's tracker shield. */
export const POST = authRoute(async ({ req, user }) => {
  // Per account (not per IP: many phones share a carrier IP).
  if (!(await rateLimit(`intercepts:${user.id}`, 600, 3600))) throw new ApiError("rate", 429);
  const { events } = await readBody(req, interceptBatchSchema, 200_000);
  // Storage full: nothing is stored and the phone stops recording until space is freed / upgraded.
  if ((await storageState(user)).full) return { stored: 0, filed: 0, paused: true };
  const r = await storeIntercepts(user, events);
  return { ...r, paused: (await storageState(user)).full };
});
