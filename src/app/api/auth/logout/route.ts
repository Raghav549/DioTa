import { publicRoute } from "@/lib/api";
import { destroyCurrentSession } from "@/lib/auth";
import { audit } from "@/lib/events";

export const POST = publicRoute(async ({ user }) => {
  if (user) await audit(user.id, "logout");
  await destroyCurrentSession();
  return { ok: true };
});
