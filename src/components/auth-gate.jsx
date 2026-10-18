"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import WorkspaceHeader from "@/components/workspace-header";
export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessionState, setSessionState] = useState("unknown");
  useEffect(() => {
    if (pathname === "/auth") {
      setSessionState("auth-page");
      return;
    }

    // The workspace stays mounted while navigating between app routes.
    // Verify on initial entry and when returning from the public auth page.
    if (sessionState === "authenticated") return;
    let cancelled = false;
    fetch("/api/auth/session", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session check failed");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.user) {
          setSessionState("unauthenticated");
          router.replace("/auth");
        } else {
          setSessionState("authenticated");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionState("unauthenticated");
          router.replace("/auth");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router, sessionState]);
  if (pathname === "/auth") {
    return <>{children}</>;
  }
  if (sessionState === "authenticated") {
    return (
      <>
        <WorkspaceHeader />
        {children}
      </>
    );
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-[15px] bg-[#f5f7f4] text-xs text-[#6d7b71]">
      <span className="grid h-[47px] w-[47px] place-items-center rounded-[15px] bg-[#7ba05b] text-white">
        <Sparkles size={21} />
      </span>
      <LoaderCircle size={19} className="animate-[spin_0.9s_linear_infinite]" />
      <p className="m-0 text-pretty">Securing your workspace…</p>
    </main>
  );
}
