"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MailPlus,
  MessageSquareText,
  Settings2,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
const items = [
  {
    href: "/",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    href: "/tasks",
    label: "My tasks",
    icon: CheckSquare,
  },
  {
    href: "/assistant",
    label: "AI assistant",
    icon: MessageSquareText,
  },
  {
    href: "/calendar",
    label: "Calendar & meetings",
    icon: CalendarDays,
  },
  {
    href: "/email",
    label: "Email outreach",
    icon: MailPlus,
  },
  {
    href: "/actions",
    label: "Action center",
    icon: ClipboardCheck,
  },
  {
    href: "/integrations",
    label: "Connections",
    icon: Settings2,
  },
];
export default function WorkspaceHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    fetch("/api/auth/session", {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null));
  }, []);
  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/auth?loggedOut=1");
      router.refresh();
    }
  }
  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex w-[58px] flex-col items-center gap-7 bg-[#7ba05b] px-[5px] pt-[18px] pb-3 text-white min-[421px]:w-[72px] min-[421px]:px-2 min-[761px]:w-[252px] min-[761px]:items-stretch min-[761px]:gap-[34px] min-[761px]:px-4 min-[761px]:pt-[27px] min-[761px]:pb-[18px]"
      aria-label="Workspace sidebar"
    >
      <Link
        href="/"
        className="inline-flex items-center gap-[11px] px-0 text-[19px] font-[760] tracking-[-0.7px] text-white min-[761px]:px-[9px]"
        aria-label="Assistant home"
      >
        <span className="grid h-[38px] w-[38px] place-items-center rounded-[13px] bg-white/18 text-white min-[421px]:h-[42px] min-[421px]:w-[42px] min-[761px]:h-[39px] min-[761px]:w-[39px]">
          <Sparkles size={19} strokeWidth={2.2} />
        </span>
        <span className="hidden min-[761px]:block">
          assistant<span className="text-[#dce9d1]">.</span>
        </span>
      </Link>
      <nav
        className="flex w-full flex-col items-center gap-2 min-[761px]:items-stretch min-[761px]:gap-[5px]"
        aria-label="Main navigation"
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/" || pathname === "/briefing"
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[44px] w-[42px] items-center justify-center gap-3 rounded-[11px] p-0 text-[13px] font-semibold min-[421px]:min-h-12 min-[421px]:w-12 min-[761px]:min-h-[44px] min-[761px]:w-auto min-[761px]:justify-start min-[761px]:px-3 min-[761px]:py-2.5 ${active ? "bg-white text-[#5d7d43]" : "text-white/86 hover:bg-white/12 hover:text-white"}`}
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
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-white/28 bg-transparent p-[9px] text-[11px]! font-semibold! whitespace-nowrap text-white enabled:hover:border-white/55 enabled:hover:bg-white/12 disabled:opacity-65 min-[761px]:p-2.5"
          onClick={() => void signOut()}
          disabled={signingOut}
          aria-label="Sign out"
          title="Sign out"
        >
          {signingOut ? (
            <LoaderCircle size={16} className="animate-[spin_0.9s_linear_infinite]" />
          ) : (
            <LogOut size={16} />
          )}
          <span className="hidden min-[761px]:inline">
            {signingOut ? "Signing out" : "Sign out"}
          </span>
        </button>
      </div>
    </aside>
  );
}
