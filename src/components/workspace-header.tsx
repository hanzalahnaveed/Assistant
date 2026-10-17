"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, LayoutDashboard, MessageSquareText, Settings2, Sparkles } from "lucide-react";

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/tasks", label: "My tasks", icon: CheckSquare },
  { href: "/assistant", label: "AI assistant", icon: MessageSquareText },
  { href: "/integrations", label: "Connections", icon: Settings2 },
] as const;

export default function WorkspaceHeader() {
  const pathname = usePathname();
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
      <div className="workspace-header-status"><span className="status-dot" /> Personal workspace</div>
    </header>
  );
}
