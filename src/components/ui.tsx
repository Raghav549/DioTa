"use client";
import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon, type IconName } from "@/components/Icon";
import { useT } from "@/components/Providers";
import { haptic } from "@/lib/client";
import { appName } from "@/lib/catalog";

/* ---------- Button ---------- */
type BtnProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"> & {
  variant?: "primary" | "soft" | "danger" | "ghost";
  loading?: boolean;
  full?: boolean;
};
export function Button({ variant = "primary", loading, full, children, className = "", disabled, onClick, ...rest }: BtnProps) {
  const v = {
    primary: "btn-primary",
    soft: "bg-surface border border-line text-fg",
    danger: "bg-bad/15 text-bad border border-bad/30",
    ghost: "text-muted hover:text-fg",
  }[variant];
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      disabled={disabled || loading}
      onClick={(e) => {
        haptic();
        onClick?.(e);
      }}
      className={`relative inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${v} ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </motion.button>
  );
}

/* ---------- Card, Pill, Skeleton, Empty ---------- */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass p-5 ${className}`}>{children}</div>;
}

export function Pill({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "primary"; className?: string }) {
  const c = {
    neutral: "bg-track/60 text-muted",
    good: "bg-good/15 text-good",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
    primary: "bg-primary/15 text-primary",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${c} ${className}`}>{children}</span>;
}

export const Skeleton = ({ className = "h-24" }: { className?: string }) => <div className={`skeleton ${className}`} />;

export function Empty({ icon = "shield", title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="mb-1 grid h-14 w-14 place-items-center rounded-full bg-primary/12 text-primary">
        <Icon name={icon} size={26} />
      </div>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ---------- Toggle ---------- */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic(10);
        onChange(!checked);
      }}
      className={`relative h-8 w-14 shrink-0 rounded-full border border-line transition-colors disabled:opacity-50 ${checked ? "btn-primary" : "bg-track"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 32 }}
        className="absolute top-1 h-6 w-6 rounded-full bg-white shadow"
        style={{ left: checked ? 28 : 4 }}
      />
    </button>
  );
}

export function Row({ icon, title, sub, right, onClick, href }: { icon?: IconName; title: string; sub?: string; right?: ReactNode; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      {icon && (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{title}</span>
        {sub && <span className="block text-sm text-muted">{sub}</span>}
      </span>
      {right}
    </>
  );
  const cls = "flex w-full items-center gap-3.5 rounded-3xl p-3.5 transition-colors hover:bg-surface-2";
  if (href)
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}

/* ---------- Field ---------- */
type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: string };
export function Field({ label, error, hint, type = "text", className = "", ...rest }: FieldProps) {
  const id = useId();
  const t = useT();
  const [show, setShow] = useState(false);
  const secret = type === "password";
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={secret && show ? "text" : type}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-e` : undefined}
          className={`input ${secret ? "pr-20" : ""}`}
          {...rest}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs font-semibold text-primary"
          >
            {show ? t("f.hide") : t("f.show")}
          </button>
        )}
      </div>
      {hint && !error && <p className="mt-2 text-xs text-muted">{hint}</p>}
      <AnimatePresence>
        {error && (
          <motion.p id={`${id}-e`} role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-sm font-medium text-bad">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TextArea({ label, error, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string | null }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-muted">
        {label}
      </label>
      <textarea id={id} aria-invalid={!!error} className="input min-h-28 resize-y" {...rest} />
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- Sheet & Confirm ---------- */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 80, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="glass-solid relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[32px] p-6 pb-8 sm:rounded-[32px]"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{title}</h2>
              <button onClick={onClose} aria-label={t("c.close")} className="grid h-9 w-9 place-items-center rounded-full bg-track/60">
                <Icon name="x" size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {body && <p className="mb-5 text-muted">{body}</p>}
      {children}
      <div className="mt-5 flex gap-3">
        <Button variant="soft" full onClick={onClose}>
          {t("c.cancel")}
        </Button>
        <Button variant={danger ? "danger" : "primary"} full loading={loading} onClick={onConfirm}>
          {confirmLabel ?? t("c.confirm")}
        </Button>
      </div>
    </Sheet>
  );
}

/* ---------- App logo (original brand artwork, stored locally) ---------- */
export function AppLogo({ slug, size = 48, className = "" }: { slug: string; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/logos/${slug}.svg`} alt={appName(slug)} width={size} height={size} loading="lazy" className={`shrink-0 rounded-[28%] ${className}`} style={{ width: size, height: size }} />
  );
}

export function PageHeader({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  const t = useT();
  return (
    <div className="mb-5 flex items-center gap-3">
      {back && (
        <a href={back} aria-label={t("c.back")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface border border-line">
          <Icon name="back" size={20} />
        </a>
      )}
      <h1 className="min-w-0 flex-1 text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{title}</h1>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => {
            haptic(6);
            onChange(o.id);
          }}
          className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
            value === o.id ? "btn-primary border-transparent" : "border-line bg-surface text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
