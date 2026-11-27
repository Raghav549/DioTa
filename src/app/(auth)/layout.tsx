import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthChrome } from "@/components/AuthChrome";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getCurrentUser()) redirect("/home");
  return <AuthChrome>{children}</AuthChrome>;
}
