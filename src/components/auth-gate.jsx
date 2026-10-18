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
    <main className="auth-loading">
      <span className="auth-loading-mark">
        <Sparkles size={21} />
      </span>
      <LoaderCircle size={19} className="animate-spin" />
      <p>Securing your workspace…</p>
    </main>
  );
}
