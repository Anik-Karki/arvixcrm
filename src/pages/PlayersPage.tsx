/**
 * Admin PlayersPage — manual FTD entry (no platform API).
 * Admin sees ALL players; filters by partner, KYC, FTD, status.
 * Admin can add, edit, qualify, and DELETE players.
 * Non-admin users cannot delete players.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Search, RefreshCw, Users, TrendingUp, Target, Shield,
  CheckCircle, XCircle, Trash2, AlertTriangle, X, Plus, Upload, Image as ImageIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Pagination } from "@/components/Pagination";

interface Player {
  id: string; player_id: string; partner_id: string|null;
  country: string|null; geo: string|null; status: string; kyc_status: string;
  ftd_date: string|null; ftd_amount: number|null;
  ngr: number; ggr: number; total_deposits: number; total_withdrawals: number;
  total_wagers: number; revshare_earned: number;
  qualified_for_cpa: boolean; cpa_paid: boolean;
  risk_score: number; lifetime_days: number;
  registered_at: string|null; last_active_at: string|null; created_at: string;
  proof_image_url: string|null;
  partner?: { name: string; affiliate_id: string };
}

const KYC_COLOR: Record<string,string> = {
  verified:   "bg-emerald-50 text-emerald-700",
  pending:    "bg-amber-50 text-amber-700",
  rejected:   "bg-red-50 text-red-700",
  unverified: "bg-slate-50 text-slate-600",
};
const STATUS_COLOR: Record<string,string> = {
  active:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  registered:    "bg-blue-50 text-blue-700 border-blue-200",
  kyc_pending:   "bg-amber-50 text-amber-700 border-amber-200",
  kyc_verified:  "bg-blue-50 text-blue-700 border-blue-200",
  ftd_made:      "bg-purple-50 text-purple-700 border-purple-200",
  inactive:      "bg-slate-50 text-slate-600 border-slate-200",
  self_excluded: "bg-orange-50 text-orange-700 border-orange-200",
  blocked:       "bg-red-50 text-red-700 border-red-200",
};

const fmt  = (n: number) => `$${(n||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2})}`;
const fmtD = (d: string|null) => d ? new Date(d).toLocaleDateString() : "—";

export default function PlayersPage() {
  const [players,  setPlayers]  = useState<Player[]>([]);
  const [partners, setPartners] = useState<{id:string;name:string;affiliate_id:string}[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Detail drawer
  const [drawer, setDrawer] = useState<Player | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  
  // Add/Edit drawer
  const [editDrawer, setEditDrawer] = useState<Player | null>(null);
  const [adding, setAdding] = useState(false);

  const [search,        setSearch]       = useState("");
  const [statusFilter,  setStatusFilter] = useState("all");
  const [kycFilter,     setKycFilter]    = useState("all");
  const [partnerFilter, setPartnerFilter]= useState("all");
  const [ftdFilter,     setFtdFilter]    = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [pRes, partRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("players") as any)
        .select("*, partner:partners(name,affiliate_id)")
        .order("created_at", { ascending: false })
        .limit(1000),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("partners") as any).select("id,name,affiliate_id").order("name"),
    ]);
    setPlayers(pRes.data ?? []);
    setPartners(partRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Delete (admin-only) ───────────────────────────────────────────────────
  const [deleteTarget,  setDeleteTarget]  = useState<Player | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("players") as any)
        .delete().eq("id", deleteTarget.id);
      if (error) throw new Error(error.message);
      const name = deleteTarget.player_id;
      setDeleteTarget(null);
      setPlayers(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteSuccess(`Player ${name} deleted successfully.`);
      setTimeout(() => setDeleteSuccess(null), 3000);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete player.");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = players.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q
      || p.player_id?.toLowerCase().includes(q)
      || p.country?.toLowerCase().includes(q)
      || (p.partner as any)?.name?.toLowerCase().includes(q);
    const matchS = statusFilter === "all" || p.status === statusFilter;
    const matchK = kycFilter    === "all" || p.kyc_status === kycFilter;
    const matchP = partnerFilter=== "all" || p.partner_id === partnerFilter;
    const matchF = ftdFilter==="all" || (ftdFilter==="yes" && p.ftd_date) || (ftdFilter==="no" && !p.ftd_date);
    return matchQ && matchS && matchK && matchP && matchF;
  });

  const stats = {
    total:    players.length,
    ftd:      players.filter(p=>p.ftd_date).length,
    active:   players.filter(p=>p.status==="active").length,
    highRisk: players.filter(p=>(p.risk_score??0)>=70).length,
    totalNGR: players.reduce((s,p)=>s+(p.ngr||0),0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Players</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{filtered.length} of {players.length} players</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { setAdding(true); setEditDrawer(null); }} 
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus className="h-4 w-4"/> Add Player / FTD
          </button>
          <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh
          </button>
        </div>
      </div>

      {/* Success / error banners */}
      {deleteSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-700">{deleteSuccess}</p>
          <button onClick={() => setDeleteSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[["Total",stats.total,Users,"blue"],["FTD",stats.ftd,Target,"green"],["Active",stats.active,TrendingUp,"purple"],["High Risk",stats.highRisk,Shield,"red"],["Total NGR",fmt(stats.totalNGR),TrendingUp,"teal"]].map(([l,v,I,c]:any)=>(
          <div key={l} className="premium-card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c==="green"?"bg-emerald-50 text-emerald-600":c==="purple"?"bg-purple-50 text-purple-600":c==="red"?"bg-red-50 text-red-600":c==="teal"?"bg-teal-50 text-teal-600":"bg-blue-50 text-blue-600"}`}><I className="h-4 w-4"/></div>
            <div><p className="text-lg font-bold text-[var(--color-text-heading)]">{v}</p><p className="text-xs text-[var(--color-text-secondary)]">{l}</p></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="premium-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Player ID, country, partner…" className="field focus:field-focus pl-9"/>
        </div>
        <select value={partnerFilter} onChange={e=>setPartnerFilter(e.target.value)} className="field focus:field-focus">
          <option value="all">All Partners</option>
          {partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={ftdFilter} onChange={e=>setFtdFilter(e.target.value)} className="field focus:field-focus">
          <option value="all">FTD: All</option>
          <option value="yes">FTD Made</option>
          <option value="no">No FTD</option>
        </select>
        <select value={kycFilter} onChange={e=>setKycFilter(e.target.value)} className="field focus:field-focus">
          <option value="all">All KYC</option>
          {["verified","pending","rejected","unverified"].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                {["Player","Affiliate Partner","Status","KYC","FTD","Deposits","Wagers","NGR","Risk Score","Registered","Last Active","Actions"].map(h=>(
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:5}).map((_,i)=>(
                <tr key={i}><td colSpan={12} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded"/></td></tr>
              )) : filtered.length===0 ? (
                <tr><td colSpan={12} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No players found</td></tr>
              ) : filtered.slice((page - 1) * pageSize, page * pageSize).map(p=>(
                <tr key={p.id}
                  onClick={() => setDrawer(p)}
                  className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)] cursor-pointer group">
                  <td className="px-3 py-3">
                    <p className="font-mono text-xs font-medium text-[var(--color-text-body)]">{p.player_id}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{p.country || p.geo || "—"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-sm font-medium text-[var(--color-text-heading)]">{(p.partner as any)?.name ?? "—"}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{(p.partner as any)?.affiliate_id ?? ""}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_COLOR[p.status]??STATUS_COLOR.inactive}`}>
                      {p.status?.replace(/_/g," ")}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${KYC_COLOR[p.kyc_status]??KYC_COLOR.unverified}`}>{p.kyc_status}</span>
                  </td>
                  <td className="px-3 py-3">
                    {p.ftd_date ? (
                      <div>
                        <div className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-600"/><span className="text-xs font-medium">{p.ftd_amount ? fmt(p.ftd_amount) : "Yes"}</span></div>
                        <p className="text-xs text-[var(--color-text-muted)]">{fmtD(p.ftd_date)}</p>
                        {p.qualified_for_cpa && <span className="text-xs text-emerald-600 font-medium">CPA Qualified</span>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[var(--color-text-muted)]"><XCircle className="h-3 w-3"/><span className="text-xs">No FTD</span></div>
                    )}
                  </td>
                  <td className="px-3 py-3 font-medium text-[var(--color-text-heading)]">{fmt(p.total_deposits)}</td>
                  <td className="px-3 py-3 font-medium text-[var(--color-text-body)]">{fmt(p.total_wagers)}</td>
                  <td className="px-3 py-3">
                    <p className="font-bold text-[var(--color-text-heading)]">{fmt(p.ngr)}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">GGR: {fmt(p.ggr)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${(p.risk_score||0)>=70?"bg-red-500":(p.risk_score||0)>=40?"bg-amber-500":"bg-emerald-500"}`} style={{width:`${p.risk_score||0}%`}}/>
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)]">{p.risk_score||0}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">
                    <p>{fmtD(p.registered_at||p.created_at)}</p>
                    {p.lifetime_days>0 && <p className="text-[var(--color-text-muted)]">{p.lifetime_days}d ago</p>}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">{fmtD(p.last_active_at)}</td>
                  {/* Delete — admin only */}
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => { setDeleteTarget(p); setDeleteError(null); }}
                      title="Delete player"
                      className="p-1.5 rounded hover:bg-red-50 text-[var(--color-text-muted)] hover:text-red-600 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div>

      {/* ── Delete Confirm Dialog ─────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-[var(--color-text-heading)]">Delete player?</p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                  <strong className="font-mono">{deleteTarget.player_id}</strong> will be permanently removed.
                  This also removes their FTD and financial data. This cannot be undone.
                </p>
                {deleteTarget.qualified_for_cpa && !deleteTarget.cpa_paid && (
                  <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    ⚠ This player has a pending CPA qualification — deleting will remove it from commission calculations.
                  </p>
                )}
              </div>
            </div>
            {deleteError && (
              <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{deleteError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete Player"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Player Detail Drawer ─────────────────────────────────────────── */}
      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={() => setDrawer(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] bg-white shadow-2xl flex flex-col border-l border-[var(--color-border-default)]">

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--color-border-default)]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {(drawer.player_id || "?").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-[var(--color-text-heading)] text-base leading-tight font-mono">{drawer.player_id}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{drawer.country || drawer.geo || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLOR[drawer.status] ?? STATUS_COLOR.inactive}`}>
                  {drawer.status?.replace(/_/g, " ")}
                </span>
                <button onClick={() => setDrawer(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Partner */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Partner</p>
                <p className="text-sm font-medium text-[var(--color-text-heading)]">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(drawer.partner as any)?.name ?? "—"}
                </p>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(drawer.partner as any)?.affiliate_id && (
                  <p className="text-xs text-[var(--color-text-muted)]">{(drawer.partner as any).affiliate_id}</p>
                )}
              </section>

              {/* KYC + FTD */}
              <section className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-[var(--color-surface-subtle)] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">KYC</p>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${KYC_COLOR[drawer.kyc_status] ?? KYC_COLOR.unverified}`}>
                    {drawer.kyc_status}
                  </span>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-subtle)] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">FTD</p>
                  {drawer.ftd_date ? (
                    <div>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-emerald-600" />
                        <span className="text-sm font-semibold text-emerald-700">{drawer.ftd_amount ? fmt(drawer.ftd_amount) : "Yes"}</span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{fmtD(drawer.ftd_date)}</p>
                      {drawer.qualified_for_cpa && (
                        <p className="text-xs text-emerald-600 font-medium mt-1">CPA Qualified {drawer.cpa_paid && "(Paid)"}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
                      <XCircle className="h-3 w-3" /><span className="text-xs">No FTD</span>
                    </div>
                  )}
                </div>
              </section>

              {/* FTD Proof Image Thumbnail - Clickable */}
              {drawer.proof_image_url && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">FTD Proof</p>
                  <button
                    onClick={() => setImageModalOpen(true)}
                    className="relative w-full h-32 rounded-xl border-2 border-emerald-200 overflow-hidden bg-emerald-50/30 hover:border-emerald-300 transition-colors group cursor-pointer"
                  >
                    <img
                      src={drawer.proof_image_url}
                      alt="Player FTD Proof"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f0f0f0" width="400" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999"%3EImage not found%3C/text%3E%3C/svg%3E';
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-colors">
                      <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 bg-black/60 px-3 py-1 rounded-lg">
                        Click to view full size
                      </span>
                    </div>
                  </button>
                </section>
              )}

              {/* Financials */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Financials</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">Deposits</p><p className="font-semibold text-[var(--color-text-heading)]">{fmt(drawer.total_deposits)}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">Withdrawals</p><p className="font-semibold text-[var(--color-text-heading)]">{fmt(drawer.total_withdrawals)}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">Wagers</p><p className="font-semibold text-[var(--color-text-heading)]">{fmt(drawer.total_wagers)}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">GGR</p><p className="font-semibold text-[var(--color-text-heading)]">{fmt(drawer.ggr)}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">NGR</p><p className="font-bold text-lg text-[var(--color-text-heading)]">{fmt(drawer.ngr)}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">RS Earned</p><p className="font-semibold text-[var(--color-text-heading)]">{fmt(drawer.revshare_earned)}</p></div>
                </div>
              </section>

              {/* Risk */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Risk Assessment</p>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${(drawer.risk_score||0)>=70?"bg-red-500":(drawer.risk_score||0)>=40?"bg-amber-500":"bg-emerald-500"}`} style={{width:`${drawer.risk_score||0}%`}} />
                  </div>
                  <span className="text-sm font-medium text-[var(--color-text-heading)]">{drawer.risk_score || 0}/100</span>
                </div>
              </section>

              {/* Dates */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Dates</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-[var(--color-border-subtle)]">
                    <span className="text-[var(--color-text-muted)]">Registered</span>
                    <span className="font-medium">{fmtD(drawer.registered_at || drawer.created_at)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[var(--color-border-subtle)]">
                    <span className="text-[var(--color-text-muted)]">Last Active</span>
                    <span className="font-medium">{fmtD(drawer.last_active_at)}</span>
                  </div>
                </div>
              </section>

              {/* Proof Image */}
              {drawer.proof_image_url && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">FTD Proof Screenshot</p>
                  <div className="rounded-xl border-2 border-[var(--color-border-default)] overflow-hidden bg-[var(--color-surface-subtle)]">
                    <img
                      src={drawer.proof_image_url}
                      alt="Player FTD Proof"
                      className="w-full h-auto"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f0f0f0" width="400" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999"%3EImage not found%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    Admin can cross-check this proof against player FTD records.
                  </p>
                </section>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--color-border-default)] flex gap-2">
              <button
                onClick={() => { setEditDrawer(drawer); setDrawer(null); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors">
                Edit Player
              </button>
              <button
                onClick={() => { setDeleteTarget(drawer); setDeleteError(null); setDrawer(null); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100 transition-colors">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
              <button
                onClick={() => setDrawer(null)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Close
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ── Add/Edit Player Drawer ───────────────────────────────────────── */}
      {(adding || editDrawer) && <AddEditPlayerDrawer 
        player={editDrawer} 
        partners={partners}
        onClose={() => { setAdding(false); setEditDrawer(null); }} 
        onSuccess={() => { setAdding(false); setEditDrawer(null); fetchData(); }}
      />}

      {/* Image Modal - Full Size View */}
      {imageModalOpen && drawer?.proof_image_url && (
        <>
          <div 
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setImageModalOpen(false)}
          >
            <div 
              className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
                <div>
                  <h3 className="font-bold text-gray-900">FTD Proof Screenshot</h3>
                  <p className="text-sm text-gray-500">Player: {drawer.player_id}</p>
                </div>
                <button
                  onClick={() => setImageModalOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-200 text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              {/* Image */}
              <div className="overflow-auto max-h-[calc(90vh-120px)]">
                <img
                  src={drawer.proof_image_url}
                  alt="Player FTD Proof - Full Size"
                  className="w-full h-auto"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600"%3E%3Crect fill="%23f0f0f0" width="800" height="600"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="24"%3EImage not found%3C/text%3E%3C/svg%3E';
                  }}
                />
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                <p className="text-xs text-gray-500">
                  Click outside or press X to close
                </p>
                <button
                  onClick={() => setImageModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Add/Edit Player Drawer Component ──────────────────────────────────────
function AddEditPlayerDrawer({ 
  player, 
  partners,
  onClose, 
  onSuccess 
}: { 
  player: Player | null; 
  partners: {id:string;name:string;affiliate_id:string}[];
  onClose: () => void; 
  onSuccess: () => void;
}) {
  const isEdit = !!player;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [success, setSuccess] = useState<string|null>(null);
  
  // Form state
  const [playerId, setPlayerId] = useState(player?.player_id || "");
  const [partnerId, setPartnerId] = useState(player?.partner_id || "");
  const [country, setCountry] = useState(player?.country || "");
  const [status, setStatus] = useState(player?.status || "registered");
  const [kycStatus, setKycStatus] = useState(player?.kyc_status || "pending");
  const [ftdMade, setFtdMade] = useState(player?.ftd_date ? true : false);
  const [ftdDate, setFtdDate] = useState(player?.ftd_date || "");
  const [ftdAmount, setFtdAmount] = useState(player?.ftd_amount?.toString() || "");
  const [qualifiedForCPA, setQualifiedForCPA] = useState(player?.qualified_for_cpa || false);
  
  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(player?.proof_image_url || null);
  const [uploading, setUploading] = useState(false);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, GIF, WebP)');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB');
      return;
    }

    setImageFile(file);
    
    // Show preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setError(null);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return player?.proof_image_url || null;

    setUploading(true);
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${playerId || 'temp'}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('player-images')
        .upload(filePath, imageFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('player-images')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      console.error('Image upload error:', err);
      setError('Failed to upload image. Please try again.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    // Validation
    if (!playerId.trim()) {
      setError('Player ID is required');
      return;
    }
    if (!partnerId) {
      setError('Partner is required');
      return;
    }

    setSaving(true);
    try {
      // Upload image if selected
      let imageUrl = player?.proof_image_url || null;
      if (imageFile) {
        imageUrl = await uploadImage();
        if (!imageUrl && imageFile) {
          // Upload failed
          setSaving(false);
          return;
        }
      }

      const playerData: any = {
        player_id: playerId.trim(), // Required - no fallback to auto-generation
        partner_id: partnerId,
        country: country || null,
        status,
        kyc_status: kycStatus,
        ftd_made: ftdMade,
        ftd_date: ftdMade && ftdDate ? ftdDate : null,
        ftd_amount: ftdMade && ftdAmount ? parseFloat(ftdAmount) : null,
        qualified_for_cpa: qualifiedForCPA,
        proof_image_url: imageUrl,
      };

      if (isEdit) {
        // Update existing player
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase.from('players') as any)
          .update(playerData)
          .eq('id', player.id);

        if (updateError) throw updateError;
        setSuccess('Player updated successfully!');
      } else {
        // Create new player
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertError } = await (supabase.from('players') as any)
          .insert([playerData]);

        if (insertError) throw insertError;
        setSuccess('Player created successfully!');
      }

      setTimeout(() => onSuccess(), 2000); // Show success for 2 seconds
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message || 'Failed to save player');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[500px] bg-white shadow-2xl flex flex-col border-l border-[var(--color-border-default)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border-default)] sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-[var(--color-text-heading)]">
            {isEdit ? 'Edit Player' : 'Add Player / FTD'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-sm font-medium text-emerald-700">{success}</p>
            </div>
          )}

          {/* Player ID */}
          <div>
            <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
              Player ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              disabled={isEdit}
              placeholder="e.g., PLY-100245"
              className="field focus:field-focus w-full disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            {isEdit && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Player ID cannot be changed after creation
              </p>
            )}
            {!isEdit && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Enter a unique Player ID (e.g., PLY-100245)
              </p>
            )}
          </div>

          {/* Partner */}
          <div>
            <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
              Partner <span className="text-red-500">*</span>
            </label>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="field focus:field-focus w-full bg-white border border-[var(--color-border-default)] rounded-lg px-3 py-2">
              <option value="">Select Partner...</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.affiliate_id})</option>
              ))}
            </select>
          </div>

          {/* Country */}
          <div>
            <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
              Country
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g., US, UK, CA"
              className="field focus:field-focus w-full"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="field focus:field-focus w-full bg-white border border-[var(--color-border-default)] rounded-lg px-3 py-2">
              <option value="registered">Registered</option>
              <option value="kyc_pending">KYC Pending</option>
              <option value="kyc_verified">KYC Verified</option>
              <option value="ftd_made">FTD Made</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="self_excluded">Self Excluded</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          {/* KYC Status */}
          <div>
            <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
              KYC Status
            </label>
            <select
              value={kycStatus}
              onChange={(e) => setKycStatus(e.target.value)}
              className="field focus:field-focus w-full bg-white border border-[var(--color-border-default)] rounded-lg px-3 py-2">
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
              <option value="unverified">Unverified</option>
            </select>
          </div>

          {/* FTD Section */}
          <div className="border-t border-[var(--color-border-default)] pt-5">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={ftdMade}
                onChange={(e) => setFtdMade(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <label className="text-sm font-semibold text-[var(--color-text-body)]">
                Player has made FTD
              </label>
            </div>

            {ftdMade && (
              <div className="space-y-4 pl-6">
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                    FTD Date
                  </label>
                  <input
                    type="date"
                    value={ftdDate}
                    onChange={(e) => setFtdDate(e.target.value)}
                    className="field focus:field-focus w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                    FTD Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={ftdAmount}
                    onChange={(e) => setFtdAmount(e.target.value)}
                    placeholder="0.00"
                    className="field focus:field-focus w-full"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={qualifiedForCPA}
                    onChange={(e) => setQualifiedForCPA(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <label className="text-sm text-[var(--color-text-body)]">
                    Qualified for CPA Commission
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Proof Image Upload */}
          <div className="border-t border-[var(--color-border-default)] pt-5">
            <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
              Player / FTD Proof Screenshot
            </label>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              Upload supporting proof for Admin verification and cross-checking
            </p>

            <div className="space-y-3">
              {imagePreview && (
                <div className="relative rounded-lg border-2 border-[var(--color-border-default)] overflow-hidden">
                  <img
                    src={imagePreview}
                    alt="Proof preview"
                    className="w-full h-auto max-h-[200px] object-contain bg-gray-50"
                  />
                  {imageFile && (
                    <div className="absolute top-2 right-2">
                      <button
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(player?.proof_image_url || null);
                        }}
                        className="p-1 rounded-lg bg-red-500 text-white hover:bg-red-600">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-[var(--color-border-default)] hover:border-blue-400 cursor-pointer bg-[var(--color-surface-subtle)] hover:bg-blue-50 transition-colors">
                <Upload className="h-4 w-4 text-[var(--color-text-muted)]" />
                <span className="text-sm font-medium text-[var(--color-text-body)]">
                  {imagePreview ? 'Change Image' : 'Choose Image'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-[var(--color-text-muted)]">
                JPG, PNG, GIF, WebP • Max 5MB
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border-default)] flex gap-3 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            disabled={saving || uploading}
            className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving...' : uploading ? 'Uploading...' : isEdit ? 'Save Changes' : 'Create Player'}
          </button>
        </div>
      </aside>
    </>
  );
}
