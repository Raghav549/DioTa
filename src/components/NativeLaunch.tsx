"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Android app launch, signed out: the intro the first time on this phone, then sign-in. */
export function NativeLaunch() {
  const router = useRouter();
  useEffect(() => {
    router.replace(localStorage.getItem("dt_intro") ? "/login" : "/welcome");
  }, [router]);
  return <main className="min-h-dvh" aria-busy="true" />;
}
