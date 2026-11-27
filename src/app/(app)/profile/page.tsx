"use client";
import { useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Card, Confirm, Row, Skeleton } from "@/components/ui";
import { api, useApi } from "@/lib/client";

const GROUPS: { id: string; icon: IconName }[][] = [
  [
    { id: "profile", icon: "user" },
    { id: "account", icon: "id" },
    { id: "language", icon: "globe" },
    { id: "theme", icon: "sun" },
  ],
  [
    { id: "security", icon: "lock" },
    { id: "privacy", icon: "shield" },
    { id: "notifications", icon: "bell" },
    { id: "payments", icon: "wallet" },
    { id: "devices", icon: "device" },
  ],
  [
    { id: "help", icon: "help" },
    { id: "support", icon: "mail" },
    { id: "policy", icon: "file" },
    { id: "terms", icon: "file" },
  ],
  [
    { id: "export", icon: "download" },
    { id: "delete", icon: "trash" },
  ],
];

export default function ProfilePage() {
  const { t } = useApp();
  const { data } = useApi<{ user: { name: string; email: string } }>("/api/me");
  const [out, setOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const u = data?.user;
  const initials = (u?.name ?? "").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  async function logout() {
    setBusy(true);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/login");
  }

  return (
    <div className="space-y-4">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{t("s.title")}</h1>
      <Card className="flex items-center gap-4">
        {u ? (
          <>
            <span className="font-display grid h-16 w-16 place-items-center rounded-full btn-primary text-2xl font-semibold">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold">{u.name}</p>
              <p className="truncate text-sm text-muted">{u.email}</p>
            </div>
          </>
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </Card>
      {GROUPS.map((g, i) => (
        <Card key={i} className="!p-2">
          {g.map((r) => (
            <Row key={r.id} icon={r.icon} title={t(`s.${r.id}`)} href={`/profile/${r.id}`} right={<Icon name="chevron" size={18} className="text-muted" />} />
          ))}
        </Card>
      ))}
      <Card className="!p-2">
        <Row icon="logout" title={t("s.logout")} onClick={() => setOut(true)} />
      </Card>
      <Confirm open={out} loading={busy} title={t("s.logout")} body={t("s.logout.q")} confirmLabel={t("s.logout")} onConfirm={logout} onClose={() => setOut(false)} />
    </div>
  );
}
