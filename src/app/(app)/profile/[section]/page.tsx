"use client";
import { useParams } from "next/navigation";
import { useApp } from "@/components/Providers";
import { PageHeader } from "@/components/ui";
import { SECTIONS, SECTION_IDS } from "@/components/Sections";
import { LegalDoc } from "@/components/LegalDoc";

export default function SectionPage() {
  const { section } = useParams<{ section: string }>();
  const { t } = useApp();
  if (!SECTION_IDS.includes(section)) return <PageHeader title={t("err.not_found")} back="/profile" />;
  if (section === "policy" || section === "terms")
    return (
      <>
        <PageHeader title={t(`s.${section}`)} back="/profile" />
        <LegalDoc doc={section === "policy" ? "privacy" : "terms"} />
      </>
    );
  const Body = SECTIONS[section];
  return (
    <div className="space-y-4">
      <PageHeader title={t(`s.${section}`)} back="/profile" />
      <Body />
    </div>
  );
}
