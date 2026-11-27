import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAvatars, users } from "@/db/schema";
import { ApiError, authRoute, readBody } from "@/lib/api";
import { audit } from "@/lib/events";
import { avatarSchema } from "@/lib/validation";

const MAX_BYTES = 256 * 1024;

/** Checks the real file signature, so a renamed file can't be stored as an image. */
function sniff(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export const GET = authRoute(async ({ user }) => {
  const [a] = await db.select().from(userAvatars).where(eq(userAvatars.userId, user.id)).limit(1);
  if (!a) throw new ApiError("not_found", 404);
  return new NextResponse(Buffer.from(a.data, "base64"), {
    headers: { "Content-Type": a.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
});

export const PUT = authRoute(
  async ({ req, user }) => {
    const { dataUrl } = await readBody(req, avatarSchema, 450_000);
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const buf = Buffer.from(b64, "base64");
    const mime = sniff(buf);
    if (!mime || buf.length > MAX_BYTES) throw new ApiError("invalid_input", 400);
    const now = new Date();
    await db
      .insert(userAvatars)
      .values({ userId: user.id, mime, data: buf.toString("base64"), updatedAt: now })
      .onConflictDoUpdate({ target: userAvatars.userId, set: { mime, data: buf.toString("base64"), updatedAt: now } });
    await db.update(users).set({ avatarUpdatedAt: now }).where(eq(users.id, user.id));
    await audit(user.id, "avatar_updated");
    return { avatar: `/api/me/avatar?v=${now.getTime()}` };
  },
  { rate: { name: "avatar", max: 30, windowSec: 3600 } },
);

export const DELETE = authRoute(async ({ user }) => {
  await db.delete(userAvatars).where(eq(userAvatars.userId, user.id));
  await db.update(users).set({ avatarUpdatedAt: null }).where(eq(users.id, user.id));
  await audit(user.id, "avatar_removed");
  return { avatar: null };
});
