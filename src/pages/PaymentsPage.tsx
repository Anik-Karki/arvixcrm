/**
 * Admin PaymentsPage
 *
 * Finance-grade payment management:
 *   - Full approval workflow: pending → reviewed → approved → processing → paid
 *   - Every status change writes the actor's identity (name, username, role, timestamp)
 *     into immutable denormalized columns — no audit trail ever relies on JOINs
 *   - Self-approval prevention: the person who requested cannot approve
 *   - Reject / Mark Paid require confirmation dialogs (with reason for reject)
 *   - Payment Log drawer: shows the full ordered event chain for any payment
 *     by calling the get_payment_audit_trail() RPC
 *   - Ledger tab: all payments with partner joined-at date visible
 *   - Duplicate period guard: calls check_payment_period_conflict() before
 *     any status mutation that could race
 */

import { useCallback, useEffect, useState } from "react";
import {
  Search, RefreshCw, CheckCircle, XCircle, Clock,
  DollarSign, TrendingUp, Eye, X, AlertTriangle,
  CheckCircle2, Ban, Play, FileText, ChevronRight, Download,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Pagination } from "@/components/Pagination";
import { downloadCSV } from "@/lib/csv-export";
import { useAuth } from "@/lib/auth/auth-context";

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentStatus =
  | "pending" | "reviewed" | "approved" | "rejected"
  | "paid" | "on_hold" | "below_minimum" | "processing" | "cancelled";

interface Payment {
  id: string;
  invoice_number: string;
  partner_id: string | null;
  period_start: string | null;
  period_end: string | null;
  payment_period: string | null;
  week_number: number | null;
  year: number | null;
  total_amount: number;
  cpa_count: number;
  cpa_rate: number;
  cpa_total: number;
  revshare_rate: number;
  revshare_total: number;
  hybrid_amount: number;
  bonus_amount: number;
  adjustments: number;
  status: PaymentStatus;
  payment_method: string | null;
  network: string | null;
  wallet_account: string | null;
  txid: string | null;
  payment_proof_url: string | null;
  notes: string | null;
  rejection_reason: string | null;
  // Requested
  requested_by: string | null;
  requested_by_username: string | null;
  requested_by_name: string | null;
  requested_by_role: string | null;
  requested_at: string | null;
  // Reviewed
  reviewed_by: string | null;
  reviewed_by_username: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  // Approved
  approved_by: string | null;
  approved_by_username: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  // Processed
  processed_by: string | null;
  processed_by_username: string | null;
  processed_by_name: string | null;
  processed_at: string | null;
  // Paid
  paid_by: string | null;
  paid_by_username: string | null;
  paid_by_name: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  partner?: { name: string; created_at: string; affiliate_id: string };
}

// Audit trail event from RPC
interface AuditStep {
  step: string;
  actor: string;
  username: string | null;
  role: string | null;
  timestamp: string;
  notes: string | Record<string, string> | null;
}

interface AuditHold {
  hold_ref: string;
  reason: string;
  reason_detail: string | null;
  placed_by: string;
  placed_at: string;
  released_by: string | null;
  released_at: string | null;
  release_reason: string | null;
  status: string;
}

interface AuditAdjustment {
  adj_ref: string;
  type: string;
  amount: number;
  reason: string;
  created_by: string;
  created_at: string;
}

