"use client";
import { api } from "@/lib/client";
import { packageOf } from "@/lib/deviceSync";
import { Phone, isNative } from "@/lib/native";

/**
 * Turns the on-phone firewall on/off for one app, then records it in the account.
 * The firewall is a local VPN on the phone (Android shows its own consent dialog the first time).
 */
export async function setAppBlocked(app: { slug: string; packageName?: string | null }, blocked: boolean) {
  if (!isNative()) throw new Error("not_native");
  const pkg = packageOf(app);
  if (!pkg) throw new Error("no_package");
  const fw = await Phone.firewall();
  const next = new Set(fw.packages);
  if (blocked) next.add(pkg);
  else next.delete(pkg);
  const res = await Phone.setBlocked([...next]);
  const isBlocked = res.packages.includes(pkg);
  if (blocked && !isBlocked) throw new Error("firewall_denied");
  await api(`/api/apps/${encodeURIComponent(app.slug)}`, { method: "PATCH", body: { blocked: isBlocked } });
  return isBlocked;
}
