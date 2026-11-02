"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "./icons";

export interface NotificationItem { id: string; href: string; title: string; detail: string }

const SECTION: Record<string, string> = {
  plan: "Plan & Gantt", reports: "Daily reports", delays: "Delay events", analytics: "Analytics", import: "Import / export",
  ai: "AI delay analysis", "progress-report": "Progress report", settings: "Settings & members", new: "New",
};
const TOP: Record<string, string> = { dashboard: "Dashboard", projects: "Projects", organization: "Organization", account: "Account", onboarding: "Get started" };

/** Breadcrumb derived from the URL; project names come from the server-provided list. */
function Crumbs({ projects }: { projects: { id: string; code: string; name: string }[] }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string }[] = [];
  let acc = "";
  parts.forEach((seg, i) => {
    acc += `/${seg}`;
    if (/^[0-9a-f-]{36}$/.test(seg)) {
      const p = projects.find((x) => x.id === seg);
      crumbs.push({ href: acc, label: parts[i - 1] === "reports" ? "Report" : p ? `${p.code}` : "Project" });
    } else crumbs.push({ href: acc, label: (i === 0 ? TOP[seg] : SECTION[seg]) ?? seg.replace(/-/g, " ") });
  });
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-ink-mute sm:flex">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex min-w-0 items-center gap-1">
          {i > 0 && <Icon name="chevronRight" size={14} className="shrink-0" />}
          {i === crumbs.length - 1 ? <span aria-current="page" className="truncate font-medium text-ink">{c.label}</span> : <Link href={c.href} className="truncate text-ink-mute no-underline hover:text-ink">{c.label}</Link>}
        </span>
      ))}
    </nav>
  );
}

/** Closes a <details> dropdown on outside click or Escape. */
function useDismiss(ref: React.RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = (e: Event) => {
      const d = ref.current;
      if (d?.open && (e.type === "keydown" ? (e as KeyboardEvent).key === "Escape" : !d.contains(e.target as Node))) d.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, [ref]);
}

export function Topbar({ projects, notifications, userName, userEmail, signOut }: {
  projects: { id: string; code: string; name: string }[]; notifications: NotificationItem[]; userName: string; userEmail: string; signOut: () => void | Promise<void>;
}) {
  const bell = useRef<HTMLDetailsElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  useDismiss(bell);
  useDismiss(menu);
  const initials = (userName || userEmail || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="no-print sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-steel-200 bg-white/95 px-3 backdrop-blur sm:px-5">
      <button type="button" className="btn btn-ghost !min-h-[40px] !px-2 lg:hidden" aria-label="Open navigation menu" aria-controls="sidebar" onClick={() => window.dispatchEvent(new Event("sp:menu"))}><Icon name="menu" /></button>
      <Crumbs projects={projects} />
      <form action="/projects" method="get" role="search" className="ml-auto hidden w-full max-w-xs md:block">
        <label htmlFor="global-search" className="sr-only">Search projects</label>
        <div className="relative"><Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel-400" />
          <input id="global-search" name="q" type="search" placeholder="Search projects by code, name or location" className="input !min-h-[36px] !py-1.5 !pl-9" /></div>
      </form>
      <Link href="/projects" className="btn btn-ghost !min-h-[40px] !px-2 ml-auto md:hidden" aria-label="Search projects"><Icon name="search" /></Link>

      <details ref={bell} className="relative">
        <summary className="btn btn-ghost !min-h-[40px] !px-2 relative cursor-pointer list-none" aria-label={`Notifications${notifications.length ? `, ${notifications.length} items need attention` : ""}`}>
          <Icon name="bell" />
          {notifications.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">{notifications.length > 9 ? "9+" : notifications.length}</span>}
        </summary>
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-md border border-steel-200 bg-white shadow-lg">
          <div className="border-b border-steel-200 px-4 py-2 text-sm font-semibold">Needs your attention</div>
          {notifications.length === 0 ? <p className="px-4 py-4 text-sm text-ink-mute">Nothing needs attention right now.</p> : (
            <ul className="max-h-80 divide-y divide-steel-100 overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id}><Link href={n.href} className="block px-4 py-2 text-sm no-underline hover:bg-steel-50"><span className="block font-medium text-ink">{n.title}</span><span className="block truncate text-xs text-ink-mute">{n.detail}</span></Link></li>
              ))}
            </ul>
          )}
          <div className="border-t border-steel-200 px-4 py-2 text-xs text-ink-mute">Computed from live data. <Link href="/account/notifications">About notifications</Link></div>
        </div>
      </details>

      <details ref={menu} className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-1.5 py-1 hover:bg-steel-100" aria-label="Account menu">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-steel-800 text-xs font-semibold text-white">{initials}</span>
          <Icon name="chevronDown" size={14} className="hidden sm:block" />
        </summary>
        <div className="absolute right-0 mt-2 w-64 rounded-md border border-steel-200 bg-white py-1 shadow-lg">
          <div className="border-b border-steel-100 px-4 py-2"><div className="truncate text-sm font-medium">{userName}</div><div className="truncate text-xs text-ink-mute">{userEmail}</div></div>
          <Link href="/account" className="flex items-center gap-2 px-4 py-2 text-sm text-ink no-underline hover:bg-steel-50"><Icon name="user" size={16} /> Profile</Link>
          <Link href="/account/security" className="flex items-center gap-2 px-4 py-2 text-sm text-ink no-underline hover:bg-steel-50"><Icon name="lock" size={16} /> Account security</Link>
          <Link href="/account/notifications" className="flex items-center gap-2 px-4 py-2 text-sm text-ink no-underline hover:bg-steel-50"><Icon name="bell" size={16} /> Notifications</Link>
          <form action={signOut} className="border-t border-steel-100"><button type="submit" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-steel-50"><Icon name="logout" size={16} /> Sign out</button></form>
        </div>
      </details>
    </header>
  );
}
