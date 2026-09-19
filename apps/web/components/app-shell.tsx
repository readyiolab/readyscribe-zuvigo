"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { AddTeamDialog } from "@/components/add-team-dialog";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  WorkspaceProvider,
  type WorkspaceOption,
  useWorkspaceOptional,
} from "@/components/workspace-provider";
import {
  HomeIcon,
  PanelLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MenuIcon,
  XIcon,
  PlusIcon,
  UserPlusIcon,
  FilePlusIcon,
  ZapIcon,
  SearchIcon,
  BellIcon,
  UserIcon,
  BookmarkIcon,
  BarChart3Icon,
  FolderIcon,
  CheckSquareIcon,
  HelpCircleIcon,
  SettingsIcon,
  LayersIcon,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: "default" | "rec" | "subtle";
  id: string;
};

const TOP_NAV: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: HomeIcon, id: "home" },
  { label: "Created by Me", href: "/dashboard?view=me", icon: UserIcon, id: "me" },
  { label: "Saved", href: "/dashboard?view=saved", icon: BookmarkIcon, id: "saved" },
  { label: "Insights", href: "/dashboard?view=insights", icon: BarChart3Icon, id: "insights" },
  { label: "Settings", href: "/dashboard/settings", icon: SettingsIcon, id: "settings" },
];

const WORKSPACE_NAV: NavItem[] = [
  { label: "All Documents", href: "/dashboard?view=all", icon: FolderIcon, id: "docs" },
  { label: "Scribes", href: "/dashboard?kind=SCRIBE", icon: LayersIcon, id: "scribes" },
  { label: "Tasks", href: "/dashboard?view=tasks", icon: CheckSquareIcon, id: "tasks" },
];

type AppShellProps = {
  email?: string | null;
  children: React.ReactNode;
  initialWorkspaces?: WorkspaceOption[];
  initialActiveWorkspaceId?: string | null;
};

export function AppShell({
  email,
  children,
  initialWorkspaces = [],
  initialActiveWorkspaceId = null,
}: AppShellProps) {
  return (
    <WorkspaceProvider
      initialWorkspaces={initialWorkspaces}
      initialActiveId={initialActiveWorkspaceId}
    >
      <Suspense fallback={<AppShellSkeleton email={email}>{children}</AppShellSkeleton>}>
        <AppShellInner email={email}>{children}</AppShellInner>
      </Suspense>
    </WorkspaceProvider>
  );
}

