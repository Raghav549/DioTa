import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sp = await searchParams;
  const google = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  return <LoginForm google={google} googleError={sp.e === "google"} />;
}
