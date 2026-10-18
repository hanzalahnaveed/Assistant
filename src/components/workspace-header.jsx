"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, CheckSquare, ClipboardCheck, LayoutDashboard, LoaderCircle, LogOut, MailPlus, MessageSquareText, Settings2, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
const items = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/tasks", label: "My tasks", icon: CheckSquare },
    { href: "/assistant", label: "AI assistant", icon: MessageSquareText },
    { href: "/calendar", label: "Calendar & meetings", icon: CalendarDays },
    { href: "/email", label: "Email outreach", icon: MailPlus },
    { href: "/actions", label: "Action center", icon: ClipboardCheck },
    { href: "/integrations", label: "Connections", icon: Settings2 },
];
export default function WorkspaceHeader() {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [signingOut, setSigningOut] = useState(false);
    useEffect(() => { fetch("/api/auth/session", { cache: "no-store" }).then(r => r.json()).then(data => setUser(data.user ?? null)).catch(() => setUser(null)); }, []);
    async function signOut() {
        setSigningOut(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        }
        finally {
            router.replace("/auth?loggedOut=1");
            router.refresh();
        }
    }
    return (_jsxs("aside", { className: "workspace-sidebar", "aria-label": "Workspace sidebar", children: [_jsxs(Link, { href: "/", className: "workspace-brand", "aria-label": "Assistant home", children: [_jsx("span", { className: "workspace-brand-mark", children: _jsx(Sparkles, { size: 19, strokeWidth: 2.2 }) }), _jsxs("span", { children: ["assistant", _jsx("span", { className: "workspace-brand-dot", children: "." })] })] }), _jsx("nav", { className: "workspace-nav", "aria-label": "Main navigation", children: items.map(({ href, label, icon: Icon }) => {
                    const active = href === "/" ? pathname === "/" || pathname === "/briefing" : pathname === href || pathname.startsWith(href + "/");
                    return _jsxs(Link, { href: href, className: active ? "workspace-nav-link active" : "workspace-nav-link", "aria-current": active ? "page" : undefined, "aria-label": label, title: label, children: [_jsx(Icon, { size: 18, strokeWidth: 1.9 }), _jsx("span", { children: label })] }, href);
                }) }), _jsxs("div", { className: "workspace-account", children: [_jsxs("div", { className: "workspace-account-identity", children: [user?.imageUrl ? _jsx("img", { src: user.imageUrl, alt: "", referrerPolicy: "no-referrer" }) : _jsx("span", { className: "workspace-account-avatar", children: _jsx(UserRound, { size: 15 }) }), _jsx("span", { className: "workspace-account-copy", children: _jsx("strong", { children: user?.name || "Your account" }) })] }), _jsxs("button", { type: "button", className: "workspace-signout", onClick: () => void signOut(), disabled: signingOut, "aria-label": "Sign out", title: "Sign out", children: [signingOut ? _jsx(LoaderCircle, { size: 16, className: "animate-spin" }) : _jsx(LogOut, { size: 16 }), _jsx("span", { children: signingOut ? "Signing out" : "Sign out" })] })] })] }));
}
