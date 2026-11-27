import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { intercepts, monitoredApps, vaultCategories, vaultItems } from "@/db/schema";
import { APPS, appName, catalogByPkg, isAppSlug, isLang, type Category } from "@/lib/catalog";
import { decrypt, encrypt, hmac } from "@/lib/crypto";
import { localeOf, translate } from "@/i18n";
import { KIND_DATA, categorize, matchTracker, type Kind, type Trigger } from "@/lib/trackers";
import type { InterceptIn } from "@/lib/validation";

/** A blocked attempt as shown to its owner (decrypted). */
export type Intercept = {
  id: string;
  app: string;
  appSlug: string;
  pkg: string;
  domain: string;
  org: string;
  kind: Kind;
  category: Category;
  data: string[];
  trigger: Trigger;
  count: number;
  firstAt: string;
  at: string;
};

type Detail = { app: string; pkg: string; domain: string; org: string; data: string[] };
type Row = typeof intercepts.$inferSelect;

export function decodeIntercept(userId: string, r: Row): Intercept | null {
  try {
    const d = JSON.parse(decrypt(userId, r.detailEnc)) as Detail;
    return {
      id: r.id,
      app: d.app,
      appSlug: r.appSlug,
      pkg: d.pkg,
      domain: d.domain,
      org: d.org,
      kind: r.kind as Kind,
      category: r.category as Category,
      data: d.data,
      trigger: r.trigger as Trigger,
      count: r.count,
      firstAt: r.firstAt.toISOString(),
      at: r.lastAt.toISOString(),
    };
  } catch {
    return null; // unreadable (e.g. the encryption key was rotated away)
  }
}

export async function listIntercepts(userId: string, opts: { app?: string; limit?: number } = {}): Promise<Intercept[]> {
  const where = opts.app ? and(eq(intercepts.userId, userId), eq(intercepts.appSlug, opts.app)) : eq(intercepts.userId, userId);
  const rows = await db.select().from(intercepts).where(where).orderBy(desc(intercepts.lastAt)).limit(opts.limit ?? 50);
  return rows.map((r) => decodeIntercept(userId, r)).filter((x): x is Intercept => !!x);
}

/** Activity-timeline form of an attempt (rendered with the `ev.intercept*` strings). */
export function interceptEvent(i: Intercept) {
  return {
    id: `i-${i.id}`,
    type: i.kind === "app" ? "intercept_app" : "intercept",
    params: { app: i.app, org: i.org, data: i.data.join(","), trigger: i.trigger, n: String(i.count) },
    appSlug: i.appSlug,
    createdAt: i.at,
  };
}

/* ---------- storing a batch from the phone ---------- */

type Meta = { count: number; first: number; last: number; triggers: Record<string, number>; domains: string[] };

const clampTime = (ms: number, now: number) => Math.min(now + 5 * 60_000, Math.max(now - 30 * 24 * 3600_000, ms));

