"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";

export interface SidebarProject { id: string; code: string; name: string }
export interface SidebarOrg { id: string; name: string }

const PROJECT_NAV: { slug: string; label: string; icon: IconName }[] = [
  { slug: "", label: "Overview", icon: "overview" },
  { slug: "plan", label: "Plan & Gantt", icon: "plan" },
  { slug: "reports", label: "Daily reports", icon: "reports" },
  { slug: "delays", label: "Delay events", icon: "delays" },
  { slug: "analytics", label: "Analytics", icon: "analytics" },
  { slug: "import", label: "Import / export", icon: "import" },
  { slug: "ai", label: "AI delay analysis", icon: "ai" },
  { slug: "progress-report", label: "Progress report", icon: "report" },
  { slug: "settings", label: "Settings & members", icon: "settings" },
];

/**
 * Collapsible navigation. Collapse state is remembered per browser (localStorage, wrapped in try/catch).
 * On phones it becomes a slide-over opened by the top bar's menu button (custom event "sp:menu").
 * UNVERIFIED in a browser.
 */
export function Sidebar({ projects, orgs, canCreate, isAdmin }: { projects: SidebarProject[]; orgs: SidebarOrg[]; canCreate: boolean; isAdmin: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("sp.sidebar") === "collapsed"); } catch { /* default expanded */ }
    const open = () => setMobileOpen((o) => !o);
    window.addEventListener("sp:menu", open);
    return () => window.removeEventListener("sp:menu", open);
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem("sp.sidebar", c ? "expanded" : "collapsed"); } catch { /* ignore */ }
    return !c;
  });

  const m = /^\/projects\/([0-9a-f-]{36})(?:\/([^/?]*))?/.exec(pathname);
  const projectId = m?.[1] ?? null;
  const current = projects.find((p) => p.id === projectId) ?? null;
  const shown = projects.filter((p) => `${p.code} ${p.name}`.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 50);

  const link = (href: string, label: string, icon: IconName, active: boolean) => (
    <Link key={href} href={href} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded px-3 py-2 text-sm no-underline transition-colors ${active ? "bg-accent text-white" : "text-steel-200 hover:bg-steel-700"} ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
      <Icon name={icon} />
      <span className={collapsed ? "lg:sr-only" : ""}>{label}</span>
    </Link>
  );

  return (
    <>
      {mobileOpen && <button type="button" aria-label="Close menu" className="no-print fixed inset-0 z-10 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside id="sidebar" aria-label="Main navigation"
        className={`no-print fixed inset-y-0 left-0 z-20 flex flex-col bg-steel-900 text-steel-100 transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "w-64 lg:w-[68px]" : "w-64"}`}>
        <div className={`flex items-center gap-2 px-3 py-4 ${collapsed ? "lg:justify-center" : "justify-between"}`}>
          <Link href="/dashboard" className="flex items-center gap-2 text-white no-underline">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-accent text-sm font-bold">SP</span>
            <span className={`text-sm font-semibold tracking-wide ${collapsed ? "lg:hidden" : ""}`}>SitePulse</span>
          </Link>
          <button type="button" onClick={toggle} className={`hidden rounded p-1.5 text-steel-300 hover:bg-steel-700 lg:block ${collapsed ? "lg:hidden" : ""}`} aria-label="Collapse sidebar"><Icon name="chevronLeft" size={16} /></button>
        </div>
        {collapsed && <button type="button" onClick={toggle} className="mx-auto mb-2 hidden rounded p-1.5 text-steel-300 hover:bg-steel-700 lg:block" aria-label="Expand sidebar"><Icon name="chevronRight" size={16} /></button>}

        <div className={collapsed ? "lg:hidden" : ""}>
          {orgs.length > 0 && (
            <div className="mx-3 mb-2 text-xs text-steel-400">
              <span className="uppercase tracking-wide">Organization</span>
              {orgs.length === 1 ? <div className="truncate text-sm text-steel-100">{orgs[0].name}</div> : (
                <ul className="mt-1 space-y-0.5">{orgs.map((o) => <li key={o.id}><Link href={`/dashboard?org=${o.id}`} className="block truncate rounded px-2 py-1 text-steel-100 no-underline hover:bg-steel-700">{o.name}</Link></li>)}</ul>
              )}
            </div>
          )}
          <details className="mx-3 mb-3 rounded border border-steel-600 bg-steel-800">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm">
              <span className="block text-[11px] uppercase tracking-wide text-steel-400">Project</span>
              <span className="flex items-center justify-between gap-2"><span className="truncate">{current ? `${current.code} · ${current.name}` : "Switch project"}</span><Icon name="chevronDown" size={14} /></span>
            </summary>
            <div className="border-t border-steel-600 p-2">
              {projects.length > 6 && <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a project" aria-label="Find a project" className="mb-1 w-full rounded border border-steel-600 bg-steel-900 px-2 py-1 text-sm text-white placeholder:text-steel-400" />}
              <ul className="max-h-60 overflow-y-auto">
                {shown.length === 0 && <li className="px-2 py-1.5 text-xs text-steel-400">{projects.length === 0 ? "No projects yet" : "No match"}</li>}
                {shown.map((p) => (
                  <li key={p.id}><Link href={`/projects/${p.id}`} aria-current={p.id === projectId ? "page" : undefined} className={`block truncate rounded px-2 py-1.5 text-sm no-underline hover:bg-steel-700 ${p.id === projectId ? "bg-steel-700 text-white" : "text-steel-100"}`}>{p.code} · {p.name}</Link></li>
                ))}
              </ul>
            </div>
          </details>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4" aria-label="Pages">
          {link("/dashboard", "Dashboard", "dashboard", pathname === "/dashboard")}
          {link("/projects", "All projects", "projects", pathname === "/projects")}
          {canCreate && link("/projects/new", "New project", "plus", pathname === "/projects/new")}
          {isAdmin && link("/organization", "Organization", "org", pathname === "/organization")}
          {projectId && (
            <div className="mt-4 border-t border-steel-700 pt-3">
              <div className={`px-3 pb-1 text-[11px] uppercase tracking-wide text-steel-400 ${collapsed ? "lg:hidden" : ""}`}>{current?.code ?? "Project"}</div>
              {PROJECT_NAV.map((n) => {
                const href = `/projects/${projectId}${n.slug ? `/${n.slug}` : ""}`;
                const active = n.slug === "" ? pathname === href : pathname.startsWith(href);
                return link(href, n.label, n.icon, active);
              })}
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
