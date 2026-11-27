"use client";
import { Icon, type IconName } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { AppLogo } from "@/components/ui";
import { money, rel } from "@/lib/client";

export type Ev = { id: string; type: string; params: Record<string, string>; appSlug?: string | null; createdAt: string };

export function eventText(t: (k: string, p?: Record<string, string | number>) => string, ev: Pick<Ev, "type" | "params">) {
  const p = { ...ev.params };
  if (p.perm) p.perm = t(`perm.${p.perm}`);
  if (p.cat) p.cat = t(`cat.${p.cat}`);
  if (p.mode) p.mode = t(`m.${p.mode}`);
  return t(`ev.${ev.type}`, p);
}

const iconFor = (type: string): IconName =>
  type.startsWith("perm") ? "alert" : type.startsWith("vault") || type === "cat_mode" ? "vault" : type.startsWith("payment") || type.startsWith("withdraw") ? "wallet" : type === "login" || type === "password_changed" ? "lock" : type === "export" ? "download" : type.startsWith("app") || type.includes("monitoring") || type.startsWith("use") ? "apps" : "shield";

export function EventList({ events }: { events: Ev[] }) {
  const { t, locale } = useApp();
  return (
    <ul className="divide-y divide-line">
      {events.map((e) => (
        <li key={e.id} className="flex items-center gap-3.5 py-3.5">
          {e.appSlug ? (
            <AppLogo slug={e.appSlug} size={42} />
          ) : (
            <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
              <Icon name={iconFor(e.type)} size={19} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-snug">{eventText(t, e)}</p>
            <p className="text-xs text-muted">{rel(e.createdAt, locale)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export type Tx = { id: string; type: string; amountPaise: number; status: string; createdAt: string };

export function TxList({ items }: { items: Tx[] }) {
  const { t, locale } = useApp();
  return (
    <ul className="divide-y divide-line">
      {items.map((x) => {
        const out = x.type === "withdrawal";
        return (
          <li key={x.id} className="flex items-center gap-3.5 py-3.5">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${out ? "bg-surface-2 text-fg" : "bg-good/15 text-good"}`}>
              <Icon name={out ? "up" : "down"} size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t(`tx.${x.type}`)}</p>
              <p className="text-xs text-muted">
                {rel(x.createdAt, locale)} · {t(`tx.${x.status}`)}
              </p>
            </div>
            <span className={`rounded-xl px-3 py-1.5 text-sm font-bold ${out ? "bg-surface-2" : "bg-good/15 text-good"}`}>
              {out ? "−" : "+"}
              {money(x.amountPaise, locale)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
