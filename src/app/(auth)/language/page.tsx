"use client";
import { useRouter } from "next/navigation";
import { useT } from "@/components/Providers";
import { LanguagePicker } from "@/components/LanguagePicker";
import { Button } from "@/components/ui";

export default function LanguagePage() {
  const t = useT();
  const router = useRouter();
  return (
    <div>
      <h1 className="font-display text-4xl font-semibold tracking-tight">{t("lang.t")}</h1>
      <p className="mb-6 mt-2 text-muted">{t("lang.b")}</p>
      <LanguagePicker persist={false} />
      <Button full className="mt-7" onClick={() => router.push("/signup")}>
        {t("c.continue")}
      </Button>
      <p className="mt-5 text-center text-sm text-muted">
        {t("su.have")}{" "}
        <a href="/login" className="font-semibold text-primary">
          {t("li.btn")}
        </a>
      </p>
    </div>
  );
}
