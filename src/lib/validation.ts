import { z } from "zod";
import { passwordOk, passwordRules } from "@/lib/rules";
import { CATEGORIES, MODES, PERMISSIONS, THEMES, LANGS, APPS } from "@/lib/catalog";

export const nameSchema = z.string().trim().min(2).max(80);
export const emailSchema = z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/);
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => /^\+?[0-9]{8,15}$/.test(v));

export { passwordRules, passwordOk };
export const passwordSchema = z.string().max(128).refine(passwordOk);

export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  password: passwordSchema,
  consentTerms: z.literal(true),
  consentPrivacy: z.literal(true),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});

export const recoverSchema = z.object({
  email: emailSchema,
  recoveryKey: z.string().min(10).max(60),
  password: passwordSchema,
});

export const profileSchema = z
  .object({
    name: nameSchema,
    phone: phoneSchema.nullable().or(z.literal("").transform(() => null)),
    language: z.enum(LANGS.map((l) => l.code) as [string, ...string[]]),
    theme: z.enum(THEMES),
    protectionEnabled: z.boolean(),
    monitoringEnabled: z.boolean(),
    notifPrefs: z.object({ alerts: z.boolean(), activity: z.boolean(), rewards: z.boolean(), security: z.boolean() }),
  })
  .partial();

export const changePasswordSchema = z.object({ current: z.string().min(1).max(128), next: passwordSchema });
export const passwordOnlySchema = z.object({ password: z.string().min(1).max(128) });

export const appAddSchema = z.object({ slug: z.enum(APPS.map((a) => a.slug) as [string, ...string[]]) });
export const appPatchSchema = z
  .object({
    monitoring: z.boolean(),
    allowUse: z.boolean(),
    permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
    dataCategories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length),
  })
  .partial();

export const vaultItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(5000),
});
export const vaultModeSchema = z.object({ mode: z.enum(MODES) });

export const upiSchema = z.object({
  kind: z.literal("upi"),
  upi: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,64}@[a-z][a-z0-9]{1,30}$/),
});
export const bankSchema = z.object({
  kind: z.literal("bank"),
  holder: z.string().trim().min(2).max(80),
  account: z.string().trim().regex(/^[0-9]{9,18}$/),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
});
export const methodSchema = z.discriminatedUnion("kind", [upiSchema, bankSchema]);

export const withdrawSchema = z.object({
  methodId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
});

export const supportSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(2000),
});