function AppShellInner({ email, children }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceCtx = useWorkspaceOptional();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const newMenuRef = React.useRef<HTMLDivElement>(null);

  const initial = email ? email.charAt(0).toUpperCase() : "U";
  const activeTeam = workspaceCtx?.active;

  // Close new menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setIsNewMenuOpen(false);
      }
    }
    if (isNewMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isNewMenuOpen]);

  // Persistent collapse state with localStorage
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("readyscribe_sidebar_collapsed");
      if (saved !== null) {
        setIsCollapsed(saved === "true");
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Keyboard shortcut: Ctrl+B or Cmd+B toggles sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIsCollapsed((prev) => {
          const next = !prev;
          try {
            localStorage.setItem("zuvigo_sidebar_collapsed", String(next));
          } catch {}
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname, searchParams]);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("readyscribe_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const viewParam = searchParams.get("view");
  const kindParam = searchParams.get("kind");

  const isItemActive = (id: NavItem["id"]) => {
    switch (id) {
      case "home":
        return pathname === "/dashboard" && !viewParam && !kindParam;
      case "docs":
        return pathname === "/dashboard" && viewParam === "all";
      case "scribes":
        return pathname === "/dashboard" && kindParam === "SCRIBE";
      case "capture":
        return pathname === "/capture";
      case "settings":
        return pathname.startsWith("/dashboard/settings");
      default:
        return false;
    }
  };

  const renderNavLink = (item: NavItem, collapsed: boolean) => {
    const active = isItemActive(item.id);
    const Icon = item.icon;

    if (collapsed) {
      return (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          className={cn(
            "group relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150",
            active
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", active ? "text-primary-foreground" : "")} />
          {item.badge === "REC" && !active && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background animate-pulse" />
          )}
        </Link>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "group flex h-9 items-center justify-between rounded-lg px-2.5 text-[13px] font-medium transition-all duration-150",
          active
            ? "bg-primary/10 font-semibold text-primary border-l-2 border-primary pl-2 shadow-2xs"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
            )}
          />
          <span className="truncate">{item.label}</span>
        </div>

        {item.badge && (
          <span
            className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase",
              item.badgeVariant === "rec"
                ? "bg-destructive/15 text-destructive animate-pulse"
                : "bg-muted text-muted-foreground",
            )}
          >
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-screen h-[100dvh] w-full overflow-hidden bg-canvas text-foreground">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border/70 bg-sidebar/70 backdrop-blur-md md:flex h-full",
          "transition-[width] duration-300 ease-in-out relative z-30",
          isCollapsed ? "w-[68px]" : "w-60 lg:w-64",
        )}
      >
        {/* Sidebar Header (Image 1) */}
        <div className={cn("flex h-14 shrink-0 items-center border-b border-border/60", isCollapsed ? "justify-center px-2" : "justify-between px-4")}>
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 font-heading text-[15px] font-bold tracking-tight text-foreground transition-opacity hover:opacity-90 group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-tr from-sky-500 to-indigo-600 text-white font-bold text-sm shadow-xs group-hover:scale-105 transition-transform">
              R
            </div>
            {!isCollapsed && (
              <span className="font-heading font-bold text-[16px] text-foreground tracking-tight">ReadyScribe</span>
            )}
          </Link>

          {!isCollapsed && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors cursor-pointer"
                title="Notifications"
              >
                <BellIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors cursor-pointer"
                title="Collapse sidebar (Ctrl+B)"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Search Bar (Image 1) */}
        {!isCollapsed && (
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-background px-2.5 py-1.5 text-xs text-muted-foreground focus-within:border-primary/50">
              <SearchIcon className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
              <input
                type="search"
                placeholder="Search"
                className="w-full bg-transparent border-0 p-0 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-hidden"
              />
            </div>
          </div>
        )}

        {/* Navigation Sections — overflow only on scroll area; team menu portals to body */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-2.5 py-2 overflow-y-auto overflow-x-hidden">
          {/* Top Nav: Home, Created by Me, Saved, Insights, Settings */}
          <nav className="flex flex-col gap-0.5">
            {TOP_NAV.map((item) => renderNavLink(item, isCollapsed))}
          </nav>

          {/* Workspace / Team switcher */}
          <div className="pt-2 border-t border-border/50">
            <TeamSwitcher collapsed={isCollapsed} fallbackInitial={initial} />

            <nav className="flex flex-col gap-0.5 mt-0.5">
              {WORKSPACE_NAV.map((item) => renderNavLink(item, isCollapsed))}
            </nav>
          </div>

          {/* Invite Teammates Button */}
          {!isCollapsed && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsInviteDialogOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/80 bg-background px-3 py-2 text-xs font-semibold text-foreground shadow-2xs hover:bg-sidebar-accent transition-all cursor-pointer active:scale-[0.98]"
              >
                <UserPlusIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Invite Teammates</span>
              </button>
            </div>
          )}

          {/* Profile Completion 40% Widget (Image 1) */}
          {!isCollapsed && (
            <div className="mt-1 flex items-center justify-between rounded-xl bg-muted/40 border border-border/40 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="relative flex h-5 w-5 items-center justify-center">
                  <svg className="h-5 w-5 -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-muted/40"
                      strokeWidth="4"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-500"
                      strokeDasharray="40, 100"
                      strokeWidth="4"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">Profile Completion</span>
              </div>
              <span className="text-[11.5px] font-bold text-foreground">40%</span>
            </div>
          )}
        </div>

        {/* Sidebar Footer (Image 1: Help & Support with Avatar) */}
        <div className="shrink-0 border-t border-border/60 p-2.5">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/dashboard/settings"
                title={email || "Account"}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-tr from-sky-400 to-indigo-500 text-white font-bold text-xs hover:opacity-90 transition-opacity"
              >
                {initial}
              </Link>
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors cursor-pointer"
                title="Expand sidebar (Ctrl+B)"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl p-1.5 hover:bg-sidebar-accent transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-linear-to-tr from-sky-400 to-indigo-500 text-xs font-bold text-white shadow-2xs">
                  {initial}
                </div>
                <span className="truncate text-xs font-medium text-muted-foreground">Help & Support</span>
              </div>
              <HelpCircleIcon className="h-4 w-4 text-muted-foreground/70 shrink-0" />
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Drawer (Slideover) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative flex w-64 max-w-[80vw] flex-1 flex-col bg-surface p-4 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-border/60">
              <Link href="/dashboard" className="flex items-center gap-2 font-heading font-bold text-[15px]">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-tr from-sky-500 to-indigo-600 text-white font-bold">
                  R
                </div>
                <span>ReadyScribe</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted cursor-pointer"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto">
              {[...TOP_NAV, ...WORKSPACE_NAV].map((item) => renderNavLink(item, false))}
            </nav>

            <div className="mt-3">
              <TeamSwitcher fallbackInitial={initial} />
            </div>

            <button
              type="button"
              onClick={() => {
                setIsMobileOpen(false);
                setIsInviteDialogOpen(true);
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border/80 bg-background px-3 py-2 text-xs font-semibold text-foreground shadow-2xs hover:bg-muted"
            >
              <UserPlusIcon className="h-3.5 w-3.5" />
              <span>Invite Teammates</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 bg-surface/90 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-2.5">
            {/* Mobile Hamburger Menu */}
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden cursor-pointer"
              title="Open Navigation"
            >
              <MenuIcon className="h-4 w-4" />
            </button>

            {/* Desktop Topbar Collapse Toggle Button */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              title={isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
            >
              <PanelLeftIcon className="h-4 w-4" />
            </button>

            {/* Path indicator */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <HomeIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                {pathname === "/dashboard"
                  ? searchParams?.get("view") === "all"
                    ? "Documents"
                    : searchParams?.get("kind") === "SCRIBE"
                      ? "Scribes"
                      : "Home"
                  : pathname === "/capture"
                    ? "Capture"
                    : pathname.startsWith("/dashboard/settings")
                      ? "Settings"
                      : "Home"}
              </span>
            </div>
          </div>

          {/* Center: Get Scribe Pro glowing badge (Image 1) */}
          <div className="hidden md:flex items-center justify-center">
            <div className="relative group">
              <div className="absolute -inset-1 rounded-full bg-linear-to-r from-sky-400 to-indigo-500 opacity-30 blur-md group-hover:opacity-60 transition duration-300" />
              <button
                type="button"
                className="relative flex items-center gap-1.5 rounded-full border border-sky-200 dark:border-sky-800 bg-white/95 dark:bg-slate-950/95 px-4 py-1 text-xs font-bold text-slate-800 dark:text-sky-300 shadow-xs backdrop-blur-md cursor-pointer hover:scale-105 transition-transform"
              >
                <span>Get Scribe Pro</span>
                <ZapIcon className="h-3 w-3 fill-sky-400 text-sky-400" />
              </button>
            </div>
          </div>

          {/* Right: Avatar, Invite button, + New dropdown, sidebar toggle */}
          <div className="flex items-center gap-2.5">
            {/* User Avatar (Image 1) */}
            <Link
              href="/dashboard/settings"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-tr from-sky-400 to-indigo-500 text-white font-bold text-xs shadow-xs hover:opacity-90 transition-opacity"
              title={email || "Account & Settings"}
            >
              {initial}
            </Link>

            {/* Invite Button -> Opens Add Your Team Modal (Image 1 & 2) */}
            <button
              type="button"
              onClick={() => setIsInviteDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60 transition-colors shadow-2xs cursor-pointer active:scale-[0.98]"
            >
              <UserPlusIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Invite</span>
            </button>

            {/* + New Button with Dropdown (Image 1) */}
            <div className="relative" ref={newMenuRef}>
              <button
                type="button"
                onClick={() => setIsNewMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60 transition-all shadow-2xs cursor-pointer active:scale-[0.98]"
              >
                <PlusIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>New</span>
              </button>

              {isNewMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-border/70 bg-popover/95 p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150 text-left">
                  {/* Option 1: Capture a Scribe */}
                  <div className="p-2">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-foreground/40 text-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-foreground leading-tight">Capture a Scribe</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">Create a step-by-step guide</div>
                      </div>
                    </div>

                    <div className="mt-2.5 ml-6 flex flex-col gap-0.5">
                      <Link
                        href="/capture"
                        onClick={() => setIsNewMenuOpen(false)}
                        className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <span>Browser</span>
                      </Link>

                      <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                        <span>Desktop</span>
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                          Pro <ZapIcon className="h-2.5 w-2.5 fill-current" />
                        </span>
                      </div>

                      <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                        <span>Mobile</span>
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                          Pro <ZapIcon className="h-2.5 w-2.5 fill-current" />
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="my-1 border-t border-border/60" />

                  {/* Option 2: Create a Page */}
                  <div className="p-2 rounded-xl hover:bg-accent/40 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <FilePlusIcon className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <div className="text-[13px] font-semibold text-foreground leading-tight">Create a Page</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">Build a doc with multiple guides</div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400 shrink-0">
                        Pro <ZapIcon className="h-2.5 w-2.5 fill-current" />
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar toggle button (Image 1 rightmost icon) */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              title="Toggle sidebar"
            >
              <PanelLeftIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>

      <AddTeamDialog
        open={isInviteDialogOpen}
        onClose={() => setIsInviteDialogOpen(false)}
        workspaceId={activeTeam?.id}
        workspaceName={activeTeam?.name ?? (email ? `${email.split("@")[0]}'s Team` : "Your Team")}
      />
    </div>
  );
}

function AppShellSkeleton({ email, children }: AppShellProps) {
  return (
    <div className="flex h-screen h-[100dvh] w-full overflow-hidden bg-canvas text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-border/70 bg-sidebar/50 md:flex flex-col h-full">
        <div className="h-14 border-b border-border/60 px-4 flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary/20 animate-pulse" />
          <div className="h-4 w-24 rounded bg-muted animate-pulse" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        <header className="h-14 shrink-0 border-b border-border/70 bg-surface/90 px-4" />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

