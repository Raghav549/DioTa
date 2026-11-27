import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  googleId: text("google_id").unique(),
  passwordHash: text("password_hash").notNull(),
  recoveryHash: text("recovery_hash"),
  language: text("language").notNull().default("en"),
  theme: text("theme").notNull().default("light"),
  protectionEnabled: boolean("protection_enabled").notNull().default(true),
  monitoringEnabled: boolean("monitoring_enabled").notNull().default(true),
  notifPrefs: jsonb("notif_prefs")
    .$type<{ alerts: boolean; activity: boolean; rewards: boolean; security: boolean }>()
    .notNull()
    .default({ alerts: true, activity: true, rewards: true, security: true }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: ts("locked_until"),
  consentVersion: text("consent_version"),
  /** Set when the user has a profile picture (the image lives in user_avatars). */
  avatarUpdatedAt: ts("avatar_updated_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Profile pictures, kept out of `users` so normal requests don't load the image. */
export const userAvatars = pgTable("user_avatars", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: text("data").notNull(), // base64
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const monitoredApps = pgTable(
  "monitored_apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    monitoring: boolean("monitoring").notNull().default(true),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    dataCategories: jsonb("data_categories").$type<string[]>().notNull().default([]),
    allowUse: boolean("allow_use").notNull().default(false),
    addedAt: ts("added_at").notNull().defaultNow(),
    lastObservedAt: ts("last_observed_at"),
    /** Display name for apps found on the phone that are not in the catalog. */
    name: text("name"),
    /** Android package name when the app was found on the user's phone. */
    packageName: text("package_name"),
    /** "manual" (added by hand) or "device" (synced from the Android app). */
    source: text("source").notNull().default("manual"),
    /** Real mobile + Wi-Fi traffic in the last 30 days, measured on the phone. Null = not measured. */
    dataBytes: bigint("data_bytes", { mode: "number" }),
    lastUsedAt: ts("last_used_at"),
    /** Internet blocked for this app by the on-device firewall. */
    blocked: boolean("blocked").notNull().default(false),
    /** Connection attempts the on-device firewall stopped. */
    blockedAttempts: bigint("blocked_attempts", { mode: "number" }).notNull().default(0),
    /** Small PNG data URL of the app's real icon, taken from the phone (only for non-catalog apps). */
    icon: text("icon"),
  },
  (t) => [uniqueIndex("monitored_user_slug").on(t.userId, t.slug)],
);

export const privacyEvents = pgTable(
  "privacy_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    appSlug: text("app_slug"),
    type: text("type").notNull(),
    params: jsonb("params").$type<Record<string, string>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("events_user_time").on(t.userId, t.createdAt)],
);

export const vaultItems = pgTable(
  "vault_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    labelEnc: text("label_enc").notNull(),
    dataEnc: text("data_enc").notNull(),
    size: integer("size").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("vault_user_cat").on(t.userId, t.category)],
);

export const vaultCategories = pgTable(
  "vault_categories",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    mode: text("mode").notNull().default("private"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] })],
);

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    granted: boolean("granted").notNull(),
    version: text("version").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("consents_user_idx").on(t.userId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text("ip_hash"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_user_time").on(t.userId, t.createdAt)],
);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // reward | withdrawal
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    status: text("status").notNull(), // pending | verified | completed | failed
    methodId: uuid("method_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("tx_user_time").on(t.userId, t.createdAt)],
);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // upi | bank
    display: text("display").notNull(),
    detailEnc: text("detail_enc").notNull(),
    status: text("status").notNull().default("unverified"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("payment_methods_user_idx").on(t.userId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    params: jsonb("params").$type<Record<string, string>>().notNull().default({}),
    read: boolean("read").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notif_user_time").on(t.userId, t.createdAt)],
);

export const supportRequests = pgTable(
  "support_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("support_user_idx").on(t.userId)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    resetAt: ts("reset_at").notNull(),
  },
  (t) => [index("rate_limits_reset_idx").on(t.resetAt)],
);

/** Server-side secrets generated by the app itself (e.g. the fallback encryption key). Never exposed via any API. */
export const appSecrets = pgTable("app_secrets", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
