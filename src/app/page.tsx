import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Splash } from "@/components/Splash";

export default async function Page() {
  if (await getCurrentUser()) redirect("/home");
  return <Splash />;
}
