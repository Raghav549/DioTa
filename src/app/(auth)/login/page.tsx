import { LoginForm } from "@/components/LoginForm";
import { googleConfigured } from "@/lib/oauth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sp = await searchParams;
  const googleError = sp.e === "google_exists" ? "err.email_taken" : sp.e === "google" ? "err.generic" : null;
  return <LoginForm google={googleConfigured()} googleError={googleError} />;
}
