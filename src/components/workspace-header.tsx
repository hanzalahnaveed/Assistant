"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare, ClipboardCheck, LayoutDashboard, LoaderCircle, LogOut, MailPlus, MessageSquareText, Settings2, Sparkles, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const items: { href: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/tasks", label: "My tasks", icon: CheckSquare },
  { href: "/assistant", label: "AI assistant", icon: MessageSquareText },
  { href: "/calendar", label: "Calendar & meetings", icon: CalendarDays },
  { href: "/email", label: "Email outreach", icon: MailPlus },
  { href: "/actions", label: "Action center", icon: ClipboardCheck },
  { href: "/integrations", label: "Connections", icon: Settings2 },
];

type SessionUser = { id: string; email: string; name: string | null; imageUrl: string | null };

export default function WorkspaceHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => { fetch("/api/auth/session", { cache: "no-store" }).then(r => r.json()).then(data => setUser(data.user ?? null)).catch(() => setUser(null)); }, []);
  async function signOut() {
    setSigningOut(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/auth?loggedOut=1"); router.refresh(); }
  }
  return (
    <header className="workspace-header">
      <Link href="/" className="workspace-brand" aria-label="Assistant home">
        <span className="workspace-brand-mark"><Sparkles size={19} strokeWidth={2.2} /></span>
        <span>assistant<span className="workspace-brand-dot">.</span><small>EXECUTIVE WORKSPACE</small></span>
      </Link>
      <nav className="workspace-nav" aria-label="Main navigation">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" || pathname === "/briefing" : pathname === href || pathname.startsWith(href + "/");
          return <Link key={href} href={href} className={active ? "workspace-nav-link active" : "workspace-nav-link"} aria-current={active ? "page" : undefined}>
            <Icon size={16} strokeWidth={1.9} /><span>{label}</span>
          </Link>;
        })}
      </nav>
      <div className="workspace-account"><div className="workspace-header-status"><span className="status-dot" /> Personal workspace</div><div className="workspace-account-divider"/><div className="workspace-account-identity">{user?.imageUrl ? <img src={user.imageUrl} alt="" referrerPolicy="no-referrer"/> : <span className="workspace-account-avatar"><UserRound size={15}/></span>}<span className="workspace-account-copy"><strong>{user?.name || "Your account"}</strong><small>{user?.email || "Signed in"}</small></span></div><button type="button" className="workspace-signout" onClick={() => void signOut()} disabled={signingOut} aria-label="Sign out" title="Sign out">{signingOut ? <LoaderCircle size={15} className="animate-spin"/> : <LogOut size={15}/>}<span>{signingOut ? "Signing out" : "Sign out"}</span></button></div>
    </header>
  );
}
