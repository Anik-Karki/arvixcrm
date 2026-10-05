import { useState } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import {
  LayoutDashboard, Users, UsersRound, Activity, Settings, LogOut,
  ChevronLeft, ChevronRight, Menu, X, ShieldCheck,
  Globe, Target, Briefcase, TrendingUp, DollarSign,
  Megaphone, LineChart, BarChart3, Shield, CheckSquare,
  FileText, MousePointerClick, KeyRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";

const NAV_GROUPS = [
  {
    group: "Overview",
    items: [
      { label: "Dashboard",      to: "/dashboard",      icon: LayoutDashboard },
    ],
  },
  {
    group: "Admin",
    items: [
      { label: "Users",          to: "/users",          icon: Users },
      { label: "Teams",          to: "/teams",          icon: UsersRound },
      { label: "Roles",          to: "/roles",          icon: KeyRound },
    ],
  },
  {
    group: "Affiliates",
    items: [
      { label: "Partners",       to: "/partners",       icon: Globe },
      { label: "Players",        to: "/players",        icon: Target },
      { label: "Leads",          to: "/leads",          icon: Briefcase },
      { label: "Deals",          to: "/deals",          icon: TrendingUp },
      { label: "Tracking",       to: "/tracking",       icon: MousePointerClick },
    ],
  },
  {
    group: "Marketing",
    items: [
      { label: "Campaigns",      to: "/campaigns",      icon: Megaphone },
    ],
  },
  {
    group: "Payments",
    items: [
      { label: "Payments",       to: "/payments",       icon: DollarSign },
    ],
  },
  {
    group: "Analytics",
    items: [
      { label: "Performance",    to: "/performance",    icon: LineChart },
      { label: "KPIs",           to: "/kpis",           icon: BarChart3 },
      { label: "Reports",        to: "/reports",        icon: FileText },
    ],
  },
  {
    group: "Security",
    items: [
      { label: "Security",       to: "/security",       icon: Shield },
    ],
  },
  {
    group: "Operations",
    items: [
      { label: "Tasks",          to: "/tasks",          icon: CheckSquare },
    ],
  },
  {
    group: "System",
    items: [
      { label: "Activity Logs",  to: "/activity-logs",  icon: Activity },
      { label: "Settings",       to: "/settings",       icon: Settings },
    ],
  },
];

export default function AdminShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={`flex items-center border-b border-[#1e293b] px-5 py-4 ${collapsed && !mobile ? "justify-center px-3" : ""}`}>
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-brand-gold)] to-amber-500 flex items-center justify-center overflow-hidden shrink-0">
          <img src="/favicon.png" alt="Averix" className="w-full h-full object-contain p-1.5" />
        </div>
        {(!collapsed || mobile) && (
          <div className="ml-3">
            <p className="text-sm font-bold text-white leading-tight">Averix Admin</p>
            <p className="text-xs text-[#94A3B8]">Control Panel</p>
          </div>
        )}
        {mobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto text-[#94A3B8] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {NAV_GROUPS.map(({ group, items }) => (
          <div key={group}>
            {(!collapsed || mobile) && (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#475569]">
                {group}
              </p>
            )}
            <ul className="space-y-0.5">
              {items.map(({ label, to, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={() => mobile && setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                       ${isActive
                         ? "bg-[#152B4D] text-white"
                         : "text-[#94A3B8] hover:bg-[#1e293b] hover:text-white"}
                       ${collapsed && !mobile ? "justify-center px-2" : ""}`
                    }
                    title={collapsed && !mobile ? label : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={`h-[17px] w-[17px] shrink-0 ${isActive ? "text-[var(--color-brand-gold)]" : ""}`} />
                        {(!collapsed || mobile) && <span>{label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Collapse toggle — desktop only */}
      {!mobile && (
        <div className="border-t border-[#1e293b] p-3">
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-[#94A3B8] hover:bg-[#1e293b] hover:text-white transition-colors ${collapsed ? "justify-center" : ""}`}
          >
            {collapsed
              ? <ChevronRight className="h-4 w-4" />
              : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>}
          </button>
        </div>
      )}

      {/* User profile */}
      <div className={`border-t border-[#1e293b] p-4 ${collapsed && !mobile ? "p-3" : ""}`}>
        <div className={`flex items-center gap-3 ${collapsed && !mobile ? "justify-center" : ""}`}>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-brand-gold)] to-amber-500 flex items-center justify-center text-[#081A33] font-bold text-sm shrink-0">
            {user.initials}
          </div>
          {(!collapsed || mobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <ShieldCheck className="h-3 w-3 text-[var(--color-brand-gold)]" />
                <p className="text-xs text-[#94A3B8]">Administrator</p>
              </div>
            </div>
          )}
          {(!collapsed || mobile) && (
            <button onClick={handleSignOut} className="text-[#94A3B8] hover:text-red-400 transition-colors" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)]">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:flex-col
          bg-[#0B1730] border-r border-[#1e293b] transition-all duration-300
          ${collapsed ? "lg:w-[72px]" : "lg:w-[260px]"}`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-[#0B1730] border-r border-[#1e293b] lg:hidden">
            <SidebarContent mobile />
          </aside>
        </>
      )}

      {/* Main */}
      <div className={`min-h-screen flex flex-col transition-all duration-300 ${collapsed ? "lg:pl-[72px]" : "lg:pl-[260px]"}`}>
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-[var(--color-border-default)] bg-white/95 backdrop-blur-sm shadow-sm">
          <div className="flex items-center gap-4 px-6 py-3.5">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-[var(--color-text-body)]">
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-[var(--color-text-heading)] leading-tight">{user.name}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">Administrator</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-brand-gold)] to-amber-500 flex items-center justify-center text-[#081A33] font-bold text-sm">
                {user.initials}
              </div>
              <button
                onClick={handleSignOut}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] text-sm text-[var(--color-text-body)] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
