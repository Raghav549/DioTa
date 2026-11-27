import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  consents,
  intercepts,
  sessions,
  supportRequests,
  userAvatars,
  monitoredApps,
  notifications,
  paymentMethods,
  privacyEvents,
  vaultCategories,
  vaultItems,
  walletTransactions,
} from "@/db/schema";
import { authRoute } from "@/lib/api";
import { publicUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { appName } from "@/lib/catalog";
import { audit, recordEvent } from "@/lib/events";
import { decodeIntercept } from "@/lib/intercepts";

export const GET = authRoute(
  async ({ user }) => {
    const uid = user.id;
    const [apps, events, items, cats, cons, txs, methods, notifs, sess, audits, support, [avatar], caught] = await Promise.all([
      db.select().from(monitoredApps).where(eq(monitoredApps.userId, uid)),
      db.select().from(privacyEvents).where(eq(privacyEvents.userId, uid)),
      db.select().from(vaultItems).where(eq(vaultItems.userId, uid)),
      db.select().from(vaultCategories).where(eq(vaultCategories.userId, uid)),
      db.select().from(consents).where(eq(consents.userId, uid)),
      db.select().from(walletTransactions).where(eq(walletTransactions.userId, uid)),
      db.select().from(paymentMethods).where(eq(paymentMethods.userId, uid)),
      db.select().from(notifications).where(eq(notifications.userId, uid)),
      db.select().from(sessions).where(eq(sessions.userId, uid)),
      db.select().from(auditLogs).where(eq(auditLogs.userId, uid)),
      db.select().from(supportRequests).where(eq(supportRequests.userId, uid)),
      db.select().from(userAvatars).where(eq(userAvatars.userId, uid)).limit(1),
      db.select().from(intercepts).where(eq(intercepts.userId, uid)).orderBy(desc(intercepts.lastAt)),
    ]);
    await audit(uid, "data_export");
    await recordEvent(uid, "export");
    const body = {
      exportedAt: new Date().toISOString(),
      profile: publicUser(user),
      profilePicture: avatar ? `data:${avatar.mime};base64,${avatar.data}` : null,
      apps: apps.map(({ userId, icon, ...a }) => (void userId, { ...a, name: appName(a.slug, a.name), hasPhoneIcon: !!icon })),
      privacyEvents: events.map(({ userId, ...e }) => (void userId, e)),
      /** Every attempt DioTa's tracker shield blocked on your phone, with what it was after. */
      blockedAttempts: caught
        .map((r) => decodeIntercept(uid, r))
        .filter((x) => x !== null)
        .map(({ id, ...x }) => (void id, x)),
      vault: items.map((i) => ({
        category: i.category,
        source: i.sourceKey ? "captured" : "manual",
        label: decrypt(uid, i.labelEnc),
        content: decrypt(uid, i.dataEnc),
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })),
      vaultSharing: cats.map((c) => ({ category: c.category, mode: c.mode })),
      consents: cons.map((c) => ({ scope: c.scope, granted: c.granted, version: c.version, at: c.createdAt })),
      transactions: txs.map((t) => ({ type: t.type, amountPaise: t.amountPaise, status: t.status, at: t.createdAt })),
      paymentMethods: methods.map((m) => ({ kind: m.kind, display: m.display, status: m.status })),
      notifications: notifs.map((n) => ({ type: n.type, params: n.params, read: n.read, at: n.createdAt })),
      signedInDevices: sess.map((x) => ({ device: x.userAgent, signedInAt: x.createdAt, lastActive: x.lastSeenAt, expires: x.expiresAt })),
      securityLog: audits.map((a) => ({ action: a.action, at: a.createdAt })),
      supportRequests: support.map((r) => ({ subject: r.subject, message: r.message, at: r.createdAt })),
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dioTa-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { rate: { name: "export", max: 10, windowSec: 3600 } },
);
