import { notFound } from "next/navigation";
import { LegalDoc } from "@/components/LegalDoc";

export default async function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (doc !== "privacy" && doc !== "terms") notFound();
  return <LegalDoc doc={doc} standalone />;
}
