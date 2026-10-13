"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import { noteNavigation, useSmartBack } from "@/lib/nav";
import { ArrowLeft, Bookmark, Calendar, HomeIcon, SearchIcon, User } from "./Icons";

/** Counts client-side navigations (mounted once in the root layout). */
export function NavTracker() {
  const path = usePathname();
  useEffect(() => {
    noteNavigation();
  }, [path]);
  return null;
}

const TABS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/search", label: "Search", icon: SearchIcon },
  { href: "/plan", label: "Plan", icon: Calendar },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/account", label: "Me", icon: User },
] as const;

/** The bottom tab bar on the main screens. Pages using it add `pb-32`. */
export function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavInner />
    </Suspense>
  );
}

function BottomNavInner() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="safe-b fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/92 px-2 pt-1.5 backdrop-blur-md">
      <ul className="mx-auto grid max-w-[440px] grid-cols-5 items-end">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex justify-center">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`press flex w-16 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium ${active ? "text-ink" : "text-ink-3"}`}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                {t.label}
                <span className={`mt-0.5 h-1 w-1 rounded-full ${active ? "bg-chilli" : "bg-transparent"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Top bar for inner screens: Back (or Home when there's no history) plus an explicit Home button. */
export function TopBar({ title, right, tone = "plain" }: { title?: React.ReactNode; right?: React.ReactNode; tone?: "plain" | "glass" }) {
  const back = useSmartBack();
  const btn = `press grid h-10 w-10 place-items-center rounded-full ${tone === "glass" ? "bg-card/70" : "border border-line-2"}`;
  return (
    <div className="safe-t flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button onClick={back} className={btn} aria-label="Back">
          <ArrowLeft />
        </button>
        <Link href="/" className={btn} aria-label="Home">
          <HomeIcon size={19} />
        </Link>
      </div>
      {title ? <div className="min-w-0 flex-1 truncate text-center">{title}</div> : <span className="flex-1" />}
      <div className="flex min-w-[88px] items-center justify-end gap-2">{right}</div>
    </div>
  );
}
