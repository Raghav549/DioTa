import { cache } from "react";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { ipFingerprint } from "@/lib/security";
import { ensureSchema } from "@/db/migrate";
import { databaseUrl } from "@/lib/config";

const TTL_MS = 30 * 24 * 3600 * 1000; // sliding idle timeout
const ABSOLUTE_MS = 90 * 24 * 3600 * 1000; // hard cap, regardless of activity

export type SessionUser = User & { sessionId: string };

/** Production always runs behind HTTPS (Vercel enforces it). */
export async function isHttps() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) return true;
  const h = await headers();
  return h.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

/**
 * Over HTTPS the cookie uses the `__Host-` prefix: the browser then guarantees it is Secure,
 * host-only (no Domain attribute, so sibling subdomains cannot set or read it) and Path=/.
 */
export const sessionCookieName = (secure: boolean) => (secure ? "__Host-dt_session" : "dt_session");

export async function createSession(userId: string) {
  const token = randomToken(32);
  const h = await headers();
  const secure = await isHttps();
  // Rotate: never keep a pre-login session token alive (session fixation defence).
  const previous = (await cookies()).get(sessionCookieName(secure))?.value;
  if (previous && previous.length <= 100) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(previous)));
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    userAgent: (h.get("user-agent") ?? "").slice(0, 300),
    ipHash: await ipFingerprint(),
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  (await cookies()).set(sessionCookieName(secure), token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(sessionCookieName(await isHttps()))?.value;
  if (!token || token.length < 40 || token.length > 100) return null;
  if (!databaseUrl()) return null; // not configured yet: behave as signed out instead of crashing pages
  await ensureSchema();
  const [row] = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  const hardExpiry = row.s.createdAt.getTime() + ABSOLUTE_MS;
  if (Date.now() >= hardExpiry) {
    await db.delete(sessions).where(eq(sessions.id, row.s.id));
    return null;
  }
  if (Date.now() - row.s.lastSeenAt.getTime() > 10 * 60 * 1000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Math.min(Date.now() + TTL_MS, hardExpiry)) })
      .where(eq(sessions.id, row.s.id));
  }
  return { ...row.u, sessionId: row.s.id };
});

export async function destroyCurrentSession() {
  const store = await cookies();
  const name = sessionCookieName(await isHttps());
  const token = store.get(name)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  store.set(name, "", { httpOnly: true, secure: name.startsWith("__Host-"), sameSite: "lax", path: "/", maxAge: 0 });
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
