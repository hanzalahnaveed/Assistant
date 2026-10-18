"use client";

import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
        fetch("/api/auth/session", { cache: "no-store" })
            .then(async response => {
                if (!response.ok) throw new Error("Session check failed");
                return response.json();
            })
            .then(data => {
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
        return _jsx(_Fragment, { children });
    }

    if (sessionState === "authenticated") {
        return _jsxs(_Fragment, {
            children: [
                _jsx(WorkspaceHeader, {}),
                children
            ]
        });
    }

    return _jsxs("main", {
        className: "auth-loading",
        children: [
            _jsx("span", {
                className: "auth-loading-mark",
                children: _jsx(Sparkles, { size: 21 })
            }),
            _jsx(LoaderCircle, { size: 19, className: "animate-spin" }),
            _jsx("p", { children: "Securing your workspace…" })
        ]
    });
}