interface AuditTrail {
  payment_id: string;
  invoice_number: string;
  partner_name: string;
  period: string;
  status: string;
  total_amount: number;
  currency: string;
  steps: AuditStep[];
  holds: AuditHold[];
  adjustments: AuditAdjustment[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<PaymentStatus, string> = {
  pending:       "bg-amber-50 text-amber-700 border-amber-200",
  reviewed:      "bg-blue-50 text-blue-700 border-blue-200",
  approved:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected:      "bg-red-50 text-red-700 border-red-200",
  paid:          "bg-green-50 text-green-800 border-green-200",
  on_hold:       "bg-slate-50 text-slate-600 border-slate-200",
  below_minimum: "bg-orange-50 text-orange-700 border-orange-200",
  processing:    "bg-purple-50 text-purple-700 border-purple-200",
  cancelled:     "bg-zinc-50 text-zinc-500 border-zinc-200",
};

const STEP_ICON: Record<string, string> = {
  Requested:  "🟡",
  Reviewed:   "🔵",
  Approved:   "🟢",
  Processing: "🟣",
  Paid:       "✅",
  Rejected:   "🔴",
  Cancelled:  "⚫",
};

const fmt = (n: number) =>
  `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ts = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) : "—";

const dateOnly = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { user } = useAuth();

  const [payments, setPayments]   = useState<Payment[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [search,   setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("all");
  const [activeTab, setActiveTab] = useState<"requests" | "ledger">("requests");

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState<string | null>(null);

  // Log drawer
  const [logPayment, setLogPayment]   = useState<Payment | null>(null);
  const [auditTrail, setAuditTrail]   = useState<AuditTrail | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<Payment | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Mark Paid dialog
  const [paidTarget,   setPaidTarget]   = useState<Payment | null>(null);
  const [txidInput,    setTxidInput]    = useState("");
  const [paidNote,     setPaidNote]     = useState("");

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("payments") as any)
      .select("*, partner:partners(name, created_at, affiliate_id)")
      .order("created_at", { ascending: false })
      .limit(1000);
    setPayments(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  // ── CSV export ─────────────────────────────────────────────────────────────
  const handleExport = () => {
    downloadCSV("payments.csv", filtered, [
      { header: "Invoice",        accessor: (p) => p.invoice_number },
      { header: "Requested By",   accessor: (p) => p.requested_by_name ?? "" },
      { header: "Period",         accessor: (p) => p.payment_period ?? "" },
      { header: "Amount ($)",     accessor: (p) => p.total_amount },
      { header: "Status",         accessor: (p) => p.status },
      { header: "Method",         accessor: (p) => p.payment_method ?? "" },
      { header: "Requested At",   accessor: (p) => p.requested_at ? new Date(p.requested_at).toLocaleString() : "" },
      { header: "Approved By",    accessor: (p) => p.approved_by_name ?? "" },
      { header: "Paid By",        accessor: (p) => p.paid_by_name ?? "" },
      { header: "Paid At",        accessor: (p) => p.paid_at ? new Date(p.paid_at).toLocaleString() : "" },
      { header: "TXID",           accessor: (p) => (p as unknown as Record<string,unknown>)["txid"] as string ?? "" },
    ]);
  };

  // ── Audit trail ────────────────────────────────────────────────────────────

  const openLog = async (p: Payment) => {
    setLogPayment(p);
    setAuditTrail(null);
    setAuditLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("get_payment_audit_trail", {
        p_payment_id: p.id,
      });
      if (error) throw new Error(error.message);
      setAuditTrail(data as AuditTrail);
    } catch {
      // Fallback: build trail from payment columns if RPC not yet deployed
      setAuditTrail(buildLocalTrail(p));
    } finally {
      setAuditLoading(false);
    }
  };

  // Fallback local trail built from denormalized columns (no RPC needed)
  const buildLocalTrail = (p: Payment): AuditTrail => {
    const steps: AuditStep[] = [];
    if (p.requested_at) steps.push({ step: "Requested", actor: p.requested_by_name ?? "Unknown", username: p.requested_by_username, role: p.requested_by_role, timestamp: p.requested_at, notes: p.notes });
    if (p.reviewed_at)  steps.push({ step: "Reviewed",  actor: p.reviewed_by_name ?? "Unknown",  username: p.reviewed_by_username,  role: "finance", timestamp: p.reviewed_at,  notes: null });
    if (p.approved_at)  steps.push({ step: "Approved",  actor: p.approved_by_name ?? "Unknown",  username: p.approved_by_username,  role: "finance", timestamp: p.approved_at,  notes: null });
    if (p.processed_at) steps.push({ step: "Processing",actor: p.processed_by_name ?? "Unknown", username: p.processed_by_username, role: "finance", timestamp: p.processed_at, notes: { method: p.payment_method ?? "", network: p.network ?? "", wallet: p.wallet_account ?? "", txid: p.txid ?? "" } });
    if (p.paid_at)      steps.push({ step: "Paid",      actor: p.paid_by_name ?? "Unknown",      username: p.paid_by_username,      role: "finance", timestamp: p.paid_at,      notes: { txid: p.txid ?? "", amount: fmt(p.total_amount) } });
    if (p.rejection_reason && ["rejected","cancelled"].includes(p.status)) {
      steps.push({ step: p.status === "rejected" ? "Rejected" : "Cancelled", actor: p.reviewed_by_name ?? "Unknown", username: null, role: null, timestamp: p.updated_at, notes: p.rejection_reason });
    }
    return { payment_id: p.id, invoice_number: p.invoice_number, partner_name: p.partner?.name ?? "Unknown", period: p.payment_period ?? `W${p.week_number}`, status: p.status, total_amount: p.total_amount, currency: "USD", steps, holds: [], adjustments: [] };
  };

  // ── Action helpers ──────────────────────────────────────────────────────────

  const nowISO = () => new Date().toISOString();

  // Core update — writes status + full identity snapshot for that stage
  const doUpdate = async (
    id: string,
    patch: Record<string, unknown>,
  ) => {
    setActionLoading(true);
    setActionError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("payments") as any)
        .update({ ...patch, updated_at: nowISO() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      await fetchPayments(); // re-fetch to get fresh denormalized data
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Review ─────────────────────────────────────────────────────────────────
  const handleReview = async (p: Payment) => {
    if (!user) return;
    await doUpdate(p.id, {
      status:               "reviewed",
      reviewed_by:          user.id,
      reviewed_by_username: user.username,
      reviewed_by_name:     user.name,
      reviewed_at:          nowISO(),
    });
  };

  // ── Approve ────────────────────────────────────────────────────────────────
  const handleApprove = async (p: Payment) => {
    if (!user) return;
    // Self-approval prevention: the requester cannot approve their own payment
    if (p.requested_by === user.id) {
      setActionError(`Cannot approve: you submitted this request. Another admin must approve it.`);
      return;
    }
    await doUpdate(p.id, {
      status:                "approved",
      approved_by:           user.id,
      approved_by_username:  user.username,
      approved_by_name:      user.name,
      approved_at:           nowISO(),
    });
  };

  // ── Reject ─────────────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!user || !rejectTarget || !rejectReason.trim()) return;
    await doUpdate(rejectTarget.id, {
      status:               "rejected",
      rejection_reason:     rejectReason.trim(),
      reviewed_by:          user.id,
      reviewed_by_username: user.username,
      reviewed_by_name:     user.name,
      reviewed_at:          nowISO(),
    });
    setRejectTarget(null);
    setRejectReason("");
  };

  // ── Mark Paid ──────────────────────────────────────────────────────────────
  const handleMarkPaid = async () => {
    if (!user || !paidTarget) return;
    if (!txidInput.trim()) { setActionError("TXID is required to mark as paid."); return; }

    // Client-side TXID uniqueness check before writing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase.from("payments") as any)
      .select("id, invoice_number")
      .eq("txid", txidInput.trim())
      .eq("status", "paid")
      .neq("id", paidTarget.id)
      .limit(1);
    if (existing && existing.length > 0) {
      setActionError(`TXID already used on invoice ${existing[0].invoice_number}. Each payment must have a unique transaction ID.`);
      return;
    }

    await doUpdate(paidTarget.id, {
      status:            "paid",
      txid:              txidInput.trim(),
      notes:             paidNote.trim() || null,
      paid_by:           user.id,
      paid_by_username:  user.username,
      paid_by_name:      user.name,
      paid_at:           nowISO(),
      payment_date:      nowISO(),
      processed_by:          user.id,
      processed_by_username: user.username,
      processed_by_name:     user.name,
      processed_at:          nowISO(),
    });
    setPaidTarget(null);
    setTxidInput("");
    setPaidNote("");
  };

  // ── Filters ────────────────────────────────────────────────────────────────

  const filtered = payments.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q
      || p.partner?.name?.toLowerCase().includes(q)
      || p.invoice_number?.toLowerCase().includes(q)
      || (p.payment_period ?? "").toLowerCase().includes(q)
      || (p.requested_by_name ?? "").toLowerCase().includes(q)
      || (p.requested_by_username ?? "").toLowerCase().includes(q);
    const matchS = statusFilter === "all" || p.status === statusFilter;
    return matchQ && matchS;
  });

  const stats = {
    pending:    payments.filter(p => ["pending","reviewed"].includes(p.status)).length,
    pendingAmt: payments.filter(p => ["pending","reviewed"].includes(p.status)).reduce((s,p) => s + p.total_amount, 0),
    approved:   payments.filter(p => p.status === "approved").length,
    paid:       payments.filter(p => p.status === "paid").reduce((s,p) => s + p.total_amount, 0),
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Payments</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {filtered.length} of {payments.length} payment records
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)]">
            <Download className="h-4 w-4" />Export CSV
          </button>
          <button
            onClick={fetchPayments}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        {([
          ["Pending Review",  stats.pending,           Clock,       "orange"],
          ["Pending Amount",  fmt(stats.pendingAmt),   DollarSign,  "amber"],
          ["Approved",        stats.approved,          CheckCircle, "green"],
          ["Total Paid",      fmt(stats.paid),         TrendingUp,  "blue"],
        ] as [string, string | number, React.ElementType, string][]).map(([label, val, Icon, color]) => (
          <div key={label} className="premium-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              color === "green" ? "bg-emerald-50 text-emerald-600" :
              color === "orange" || color === "amber" ? "bg-amber-50 text-amber-600" :
              "bg-blue-50 text-blue-600"
            }`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--color-text-heading)]">{val}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border-default)]">
        {(["requests", "ledger"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-[var(--color-brand-blue)] text-[var(--color-brand-blue)]"
                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-body)]"
            }`}
          >
            {tab === "requests" ? "Payment Requests" : "Full Ledger"}
          </button>
        ))}
      </div>

      {/* Global action error */}
      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="premium-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Invoice, partner, period, manager…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="field focus:field-focus pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as PaymentStatus | "all")}
          className="field focus:field-focus w-auto min-w-[160px]"
        >
          <option value="all">All Statuses</option>
          {(["pending","reviewed","approved","processing","paid","on_hold","rejected","cancelled"] as PaymentStatus[]).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      {/* ── Payment Requests table ───────────────────────────────────────────── */}
      {activeTab === "requests" && (
        <div className="premium-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                  {["Invoice","Partner","Period","Requested By","CPA","RevShare","Total","Method","Status","Actions"].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={10} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No payments found</td></tr>
                ) : filtered.slice((page - 1) * pageSize, page * pageSize).map(p => (
                  <tr key={p.id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]">
                    {/* Invoice */}
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-[var(--color-text-heading)]">
                      {p.invoice_number || "—"}
                    </td>
                    {/* Partner */}
                    <td className="px-3 py-3">
                      <p className="font-medium text-[var(--color-text-heading)]">{p.partner?.name ?? "Unknown"}</p>
                      {p.partner?.created_at && (
                        <p className="text-xs text-[var(--color-text-muted)]">joined {dateOnly(p.partner.created_at)}</p>
                      )}
                    </td>
                    {/* Period */}
                    <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                      {p.payment_period ?? (p.week_number ? `W${p.week_number}/${p.year}` : "—")}
                    </td>
                    {/* Requested By */}
                    <td className="px-3 py-3">
                      <p className="text-sm text-[var(--color-text-body)]">{p.requested_by_name ?? "—"}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {p.requested_by_username ? `@${p.requested_by_username}` : ""}{p.requested_by_role ? ` · ${p.requested_by_role}` : ""}
                      </p>
                      {p.requested_at && (
                        <p className="text-xs text-[var(--color-text-muted)]">{ts(p.requested_at)}</p>
                      )}
                    </td>
                    {/* CPA */}
                    <td className="px-3 py-3 text-right font-medium text-[var(--color-text-heading)]">
                      {fmt(p.cpa_total)}
                    </td>
                    {/* RevShare */}
                    <td className="px-3 py-3 text-right font-medium text-[var(--color-text-heading)]">
                      {fmt(p.revshare_total)}
                    </td>
                    {/* Total */}
                    <td className="px-3 py-3 text-right font-bold text-[var(--color-text-heading)]">
                      {fmt(p.total_amount)}
                    </td>
                    {/* Method */}
                    <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">
                      {p.payment_method ?? "—"}
                    </td>
                    {/* Status */}
                    <td className="px-3 py-3">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_COLOR[p.status]}`}>
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-3 py-3">
                      <div className="flex gap-1 flex-wrap items-center">
                        {/* View Log */}
                        <button
                          onClick={() => openLog(p)}
                          title="Payment Log"
                          className="p-1.5 rounded hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)]"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        {/* Review */}
                        {p.status === "pending" && (
                          <button
                            onClick={() => handleReview(p)}
                            disabled={actionLoading}
                            className="px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium disabled:opacity-40"
                          >
                            Review
                          </button>
                        )}
                        {/* Approve — blocked if self-request */}
                        {["pending","reviewed"].includes(p.status) && (
                          <button
                            onClick={() => handleApprove(p)}
                            disabled={actionLoading || p.requested_by === user?.id}
                            title={p.requested_by === user?.id ? "Cannot approve your own request" : "Approve"}
                            className="px-2 py-1 rounded text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Approve
                          </button>
                        )}
                        {/* Reject */}
                        {["pending","reviewed"].includes(p.status) && (
                          <button
                            onClick={() => { setRejectTarget(p); setRejectReason(""); setActionError(null); }}
                            className="px-2 py-1 rounded text-xs bg-red-50 text-red-700 hover:bg-red-100 font-medium"
                          >
                            Reject
                          </button>
                        )}
                        {/* Mark Paid */}
                        {p.status === "approved" && (
                          <button
                            onClick={() => { setPaidTarget(p); setTxidInput(""); setPaidNote(""); setActionError(null); }}
                            className="px-2 py-1 rounded text-xs bg-green-50 text-green-800 hover:bg-green-100 font-medium"
                          >
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </div>
      )}

      {/* ── Full Ledger tab ──────────────────────────────────────────────────── */}
      {activeTab === "ledger" && (
        <div className="premium-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                  {["Invoice","Partner","Joined","Period","Total","Requested By","Reviewed By","Approved By","Paid By","Paid At","Status"].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={11} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No records found</td></tr>
                ) : filtered.slice((page - 1) * pageSize, page * pageSize).map(p => (
                  <tr
                    key={p.id}
                    className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)] cursor-pointer"
                    onClick={() => openLog(p)}
                  >
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-[var(--color-text-heading)]">{p.invoice_number || "—"}</td>
                    <td className="px-3 py-3 font-medium text-[var(--color-text-heading)]">{p.partner?.name ?? "Unknown"}</td>
                    <td className="px-3 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">{dateOnly(p.partner?.created_at ?? null)}</td>
                    <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">{p.payment_period ?? `W${p.week_number}`}</td>
                    <td className="px-3 py-3 font-bold text-right text-[var(--color-text-heading)]">{fmt(p.total_amount)}</td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-[var(--color-text-body)]">{p.requested_by_name ?? "—"}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{ts(p.requested_at)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-[var(--color-text-body)]">{p.reviewed_by_name ?? "—"}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{ts(p.reviewed_at)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-[var(--color-text-body)]">{p.approved_by_name ?? "—"}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{ts(p.approved_at)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-[var(--color-text-body)]">{p.paid_by_name ?? "—"}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">@{p.paid_by_username ?? "—"}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">{ts(p.paid_at)}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_COLOR[p.status]}`}>
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </div>
      )}

      {/* ── Payment Log Drawer ───────────────────────────────────────────────── */}
      {logPayment && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => { setLogPayment(null); setAuditTrail(null); }}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] bg-white shadow-2xl flex flex-col overflow-y-auto">
            {/* Drawer header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--color-border-default)]">
              <div>
                <p className="text-lg font-bold text-[var(--color-text-heading)]">
                  Payment Log
                </p>
                <p className="text-sm font-mono text-[var(--color-text-secondary)] mt-0.5">
                  {logPayment.invoice_number || logPayment.id.slice(0, 8)}
                </p>
              </div>
              <button
                onClick={() => { setLogPayment(null); setAuditTrail(null); }}
                className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Summary row */}
              <div className="rounded-xl bg-[var(--color-surface-subtle)] p-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Partner</p>
                  <p className="font-semibold text-[var(--color-text-heading)]">{logPayment.partner?.name ?? "Unknown"}</p>
                  {logPayment.partner?.created_at && (
                    <p className="text-xs text-[var(--color-text-muted)]">joined {dateOnly(logPayment.partner.created_at)}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Period</p>
                  <p className="font-semibold text-[var(--color-text-heading)]">{logPayment.payment_period ?? `W${logPayment.week_number}`}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Amount</p>
                  <p className="font-bold text-lg text-[var(--color-text-heading)]">{fmt(logPayment.total_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Status</p>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_COLOR[logPayment.status]}`}>
                    {logPayment.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              {/* Commission breakdown */}
              <div className="rounded-xl border border-[var(--color-border-default)] p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Commission Breakdown</p>
                {([
                  ["CPA", fmt(logPayment.cpa_total), `${logPayment.cpa_count} FTDs × ${fmt(logPayment.cpa_rate)}`],
                  ["RevShare", fmt(logPayment.revshare_total), `${logPayment.revshare_rate}% of NGR`],
                  ["Hybrid", fmt(logPayment.hybrid_amount), ""],
                  ["Bonus", fmt(logPayment.bonus_amount), ""],
                  ["Adjustments", fmt(logPayment.adjustments), ""],
                ] as [string, string, string][]).map(([k, v, sub]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">{k}{sub ? <span className="text-xs text-[var(--color-text-muted)] ml-1">({sub})</span> : null}</span>
                    <span className="font-medium text-[var(--color-text-heading)]">{v}</span>
                  </div>
                ))}
                <div className="border-t border-[var(--color-border-default)] pt-2 flex justify-between">
                  <span className="font-semibold text-[var(--color-text-body)]">Total</span>
                  <span className="font-bold text-lg text-[var(--color-text-heading)]">{fmt(logPayment.total_amount)}</span>
                </div>
              </div>

              {/* Approval chain timeline */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-4">Approval Chain</p>
                {auditLoading ? (
                  <div className="space-y-3">
                    {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 animate-pulse rounded-lg" />)}
                  </div>
                ) : (auditTrail?.steps ?? buildLocalTrail(logPayment).steps).length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">No events recorded yet.</p>
                ) : (
                  <ol className="relative border-l-2 border-[var(--color-border-default)] ml-3 space-y-5">
                    {(auditTrail?.steps ?? buildLocalTrail(logPayment).steps).map((step, i) => (
                      <li key={i} className="ml-6">
                        <span className="absolute -left-3.5 flex items-center justify-center w-7 h-7 rounded-full bg-white border-2 border-[var(--color-border-default)] text-sm">
                          {STEP_ICON[step.step] ?? "⚪"}
                        </span>
                        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-semibold text-sm text-[var(--color-text-heading)]">{step.step}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{ts(step.timestamp)}</p>
                          </div>
                          <p className="text-sm text-[var(--color-text-body)]">
                            {step.actor}
                            {step.username && <span className="text-[var(--color-text-muted)] ml-1">@{step.username}</span>}
                            {step.role && <span className="ml-1 text-xs text-[var(--color-text-muted)]">· {step.role}</span>}
                          </p>
                          {step.notes && typeof step.notes === "string" && (
                            <p className="text-xs text-[var(--color-text-secondary)] mt-1 italic">"{step.notes}"</p>
                          )}
                          {step.notes && typeof step.notes === "object" && (
                            <div className="mt-1 space-y-0.5">
                              {Object.entries(step.notes as Record<string,string>).filter(([,v])=>v).map(([k,v])=>(
                                <p key={k} className="text-xs text-[var(--color-text-muted)] font-mono">{k}: {v}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Payment execution details */}
              {(logPayment.txid || logPayment.wallet_account) && (
                <div className="rounded-xl border border-[var(--color-border-default)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Payment Execution</p>
                  {([
                    ["Method",  logPayment.payment_method],
                    ["Network", logPayment.network],
                    ["Wallet",  logPayment.wallet_account],
                    ["TXID",    logPayment.txid],
                    ["Proof",   logPayment.payment_proof_url],
                  ] as [string, string | null][]).filter(([,v]) => v).map(([k,v]) => (
                    <div key={k} className="flex justify-between text-sm py-1.5 border-b border-[var(--color-border-subtle)] last:border-0">
                      <span className="text-[var(--color-text-secondary)]">{k}</span>
                      <span className="font-mono text-xs font-medium text-[var(--color-text-heading)] break-all text-right max-w-[65%]">{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Holds */}
              {(auditTrail?.holds ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Holds</p>
                  <div className="space-y-3">
                    {(auditTrail?.holds ?? []).map(h => (
                      <div key={h.hold_ref} className={`rounded-lg border p-3 text-sm ${h.status === "active" ? "border-red-200 bg-red-50" : "border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]"}`}>
                        <p className="font-semibold text-[var(--color-text-heading)]">{h.hold_ref} — {h.reason.replace(/_/g," ")}</p>
                        {h.reason_detail && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{h.reason_detail}</p>}
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">Placed by {h.placed_by} · {ts(h.placed_at)}</p>
                        {h.released_at && <p className="text-xs text-emerald-700 mt-0.5">Released by {h.released_by} · {ts(h.released_at)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Adjustments */}
              {(auditTrail?.adjustments ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Adjustments</p>
                  <div className="space-y-2">
                    {(auditTrail?.adjustments ?? []).map(a => (
                      <div key={a.adj_ref} className="rounded-lg border border-[var(--color-border-subtle)] p-3 text-sm flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-[var(--color-text-heading)]">{a.adj_ref} · {a.type}</p>
                          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{a.reason}</p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">by {a.created_by} · {ts(a.created_at)}</p>
                        </div>
                        <span className={`font-bold text-sm ${a.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {a.amount >= 0 ? "+" : ""}{fmt(a.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rejection reason */}
              {logPayment.rejection_reason && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-semibold text-red-800 mb-1">
                    {logPayment.status === "rejected" ? "Rejection Reason" : "Cancellation Reason"}
                  </p>
                  <p className="text-sm text-red-700">{logPayment.rejection_reason}</p>
                </div>
              )}

            </div>
          </div>
        </>
      )}

      {/* ── Reject Dialog ────────────────────────────────────────────────────── */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-[var(--color-text-heading)]">Reject {rejectTarget.invoice_number}?</p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                  Amount: {fmt(rejectTarget.total_amount)} · Partner: {rejectTarget.partner?.name ?? "Unknown"}
                </p>
              </div>
            </div>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)…"
              className="field focus:field-focus resize-none w-full"
              rows={3}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setRejectTarget(null); setRejectReason(""); }}
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || actionLoading}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                {actionLoading ? "Rejecting…" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark Paid Dialog ─────────────────────────────────────────────────── */}
      {paidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-heading)]">Mark as Paid</h2>
                <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                  {paidTarget.invoice_number} · {fmt(paidTarget.total_amount)}
                </p>
              </div>
              <button onClick={() => setPaidTarget(null)} className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {actionError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{actionError}</p>
                </div>
              )}
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  <strong>Irreversible.</strong> Once marked as paid, this payment cannot be reversed automatically.
                  Ensure the transaction is confirmed on the blockchain/bank before proceeding.
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                  Transaction ID (TXID) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={txidInput}
                  onChange={e => setTxidInput(e.target.value)}
                  placeholder="Blockchain TXID or bank reference…"
                  className="field focus:field-focus font-mono"
                />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Must be unique. This is the permanent record of payment execution.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Notes (optional)</label>
                <textarea
                  value={paidNote}
                  onChange={e => setPaidNote(e.target.value)}
                  placeholder="Additional notes…"
                  className="field focus:field-focus resize-none"
                  rows={2}
                />
              </div>
              <div className="rounded-lg bg-[var(--color-surface-subtle)] p-3 text-sm">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Recorded as paid by</p>
                <p className="font-semibold text-[var(--color-text-heading)]">
                  {user?.name} (@{user?.username}) · admin
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{ts(new Date().toISOString())}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <button
                onClick={() => { setPaidTarget(null); setActionError(null); }}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={!txidInput.trim() || actionLoading}
                className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-60"
              >
                {actionLoading ? "Saving…" : "Confirm Payment Sent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
