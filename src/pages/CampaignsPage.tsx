/**
 * Admin CampaignsPage
 * Matches the CRM campaigns page exactly — same form sections, same drawer,
 * same action buttons. Admin sees ALL campaigns across all users.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Search, RefreshCw, Plus, Edit, X, Megaphone,
  TrendingUp, Target, AlertTriangle, Trash2,
  Play, Pause, CheckCircle2, ChevronRight,
  Calendar, Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Pagination } from "@/components/Pagination";

type CampaignStatus  = "draft" | "active" | "paused" | "completed" | "cancelled";
type CampaignChannel = "email" | "social" | "display" | "search" | "affiliate" | "content" | "referral" | "other";

interface Campaign {
  id: string; name: string; description: string | null;
  channel: CampaignChannel; status: CampaignStatus;
  partner_id: string | null; partner_name: string | null;
  budget: number | null; spent: number | null;
  start_date: string | null; end_date: string | null;
  target_geos: string[] | null; tracking_url: string | null;
  clicks: number; registrations: number; conversions: number; ftds: number; ngr: number;
  created_by: string | null; team_id: string | null;
  created_at: string; updated_at: string;
  creator?: { full_name: string; username: string };
}

interface PartnerOption { id: string; name: string; affiliate_id: string; }

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<CampaignStatus, string> = {
  draft:     "bg-slate-50 text-slate-600 border-slate-200",
  active:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused:    "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const STATUSES: CampaignStatus[]  = ["draft", "active", "paused", "completed", "cancelled"];
const CHANNELS: CampaignChannel[] = ["affiliate", "email", "social", "display", "search", "content", "referral", "other"];

const fmt     = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const defaultForm = () => ({
  name: "", description: "", channel: "affiliate" as CampaignChannel,
  status: "draft" as CampaignStatus,
  partner_id: "", partner_name: "",
  budget: "", start_date: "", end_date: "",
  target_geos: "", tracking_url: "",
});

// ── Component ──────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns,    setCampaigns]    = useState<Campaign[]>([]);
  const [partners,     setPartners]     = useState<PartnerOption[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");

  // ✅ NEW: Success message
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editCamp,  setEditCamp]  = useState<Campaign | null>(null);
  const [form,      setForm]      = useState(defaultForm());
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete
  const [deleteCamp,    setDeleteCamp]    = useState<Campaign | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);

  // Drawer
  const [drawer, setDrawer] = useState<Campaign | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: campsData }, { data: partnersData }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("campaigns") as any)
          .select("*, creator:created_by(full_name,username)")
          .order("created_at", { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("partners") as any)
          .select("id,name,affiliate_id").eq("status","active").order("name"),
      ]);
      setCampaigns(campsData ?? []);
      setPartners(partnersData ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Filtered ─────────────────────────────────────────────────────────────

  const filtered = campaigns.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.name.toLowerCase().includes(q) || (c.partner_name ?? "").toLowerCase().includes(q);
    const matchS = statusFilter === "all" || c.status === statusFilter;
    return matchQ && matchS;
  });

  const stats = {
    total:       campaigns.length,
    active:      campaigns.filter(c => c.status === "active").length,
    clicks:      campaigns.reduce((s, c) => s + (c.clicks || 0), 0),
    conversions: campaigns.reduce((s, c) => s + (c.conversions || 0), 0),
  };

  // ── Status change ─────────────────────────────────────────────────────────

  const setStatus = async (id: string, status: CampaignStatus) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("campaigns") as any)
      .update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    if (drawer?.id === id) setDrawer(prev => prev ? { ...prev, status } : null);
    // ✅ Show success message
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    setSuccessMessage(`Campaign status changed to ${statusLabel}`);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 4000);
  };

  // ── Create / Edit ─────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditCamp(null); setForm(defaultForm()); setFormError(null); setModalOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditCamp(c);
    setForm({
      name: c.name, description: c.description ?? "", channel: c.channel, status: c.status,
      partner_id: c.partner_id ?? "", partner_name: c.partner_name ?? "",
      budget: c.budget != null ? String(c.budget) : "",
      start_date: c.start_date ?? "", end_date: c.end_date ?? "",
      target_geos: (c.target_geos ?? []).join(", "), tracking_url: c.tracking_url ?? "",
    });
    setFormError(null); setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError("Campaign name is required."); return; }
    setSaving(true); setFormError(null);
    const selectedPartner = partners.find(p => p.id === form.partner_id);
    const payload = {
      name: form.name.trim(), description: form.description || null,
      channel: form.channel, status: form.status,
      partner_id: form.partner_id || null,
      partner_name: selectedPartner?.name || form.partner_name || null,
      budget: form.budget ? parseFloat(form.budget) : null,
      start_date: form.start_date || null, end_date: form.end_date || null,
      target_geos: form.target_geos ? form.target_geos.split(",").map(g => g.trim()).filter(Boolean) : null,
      tracking_url: form.tracking_url || null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (editCamp) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("campaigns") as any)
          .update(payload).eq("id", editCamp.id)
          .select("*, creator:created_by(full_name,username)").single();
        if (error) throw new Error(error.message);
        setCampaigns(prev => prev.map(c => c.id === editCamp.id ? data : c));
        // ✅ Show success message
        setSuccessMessage("Campaign updated successfully!");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("campaigns") as any)
          .insert(payload)
          .select("*, creator:created_by(full_name,username)").single();
        if (error) throw new Error(error.message);
        setCampaigns(prev => [data, ...prev]);
        // ✅ Show success message
        setSuccessMessage(`Campaign "${form.name}" created successfully!`);
      }
      setModalOpen(false); setEditCamp(null);
      // ✅ Show success toast
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteCamp) return;
    setDeleteLoading(true); setDeleteError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("campaigns") as any).delete().eq("id", deleteCamp.id);
      if (error) throw new Error(error.message);
      setCampaigns(prev => prev.filter(c => c.id !== deleteCamp.id));
      setDeleteCamp(null); setDrawer(null);
      // ✅ Show success message
      setSuccessMessage("Campaign deleted successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ✅ Success Message Toast */}
      {showSuccess && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 shadow-lg">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-900">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Campaigns</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {filtered.length} of {campaigns.length} · {stats.active} active
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
            <Plus className="h-4 w-4" /> New Campaign
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-4">
        {([
          ["Total",       stats.total,                   Megaphone,   "blue"],
          ["Active",      stats.active,                  TrendingUp,  "emerald"],
          ["Total Clicks",stats.clicks.toLocaleString(), Target,      "purple"],
          ["Conversions", stats.conversions.toLocaleString(), Users,  "amber"],
        ] as [string, string|number, React.ElementType, string][]).map(([l,v,Icon,c]) => (
          <div key={l as string} className="premium-card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              c==="emerald"?"bg-emerald-50 text-emerald-600":
              c==="purple" ?"bg-purple-50 text-purple-600" :
              c==="amber"  ?"bg-amber-50 text-amber-600"   :
                             "bg-blue-50 text-blue-600"
            }`}><Icon className="h-4 w-4" /></div>
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
          <input type="text" placeholder="Search campaigns or partner…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="field focus:field-focus pl-9" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CampaignStatus | "all")}
          className="field focus:field-focus w-auto min-w-[140px]">
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                {["Campaign","Partner","Channel","Created By","Budget","Clicks","FTDs","Status","Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:5}).map((_,i)=>(
                <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded"/></td></tr>
              )) : filtered.length===0 ? (
                <tr><td colSpan={9} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No campaigns found</td></tr>
              ) : filtered.slice((page - 1) * pageSize, page * pageSize).map(c => (
                <tr key={c.id}
                  onClick={() => setDrawer(c)}
                  className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)] cursor-pointer transition-colors group">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--color-text-heading)]">{c.name}</p>
                    {c.description && <p className="text-xs text-[var(--color-text-muted)] truncate max-w-[160px]">{c.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">{c.partner_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs capitalize text-[var(--color-text-secondary)]">{c.channel}</td>
                  <td className="px-4 py-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(c.creator as any)?.full_name
                      ? <div>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <p className="text-xs font-medium text-[var(--color-text-body)]">{(c.creator as any).full_name}</p>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <p className="text-[10px] text-[var(--color-text-muted)]">@{(c.creator as any).username}</p>
                        </div>
                      : <span className="text-xs text-[var(--color-text-muted)]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-body)]">{c.budget ? fmt(c.budget) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-body)]">{(c.clicks||0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-[var(--color-text-heading)]">{c.ftds||0}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_COLOR[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 flex-wrap">
                      <button onClick={(e)=>{e.stopPropagation();openEdit(c);}} title="Edit"
                        className="p-1.5 rounded hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)]">
                        <Edit className="h-3.5 w-3.5"/>
                      </button>
                      {c.status==="active" && (
                        <button onClick={(e)=>{e.stopPropagation();setStatus(c.id,"paused");}}
                          className="px-2 py-1 rounded text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium whitespace-nowrap">
                          Pause
                        </button>
                      )}
                      {(c.status==="paused"||c.status==="draft") && (
                        <button onClick={(e)=>{e.stopPropagation();setStatus(c.id,"active");}}
                          className="px-2 py-1 rounded text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium whitespace-nowrap">
                          {c.status==="draft"?"Launch":"Resume"}
                        </button>
                      )}
                      {c.status==="active" && (
                        <button onClick={(e)=>{e.stopPropagation();setStatus(c.id,"completed");}}
                          className="px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium whitespace-nowrap">
                          Complete
                        </button>
                      )}
                      <button onClick={(e)=>{e.stopPropagation();setDeleteCamp(c);}}
                        className="p-1.5 rounded hover:bg-red-50 text-[var(--color-text-muted)] hover:text-red-600" title="Delete">
                        <Trash2 className="h-3.5 w-3.5"/>
                      </button>
                      <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 ml-1 transition-opacity shrink-0"/>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div>

      {/* ── Create / Edit Modal ──────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border-default)]">
              <div>
                <h2 className="text-base font-bold text-[var(--color-text-heading)]">
                  {editCamp ? "Edit Campaign" : "New Campaign"}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {editCamp ? "Update campaign details" : "Create a new marketing campaign"}
                </p>
              </div>
              <button onClick={() => { setModalOpen(false); setEditCamp(null); }}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700">{formError}</p>
                </div>
              )}

              {/* Campaign Info */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Campaign Info</p>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-body)] mb-1.5">Campaign Name *</label>
                  <input type="text" value={form.name}
                    onChange={e => { setForm(f=>({...f,name:e.target.value})); setFormError(null); }}
                    className="field focus:field-focus" placeholder="UK Christmas Promo 2026" autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-body)] mb-1.5">Description</label>
                  <textarea value={form.description}
                    onChange={e => setForm(f=>({...f,description:e.target.value}))}
                    className="field focus:field-focus resize-none" rows={2}
                    placeholder="Campaign objectives and details…" />
                </div>
              </div>

              {/* Setup */}
              <div className="rounded-xl border border-[var(--color-border-subtle)] p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Setup</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-body)] mb-1.5">Partner</label>
                    <select value={form.partner_id}
                      onChange={e => {
                        const p = partners.find(x => x.id === e.target.value);
                        setForm(f=>({...f, partner_id: e.target.value, partner_name: p?.name ?? ""}));
                      }}
                      className="field focus:field-focus text-xs">
                      <option value="">No partner</option>
                      {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-body)] mb-1.5">Channel</label>
                    <select value={form.channel}
                      onChange={e => setForm(f=>({...f,channel:e.target.value as CampaignChannel}))}
                      className="field focus:field-focus text-xs capitalize">
                      {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-body)] mb-1.5">Status</label>
                    <select value={form.status}
                      onChange={e => setForm(f=>({...f,status:e.target.value as CampaignStatus}))}
                      className="field focus:field-focus text-xs">
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-body)] mb-1.5">Budget ($)</label>
                    <input type="text" inputMode="decimal" value={form.budget}
                      onChange={e => setForm(f=>({...f,budget:e.target.value}))}
                      className="field focus:field-focus text-xs" placeholder="e.g. 5000" />
                  </div>
                </div>
              </div>

              {/* Targeting */}
              <div className="rounded-xl border border-[var(--color-border-subtle)] p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Targeting & Tracking</p>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-body)] mb-1.5">
                    Target GEOs
                    <span className="ml-1 text-[10px] font-normal text-[var(--color-text-muted)]">comma-separated</span>
                  </label>
                  <input type="text" value={form.target_geos}
                    onChange={e => setForm(f=>({...f,target_geos:e.target.value}))}
                    className="field focus:field-focus text-xs" placeholder="UK, US, CA, DE" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-body)] mb-1.5">Tracking URL</label>
                  <input type="text" value={form.tracking_url}
                    onChange={e => setForm(f=>({...f,tracking_url:e.target.value}))}
                    className="field focus:field-focus text-xs" placeholder="https://track.example.com/?ref=..." />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-body)] mb-1.5">
                    <Calendar className="inline h-3.5 w-3.5 mr-1 text-[var(--color-text-muted)]" />
                    Start Date
                  </label>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm(f=>({...f,start_date:e.target.value}))}
                    className="field focus:field-focus text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-body)] mb-1.5">
                    <Calendar className="inline h-3.5 w-3.5 mr-1 text-[var(--color-text-muted)]" />
                    End Date
                  </label>
                  <input type="date" value={form.end_date}
                    onChange={e => setForm(f=>({...f,end_date:e.target.value}))}
                    className="field focus:field-focus text-xs" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 pb-5">
              <button onClick={() => { setModalOpen(false); setEditCamp(null); }}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-xs font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-xs font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60 flex items-center gap-1.5">
                {saving ? "Saving…" : editCamp ? "Save Changes" : <><Plus className="h-3.5 w-3.5" />Create Campaign</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Drawer ─────────────────────────────────────────────────────── */}
      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={() => setDrawer(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] bg-white shadow-2xl flex flex-col border-l border-[var(--color-border-default)]">

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--color-border-default)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-[var(--color-text-heading)] leading-tight">{drawer.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] capitalize">{drawer.channel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLOR[drawer.status]}`}>
                  {drawer.status}
                </span>
                <button onClick={() => setDrawer(null)}
                  className="p-1.5 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Created by */}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(drawer.creator as any)?.full_name && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Created By</p>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <p className="text-sm font-semibold text-[var(--color-text-heading)]">{(drawer.creator as any).full_name}</p>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <p className="text-xs text-[var(--color-text-muted)]">@{(drawer.creator as any).username}</p>
                </section>
              )}

              {drawer.partner_name && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Partner</p>
                  <p className="text-sm font-semibold text-[var(--color-text-heading)]">{drawer.partner_name}</p>
                </section>
              )}

              {/* Performance */}
              <section className="rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Performance</p>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    ["Clicks",      (drawer.clicks||0).toLocaleString()],
                    ["Registrations",drawer.registrations||0],
                    ["FTDs",        drawer.ftds||0],
                    ["Conversions", drawer.conversions||0],
                    ["NGR",         fmt(drawer.ngr||0)],
                    ["Budget",      drawer.budget ? fmt(drawer.budget) : "—"],
                  ] as [string,string|number][]).map(([l,v]) => (
                    <div key={l}>
                      <p className="text-[10px] text-[var(--color-text-muted)]">{l}</p>
                      <p className="text-sm font-bold text-[var(--color-text-heading)]">{v}</p>
                    </div>
                  ))}
                </div>
              </section>

              {(drawer.start_date || drawer.end_date) && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Timeline</p>
                  <p className="text-sm text-[var(--color-text-body)]">{fmtDate(drawer.start_date)} → {fmtDate(drawer.end_date)}</p>
                </section>
              )}

              {drawer.target_geos && drawer.target_geos.length > 0 && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Target GEOs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {drawer.target_geos.map(g => (
                      <span key={g} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">{g}</span>
                    ))}
                  </div>
                </section>
              )}

              {drawer.tracking_url && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Tracking URL</p>
                  <p className="text-xs text-[var(--color-text-secondary)] break-all">{drawer.tracking_url}</p>
                </section>
              )}

              {drawer.description && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Description</p>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{drawer.description}</p>
                </section>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-[var(--color-border-default)] flex gap-2 flex-wrap">
              <button onClick={() => { openEdit(drawer); setDrawer(null); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                <Edit className="h-4 w-4" /> Edit
              </button>
              {drawer.status === "active" && (
                <button onClick={() => setStatus(drawer.id, "paused")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold hover:bg-amber-100">
                  <Pause className="h-4 w-4" /> Pause
                </button>
              )}
              {(drawer.status === "paused" || drawer.status === "draft") && (
                <button onClick={() => setStatus(drawer.id, "active")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
                  <Play className="h-4 w-4" /> {drawer.status === "draft" ? "Launch" : "Resume"}
                </button>
              )}
              {drawer.status === "active" && (
                <button onClick={() => { setStatus(drawer.id, "completed"); setDrawer(null); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-100">
                  <CheckCircle2 className="h-4 w-4" /> Complete
                </button>
              )}
              <button onClick={() => { setDeleteCamp(drawer); setDrawer(null); }}
                className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      {deleteCamp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-[var(--color-text-heading)]">Delete campaign?</p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                  <strong>{deleteCamp.name}</strong> will be permanently removed.
                </p>
              </div>
            </div>
            {deleteError && (
              <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{deleteError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setDeleteCamp(null); setDeleteError(null); }}
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                {deleteLoading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
