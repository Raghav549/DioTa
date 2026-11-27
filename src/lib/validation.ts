import { z } from "zod";
import { passwordOk, passwordRules } from "@/lib/rules";
import { CATEGORIES, MODES, PERMISSIONS, THEMES, LANGS, PKG_RE, isCatalogSlug } from "@/lib/catalog";

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

export const appAddSchema = z.object({ slug: z.string().max(40).refine(isCatalogSlug) });
export const appPatchSchema = z
  .object({
    monitoring: z.boolean(),
    allowUse: z.boolean(),
    blocked: z.boolean(),
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

/* ---------- Android app: real data from the phone ---------- */
export const pkgSchema = z.string().max(150).regex(PKG_RE);
export const deviceAppSchema = z.object({
  pkg: pkgSchema,
  label: z.string().trim().min(1).max(80),
  /** Android permissions that are actually granted to the app. */
  granted: z.array(z.string().max(120)).max(300),
  /** Mobile + Wi-Fi bytes in the last 30 days (needs usage access). */
  dataBytes: z.number().int().min(0).max(1e15).nullable().optional(),
  /** Last time the app was in the foreground, epoch ms (needs usage access). */
  lastUsed: z.number().int().min(0).max(4102444800000).nullable().optional(),
  blocked: z.boolean().optional(),
  blockedAttempts: z.number().int().min(0).max(1e12).optional(),
  /** Real launcher icon from the phone (PNG data URL), only sent for apps outside the catalog. */
  icon: z.string().max(40_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).optional(),
});
export type DeviceApp = z.infer<typeof deviceAppSchema>;
export const deviceSyncSchema = z.object({
  apps: z.array(deviceAppSchema).max(100),
  /** Packages the user chose to start tracking in this request. */
  track: z.array(pkgSchema).max(100).optional(),
});

export const avatarSchema = z.object({
  dataUrl: z.string().max(400_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
});

/* ---------- Android tracker shield: blocked attempts ---------- */
export const interceptSchema = z.object({
  pkg: pkgSchema,
  label: z.string().trim().min(1).max(80),
  domain: z.string().trim().toLowerCase().max(253),
  trigger: z.enum(["launch", "foreground", "background", "screen_off", "unknown"]),
  /** True when the whole app is blocked by the user (any domain), false for a tracker endpoint. */
  app: z.boolean().optional(),
  count: z.number().int().min(1).max(100_000),
  /** Epoch ms of the first and last attempt in this batch. */
  first: z.number().int().min(0).max(4102444800000),
  last: z.number().int().min(0).max(4102444800000),
  /**
   * DioTa browser only: the fingerprinting API a page tried to read (canvas, webgl, audio, ...).
   * The domain is then the page's host, which needn't be a known tracker.
   */
  fp: z.string().regex(/^[A-Za-z]{2,24}$/).optional(),
  /** DioTa browser only: what a blocked tracker request carried in its URL (kept encrypted). */
  payload: z.string().max(1000).optional(),
});
export type InterceptIn = z.infer<typeof interceptSchema>;
export const interceptBatchSchema = z.object({ events: z.array(interceptSchema).min(1).max(200) });

/** The UPI app's answer to an Upgrade payment, relayed by the Android app. */
export const upiConfirmSchema = z.object({
  ref: z.string().regex(/^DT[0-9A-F]{20}$/),
  status: z.string().trim().toLowerCase().max(20),
  txnId: z.string().trim().max(80).optional().default(""),
  txnRef: z.string().trim().max(80).optional().default(""),
  approvalRef: z.string().trim().max(80).optional().default(""),
  responseCode: z.string().trim().max(80).optional().default(""),
});