function vaultText(lang: string, app: string, org: string, data: string[], m: Meta) {
  const l = isLang(lang) ? lang : "en";
  const t = (k: string, p?: Record<string, string | number>) => translate(l, k, p);
  const fmt = new Intl.DateTimeFormat(localeOf(l), { dateStyle: "medium", timeStyle: "short" });
  const nf = new Intl.NumberFormat(localeOf(l));
  const when = Object.entries(m.triggers)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${t(`tg.${k}.s`)} (${nf.format(n)})`)
    .join(", ");
  const label = t("vx.label", { app, org });
  const content = [
    t("vx.count", { n: nf.format(m.count) }),
    t("vx.data", { data: data.map((d) => t(`dk.${d}`)).join(", ") }),
    t("vx.when", { list: when }),
    t("vx.where", { list: m.domains.join(", ") }),
    t("vx.range", { first: fmt.format(new Date(m.first)), last: fmt.format(new Date(m.last)) }),
  ].join("\n");
  return { label, content };
}

/**
 * Stores blocked attempts reported by the user's phone: each one is categorised, encrypted and
 * added to the activity log, and filed into the matching vault category as one running item per
 * app + tracker (unless the user turned that vault category off).
 */
export async function storeIntercepts(user: { id: string; language: string }, events: InterceptIn[]) {
  const uid = user.id;
  const now = Date.now();

  // Whole-app blocks are accepted only for apps this user really blocked.
  const appPkgs = [...new Set(events.filter((e) => e.app).map((e) => e.pkg))];
  const blocked = new Set<string>();
  if (appPkgs.length) {
    const rows = await db
      .select({ pkg: monitoredApps.packageName, slug: monitoredApps.slug })
      .from(monitoredApps)
      .where(and(eq(monitoredApps.userId, uid), eq(monitoredApps.blocked, true)));
    for (const r of rows) blocked.add(r.pkg ?? catalogPkg(r.slug));
  }

  const rows: (typeof intercepts.$inferInsert & { dedupeKey: string })[] = [];
  type Part = { group: string; category: Category; app: string; appSlug: string; org: string; data: string[]; count: number; first: number; last: number; trigger: Trigger; domain: string };
  const parts = new Map<string, Part>();

  for (const e of events) {
    const tracker = e.app ? null : matchTracker(e.domain);
    if (!e.app && !tracker) continue; // only known tracker endpoints are recorded
    if (e.app && !blocked.has(e.pkg)) continue;
    const kind: Kind = tracker ? tracker.kind : "app";
    const appSlug = catalogByPkg(e.pkg)?.slug ?? e.pkg;
    if (!isAppSlug(appSlug)) continue;
    const app = appName(appSlug, e.label);
    const org = tracker ? tracker.org : "";
    const category = categorize(e.pkg, kind);
    const data = [...KIND_DATA[kind]];
    const first = clampTime(Math.min(e.first, e.last), now);
    const last = clampTime(Math.max(e.first, e.last), now);
    const domain = e.domain.replace(/\.$/, "").slice(0, 253);

    // The phone retries a batch when it doesn't hear back, so the same report can arrive twice:
    // it's stored (and counted in the vault) once.
    const dedupeKey = hmac("intercept", `${uid}|${e.pkg}|${domain}|${e.trigger}|${e.app ? 1 : 0}|${e.first}|${e.last}|${e.count}`);
    if (parts.has(dedupeKey)) continue;
    rows.push({
      dedupeKey,
      userId: uid,
      appSlug,
      category,
      kind,
      trigger: e.trigger,
      count: e.count,
      firstAt: new Date(first),
      lastAt: new Date(last),
      detailEnc: encrypt(uid, JSON.stringify({ app, pkg: e.pkg, domain, org, data } satisfies Detail)),
    });

    const group = hmac("vault-intercept", `${uid}|${appSlug}|${org || "app"}|${category}`);
    parts.set(dedupeKey, { group, category, app, appSlug, org, data, count: e.count, first, last, trigger: e.trigger, domain });
  }
  if (!rows.length) return { stored: 0, filed: 0 };

  const inserted = await db
    .insert(intercepts)
    .values(rows)
    .onConflictDoNothing({ target: [intercepts.userId, intercepts.dedupeKey] })
    .returning({ k: intercepts.dedupeKey });

  // Vault totals grow only by what is new.
  type Group = { category: Category; app: string; appSlug: string; org: string; data: string[]; meta: Meta };
  const groups = new Map<string, Group>();
  for (const { k } of inserted) {
    const p = k ? parts.get(k) : undefined;
    if (!p) continue;
    const g = groups.get(p.group) ?? { category: p.category, app: p.app, appSlug: p.appSlug, org: p.org, data: p.data, meta: { count: 0, first: p.first, last: p.last, triggers: {}, domains: [] } };
    g.meta.count += p.count;
    g.meta.first = Math.min(g.meta.first, p.first);
    g.meta.last = Math.max(g.meta.last, p.last);
    g.meta.triggers[p.trigger] = (g.meta.triggers[p.trigger] ?? 0) + p.count;
    if (!g.meta.domains.includes(p.domain)) g.meta.domains.push(p.domain);
    groups.set(p.group, g);
  }
  if (!groups.size) return { stored: 0, filed: 0 };

  // File into the vault (skipping categories the user switched off).
  const cats = [...new Set([...groups.values()].map((g) => g.category))];
  const off = new Set(
    (
      await db
        .select({ c: vaultCategories.category })
        .from(vaultCategories)
        .where(and(eq(vaultCategories.userId, uid), inArray(vaultCategories.category, cats), eq(vaultCategories.mode, "disabled")))
    ).map((r) => r.c),
  );
  let filed = 0;
  for (const [key, g] of groups) {
    if (off.has(g.category)) continue;
    await db.transaction(async (tx) => {
      const [cur] = await tx
        .select()
        .from(vaultItems)
        .where(and(eq(vaultItems.userId, uid), eq(vaultItems.sourceKey, key)))
        .for("update")
        .limit(1);
      let meta = g.meta;
      if (cur?.metaEnc) {
        try {
          const old = JSON.parse(decrypt(uid, cur.metaEnc)) as Meta;
          const triggers = { ...old.triggers };
          for (const [k, n] of Object.entries(g.meta.triggers)) triggers[k] = (triggers[k] ?? 0) + n;
          meta = {
            count: old.count + g.meta.count,
            first: Math.min(old.first, g.meta.first),
            last: Math.max(old.last, g.meta.last),
            triggers,
            domains: [...new Set([...old.domains, ...g.meta.domains])].slice(0, 12),
          };
        } catch {
          /* unreadable old totals: start again from this batch */
        }
      }
      const orgName = g.org || translate(isLang(user.language) ? user.language : "en", "vx.internet");
      const { label, content } = vaultText(user.language, g.app, orgName, g.data, meta);
      const values = {
        labelEnc: encrypt(uid, label),
        dataEnc: encrypt(uid, content),
        metaEnc: encrypt(uid, JSON.stringify(meta)),
        size: Buffer.byteLength(label) + Buffer.byteLength(content),
        updatedAt: new Date(),
      };
      if (cur) await tx.update(vaultItems).set(values).where(eq(vaultItems.id, cur.id));
      else await tx.insert(vaultItems).values({ userId: uid, category: g.category, sourceKey: key, ...values }).onConflictDoNothing();
    });
    filed++;
  }
  return { stored: inserted.length, filed };
}

/** Android package of a monitored app (catalog apps store only their slug). */
const catalogPkg = (slug: string) => APPS.find((a) => a.slug === slug)?.pkg ?? slug;

/** Pseudonymous totals per category for the partner API (no content, no app names, no domains). */
export async function interceptTotals(userIds: string[]) {
  if (!userIds.length) return [];
  return db
    .select({ userId: intercepts.userId, category: intercepts.category, kind: intercepts.kind, n: sql<number>`sum(${intercepts.count})::int` })
    .from(intercepts)
    .where(inArray(intercepts.userId, userIds))
    .groupBy(intercepts.userId, intercepts.category, intercepts.kind);
}
