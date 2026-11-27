import { cache } from "react";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { ipFingerprint } from "@/lib/security";

export const SESSION_COOKIE = "dt_session";
const TTL_MS = 30 * 24 * 3600 * 1000;

export type SessionUser = User & { sessionId: string };

async function isHttps() {
  const h = await headers();
  return h.get("x-forwarded-proto")?.split(",")[0] === "https";
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const h = await headers();
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    userAgent: (h.get("user-agent") ?? "").slice(0, 300),
    ipHash: await ipFingerprint(),
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: await isHttps(),
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  if (Date.now() - row.s.lastSeenAt.getTime() > 10 * 60 * 1000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + TTL_MS) })
      .where(eq(sessions.id, row.s.id));
  }
  return { ...row.u, sessionId: row.s.id };
});

export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  store.delete(SESSION_COOKIE);
}

/** Only fields the browser is allowed to see. */
export function publicUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    language: u.language,
    theme: u.theme,
    protectionEnabled: u.protectionEnabled,
    monitoringEnabled: u.monitoringEnabled,
    notifPrefs: u.notifPrefs,
    createdAt: u.createdAt.toISOString(),
  };
}
