import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { consents, intercepts, vaultCategories, vaultItems } from "@/db/schema";
import { ApiError, authRoute, readBody } from "@/lib/api";
import { CATEGORIES, CONSENT_VERSION, type Category } from "@/lib/catalog";
import { decrypt, encrypt } from "@/lib/crypto";
import { audit, recordEvent } from "@/lib/events";
import { storageState } from "@/lib/storage";
import { vaultItemSchema, vaultModeSchema } from "@/lib/validation";

function cat(p: string): Category {
  if (!(CATEGORIES as readonly string[]).includes(p)) throw new ApiError("not_found", 404);
  return p as Category;
}
async function modeOf(userId: string, c: string) {
  const [m] = await db
    .select()
    .from(vaultCategories)
    .where(and(eq(vaultCategories.userId, userId), eq(vaultCategories.category, c)))
    .limit(1);
  return m?.mode ?? "private";
}

export const GET = authRoute<{ category: string }>(async ({ user, params }) => {
  const c = cat(params.category);
  const rows = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.userId, user.id), eq(vaultItems.category, c)))
    .orderBy(desc(vaultItems.updatedAt));
  return {
    category: c,
    mode: await modeOf(user.id, c),
    items: rows.map((r) => ({
      id: r.id,
      label: decrypt(user.id, r.labelEnc),
      content: decrypt(user.id, r.dataEnc),
      size: r.size,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
});

export const POST = authRoute<{ category: string }>(async ({ req, user, params }) => {
  const c = cat(params.category);
  const b = await readBody(req, vaultItemSchema);
  if ((await modeOf(user.id, c)) === "disabled") throw new ApiError("vault_disabled", 403);
  if ((await storageState(user)).full) throw new ApiError("storage_full", 403);
  await db.insert(vaultItems).values({
    userId: user.id,
    category: c,
    labelEnc: encrypt(user.id, b.label),
    dataEnc: encrypt(user.id, b.content),
    size: Buffer.byteLength(b.label) + Buffer.byteLength(b.content),
  });
  await recordEvent(user.id, "vault_add", { cat: c });
  await audit(user.id, "vault_add", { category: c });
  return { ok: true };
});

export const PATCH = authRoute<{ category: string }>(async ({ req, user, params }) => {
  const c = cat(params.category);
  const { mode } = await readBody(req, vaultModeSchema);
  await db
    .insert(vaultCategories)
    .values({ userId: user.id, category: c, mode })
    .onConflictDoUpdate({
      target: [vaultCategories.userId, vaultCategories.category],
      set: { mode, updatedAt: new Date() },
    });
  await db.insert(consents).values({ userId: user.id, scope: `vault:${c}:${mode}`, granted: mode === "selected", version: CONSENT_VERSION });
  await recordEvent(user.id, "cat_mode", { cat: c, mode });
  await audit(user.id, "vault_mode", { category: c, mode });
  return { ok: true };
});

/** DELETE ?item=<id> removes one entry; without it, removes everything in the category. */
export const DELETE = authRoute<{ category: string }>(async ({ req, user, params }) => {
  const c = cat(params.category);
  const item = req.nextUrl.searchParams.get("item");
  if (item) {
    if (!z.string().uuid().safeParse(item).success) throw new ApiError("not_found", 404);
    await db.delete(vaultItems).where(and(eq(vaultItems.id, item), eq(vaultItems.userId, user.id), eq(vaultItems.category, c)));
  } else {
    await db.delete(vaultItems).where(and(eq(vaultItems.userId, user.id), eq(vaultItems.category, c)));
    // Clearing a category also frees the captured records that were filed into it.
    await db.delete(intercepts).where(and(eq(intercepts.userId, user.id), eq(intercepts.category, c)));
    await recordEvent(user.id, "vault_delete", { cat: c });
  }
  await audit(user.id, "vault_delete", { category: c, single: !!item });
  return { ok: true };
});
