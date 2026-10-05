/**
 * Admin DealsPage — Full deal visibility
 *
 * Shows ALL deals in the system from every source:
 *   1. Pipeline deals created via the CRM Deals page (proposal → negotiation → won)
 *   2. Commission deals created when a Partner is created (CPA/RevShare/Hybrid)
 *   3. Deals created from Lead conversion
 *
 * Columns: Title, Partner, Commission Type + Rate, Stage, Owner (who created it),
 *          Team, Deal Start, Created At
 *
 * Admin can see deal_status, commission model, rates, and exactly who made the deal.
 * Admin cannot modify commission rates (immutable history) but can change stage/status.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Search, RefreshCw, X, TrendingUp, CheckCircle,
  DollarSign, FileText, Eye, Plus, AlertTriangle, Edit,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Pagination } from "@/components/Pagination";

// ── Types ─────────────────────────────────────────────────────────────────────

type DealStage      = "proposal" | "negotiation" | "legal_review" | "won" | "lost" | "active";
type DealStatus     = "active" | "draft" | "paused" | "expired" | "cancelled";
type CommissionType = "CPA" | "RevShare" | "Hybrid";

interface Deal {
  id: string;
  title: string;
  partner_id: string | null;
  partner_name: string | null;
  lead_id: string | null;
  commission_type: CommissionType | null;
  cpa_amount: number;
  revshare_percentage: number;
  minimum_ftd: number;
  payment_cycle: string | null;
  deal_status: DealStatus;
  stage: string;
  deal_start_date: string | null;
  deal_end_date: string | null;
  amount: number;
  probability: number;
  notes: string | null;
  created_by: string | null;
  owner_id: string | null;
  team_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  partner?:  { name: string } | null;
  owner?:    { full_name: string; username: string } | null;
  creator?:  { full_name: string; username: string } | null;
  team?:     { name: string } | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STAGE_COLOR: Record<string, string> = {
  proposal:     "bg-blue-50 text-blue-700 border-blue-200",
  negotiation:  "bg-amber-50 text-amber-700 border-amber-200",
  legal_review: "bg-purple-50 text-purple-700 border-purple-200",
  won:          "bg-emerald-50 text-emerald-700 border-emerald-200",
  lost:         "bg-red-50 text-red-700 border-red-200",
  active:       "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const DEAL_STATUS_COLOR: Record<DealStatus, string> = {
  active:    "bg-emerald-50 text-emerald-700",
  draft:     "bg-slate-50 text-slate-600",
  paused:    "bg-amber-50 text-amber-700",
  expired:   "bg-red-50 text-red-600",
  cancelled: "bg-zinc-50 text-zinc-500",
};

const COMM_COLOR: Record<string, string> = {
  CPA:      "bg-blue-50 text-blue-700",
  RevShare: "bg-purple-50 text-purple-700",
  Hybrid:   "bg-teal-50 text-teal-700",
};

const fmt = (n: number) =>
  `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const dateShort = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ── Component ──────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const [deals,   setDeals]   = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [commFilter,   setCommFilter]   = useState<CommissionType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DealStatus | "all">("all");

  // Detail drawer
  const [selected, setSelected] = useState<Deal | null>(null);

  // Create deal
  const [createOpen,    setCreateOpen]    = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [createForm,    setCreateForm]    = useState({
    title: "", prospect_name: "", commission_type: "CPA" as CommissionType,
    cpa_amount: "", revshare_percentage: "", minimum_ftd: "0",
    payment_cycle: "Weekly", deal_start_date: new Date().toISOString().slice(0, 10),
    amount: "0", notes: "",
  });
  const [createSaving,  setCreateSaving]  = useState(false);
  const [createError,   setCreateError]   = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  // Edit deal
  const [editDeal,     setEditDeal]     = useState<Deal | null>(null);
  const [editForm,     setEditForm]     = useState({
    title: "", prospect_name: "", commission_type: "CPA" as CommissionType,
    cpa_amount: "", revshare_percentage: "", minimum_ftd: "0",
    payment_cycle: "Weekly", deal_start_date: "", amount: "0", notes: "",
  });
  const [editSaving,  setEditSaving]   = useState(false);
  const [editError,   setEditError]    = useState<string | null>(null);
  const [editSuccess, setEditSuccess]  = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("deals") as any)
        .select(`
          *,
          partner:partner_id ( name ),
          owner:owner_id ( full_name, username ),
          creator:created_by ( full_name, username ),
          team:team_id ( name )
        `)
        .order("created_at", { ascending: false });
      setDeals(data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  // ── Filtered ─────────────────────────────────────────────────────────────

  const filtered = deals.filter(d => {
    const q = search.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partnerName = (d.partner as any)?.name ?? d.partner_name ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ownerName   = (d.owner as any)?.full_name ?? (d.creator as any)?.full_name ?? "";
    const matchQ = !q
      || d.title.toLowerCase().includes(q)
      || partnerName.toLowerCase().includes(q)
      || ownerName.toLowerCase().includes(q);
    const matchC = commFilter   === "all" || d.commission_type === commFilter;
    const matchS = statusFilter === "all" || d.deal_status     === statusFilter;
    return matchQ && matchC && matchS;
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = {
    total:    deals.length,
    active:   deals.filter(d => d.deal_status === "active").length,
    cpa:      deals.filter(d => d.commission_type === "CPA").length,
    revshare: deals.filter(d => d.commission_type === "RevShare").length,
    hybrid:   deals.filter(d => d.commission_type === "Hybrid").length,
  };

  // ── Create deal ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createForm.title.trim()) { setCreateError("Title is required."); return; }
    setCreateSaving(true); setCreateError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("deals") as any).insert({
        title:               createForm.title.trim(),
        partner_name:        createForm.prospect_name || null,
        commission_type:     createForm.commission_type,
        cpa_amount:          parseFloat(createForm.cpa_amount) || 0,
        revshare_percentage: parseFloat(createForm.revshare_percentage) || 0,
        minimum_ftd:         parseInt(createForm.minimum_ftd) || 0,
        payment_cycle:       createForm.payment_cycle,
        deal_start_date:     createForm.deal_start_date || null,
        amount:              parseFloat(createForm.amount) || 0,
        probability:         25,
        notes:               createForm.notes || null,
        stage:               "proposal",
        deal_status:         "active",
      });
      if (error) throw new Error(error.message);
      // ── Audit log ──────────────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("activity_logs") as any).insert({
        user_role:   "admin",
        action:      "create_deal",
        entity_type: "deal",
        entity_name: createForm.title.trim(),
        new_value: {
          title: createForm.title.trim(),
          commission_type: createForm.commission_type,
          cpa_amount: createForm.cpa_amount,
          revshare_percentage: createForm.revshare_percentage,
          prospect: createForm.prospect_name,
        },
      });
      setCreateForm({ title:"", prospect_name:"", commission_type:"CPA", cpa_amount:"", revshare_percentage:"", minimum_ftd:"0", payment_cycle:"Weekly", deal_start_date: new Date().toISOString().slice(0,10), amount:"0", notes:"" });
      await fetchDeals();
      setCreateSuccess(true);
      setTimeout(() => { setCreateSuccess(false); setCreateOpen(false); }, 1200);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create deal.");
    } finally {
      setCreateSaving(false);
    }
  };

  // ── Edit deal ─────────────────────────────────────────────────────────────

  const openEdit = (d: Deal) => {
    setEditDeal(d);
    setEditForm({
      title:               d.title,
      prospect_name:       d.partner_name ?? "",
      commission_type:     (d.commission_type ?? "CPA") as CommissionType,
      cpa_amount:          String(d.cpa_amount ?? ""),
      revshare_percentage: String(d.revshare_percentage ?? ""),
      minimum_ftd:         String(d.minimum_ftd ?? "0"),
      payment_cycle:       d.payment_cycle ?? "Weekly",
      deal_start_date:     d.deal_start_date ?? new Date().toISOString().slice(0, 10),
      amount:              String(d.amount ?? "0"),
      notes:               d.notes ?? "",
    });
    setEditError(null);
    setEditSuccess(false);
  };

  const handleEditSave = async () => {
    if (!editDeal) return;
    if (!editForm.title.trim()) { setEditError("Title is required."); return; }
    setEditSaving(true); setEditError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("deals") as any)
        .update({
          title:               editForm.title.trim(),
          partner_name:        editForm.prospect_name || null,
          commission_type:     editForm.commission_type,
          cpa_amount:          parseFloat(editForm.cpa_amount) || 0,
          revshare_percentage: parseFloat(editForm.revshare_percentage) || 0,
          minimum_ftd:         parseInt(editForm.minimum_ftd) || 0,
          payment_cycle:       editForm.payment_cycle,
          deal_start_date:     editForm.deal_start_date || null,
          amount:              parseFloat(editForm.amount) || 0,
          notes:               editForm.notes || null,
          updated_at:          new Date().toISOString(),
        })
        .eq("id", editDeal.id);
      if (error) throw new Error(error.message);
      // ── Audit log ──────────────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("activity_logs") as any).insert({
        user_role:      "admin",
        action:         "update_deal",
        entity_type:    "deal",
        entity_id:      editDeal.id,
        entity_name:    editForm.title.trim(),
        previous_value: { title: editDeal.title, commission_type: editDeal.commission_type, cpa_amount: editDeal.cpa_amount, revshare_percentage: editDeal.revshare_percentage },
        new_value:      { title: editForm.title.trim(), commission_type: editForm.commission_type, cpa_amount: editForm.cpa_amount, revshare_percentage: editForm.revshare_percentage },
      });
      await fetchDeals();
      setEditSuccess(true);
      setTimeout(() => { setEditSuccess(false); setEditDeal(null); }, 1200);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update deal.");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Commission display ────────────────────────────────────────────────────

  const commLabel = (d: Deal) => {    if (!d.commission_type) return "—";
    if (d.commission_type === "CPA")      return `${fmt(d.cpa_amount)}/FTD`;
    if (d.commission_type === "RevShare") return `${d.revshare_percentage}%`;
    return `${fmt(d.cpa_amount)} + ${d.revshare_percentage}%`;
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Deals</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            All deals across the platform — pipeline deals, commission deals, and converted leads
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchDeals} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
            <Plus className="h-4 w-4" /> New Deal
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {([
          ["Total Deals",  stats.total,    FileText,   "blue"],
          ["Active",        stats.active,  CheckCircle,"green"],
          ["CPA",           stats.cpa,     DollarSign, "blue"],
          ["RevShare",      stats.revshare,TrendingUp, "purple"],
          ["Hybrid",        stats.hybrid,  DollarSign, "teal"],
        ] as [string, number, React.ElementType, string][]).map(([l, v, Icon, c]) => (
          <div key={l} className="premium-card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              c === "green"  ? "bg-emerald-50 text-emerald-600" :
              c === "purple" ? "bg-purple-50 text-purple-600"  :
              c === "teal"   ? "bg-teal-50 text-teal-600"      :
                               "bg-blue-50 text-blue-600"
            }`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--color-text-heading)]">{v}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">{l}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="premium-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
          <input type="text" placeholder="Search title, partner, owner…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="field focus:field-focus pl-9" />
        </div>
        <select value={commFilter} onChange={e => setCommFilter(e.target.value as CommissionType | "all")}
          className="field focus:field-focus w-auto min-w-[150px]">
          <option value="all">All Types</option>
          <option value="CPA">CPA</option>
          <option value="RevShare">RevShare</option>
          <option value="Hybrid">Hybrid</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as DealStatus | "all")}
          className="field focus:field-focus w-auto min-w-[140px]">
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="paused">Paused</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                {["Deal","Partner","Commission","Rate","Min FTD","Cycle","Status","Owner","Team","Start Date","Created",""].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={12} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-16 text-center text-[var(--color-text-muted)]">
                  No deals found
                </td></tr>
              ) : filtered.slice((page - 1) * pageSize, page * pageSize).map(d => (
                <tr key={d.id}
                  onClick={() => setSelected(d)}
                  className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)] cursor-pointer group">

                  {/* Title */}
                  <td className="px-3 py-3">
                    <p className="font-semibold text-[var(--color-text-heading)] max-w-[180px] truncate" title={d.title}>
                      {d.title}
                    </p>
                    {d.lead_id && (
                      <p className="text-[10px] text-amber-600 font-medium">from lead</p>
                    )}
                  </td>

                  {/* Partner */}
                  <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(d.partner as any)?.name ?? d.partner_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </td>

                  {/* Commission type */}
                  <td className="px-3 py-3">
                    {d.commission_type ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${COMM_COLOR[d.commission_type] ?? "bg-slate-50 text-slate-600"}`}>
                        {d.commission_type}
                      </span>
                    ) : <span className="text-xs text-[var(--color-text-muted)]">—</span>}
                  </td>

                  {/* Rate */}
                  <td className="px-3 py-3 text-xs font-medium text-[var(--color-text-heading)]">
                    {commLabel(d)}
                  </td>

                  {/* Min FTD */}
                  <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">
                    {d.minimum_ftd > 0 ? d.minimum_ftd : "—"}
                  </td>

                  {/* Payment cycle */}
                  <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">
                    {d.payment_cycle ?? "—"}
                  </td>

                  {/* Deal status */}
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${DEAL_STATUS_COLOR[d.deal_status] ?? "bg-slate-50 text-slate-600"}`}>
                      {d.deal_status}
                    </span>
                  </td>

                  {/* Owner (who made the deal) */}
                  <td className="px-3 py-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(() => { const o = (d.owner as any) ?? (d.creator as any); return o ? (
                      <div>
                        <p className="text-xs font-medium text-[var(--color-text-body)]">{o.full_name}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">@{o.username}</p>
                      </div>
                    ) : <span className="text-xs text-[var(--color-text-muted)]">—</span>; })()}
                  </td>

                  {/* Team */}
                  <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(d.team as any)?.name ?? "—"}
                  </td>

                  {/* Deal start date */}
                  <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                    {dateShort(d.deal_start_date)}
                  </td>

                  {/* Created at */}
                  <td className="px-3 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                    {dateShort(d.created_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelected(d)}
                        className="p-1.5 rounded hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)]">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => openEdit(d)}
                        className="p-1.5 rounded hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)]">
                        <Edit className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div>

      {/* ── Create Deal dialog ───────────────────────────────────────────── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <h2 className="text-lg font-bold text-[var(--color-text-heading)]">New Deal</h2>
              <button onClick={() => setCreateOpen(false)}
                className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {createError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{createError}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Deal Title *</label>
                <input type="text" value={createForm.title}
                  onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                  className="field focus:field-focus" placeholder="e.g. BetMedia Corp — CPA Deal" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Prospect / Company</label>
                <input type="text" value={createForm.prospect_name}
                  onChange={e => setCreateForm(f => ({ ...f, prospect_name: e.target.value }))}
                  className="field focus:field-focus" placeholder="Company name" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Commission Type</label>
                <select value={createForm.commission_type}
                  onChange={e => setCreateForm(f => ({ ...f, commission_type: e.target.value as CommissionType }))}
                  className="field focus:field-focus">
                  <option value="CPA">CPA — Cost Per Acquisition</option>
                  <option value="RevShare">RevShare — Revenue Share</option>
                  <option value="Hybrid">Hybrid — CPA + RevShare</option>
                </select>
              </div>
              {(createForm.commission_type === "CPA" || createForm.commission_type === "Hybrid") && (
                <div className="grid grid-cols-2 gap-4 rounded-xl bg-blue-50 border border-blue-200 p-4">
                  <div>
                    <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">CPA Rate ($/FTD)</label>
                    <input type="text" inputMode="decimal" value={createForm.cpa_amount}
                      onChange={e => setCreateForm(f => ({ ...f, cpa_amount: e.target.value }))}
                      className="field focus:field-focus" placeholder="25" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Min FTDs</label>
                    <input type="text" inputMode="decimal" value={createForm.minimum_ftd}
                      onChange={e => setCreateForm(f => ({ ...f, minimum_ftd: e.target.value }))}
                      className="field focus:field-focus" />
                  </div>
                </div>
              )}
              {(createForm.commission_type === "RevShare" || createForm.commission_type === "Hybrid") && (
                <div className="rounded-xl bg-purple-50 border border-purple-200 p-4">
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">RS Rate (%)</label>
                  <input type="text" inputMode="decimal" value={createForm.revshare_percentage}
                    onChange={e => setCreateForm(f => ({ ...f, revshare_percentage: e.target.value }))}
                    className="field focus:field-focus" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Payment Cycle</label>
                  <select value={createForm.payment_cycle}
                    onChange={e => setCreateForm(f => ({ ...f, payment_cycle: e.target.value }))}
                    className="field focus:field-focus">
                    <option value="Weekly">Weekly</option>
                    <option value="Bi-Weekly">Bi-Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Deal Start Date</label>
                  <input type="date" value={createForm.deal_start_date}
                    onChange={e => setCreateForm(f => ({ ...f, deal_start_date: e.target.value }))}
                    className="field focus:field-focus" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Notes</label>
                <textarea value={createForm.notes}
                  onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                  className="field focus:field-focus resize-none" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={createSaving}
                className="px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60 flex items-center gap-2">
                {createSaving ? "Creating…" : <><Plus className="h-4 w-4" /> Create Deal</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail drawer ──────────────────────────────────────────────────── */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border-default)]">
              <div>
                <p className="font-bold text-[var(--color-text-heading)]">{selected.title}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Deal detail</p>
              </div>
              <button onClick={() => setSelected(null)}
                className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Commission */}
              <div className="rounded-xl bg-[var(--color-surface-subtle)] p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Commission</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-[var(--color-text-muted)]">Type</p>
                    <p className="font-semibold">{selected.commission_type ?? "—"}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)]">Rate</p>
                    <p className="font-semibold">{commLabel(selected)}</p></div>
                  {(selected.commission_type === "CPA" || selected.commission_type === "Hybrid") && (
                    <div><p className="text-xs text-[var(--color-text-muted)]">Min FTDs</p>
                      <p className="font-semibold">{selected.minimum_ftd}</p></div>
                  )}
                  <div><p className="text-xs text-[var(--color-text-muted)]">Cycle</p>
                    <p className="font-semibold">{selected.payment_cycle ?? "—"}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)]">Start Date</p>
                    <p className="font-semibold">{dateShort(selected.deal_start_date)}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)]">End Date</p>
                    <p className="font-semibold">{dateShort(selected.deal_end_date)}</p></div>
                </div>
              </div>

              {/* Deal info */}
              <div className="rounded-xl bg-[var(--color-surface-subtle)] p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Deal Info</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-[var(--color-text-muted)]">Stage</p>
                    <p className="font-semibold capitalize">{selected.stage}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)]">Status</p>
                    <p className="font-semibold">{selected.deal_status}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)]">Partner</p>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <p className="font-semibold">{(selected.partner as any)?.name ?? selected.partner_name ?? "—"}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)]">From Lead</p>
                    <p className="font-semibold">{selected.lead_id ? "Yes" : "No"}</p></div>
                </div>
              </div>

              {/* Who made it */}
              <div className="rounded-xl bg-[var(--color-surface-subtle)] p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Created By</p>
                {(() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const o = (selected.owner as any) ?? (selected.creator as any);
                  return o ? (
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-heading)]">{o.full_name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">@{o.username}</p>
                    </div>
                  ) : <p className="text-sm text-[var(--color-text-muted)]">Unknown</p>;
                })()}
                <p className="text-xs text-[var(--color-text-muted)]">Created {dateShort(selected.created_at)}</p>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(selected.team as any)?.name && (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <p className="text-xs text-[var(--color-text-secondary)]">Team: {(selected.team as any).name}</p>
                )}
              </div>

              {/* Notes */}
              {selected.notes && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Notes</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">{selected.notes}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
