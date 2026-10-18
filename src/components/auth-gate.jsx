"use client";
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
export default function AuthGate({ children }) {
    const pathname = usePathname();
    const router = useRouter();
    const [checkedPath, setCheckedPath] = useState(null);
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
            if (cancelled)
                return;
            if (!data.user)
                router.replace("/auth");
            else
                setCheckedPath(pathname);
        })
            .catch(() => { if (!cancelled)
            router.replace("/auth"); });
        return () => { cancelled = true; };
    }, [pathname, router]);
    if (pathname === "/auth" || checkedPath === pathname)
        return _jsx(_Fragment, { children: children });
    return _jsxs("main", { className: "auth-loading", children: [_jsx("span", { className: "auth-loading-mark", children: _jsx(Sparkles, { size: 21 }) }), _jsx(LoaderCircle, { size: 19, className: "animate-spin" }), _jsx("p", { children: "Securing your workspace\u2026" })] });
}
