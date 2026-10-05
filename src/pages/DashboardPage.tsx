/**
 * Admin Dashboard — full platform overview
 *
 * Loads in parallel:
 *  users, partners, players, payments, leads, deals, tasks, security_reviews, activity_logs
 *
 * Shows:
 *  • Actionable alert strip
 *  • KPI grid (4 sections)
 *  • 3 charts: users by role (pie), partner status (donut), payment pipeline (bar)
 *  • Recent deals table
 *  • Recent payment requests table (who requested, amount, status)
 *  • Recent partners table
 *  • Top partners by NGR + recent activity side-by-side
 *  • Deals funnel + Leads funnel
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users, Globe, Target, DollarSign, TrendingUp, Briefcase,
  CheckSquare, Shield, Activity, RefreshCw, AlertTriangle,
  CheckCircle2, Clock, UserPlus, ArrowRight, Sparkles,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `$${(n / 1_000).toFixed(1)}K`
  : `$${n.toLocaleString()}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (t: string) => (supabase.from(t) as any);

const CHART_COLORS = ["#2563EB","#10B981","#F5B800","#EF4444","#8B5CF6","#F59E0B","#06B6D4","#EC4899"];

const TOOLTIP_STYLE = {
  background: "white", border: "1px solid #E2E8F0",
  borderRadius: "10px", fontSize: "12px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
};

// ── types ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface DashData {
  users:     Row[];
  partners:  Row[];
  players:   Row[];
  payments:  Row[];
  leads:     Row[];
  deals:     Row[];
  tasks:     Row[];
  security:  Row[];
  logs:      Row[];
  recentDeals:    Row[];
  recentPartners: Row[];
  recentPayments: Row[];
}

// ── stat helpers ──────────────────────────────────────────────────────────────

function count(rows: Row[], key: string, val: string) {
  return rows.filter(r => r[key] === val).length;
}
function countIn(rows: Row[], key: string, vals: string[]) {
  return rows.filter(r => vals.includes(r[key])).length;
}
function sumWhere(rows: Row[], keyVal: [string, string | string[]], sumKey: string) {
  const [k, v] = keyVal;
  return rows
    .filter(r => Array.isArray(v) ? v.includes(r[k]) : r[k] === v)
    .reduce((s, r) => s + (r[sumKey] ?? 0), 0);
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, color, to,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string; to?: string;
}) {
  const gradients: Record<string, string> = {
    blue:   "from-blue-500/90 to-blue-600/90",
    green:  "from-emerald-500/90 to-emerald-600/90",
    orange: "from-amber-500/90 to-amber-600/90",
    red:    "from-red-500/90 to-red-600/90",
    purple: "from-purple-500/90 to-purple-600/90",
    teal:   "from-teal-500/90 to-teal-600/90",
  };
  const inner = (
    <div className="group relative bg-white rounded-xl p-5 hover:shadow-lg transition-all duration-200 cursor-pointer border border-gray-100">
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br ${gradients[color] ?? gradients.blue} shadow-sm`}>
          <div className="text-white">{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        {to && (
          <ArrowRight className="h-4 w-4 text-gray-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function AlertBanner({ icon, title, body, to, color }: {
  icon: React.ReactNode; title: string; body: string; to: string; color: string;
}) {
  const styles: Record<string, string> = {
    orange: "border-amber-200 bg-amber-50/50",
    red:    "border-red-200 bg-red-50/50",
    blue:   "border-blue-200 bg-blue-50/50",
  };
  const icon_bg: Record<string, string> = {
    orange: "bg-amber-100 text-amber-600",
    red:    "bg-red-100 text-red-600",
    blue:   "bg-blue-100 text-blue-600",
  };
  return (
    <Link to={to} className={`rounded-xl border p-4 flex items-center gap-3 hover:shadow-sm transition-all duration-200 ${styles[color]}`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${icon_bg[color]}`}>
        <div>{icon}</div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[var(--color-text-heading)] text-sm">{title}</p>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{body}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] mb-3 flex items-center gap-2">
      <span className="w-3 h-0.5 bg-[var(--color-brand-blue)] rounded-full inline-block" />
      {label}
    </p>
  );
}

// Status pill
function Pill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:      "bg-emerald-50 text-emerald-700 border-emerald-200",
    onboarding:  "bg-blue-50 text-blue-700 border-blue-200",
    paused:      "bg-amber-50 text-amber-700 border-amber-200",
    suspended:   "bg-red-50 text-red-700 border-red-200",
    pending:     "bg-amber-50 text-amber-700 border-amber-200",
    reviewed:    "bg-purple-50 text-purple-700 border-purple-200",
    approved:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    paid:        "bg-green-50 text-green-800 border-green-200",
    rejected:    "bg-red-50 text-red-700 border-red-200",
    closed_won:  "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed_lost: "bg-slate-50 text-slate-600 border-slate-200",
    proposal:    "bg-purple-50 text-purple-700 border-purple-200",
    negotiation: "bg-orange-50 text-orange-700 border-orange-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${map[status] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData]       = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      // Fetch all data in parallel with explicit select * to bypass potential RLS issues
      const [
        usersR, partnersR, playersR, paymentsR,
        leadsR, dealsR, tasksR, securityR, logsR,
        recentDealsR, recentPartnersR, recentPaymentsR,
      ] = await Promise.all([
        supabase.from("users").select("*"),
        supabase.from("partners").select("*"),
        supabase.from("players").select("*"),
        supabase.from("payments").select("*"),
        supabase.from("leads").select("*"),
        supabase.from("deals").select("*"),
        supabase.from("tasks").select("*"),
        supabase.from("security_reviews").select("*"),
        supabase.from("activity_logs").select("*")
          .order("created_at", { ascending: false }).limit(8),
        // Recent deals with partner name
        supabase.from("deals").select("id,title,stage,amount,created_at,partner:partners(name)")
          .order("created_at", { ascending: false }).limit(6),
        // Recent partners
        supabase.from("partners").select("id,name,partner_type,status,commission_type,commission_rate,created_at")
          .order("created_at", { ascending: false }).limit(6),
        // Recent payment requests with partner name
        supabase.from("payments").select("id,status,total_amount,period,requested_at,partner:partners(name)")
          .order("requested_at", { ascending: false }).limit(8),
      ]);

      // Detailed error logging with suggestions
      if (usersR.error) {
        console.error("❌ Users query error:", usersR.error);
        console.error("Hint: Check RLS policies on 'users' table for admin role");
      }
      if (partnersR.error) {
        console.error("❌ Partners query error:", partnersR.error);
        console.error("Hint: Check RLS policies on 'partners' table for admin role");
      }
      if (playersR.error) {
        console.error("❌ Players query error:", playersR.error);
        console.error("Hint: Check RLS policies on 'players' table for admin role");
      }
      if (paymentsR.error) {
        console.error("❌ Payments query error:", paymentsR.error);
        console.error("Hint: Check RLS policies on 'payments' table for admin role");
      }
      if (leadsR.error) {
        console.error("❌ Leads query error:", leadsR.error);
        console.error("Hint: Check RLS policies on 'leads' table for admin role");
      }
      if (dealsR.error) {
        console.error("❌ Deals query error:", dealsR.error);
        console.error("Hint: Check RLS policies on 'deals' table for admin role");
      }
      if (tasksR.error) {
        console.error("❌ Tasks query error:", tasksR.error);
        console.error("Hint: Check RLS policies on 'tasks' table for admin role");
      }
      if (securityR.error) {
        console.error("❌ Security reviews query error:", securityR.error);
        console.error("Hint: Check RLS policies on 'security_reviews' table for admin role");
      }

      // Comprehensive data logging
      const actualData = {
        users: usersR.data ?? [],
        partners: partnersR.data ?? [],
        players: playersR.data ?? [],
        payments: paymentsR.data ?? [],
        leads: leadsR.data ?? [],
        deals: dealsR.data ?? [],
        tasks: tasksR.data ?? [],
        security: securityR.data ?? [],
        logs: logsR.data ?? [],
        recentDeals: recentDealsR.data ?? [],
        recentPartners: recentPartnersR.data ?? [],
        recentPayments: recentPaymentsR.data ?? [],
      };

      console.log("📊 Dashboard Data Loaded:", {
        users: actualData.users.length,
        partners: actualData.partners.length,
        players: actualData.players.length,
        payments: actualData.payments.length,
        leads: actualData.leads.length,
        deals: actualData.deals.length,
        tasks: actualData.tasks.length,
        security: actualData.security.length,
      });

      // Show detailed partner info if count is wrong
      if (actualData.partners.length > 0) {
        console.log("✅ Partners loaded successfully:");
        console.log(`   Total: ${actualData.partners.length}`);
        console.log(`   Active: ${actualData.partners.filter((p: any) => p.status === 'active').length}`);
        console.log(`   High-risk: ${actualData.partners.filter((p: any) => p.risk_level === 'high').length}`);
      } else {
        console.warn("⚠️ No partners loaded! Check:");
        console.warn("   1. Database has partner data");
        console.warn("   2. RLS policies allow admin to SELECT from partners table");
        console.warn("   3. Run FIX_ADMIN_DASHBOARD_ACCESS.sql to create bypass function");
      }

      setData(actualData);
    } catch (e) {
      console.error("❌ Dashboard load error:", e);
      console.error("Critical error - dashboard data could not be loaded");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-gray-100 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="premium-card p-5 h-24 bg-gray-50" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="premium-card p-6 h-64 bg-gray-50" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { users, partners, players, payments, leads, deals, tasks, security, logs } = data;

  // ── computed stats ────────────────────────────────────────────────────────

  const byRole: Record<string, number> = {};
  for (const u of users) byRole[u.role] = (byRole[u.role] ?? 0) + 1;

  const ngrMap: Record<string, { name: string; ngr: number; players: number }> = {};
  for (const p of partners) ngrMap[p.id] = { name: p.name, ngr: 0, players: 0 };
  for (const pl of players) {
    if (pl.partner_id && ngrMap[pl.partner_id]) {
      ngrMap[pl.partner_id].ngr += pl.ngr ?? 0;
      ngrMap[pl.partner_id].players++;
    }
  }
  const topPartners = Object.values(ngrMap).sort((a, b) => b.ngr - a.ngr).slice(0, 6);

  // chart data
  const roleChartData = Object.entries(byRole).map(([name, value]) => ({
    name: name.replace(/_/g, " "), value,
  }));

  const partnerStatusData = [
    { name: "Active",    value: count(partners,"status","active"),    fill: "#10B981" },
    { name: "Onboarding",value: count(partners,"status","onboarding"),fill: "#2563EB" },
    { name: "Paused",    value: count(partners,"status","paused"),    fill: "#F5B800" },
    { name: "Suspended", value: count(partners,"status","suspended"), fill: "#EF4444" },
  ].filter(x => x.value > 0);

  const paymentBarData = [
    { name: "Pending",  count: countIn(payments,"status",["pending","reviewed"]), amt: sumWhere(payments,["status",["pending","reviewed"]],"total_amount"), fill: "#F59E0B" },
    { name: "Approved", count: count(payments,"status","approved"),               amt: sumWhere(payments,["status","approved"],"total_amount"),             fill: "#2563EB" },
    { name: "Paid",     count: count(payments,"status","paid"),                   amt: sumWhere(payments,["status","paid"],"total_amount"),                  fill: "#10B981" },
    { name: "Rejected", count: count(payments,"status","rejected"),               amt: 0,                                                                    fill: "#EF4444" },
  ];

  // alerts
  const pendingPayCount = countIn(payments,"status",["pending","reviewed"]);
  const pendingPayAmt   = sumWhere(payments,["status",["pending","reviewed"]],"total_amount");
  const flaggedSec      = count(security,"status","flagged");
  const urgentTasks     = tasks.filter(t => t.priority === "urgent" && t.status !== "done").length;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const emoji = hour < 12 ? "☀️" : hour < 17 ? "👋" : "🌙";

  return (
    <div className="space-y-8">

      {/* ── Refined Hero Header with Date & Time ────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 px-8 py-6 shadow-lg border border-slate-700/50">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40" />
        
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-3">
              <div className="text-3xl">{emoji}</div>
              <div>
                <p className="text-slate-300 text-sm font-medium">{greeting}</p>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {user?.name.split(" ")[0]}'s Platform
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-400">Admin Dashboard</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-xs text-slate-400">
                    {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="text-xs text-slate-400">
                    {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900/50 backdrop-blur-sm border border-slate-600/30 text-slate-200 text-sm font-medium hover:bg-slate-900/70 hover:border-slate-500/50 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="relative">
                <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                <div className="absolute inset-0 w-2 h-2 bg-emerald-400 rounded-full animate-ping"></div>
              </div>
              <span className="text-sm font-semibold text-emerald-400">Live</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Items (Priority Alerts) ────────────────────────────── */}
      {(pendingPayCount > 0 || flaggedSec > 0 || urgentTasks > 0) && (
        <section>
          <SectionLabel label="⚡ Requires Attention" />
          <div className="grid gap-3 sm:grid-cols-3">
            {pendingPayCount > 0 && (
              <AlertBanner color="orange" to="/payments"
                icon={<DollarSign className="h-4 w-4" />}
                title={`${pendingPayCount} payment${pendingPayCount !== 1 ? "s" : ""} pending`}
                body={`${fmt(pendingPayAmt)} awaiting approval`}
              />
            )}
            {flaggedSec > 0 && (
              <AlertBanner color="red" to="/security"
                icon={<Shield className="h-4 w-4" />}
                title={`${flaggedSec} security alert${flaggedSec !== 1 ? "s" : ""}`}
                body="High-risk accounts flagged"
              />
            )}
            {urgentTasks > 0 && (
              <AlertBanner color="blue" to="/tasks"
                icon={<AlertTriangle className="h-4 w-4" />}
                title={`${urgentTasks} urgent task${urgentTasks !== 1 ? "s" : ""}`}
                body="Critical items need action"
              />
            )}
          </div>
        </section>
      )}

      {/* ── Core Platform Metrics (Simplified) ────────────────────────────── */}
      <section>
        <SectionLabel label="📊 Platform Overview" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Revenue & Money Flow */}
          <StatCard to="/payments" color="green" icon={<DollarSign className="h-5 w-5" />}
            label="Total Paid Out"
            value={fmt(sumWhere(payments,["status","paid"],"total_amount"))}
            sub={`${count(payments,"status","paid")} payments completed`}
          />
          
          {/* Pipeline Value */}
          <StatCard to="/deals" color="blue" icon={<TrendingUp className="h-5 w-5" />}
            label="Active Pipeline"
            value={fmt(deals.filter(d=>!["closed_won","closed_lost"].includes(d.stage)).reduce((s,d)=>s+(d.amount??0),0))}
            sub={`${deals.filter(d=>!["closed_won","closed_lost"].includes(d.stage)).length} deals in progress`}
          />
          
          {/* Active Partners */}
          <StatCard to="/partners" color="purple" icon={<Globe className="h-5 w-5" />}
            label="Active Partners"
            value={count(partners,"status","active")}
            sub={`${partners.length} total • ${count(partners,"risk_level","high")} high-risk`}
          />
          
          {/* Total Players with FTD */}
          <StatCard to="/players" color="teal" icon={<Target className="h-5 w-5" />}
            label="Total Players"
            value={players.length}
            sub={`${players.filter(p=>p.ftd_date).length} FTD • ${players.filter(p=>(p.risk_score??0)>=70).length} high-risk`}
          />
        </div>
      </section>

      {/* ── Operations Health (Secondary Metrics) ────────────────────────── */}
      <section>
        <SectionLabel label="🔧 Operations" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Active Users */}
          <StatCard to="/users" color="blue" icon={<Users className="h-5 w-5" />}
            label="Team Members"
            value={count(users,"status","active")}
            sub={`${users.length} total • ${count(users,"status","suspended")} suspended`}
          />
          
          {/* New Leads */}
          <StatCard to="/leads" color="orange" icon={<UserPlus className="h-5 w-5" />}
            label="New Leads"
            value={count(leads,"status","new")}
            sub={`${count(leads,"status","qualified")} qualified • ${count(leads,"status","converted")} converted`}
          />
          
          {/* Open Tasks */}
          <StatCard to="/tasks" color="purple" icon={<CheckSquare className="h-5 w-5" />}
            label="Active Tasks"
            value={countIn(tasks,"status",["todo","in_progress"])}
            sub={`${urgentTasks} urgent priority`}
          />
          
          {/* Security Reviews */}
          <StatCard to="/security" color="red" icon={<Shield className="h-5 w-5" />}
            label="Security Reviews"
            value={count(security,"status","pending")}
            sub={`${flaggedSec} flagged for review`}
          />
        </div>
      </section>

      {/* ── Charts row ──────────────────────────────────────────────────── */}
      <section>
        <SectionLabel label="Analytics" />
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Users by role — donut */}
          <div className="premium-card p-6">
            <h3 className="font-semibold text-[var(--color-text-heading)] mb-1">Users by Role</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Distribution across all roles</p>
            {roleChartData.length === 0
              ? <div className="flex flex-col items-center justify-center h-48 text-[var(--color-text-muted)]"><Users className="h-8 w-8 mb-2 opacity-40"/><p className="text-sm">No users yet</p></div>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={roleChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                      dataKey="value" paddingAngle={3}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {roleChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              )
            }
          </div>

          {/* Partner status — donut */}
          <div className="premium-card p-6">
            <h3 className="font-semibold text-[var(--color-text-heading)] mb-1">Partner Status</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Breakdown by lifecycle stage</p>
            {partnerStatusData.length === 0
              ? <div className="flex flex-col items-center justify-center h-48 text-[var(--color-text-muted)]"><Globe className="h-8 w-8 mb-2 opacity-40"/><p className="text-sm">No partners yet</p></div>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={partnerStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                      dataKey="value" paddingAngle={3}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {partnerStatusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              )
            }
          </div>

          {/* Payment pipeline — bar */}
          <div className="premium-card p-6">
            <h3 className="font-semibold text-[var(--color-text-heading)] mb-1">Payment Pipeline</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Count by status</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={paymentBarData} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, _: string, props: any) =>
                    [`${v} payments (${fmt(props.payload.amt)})`, "Count"]
                  }
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {paymentBarData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── Recent data tables ────────────────────────────────────────────── */}
      <section>
        <SectionLabel label="Recent Activity" />
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Recent payment requests */}
          <div className="premium-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)]">
              <div>
                <h3 className="font-semibold text-[var(--color-text-heading)]">Payment Requests</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Most recent — who requested, amount, status</p>
              </div>
              <Link to="/payments" className="text-xs font-medium text-[var(--color-brand-blue)] hover:underline shrink-0">View all →</Link>
            </div>
            {data.recentPayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[var(--color-text-muted)]">
                <DollarSign className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No payment requests yet</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {data.recentPayments.map(pay => (
                  <div key={pay.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface-subtle)] transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-heading)] truncate">
                        {(pay.partner as any)?.name ?? "Unknown Partner"}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">{pay.period ?? "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--color-text-heading)]">{fmt(pay.total_amount ?? 0)}</p>
                      <Pill status={pay.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent deals */}
          <div className="premium-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)]">
              <div>
                <h3 className="font-semibold text-[var(--color-text-heading)]">Recent Deals</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Latest deals created by the team</p>
              </div>
              <Link to="/deals" className="text-xs font-medium text-[var(--color-brand-blue)] hover:underline shrink-0">View all →</Link>
            </div>
            {data.recentDeals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[var(--color-text-muted)]">
                <TrendingUp className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No deals yet</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {data.recentDeals.map(deal => (
                  <div key={deal.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface-subtle)] transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-heading)] truncate">{deal.title}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {(deal.partner as any)?.name ?? "No partner"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--color-text-heading)]">{fmt(deal.amount ?? 0)}</p>
                      <Pill status={deal.stage} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Recent partners */}
      <section>
        <div className="premium-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)]">
            <div>
              <h3 className="font-semibold text-[var(--color-text-heading)]">Recently Added Partners</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Latest partners onboarded to the platform</p>
            </div>
            <Link to="/partners" className="text-xs font-medium text-[var(--color-brand-blue)] hover:underline shrink-0">View all →</Link>
          </div>
          {data.recentPartners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[var(--color-text-muted)]">
              <Globe className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No partners yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--color-surface-subtle)]">
                    {["Partner","Type","Commission","Status","Joined"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {data.recentPartners.map(p => (
                    <tr key={p.id} className="hover:bg-[var(--color-surface-subtle)] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <Globe className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <p className="font-medium text-[var(--color-text-heading)]">{p.name}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[var(--color-text-secondary)] capitalize">{p.partner_type?.replace(/_/g," ") ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span className="font-medium text-[var(--color-text-heading)]">{p.commission_rate}%</span>
                        <span className="text-xs text-[var(--color-text-muted)] ml-1 uppercase">{p.commission_type}</span>
                      </td>
                      <td className="px-5 py-3"><Pill status={p.status} /></td>
                      <td className="px-5 py-3 text-[var(--color-text-muted)] text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Top partners + recent activity ─────────────────────────────── */}
      <section>
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Top partners by NGR */}
          <div className="premium-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-[var(--color-text-heading)]">Top Partners by NGR</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Highest net gaming revenue</p>
              </div>
              <Link to="/performance" className="text-xs font-medium text-[var(--color-brand-blue)] hover:underline">Performance →</Link>
            </div>
            {topPartners.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)]">
                <Target className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No player data yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topPartners.map((partner, i) => (
                  <div key={partner.name} className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      i === 0 ? "bg-amber-100 text-amber-700" :
                      i === 1 ? "bg-slate-100 text-slate-500" :
                      i === 2 ? "bg-orange-100 text-orange-600" :
                      "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]"
                    }`}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-heading)] truncate">{partner.name}</p>
                      <div className="mt-1 h-1.5 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--color-brand-blue)] rounded-full"
                          style={{ width: `${topPartners[0].ngr > 0 ? (partner.ngr / topPartners[0].ngr) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      <p className="text-sm font-bold text-[var(--color-text-heading)]">{fmt(partner.ngr)}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{partner.players} players</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="premium-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-[var(--color-text-heading)]">Recent Activity</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Latest platform actions</p>
              </div>
              <Link to="/activity-logs" className="text-xs font-medium text-[var(--color-brand-blue)] hover:underline">View all →</Link>
            </div>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)]">
                <Activity className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No activity yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-[var(--color-border-subtle)] last:border-0">
                    <div className="w-7 h-7 rounded-full bg-[var(--color-surface-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                      <Activity className="h-3 w-3 text-[var(--color-text-muted)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-body)] truncate capitalize">
                        {log.action?.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">{log.user_email}</p>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] shrink-0 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Deals + Leads funnels ────────────────────────────────────────── */}
      <section>
        <SectionLabel label="Pipeline" />
        <div className="grid gap-6 lg:grid-cols-2">

          <div className="premium-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-[var(--color-text-heading)]">Deals Pipeline</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Stage breakdown with value</p>
              </div>
              <Link to="/deals" className="text-xs font-medium text-[var(--color-brand-blue)] hover:underline">View all →</Link>
            </div>
            <div className="space-y-3">
              {[
                { label: "Total Deals",  val: deals.length,                                                              color: "bg-slate-400" },
                { label: "In Pipeline",  val: deals.filter(d=>!["closed_won","closed_lost"].includes(d.stage)).length,   color: "bg-blue-500" },
                { label: "Closed Won",   val: deals.filter(d=>d.stage==="closed_won").length,                            color: "bg-emerald-500" },
                { label: "Closed Lost",  val: deals.filter(d=>d.stage==="closed_lost").length,                           color: "bg-red-400" },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-sm text-[var(--color-text-secondary)] w-28 shrink-0">{row.label}</span>
                  <div className="flex-1 h-2 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
                    <div className={`h-full ${row.color} rounded-full transition-all`}
                      style={{ width: deals.length ? `${(row.val / deals.length) * 100}%` : "0%" }} />
                  </div>
                  <span className="text-sm font-bold text-[var(--color-text-heading)] w-6 text-right">{row.val}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)] grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-lg font-bold text-[var(--color-text-heading)]">
                  {fmt(deals.filter(d=>d.stage==="closed_won").reduce((s,d)=>s+(d.amount??0),0))}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">Won Value</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-[var(--color-text-heading)]">
                  {fmt(deals.filter(d=>!["closed_won","closed_lost"].includes(d.stage)).reduce((s,d)=>s+(d.amount??0),0))}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">Pipeline Value</p>
              </div>
            </div>
          </div>

          <div className="premium-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-[var(--color-text-heading)]">Leads Funnel</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Conversion through stages</p>
              </div>
              <Link to="/leads" className="text-xs font-medium text-[var(--color-brand-blue)] hover:underline">View all →</Link>
            </div>
            <div className="space-y-3">
              {[
                { label: "Total",      val: leads.length,                            color: "bg-slate-400" },
                { label: "New",        val: count(leads,"status","new"),             color: "bg-blue-500" },
                { label: "Qualified",  val: count(leads,"status","qualified"),       color: "bg-amber-500" },
                { label: "Converted",  val: count(leads,"status","converted"),       color: "bg-emerald-500" },
                { label: "Lost",       val: count(leads,"status","lost"),            color: "bg-red-400" },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-sm text-[var(--color-text-secondary)] w-28 shrink-0">{row.label}</span>
                  <div className="flex-1 h-2 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
                    <div className={`h-full ${row.color} rounded-full transition-all`}
                      style={{ width: leads.length ? `${(row.val / leads.length) * 100}%` : "0%" }} />
                  </div>
                  <span className="text-sm font-bold text-[var(--color-text-heading)] w-6 text-right">{row.val}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)] text-center">
              <p className="text-2xl font-bold text-[var(--color-text-heading)]">
                {leads.length ? ((count(leads,"status","converted") / leads.length) * 100).toFixed(1) : 0}%
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">Overall conversion rate</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
