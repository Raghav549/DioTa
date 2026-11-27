"use client";
import { memo } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { AppLogo } from "@/components/ui";
import { money, rel } from "@/lib/client";

export type Ev = { id: string; type: string; params: Record<string, string>; appSlug?: string | null; createdAt: string };

type T = (k: string, p?: Record<string, string | number>) => string;

/** "Ad-ID, device details and IP address", in the user's language. */
export function dataList(t: T, locale: string, keys: readonly string[]) {
  const items = keys.map((k) => t(`dk.${k}`));
  try {
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

export function eventText(t: T, ev: Pick<Ev, "type" | "params">, locale = "en-IN") {
  const p = { ...ev.params };
  if (p.perm) p.perm = t(`perm.${p.perm}`);
  if (p.cat) p.cat = t(`cat.${p.cat}`);
  if (p.mode) p.mode = t(`m.${p.mode}`);
  if (p.data !== undefined) p.data = dataList(t, locale, p.data ? p.data.split(",") : []);
  if (p.trigger !== undefined) p.trigger = t(`tg.${p.trigger}`);
  return t(`ev.${ev.type}`, p).replace(/\s{2,}/g, " ").replace(/\s+([.,…])/g, "$1");
}

const iconFor = (type: string): IconName =>
  type.startsWith("intercept") ? "block" : type.startsWith("perm") ? "alert" : type.startsWith("vault") || type === "cat_mode" ? "vault" : type.startsWith("payment") || type.startsWith("withdraw") ? "wallet" : type === "login" || type === "password_changed" ? "lock" : type === "export" ? "download" : type.startsWith("app") || type.includes("monitoring") || type.startsWith("use") ? "apps" : "shield";

export const EventList = memo(function EventList({ events }: { events: Ev[] }) {
  const { t, locale } = useApp();
  return (
    <ul className="divide-y divide-line">
      {events.map((e) => (
        <li key={e.id} className="flex items-center gap-3.5 py-3.5">
          {e.appSlug ? (
            <AppLogo slug={e.appSlug} name={e.params.app} size={42} />
          ) : (
            <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
              <Icon name={iconFor(e.type)} size={19} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-snug">{eventText(t, e, locale)}</p>
            <p className="text-xs text-muted">{rel(e.createdAt, locale)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
});

export type Tx = { id: string; type: string; amountPaise: number; status: string; createdAt: string };

export function TxList({ items }: { items: Tx[] }) {
  const { t, locale } = useApp();
  return (
    <ul className="divide-y divide-line">
      {items.map((x) => {
        const out = x.type === "withdrawal";
        return (
          <li key={x.id} className="flex items-center gap-3.5 py-3.5">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${out ? "bg-track/60 text-fg" : "bg-good/15 text-good"}`}>
              <Icon name={out ? "up" : "down"} size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t(`tx.${x.type}`)}</p>
              <p className="text-xs text-muted">
                {rel(x.createdAt, locale)} · {t(`tx.${x.status}`)}
              </p>
            </div>
            <span className={`rounded-xl px-3 py-1.5 text-sm font-bold ${out ? "bg-track/60" : "bg-good/15 text-good"}`}>
              {out ? "−" : "+"}
              {money(x.amountPaise, locale)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
