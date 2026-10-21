"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Mail, Settings2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

const items = [
  { href: "/dashboard/schedule", label: "Tasks & calendar", icon: CalendarDays },
  { href: "/dashboard/email", label: "Email", icon: Mail },
  { href: "/dashboard/integrations", label: "Connections", icon: Settings2 },
];

export default function WorkspaceHeader() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null));
  }, []);
  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col gap-7 bg-[#233044] px-4 py-7 text-white max-[760px]:w-[68px] max-[760px]:items-center max-[760px]:px-2" aria-label="Workspace sidebar">
      <Link href="/dashboard/schedule" className="px-2 text-xl font-bold tracking-tight max-[760px]:px-0" aria-label="Assistant home">
        <span className="max-[760px]:hidden">assistant<span className="text-[#FA8500]">.</span></span>
        <span className="hidden max-[760px]:inline">a<span className="text-[#FA8500]">.</span></span>
      </Link>
      <nav className="flex w-full flex-col gap-2" aria-label="Main navigation">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} title={label} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold max-[760px]:justify-center max-[760px]:px-0 ${active ? "bg-[#FA8500] text-white" : "text-white/90 hover:bg-white/10"}`}><Icon size={18} /><span className="max-[760px]:hidden">{label}</span></Link>;
        })}
      </nav>
      <div className="mt-auto flex min-w-0 items-center gap-2 px-2 max-[760px]:px-0">
        {user?.imageUrl ? <img src={user.imageUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15"><UserRound size={15} /></span>}
        <span className="min-w-0 max-[760px]:hidden"><strong className="block max-w-[130px] truncate text-xs">{user?.name || "Your account"}</strong><span className="text-[10px] text-white/60">Workspace</span></span>
      </div>
    </aside>
  );
}
