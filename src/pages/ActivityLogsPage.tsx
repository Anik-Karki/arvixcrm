/**
 * Admin Activity Logs — comprehensive audit trail
 *
 * Shows every action in the system:
 *   • Login / logout (with user name + role)
 *   • Create / update / delete on partners, deals, leads, campaigns, users
 *   • Payment requests (with amount + requester name)
 *   • Payment approvals (with approver name + role + amount)
 *
 * DB triggers (020 + 021) auto-log create/update/delete on all core tables.
 * Auth contexts log login/logout.
 * Payment RPCs (007/017) log create_payment_request + mark_payment_paid.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Activity, RefreshCw, Search, LogIn, LogOut, Plus, Edit, Trash2,
  DollarSign, UserPlus, FileText, Filter, X, Download,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Pagination } from "@/components/Pagination";
import { downloadCSV } from "@/lib/csv-export";

// ── Types ───────────────────────────────────────────────────────────────────

interface LogRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

// ── Action categorization ───────────────────────────────────────────────────

type ActionCategory =
  | "all" | "auth" | "create" | "update" | "delete" | "payment";

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  all:     "All",
  auth:    "Login / Logout",
  create:  "Created",
  update:  "Updated",
  delete:  "Deleted",
  payment: "Payments",
};

function categorize(action: string): ActionCategory {
  if (action === "user_login" || action === "user_logout") return "auth";
  if (action.startsWith("create_"))                       return "create";
  if (action.startsWith("update_"))                        return "update";
  if (action.startsWith("delete_"))                        return "delete";
  if (action.includes("payment") || action.includes("paid")) return "payment";
  return "create";
}

// ── Icon + colour per action ────────────────────────────────────────────────

function actionIcon(action: string) {
  if (action === "user_login")  return { Icon: LogIn,    color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  if (action === "user_logout") return { Icon: LogOut,   color: "text-slate-600 bg-slate-50 border-slate-200" };
  if (action.startsWith("create_")) return { Icon: Plus, color: "text-blue-600 bg-blue-50 border-blue-200" };
  if (action.startsWith("update_")) return { Icon: Edit, color: "text-amber-600 bg-amber-50 border-amber-200" };
  if (action.startsWith("delete_")) return { Icon: Trash2, color: "text-red-600 bg-red-50 border-red-200" };
  if (action.includes("payment") || action.includes("paid"))
    return { Icon: DollarSign, color: "text-purple-600 bg-purple-50 border-purple-200" };
  return { Icon: Activity, color: "text-slate-600 bg-slate-50 border-slate-200" };
}

// ── Role colour ─────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  admin:              "bg-red-50 text-red-700 border-red-200",
  finance:            "bg-emerald-50 text-emerald-700 border-emerald-200",
  affiliate_manager: "bg-purple-50 text-purple-700 border-purple-200",
  team_leader:        "bg-blue-50 text-blue-700 border-blue-200",
  security:           "bg-orange-50 text-orange-700 border-orange-200",
};

// ── Format helpers ──────────────────────────────────────────────────────────

const fmtTime = (s: string) =>
  new Date(s).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

const fmtAction = (action: string) =>
  action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const fmtMoney = (n: unknown) => {
  const num = typeof n === "number" ? n : parseFloat(String(n ?? "0"));
  if (isNaN(num)) return "";
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ── Extract a human-readable detail line from new_value ────────────────────

function extractDetail(log: LogRow): string {
  const nv = log.new_value ?? {};
  const pv = log.previous_value ?? {};
  const action = log.action;

  // Login / logout
  if (action === "user_login")
    return `Signed in as ${(nv as Record<string, unknown>).username ?? "—"}`;
  if (action === "user_logout")
    return "Signed out";

  // Payment events
  if (action === "create_payment_request") {
    const total = (nv as Record<string, unknown>).total_amount ?? (nv as Record<string, unknown>).invoice_number;
    const inv = (nv as Record<string, unknown>).invoice_number;
    return `${inv ? inv + " · " : ""}Requested ${fmtMoney(total)}`;
  }
  if (action === "mark_payment_paid") {
    const txid = (nv as Record<string, unknown>).txid;
    const inv = (nv as Record<string, unknown>).invoice_number;
    return `${inv ? inv + " · " : ""}Paid via ${txid ?? "—"}`;
  }

  // User creation
  if (action === "create_user") {
    const username = (nv as Record<string, unknown>).username;
    const role = (nv as Record<string, unknown>).role;
    return `Created user @${username} (${role})`;
  }

  // Partner / deal / lead / campaign create
  if (action.startsWith("create_")) {
    const parts: string[] = [];
    if ((nv as Record<string, unknown>).commission_type || (nv as Record<string, unknown>).commission_model)
      parts.push(`${(nv as Record<string, unknown>).commission_type ?? (nv as Record<string, unknown>).commission_model}`);
    if ((nv as Record<string, unknown>).cpa_amount)
      parts.push(`CPA ${fmtMoney((nv as Record<string, unknown>).cpa_amount)}`);
    if ((nv as Record<string, unknown>).revshare_percentage)
      parts.push(`RS ${(nv as Record<string, unknown>).revshare_percentage}%`);
    if ((nv as Record<string, unknown>).status)
      parts.push(`status: ${(nv as Record<string, unknown>).status}`);
    return parts.join(" · ") || "Created";
  }

  // Update — show what changed
  if (action.startsWith("update_")) {
    const changes: string[] = [];
    for (const key of Object.keys(nv)) {
      const newVal = (nv as Record<string, unknown>)[key];
      const oldVal = (pv as Record<string, unknown>)[key];
      if (newVal !== oldVal && key !== "updated_at" && key !== "updated_by") {
        const display = key === "cpa_amount" || key === "amount" || key === "total_amount"
          ? fmtMoney(newVal)
          : String(newVal ?? "—");
        changes.push(`${key}: ${display}`);
      }
    }
    return changes.slice(0, 3).join(" · ") + (changes.length > 3 ? ` +${changes.length - 3} more` : "");
  }

  // Delete
  if (action.startsWith("delete_")) {
    return `Deleted ${log.entity_name ?? "record"}`;
  }

  // Fallback
  if (log.entity_name) return log.entity_name;
  if (log.entity_id)   return log.entity_id;
  return "—";
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ActivityLogsPage() {
  const [logs,    setLogs]    = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [category, setCategory] = useState<ActionCategory>("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("activity_logs") as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLogs(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── CSV export ────────────────────────────────────────────────────────────
  const handleExport = () => {
    downloadCSV("activity-logs.csv", filtered, [
      { header: "Time",        accessor: (l) => new Date(l.created_at).toLocaleString() },
      { header: "User Email",  accessor: (l) => l.user_email ?? "" },
      { header: "User Role",   accessor: (l) => l.user_role ?? "" },
      { header: "Action",     accessor: (l) => l.action },
      { header: "Entity Type", accessor: (l) => l.entity_type ?? "" },
      { header: "Entity Name", accessor: (l) => l.entity_name ?? "" },
      { header: "Entity ID",   accessor: (l) => l.entity_id ?? "" },
    ]);
  };

  // ── Filtered ─────────────────────────────────────────────────────────────

  const filtered = logs.filter(l => {
    const cat = categorize(l.action);
    const matchCat = category === "all" || cat === category;
    if (!matchCat) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      l.user_email?.toLowerCase().includes(q) ||
      l.action?.toLowerCase().includes(q) ||
      l.entity_type?.toLowerCase().includes(q) ||
      l.entity_name?.toLowerCase().includes(q)
    );
  });

  // ── Category counts for filter pills ─────────────────────────────────────

  const catCounts: Record<ActionCategory, number> = {
    all:     logs.length,
    auth:    logs.filter(l => categorize(l.action) === "auth").length,
    create:  logs.filter(l => categorize(l.action) === "create").length,
    update:  logs.filter(l => categorize(l.action) === "update").length,
    delete:  logs.filter(l => categorize(l.action) === "delete").length,
    payment: logs.filter(l => categorize(l.action) === "payment").length,
  };

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Activity Logs</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {filtered.length} of {logs.length} events — full audit trail
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button onClick={fetchLogs} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm font-medium hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CATEGORY_LABELS) as ActionCategory[]).map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              category === cat
                ? "bg-[var(--color-brand-blue)] text-white border-[var(--color-brand-blue)]"
                : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border-default)] hover:border-[var(--color-brand-blue)]"
            }`}>
            {CATEGORY_LABELS[cat]} ({catCounts[cat]})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="premium-card p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
          <input type="text" placeholder="Search by user, action, entity name…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="field focus:field-focus pl-9" />
        </div>
      </div>

      {/* Table */}
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                {["Time", "User", "Role", "Action", "Entity", "Details"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-[var(--color-text-secondary)] text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-16 text-center">
                  <Activity className="h-8 w-8 text-[var(--color-text-muted)] mx-auto mb-2" />
                  <p className="text-[var(--color-text-muted)]">No activity logs found</p>
                </td></tr>
              ) : filtered.slice((page - 1) * pageSize, page * pageSize).map(log => {
                const { Icon, color } = actionIcon(log.action);
                const role = log.user_role ?? "";
                return (
                  <tr key={log.id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]">
                    {/* Time */}
                    <td className="px-4 py-3 text-[var(--color-text-muted)] whitespace-nowrap text-xs">
                      {fmtTime(log.created_at)}
                    </td>
                    {/* User (name or email) */}
                    <td className="px-4 py-3">
                      <p className="text-[var(--color-text-body)] font-medium">
                        {log.entity_name && log.action.startsWith("user_")
                          ? log.entity_name
                          : log.user_email ?? "—"}
                      </p>
                    </td>
                    {/* Role badge */}
                    <td className="px-4 py-3">
                      {role && ROLE_BADGE[role] ? (
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${ROLE_BADGE[role]}`}>
                          {role.replace("_", " ")}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    {/* Action */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${color}`}>
                        <Icon className="h-3 w-3" />
                        {fmtAction(log.action)}
                      </span>
                    </td>
                    {/* Entity */}
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">
                      {log.entity_type ? (
                        <div>
                          <span className="text-xs font-medium text-[var(--color-text-heading)]">{log.entity_type}</span>
                          {log.entity_name && !log.action.startsWith("user_") && (
                            <p className="text-xs text-[var(--color-text-muted)] truncate max-w-[160px]" title={log.entity_name}>
                              {log.entity_name}
                            </p>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    {/* Details */}
                    <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs max-w-xs">
                      {extractDetail(log)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
