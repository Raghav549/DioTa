"use client";
import { Icon } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Button, Card, Empty, PageHeader, Skeleton } from "@/components/ui";
import { api, rel, useApi } from "@/lib/client";

type N = { id: string; type: string; params: Record<string, string>; read: boolean; createdAt: string };

export default function Notifications() {
  const { t, locale } = useApp();
  const { data, reload } = useApi<{ unread: number; items: N[] }>("/api/notifications");
  async function readAll() {
    await api("/api/notifications", { method: "POST" }).catch(() => {});
    await reload();
  }
  return (
    <div>
      <PageHeader title={t("nt.title")} back="/home" />
      {!data ? (
        <Skeleton className="h-40" />
      ) : data.items.length === 0 ? (
        <Card><Empty icon="bell" title={t("nt.empty")} /></Card>
      ) : (
        <>
          {data.unread > 0 && <Button variant="soft" className="mb-4" onClick={readAll}><Icon name="check" size={16} />{t("nt.read")}</Button>}
          <div className="space-y-3">
            {data.items.map((n) => {
              const p = { ...n.params };
              if (p.perm) p.perm = t(`perm.${p.perm}`);
              return (
                <div key={n.id} className={`glass flex gap-3.5 p-4 ${n.read ? "opacity-70" : ""}`}>
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${n.type === "alert" ? "bg-warn/15 text-warn" : "bg-primary/12 text-primary"}`}>
                    <Icon name={n.type === "alert" ? "alert" : n.type === "withdraw" ? "wallet" : n.type === "password" ? "lock" : "shield"} size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{t(`nt.${n.type}.t`)}</p>
                    <p className="mt-0.5 text-sm text-muted">{t(`nt.${n.type}.b`, p)}</p>
                    <p className="mt-1.5 text-xs text-muted">{rel(n.createdAt, locale)}</p>
                  </div>
                  {!n.read && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary2" />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
