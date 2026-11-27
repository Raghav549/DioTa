import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  consents,
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
import { audit, recordEvent } from "@/lib/events";

export const GET = authRoute(
  async ({ user }) => {
    const uid = user.id;
    const [apps, events, items, cats, cons, txs, methods, notifs] = await Promise.all([
      db.select().from(monitoredApps).where(eq(monitoredApps.userId, uid)),
      db.select().from(privacyEvents).where(eq(privacyEvents.userId, uid)),
      db.select().from(vaultItems).where(eq(vaultItems.userId, uid)),
      db.select().from(vaultCategories).where(eq(vaultCategories.userId, uid)),
      db.select().from(consents).where(eq(consents.userId, uid)),
      db.select().from(walletTransactions).where(eq(walletTransactions.userId, uid)),
      db.select().from(paymentMethods).where(eq(paymentMethods.userId, uid)),
      db.select().from(notifications).where(eq(notifications.userId, uid)),
    ]);
    await audit(uid, "data_export");
    await recordEvent(uid, "export");
    const body = {
      exportedAt: new Date().toISOString(),
      profile: publicUser(user),
      apps: apps.map(({ userId, ...a }) => (void userId, a)),
      privacyEvents: events.map(({ userId, ...e }) => (void userId, e)),
      vault: items.map((i) => ({
        category: i.category,
        label: decrypt(uid, i.labelEnc),
        content: decrypt(uid, i.dataEnc),
        createdAt: i.createdAt,
      })),
      vaultSharing: cats.map((c) => ({ category: c.category, mode: c.mode })),
      consents: cons.map((c) => ({ scope: c.scope, granted: c.granted, version: c.version, at: c.createdAt })),
      transactions: txs.map((t) => ({ type: t.type, amountPaise: t.amountPaise, status: t.status, at: t.createdAt })),
      paymentMethods: methods.map((m) => ({ kind: m.kind, display: m.display, status: m.status })),
      notifications: notifs.map((n) => ({ type: n.type, params: n.params, at: n.createdAt })),
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="dioTa-export.json"',
        "Cache-Control": "no-store",
      },
    });
  },
  { rate: { name: "export", max: 10, windowSec: 3600 } },
);
