"use client";
import { useRef, useState } from "react";
import { Avatar, imageFileToDataUrl } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Button, Card, Confirm, Row, Sheet, Skeleton } from "@/components/ui";
import { api, useApi, clearApiCache } from "@/lib/client";

const GROUPS: { id: string; icon: IconName }[][] = [
  [
    { id: "upgrade", icon: "up" },
    { id: "profile", icon: "user" },
    { id: "account", icon: "id" },
    { id: "language", icon: "globe" },
    { id: "theme", icon: "sun" },
  ],
  [
    { id: "security", icon: "lock" },
    { id: "privacy", icon: "shield" },
    { id: "notifications", icon: "bell" },
    { id: "device", icon: "device" },
    { id: "payments", icon: "wallet" },
    { id: "devices", icon: "device" },
  ],
  [
    { id: "inbox", icon: "bell" },
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

const HREF: Record<string, string> = { inbox: "/notifications", device: "/device" };

export default function ProfilePage() {
  const { t, toast, errText } = useApp();
  const { data, reload } = useApi<{ user: { name: string; email: string; avatar: string | null } }>("/api/me");
  const { data: inbox } = useApi<{ unread: number }>("/api/notifications");
  const [out, setOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const u = data?.user;
  const unread = inbox?.unread ?? 0;

  async function logout() {
    setBusy(true);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearApiCache();
    window.location.assign("/login");
  }

  async function changed(msg: string) {
    await reload();
    window.dispatchEvent(new Event("dt:me-changed"));
    setPhotoSheet(false);
    toast(msg);
  }

  async function onFile(f: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setPhotoBusy(true);
    try {
      let dataUrl: string;
      try {
        dataUrl = await imageFileToDataUrl(f);
      } catch {
        throw new Error(t("pf.photo.err"));
      }
      await api("/api/me/avatar", { method: "PUT", body: { dataUrl } });
      await changed(t("pf.photo.saved"));
    } catch (e) {
      toast(e instanceof Error && e.message === t("pf.photo.err") ? e.message : errText(e), "err");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      await api("/api/me/avatar", { method: "DELETE" });
      await changed(t("pf.photo.removed"));
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{t("s.title")}</h1>
      <Card className="flex items-center gap-4">
        {u ? (
          <>
            <button onClick={() => setPhotoSheet(true)} aria-label={u.avatar ? t("pf.photo.change") : t("pf.photo.add")} className="relative shrink-0 rounded-full transition-transform active:scale-95">
              <Avatar user={u} size={72} />
              <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--bg)] bg-[#0d0d0f] text-white">
                <Icon name={u.avatar ? "edit" : "plus"} size={14} stroke={2.5} />
              </span>
            </button>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold">{u.name}</p>
              <p className="truncate text-sm text-muted">{u.email}</p>
              <button onClick={() => setPhotoSheet(true)} className="mt-1 text-sm font-semibold underline underline-offset-4">
                {u.avatar ? t("pf.photo.change") : t("pf.photo.add")}
              </button>
            </div>
          </>
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </Card>
      {GROUPS.map((g, i) => (
        <Card key={i} className="!p-2">
          {g.map((r) => (
            <Row
              key={r.id}
              icon={r.icon}
              title={t(`s.${r.id}`)}
              href={HREF[r.id] ?? `/profile/${r.id}`}
              right={
                <span className="flex items-center gap-2">
                  {r.id === "inbox" && unread > 0 && <span className="min-w-6 rounded-full bg-[#0d0d0f] px-2 py-0.5 text-center text-xs font-bold text-white dark:bg-white dark:text-black">{unread > 99 ? "99+" : unread}</span>}
                  <Icon name="chevron" size={18} className="text-muted" />
                </span>
              }
            />
          ))}
        </Card>
      ))}
      <Card className="!p-2">
        <Row icon="logout" title={t("s.logout")} onClick={() => setOut(true)} />
      </Card>
      <Confirm open={out} loading={busy} title={t("s.logout")} body={t("s.logout.q")} confirmLabel={t("s.logout")} onConfirm={logout} onClose={() => setOut(false)} />

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <Sheet open={photoSheet} onClose={() => !photoBusy && setPhotoSheet(false)} title={u?.avatar ? t("pf.photo.change") : t("pf.photo.add")}>
        <div className="mb-6 flex justify-center">
          <Avatar user={u} size={120} />
        </div>
        <div className="space-y-3">
          <Button full loading={photoBusy} onClick={() => fileRef.current?.click()}>
            <Icon name={u?.avatar ? "edit" : "plus"} size={18} />
            {u?.avatar ? t("pf.photo.change") : t("pf.photo.add")}
          </Button>
          {u?.avatar && (
            <Button full variant="danger" disabled={photoBusy} onClick={removePhoto}>
              <Icon name="trash" size={18} />
              {t("pf.photo.remove")}
            </Button>
          )}
        </div>
      </Sheet>
    </div>
  );
}
