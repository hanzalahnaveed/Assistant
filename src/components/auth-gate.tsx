"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkedPath, setCheckedPath] = useState<string | null>(null);

  useEffect(() => {
    if (pathname === "/auth") {
      setCheckedPath(pathname);
      return;
    }
    let cancelled = false;
    setCheckedPath(null);
    fetch("/api/auth/session", { cache: "no-store" })
      .then(response => response.json())
      .then(data => {
        if (cancelled) return;
        if (!data.user) router.replace("/auth");
        else setCheckedPath(pathname);
      })
      .catch(() => { if (!cancelled) router.replace("/auth"); });
    return () => { cancelled = true; };
  }, [pathname, router]);

  if (pathname === "/auth" || checkedPath === pathname) return <>{children}</>;
  return <main className="auth-loading"><span className="auth-loading-mark"><Sparkles size={21}/></span><LoaderCircle size={19} className="animate-spin"/><p>Securing your workspace…</p></main>;
}
