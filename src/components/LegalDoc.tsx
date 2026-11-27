"use client";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/Providers";

export function LegalDoc({ doc, standalone = false }: { doc: "privacy" | "terms"; standalone?: boolean }) {
  const t = useT();
  const router = useRouter();
  const keys = doc === "privacy" ? ["lg.p1", "lg.p2", "lg.p3"] : ["lg.t1", "lg.t2", "lg.t3"];
  return (
    <div className={standalone ? "mx-auto max-w-2xl px-5 py-8" : ""}>
      {standalone && (
        <button onClick={() => router.back()} aria-label={t("c.back")} className="mb-6 grid h-11 w-11 place-items-center rounded-full border border-line bg-surface">
          <Icon name="back" size={20} />
        </button>
      )}
      <h1 className="mb-5 text-2xl font-bold tracking-tight">{t(doc === "privacy" ? "s.policy" : "s.terms")}</h1>
      <div className="glass space-y-5 p-6 text-[16px] leading-relaxed">
        {keys.map((k, i) => (
          <p key={k}>
            <span className="mr-2 font-bold text-primary">{i + 1}.</span>
            {t(k)}
          </p>
        ))}
      </div>
    </div>
  );
}
