"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  MailPlus,
  MessageSquareText,
  Settings2,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
const items = [
  {
    href: "/dashboard/briefing",
    label: "Briefing",
    icon: LayoutDashboard,
  },
  {
    href: "/dashboard",
    label: "AI assistant",
    icon: MessageSquareText,
  },
  {
    href: "/dashboard/schedule",
    label: "Schedule",
    icon: CalendarDays,
  },
  {
    href: "/dashboard/email",
    label: "Email outreach",
    icon: MailPlus,
  },
  {
    href: "/dashboard/actions",
    label: "Action center",
    icon: ClipboardCheck,
  },
  {
    href: "/dashboard/integrations",
    label: "Integrations",
    icon: Settings2,
  },
];

export default function WorkspaceHeader() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch("/api/auth/session", {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null));
  }, []);
  return (
    <aside
      className="flex h-screen w-[20vw] shrink-0 flex-col items-center gap-7 bg-[#233044] px-5 py-10 text-white"
      aria-label="Workspace sidebar"
    >
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-[11px] px-0 text-[19px] font-[760] tracking-[-0.7px] text-white min-[761px]:px-[9px]"
        aria-label="Assistant home"
      >
        {/* <span className="grid h-[38px] w-[38px] place-items-center rounded-[13px] bg-white/18 text-white min-[421px]:h-[42px] min-[421px]:w-[42px] min-[761px]:h-[39px] min-[761px]:w-[39px]">
          <Sparkles size={19} strokeWidth={2.2} />
        </span> */}
        <span className="hidden min-[761px]:block">
          assistant<span className="text-[#FA8500]">.</span>
        </span>
      </Link>
      <nav
        className="font-roboto flex w-full flex-col items-center gap-2 min-[761px]:items-stretch min-[761px]:gap-[5px]"
        aria-label="Main navigation"
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href + "/"));
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[44px] w-[42px] items-center justify-center gap-3 rounded-[11px] p-0 text-[13px] font-semibold min-[421px]:min-h-12 min-[421px]:w-12 min-[761px]:min-h-[44px] min-[761px]:w-auto min-[761px]:justify-start min-[761px]:px-3 min-[761px]:py-2.5 ${active ? "bg-[#FA8500] text-white shadow-sm" : "text-white/90 hover:bg-[#FA8500] hover:text-white"}`}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              title={label}
            >
              <Icon size={18} strokeWidth={1.9} />
              <span className="hidden min-[761px]:inline">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex min-w-0 flex-col items-center gap-2.5 min-[761px]:flex-row">
        <div className="hidden min-w-0 items-center gap-2 min-[761px]:flex">
          {user?.imageUrl ? (
            <img
              src={user.imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-8 w-8 shrink-0 rounded-full bg-white/18 object-cover"
            />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/18 text-white">
              <UserRound size={15} />
            </span>
          )}
          <span className="flex min-w-0 flex-col gap-[3px]">
            <strong className="max-w-[125px] truncate text-[11px] font-bold text-white">
              {user?.name || "Your account"}
            </strong>
          </span>
        </div>
      </div>
    </aside>
  );
}
