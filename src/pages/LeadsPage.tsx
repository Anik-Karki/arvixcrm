/**
 * Admin LeadsPage
 *
 * Matches the CRM leads form exactly:
 *   - Same 6 pipeline stages: new → contacted → qualified → negotiating → converted → lost
 *   - Same form fields: name, company, email, phone, country, website, source,
 *     estimated monthly players, notes
 *   - "Convert to Partner" button on qualified + negotiating leads
 *   - Conversion opens the same commission deal form (CPA/RevShare/Hybrid)
 *   - Admin sees ALL leads across all users, with assigned manager column
 *   - Shows which user created/owns the lead
 */

import { useCallback, useEffect, useState } from "react";
import {
  Search, RefreshCw, Plus, Edit, X, UserPlus,
  AlertTriangle, ChevronRight, CheckCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Pagination } from "@/components/Pagination";

// ── Types ─────────────────────────────────────────────────────────────────────

type LeadStatus = "new" | "contacted" | "qualified" | "negotiating" | "converted" | "lost";
type CommissionType = "CPA" | "RevShare" | "Hybrid";

interface Lead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  website_url: string | null;
  status: LeadStatus;
  source: string | null;
  estimated_monthly_players: number | null;
  notes: string | null;
  assigned_to: string | null;
  team_id: string | null;
  created_by: string | null;
  converted_partner_id: string | null;
  created_at: string;
  creator?: { full_name: string; username: string };
  assignee?: { full_name: string; username: string };
}

interface UserRow { id: string; full_name: string; username: string; role: string; }

// ── Constants ──────────────────────────────────────────────────────────────────

// 6 stages — matches CRM exactly
const STAGES: LeadStatus[] = ["new", "contacted", "qualified", "negotiating", "converted", "lost"];

const STAGE_LABEL: Record<LeadStatus, string> = {
  new:        "New",
  contacted:  "Contacted",
  qualified:  "Qualified",
  negotiating:"Negotiating",
  converted:  "Converted",
  lost:       "Lost",
};

const STAGE_COLOR: Record<LeadStatus, string> = {
  new:        "bg-blue-50 text-blue-700 border-blue-200",
  contacted:  "bg-purple-50 text-purple-700 border-purple-200",
  qualified:  "bg-amber-50 text-amber-700 border-amber-200",
  negotiating:"bg-orange-50 text-orange-700 border-orange-200",
  converted:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  lost:       "bg-slate-50 text-slate-500 border-slate-200",
};

const SOURCES = ["Referral", "Inbound", "Outreach", "Event", "Existing Partner", "Cold Outreach", "Conference", "Network"];

const fmt = (n: number) =>
  `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtD = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ── Default forms ─────────────────────────────────────────────────────────────

const defaultForm = () => ({
  name: "", company: "", email: "", phone: "",
  country: "", website_url: "",
  source: "Referral", estimated_monthly_players: "",
  status: "new" as LeadStatus,
  assigned_to: "",
  notes: "",
});

const defaultConvertForm = (lead: Lead) => ({
  commission_model: "CPA" as CommissionType,
  cpa_amount: "",
  revshare_percentage: "",
  rs_calculation_basis: "NGR",
  minimum_ftd: "0",
  payment_cycle: "Weekly",
  deal_start_date: new Date().toISOString().slice(0, 10),
  partner_type: "Review Site",
  payment_method: "Bank Transfer",
  minimum_payout: "100",
  partner_name: lead.company || lead.name,
  partner_email: lead.email || "",
  partner_country: lead.country || "",
  image_url: "", // ✅ NEW: Partner proof image
});

// ── Component ──────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [leads,    setLeads]    = useState<Lead[]>([]);
  const [users,    setUsers]    = useState<UserRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [search,   setSearch]   = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");

  // Create / edit
  const [createOpen, setCreateOpen] = useState(false);
  const [editLead,   setEditLead]   = useState<Lead | null>(null);
  const [form,       setForm]       = useState(defaultForm());
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Detail drawer
  const [drawer, setDrawer] = useState<Lead | null>(null);

  // Convert to Partner
  const [convertLead,  setConvertLead]  = useState<Lead | null>(null);
  const [convertForm,  setConvertForm]  = useState(defaultConvertForm({} as Lead));
  const [converting,   setConverting]   = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, usersRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("leads") as any)
          .select(`
            *,
            creator:created_by ( full_name, username ),
            assignee:assigned_to ( full_name, username )
          `)
          .order("created_at", { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("users") as any)
          .select("id, full_name, username, role")
          .in("role", ["affiliate_manager", "team_leader"])
          .order("full_name"),
      ]);
      setLeads(leadsRes.data ?? []);
      setUsers(usersRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Filtered ─────────────────────────────────────────────────────────────

  const filtered = leads.filter(l => {
    const q = search.toLowerCase();
    const matchQ = !q
      || l.name.toLowerCase().includes(q)
      || (l.company ?? "").toLowerCase().includes(q)
      || (l.email ?? "").toLowerCase().includes(q);
    const matchS = statusFilter === "all" || l.status === statusFilter;
    return matchQ && matchS;
  });

  const stats = {
    total:     leads.length,
    qualified: leads.filter(l => l.status === "qualified" || l.status === "negotiating").length,
    converted: leads.filter(l => l.status === "converted").length,
    lost:      leads.filter(l => l.status === "lost").length,
  };

  // ── Create / Edit ─────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(defaultForm());
    setFormError(null);
    setCreateOpen(true);
  };

  const openEdit = (l: Lead) => {
    setEditLead(l);
    setForm({
      name:                       l.name,
      company:                    l.company ?? "",
      email:                      l.email ?? "",
      phone:                      l.phone ?? "",
      country:                    l.country ?? "",
      website_url:                l.website_url ?? "",
      source:                     l.source ?? "Referral",
      estimated_monthly_players:  String(l.estimated_monthly_players ?? ""),
      status:                     l.status,
      assigned_to:                l.assigned_to ?? "",
      notes:                      l.notes ?? "",
    });
    setFormError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setFormError("Name and email are required.");
      return;
    }
    setSaving(true); setFormError(null);
    const payload = {
      name:                      form.name.trim(),
      company:                   form.company || null,
      email:                     form.email.trim().toLowerCase(),
      phone:                     form.phone || null,
      country:                   form.country || null,
      website_url:               form.website_url || null,
      source:                    form.source || null,
      estimated_monthly_players: form.estimated_monthly_players
        ? parseInt(form.estimated_monthly_players) : null,
      status:                    form.status,
      assigned_to:               form.assigned_to || null,
      notes:                     form.notes || null,
      updated_at:                new Date().toISOString(),
    };
    try {
      if (editLead) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("leads") as any)
          .update(payload).eq("id", editLead.id)
          .select("*, creator:created_by(full_name,username), assignee:assigned_to(full_name,username)")
          .single();
        if (error) throw new Error(error.message);
        setLeads(prev => prev.map(l => l.id === editLead.id ? data : l));
        // ── Audit log ────────────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("activity_logs") as any).insert({
          user_role:      "admin",
          action:         "update_lead",
          entity_type:    "lead",
          entity_id:      editLead.id,
          entity_name:    form.name.trim(),
          previous_value: { name: editLead.name, email: editLead.email, status: editLead.status, assigned_to: editLead.assigned_to },
          new_value:      { name: form.name.trim(), email: form.email, status: form.status, assigned_to: form.assigned_to },
        });
        setSaveSuccess(true);
        setTimeout(() => { setSaveSuccess(false); setEditLead(null); }, 1200);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("leads") as any)
          .insert(payload)
          .select("*, creator:created_by(full_name,username), assignee:assigned_to(full_name,username)")
          .single();
        if (error) throw new Error(error.message);
        setLeads(prev => [data, ...prev]);
        // ── Audit log ────────────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("activity_logs") as any).insert({
          user_role:   "admin",
          action:      "create_lead",
          entity_type: "lead",
          entity_id:   data.id,
          entity_name: form.name.trim(),
          new_value:   { name: form.name.trim(), email: form.email, source: form.source, status: form.status, assigned_to: form.assigned_to },
        });
        setSaveSuccess(true);
        setTimeout(() => { setSaveSuccess(false); setCreateOpen(false); }, 1200);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // ── Advance stage ─────────────────────────────────────────────────────────

  const advanceStage = async (lead: Lead, newStatus: LeadStatus) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("leads") as any)
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", lead.id);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));
  };

  // ── Convert to Partner ────────────────────────────────────────────────────

  const openConvert = (lead: Lead) => {
    setConvertLead(lead);
    setConvertForm(defaultConvertForm(lead));
    setConvertError(null);
  };

  // ✅ NEW: Handle image upload for partner proof
  const handleImageUpload = async (file: File) => {
    if (!file) return;
    
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setConvertError('Please upload a valid image file (JPG, PNG, GIF, or WebP)');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      setConvertError('Image must be smaller than 5MB');
      return;
    }
    
    setUploadingImage(true);
    setConvertError(null);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `partners/${fileName}`;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: uploadError } = await (supabase.storage as any)
        .from('partner-images')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: urlData } = (supabase.storage as any)
        .from('partner-images')
        .getPublicUrl(filePath);
      
      if (urlData?.publicUrl) {
        setConvertForm(prev => ({ ...prev, image_url: urlData.publicUrl }));
      }
    } catch (err) {
      console.error('Image upload error:', err);
      setConvertError('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleConvert = async () => {
    if (!convertLead) return;
    if (!convertForm.partner_name.trim()) { setConvertError("Partner name is required."); return; }
    if (!convertForm.partner_email.trim()) { setConvertError("Partner email is required."); return; }

    setConverting(true); setConvertError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("convert_lead_to_partner", {
        p_lead_id:              convertLead.id,
        p_partner_name:         convertForm.partner_name.trim(),
        p_partner_email:        convertForm.partner_email.trim(),
        p_partner_country:      convertForm.partner_country || "Unknown",
        p_partner_type:         convertForm.partner_type,
        p_commission_type:      convertForm.commission_model,
        p_cpa_amount:           parseFloat(convertForm.cpa_amount) || 0,
        p_revshare_percentage:  parseFloat(convertForm.revshare_percentage) || 0,
        p_rs_calculation_basis: convertForm.rs_calculation_basis,
        p_minimum_ftd:          parseInt(convertForm.minimum_ftd) || 0,
        p_payment_cycle:        convertForm.payment_cycle,
        p_deal_start_date:      convertForm.deal_start_date || null,
        p_minimum_payout:       parseFloat(convertForm.minimum_payout) || 100,
        p_payment_method:       convertForm.payment_method,
        p_notes:                null,
        p_image_url:            convertForm.image_url || null, // ✅ NEW: Include partner proof image
      });
      if (error) throw new Error(error.message);

      // Mark lead converted in local state
      setLeads(prev => prev.map(l =>
        l.id === convertLead.id ? { ...l, status: "converted" as LeadStatus } : l
      ));
      setConvertLead(null);
      // Refresh to pick up converted_partner_id
      await fetchAll();
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Leads</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {stats.total} total · {stats.qualified} in pipeline · <button 
              onClick={() => setStatusFilter("converted")}
              className="hover:text-[var(--color-brand-blue)] hover:underline cursor-pointer font-medium"
            >
              {stats.converted} converted
            </button>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
            <Plus className="h-4 w-4" /> Add Lead
          </button>
        </div>
      </div>

      {/* Stage filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${statusFilter === "all" ? "bg-[var(--color-brand-blue)] text-white border-[var(--color-brand-blue)]" : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border-default)] hover:border-[var(--color-brand-blue)]"}`}>
          All ({leads.length})
        </button>
        {STAGES.map(s => {
          const count = leads.filter(l => l.status === s).length;
          return (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${statusFilter === s ? "bg-[var(--color-brand-blue)] text-white border-[var(--color-brand-blue)]" : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border-default)] hover:border-[var(--color-brand-blue)]"}`}>
              {STAGE_LABEL[s]} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="premium-card p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
          <input type="text" placeholder="Search name, company, email…"
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
                {["Lead","Contact","Country","Source","Est. Players","Stage","Assigned To","Created By","Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-[var(--color-text-secondary)] text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No leads found</td></tr>
              ) : filtered.slice((page - 1) * pageSize, page * pageSize).map(l => (
                <tr key={l.id}
                  onClick={() => setDrawer(l)}
                  className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)] cursor-pointer group">

                  {/* Name + company */}
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--color-text-heading)]">{l.name}</p>
                    {l.company && <p className="text-xs text-[var(--color-text-muted)]">{l.company}</p>}
                  </td>

                  {/* Contact */}
                  <td className="px-4 py-3">
                    <p className="text-xs text-[var(--color-text-body)]">{l.email ?? "—"}</p>
                    {l.phone && <p className="text-xs text-[var(--color-text-muted)]">{l.phone}</p>}
                  </td>

                  <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">{l.country ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">{l.source ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-body)]">
                    {l.estimated_monthly_players?.toLocaleString() ?? "—"}
                  </td>

                  {/* Stage */}
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${STAGE_COLOR[l.status]}`}>
                      {STAGE_LABEL[l.status]}
                    </span>
                  </td>

                  {/* Assigned to */}
                  <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(l.assignee as any)?.full_name ?? <span className="text-[var(--color-text-muted)]">Unassigned</span>}
                  </td>

                  {/* Created by */}
                  <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(l.creator as any)?.full_name ?? "—"}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button onClick={() => openEdit(l)} title="Edit"
                        className="p-1.5 rounded hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)]">
                        <Edit className="h-4 w-4" />
                      </button>

                      {/* Advance stage */}
                      {l.status === "new" && (
                        <button onClick={() => advanceStage(l, "contacted")}
                          className="px-2 py-1 rounded text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium whitespace-nowrap">
                          Mark Contacted
                        </button>
                      )}
                      {l.status === "contacted" && (
                        <button onClick={() => advanceStage(l, "qualified")}
                          className="px-2 py-1 rounded text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium whitespace-nowrap">
                          Mark Qualified
                        </button>
                      )}
                      {l.status === "qualified" && (
                        <button onClick={() => advanceStage(l, "negotiating")}
                          className="px-2 py-1 rounded text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 font-medium whitespace-nowrap">
                          Negotiating
                        </button>
                      )}

                      {/* Convert to Partner — shows on qualified + negotiating */}
                      {(l.status === "qualified" || l.status === "negotiating") && !l.converted_partner_id && (
                        <button onClick={() => openConvert(l)}
                          className="px-2 py-1 rounded text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium flex items-center gap-1 whitespace-nowrap">
                          <UserPlus className="h-3 w-3" /> Convert
                        </button>
                      )}

                      {/* Already converted */}
                      {l.status === "converted" && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Partner created
                          </span>
                          {l.converted_partner_id && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                // Open partner in new tab or show partner info
                                window.open(`/partners?id=${l.converted_partner_id}`, '_blank');
                              }}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                            >
                              View Partner
                            </button>
                          )}
                        </div>
                      )}

                      {/* Mark lost */}
                      {!["converted", "lost"].includes(l.status) && (
                        <button onClick={() => advanceStage(l, "lost")}
                          className="px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100 font-medium whitespace-nowrap">
                          Lost
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

      {/* ── Create / Edit Lead dialog ──────────────────────────────────────── */}
      {(createOpen || editLead) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-heading)]">
                  {editLead ? "Edit Lead" : "Add Lead"}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Leads that reach Qualified or Negotiating can be converted to Partners.
                </p>
              </div>
              <button onClick={() => { setCreateOpen(false); setEditLead(null); }}
                className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {saveSuccess && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="text-sm font-medium text-emerald-700">
                    {editLead ? "Lead updated successfully!" : "Lead created successfully!"}
                  </p>
                </div>
              )}
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Name */}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Contact Name *</label>
                  <input type="text" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="field focus:field-focus" placeholder="John Doe" autoFocus />
                </div>

                {/* Company */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Company</label>
                  <input type="text" value={form.company}
                    onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    className="field focus:field-focus" placeholder="Betting Media Corp" />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Email *</label>
                  <input type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="field focus:field-focus" placeholder="john@example.com" />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Phone</label>
                  <input type="text" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="field focus:field-focus" placeholder="+1 234 567 8900" />
                </div>

                {/* Country */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Country</label>
                  <input type="text" value={form.country}
                    onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="field focus:field-focus" placeholder="US, UK, DE…" />
                </div>

                {/* Website */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Website</label>
                  <input type="text" value={form.website_url}
                    onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
                    className="field focus:field-focus" placeholder="https://example.com" />
                </div>

                {/* Source */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Lead Source</label>
                  <select value={form.source}
                    onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    className="field focus:field-focus">
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Est. Players */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Est. Monthly Players</label>
                  <input type="text" inputMode="decimal" value={form.estimated_monthly_players}
                    onChange={e => setForm(f => ({ ...f, estimated_monthly_players: e.target.value }))}
                    className="field focus:field-focus" placeholder="100" />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Status</label>
                  <select value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as LeadStatus }))}
                    className="field focus:field-focus">
                    {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                  </select>
                </div>

                {/* Assign to manager */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Assign To</label>
                  <select value={form.assigned_to}
                    onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                    className="field focus:field-focus">
                    <option value="">Unassigned</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Notes</label>
                  <textarea value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="field focus:field-focus resize-none" rows={3}
                    placeholder="Additional information about the lead…" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={() => { setCreateOpen(false); setEditLead(null); }}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60">
                {saving ? "Saving…" : editLead ? "Save Changes" : "Add Lead"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Convert to Partner dialog ──────────────────────────────────────── */}
      {convertLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-heading)]">Convert to Partner</h2>
                <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
                  {convertLead.company || convertLead.name} — set the commission deal before converting
                </p>
              </div>
              <button onClick={() => setConvertLead(null)}
                className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {convertError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{convertError}</p>
                </div>
              )}

              {/* Partner info */}
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Partner Info</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Partner Name *</label>
                  <input type="text" value={convertForm.partner_name}
                    onChange={e => setConvertForm(f => ({ ...f, partner_name: e.target.value }))}
                    className="field focus:field-focus" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Email *</label>
                  <input type="email" value={convertForm.partner_email}
                    onChange={e => setConvertForm(f => ({ ...f, partner_email: e.target.value }))}
                    className="field focus:field-focus" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Country</label>
                  <input type="text" value={convertForm.partner_country}
                    onChange={e => setConvertForm(f => ({ ...f, partner_country: e.target.value }))}
                    className="field focus:field-focus" placeholder="US, UK, DE…" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Partner Type</label>
                  <select value={convertForm.partner_type}
                    onChange={e => setConvertForm(f => ({ ...f, partner_type: e.target.value }))}
                    className="field focus:field-focus">
                    {["Review Site","Media Buyer","Content Creator","Influencer","SEO","Social","Email","Network"].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ✅ Account Proof Screenshot */}
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                  Account Proof Screenshot (optional)
                </label>
                <p className="text-xs text-[var(--color-text-muted)] mb-2">
                  JPG, PNG, GIF, or WebP. Max 5MB.
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                  disabled={uploadingImage}
                  className="field focus:field-focus text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {uploadingImage && (
                  <p className="text-xs text-blue-600 mt-2 flex items-center gap-2">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Uploading image...
                  </p>
                )}
                {convertForm.image_url && !uploadingImage && (
                  <div className="mt-3 relative inline-block">
                    <img
                      src={convertForm.image_url}
                      alt="Account proof"
                      className="w-24 h-24 object-cover rounded-lg border-2 border-[var(--color-border-default)]"
                    />
                    <button
                      type="button"
                      onClick={() => setConvertForm(f => ({ ...f, image_url: "" }))}
                      className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg"
                      title="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Deal type */}
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Commission Deal</p>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Deal Type *</label>
                <select value={convertForm.commission_model}
                  onChange={e => setConvertForm(f => ({ ...f, commission_model: e.target.value as CommissionType }))}
                  className="field focus:field-focus">
                  <option value="CPA">CPA — Cost Per Acquisition</option>
                  <option value="RevShare">RevShare — Revenue Share</option>
                  <option value="Hybrid">Hybrid — CPA + RevShare</option>
                </select>
              </div>

              {(convertForm.commission_model === "CPA" || convertForm.commission_model === "Hybrid") && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">CPA Rate ($/FTD)</label>
                    <input type="text" inputMode="decimal" value={convertForm.cpa_amount}
                      onChange={e => setConvertForm(f => ({ ...f, cpa_amount: e.target.value }))}
                      className="field focus:field-focus" placeholder="25" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Min Qualified FTDs</label>
                    <input type="text" inputMode="decimal" value={convertForm.minimum_ftd}
                      onChange={e => setConvertForm(f => ({ ...f, minimum_ftd: e.target.value }))}
                      className="field focus:field-focus" placeholder="0" />
                  </div>
                </div>
              )}

              {(convertForm.commission_model === "RevShare" || convertForm.commission_model === "Hybrid") && (
                <div className="rounded-xl bg-purple-50 border border-purple-200 p-4">
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">RS Rate (%)</label>
                  <input type="text" inputMode="decimal" value={convertForm.revshare_percentage}
                    onChange={e => setConvertForm(f => ({ ...f, revshare_percentage: e.target.value }))}
                    className="field focus:field-focus" placeholder="12" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Payment Cycle</label>
                  <select value={convertForm.payment_cycle}
                    onChange={e => setConvertForm(f => ({ ...f, payment_cycle: e.target.value }))}
                    className="field focus:field-focus">
                    <option value="Weekly">Weekly</option>
                    <option value="Bi-Weekly">Bi-Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Deal Start Date</label>
                  <input type="date" value={convertForm.deal_start_date}
                    onChange={e => setConvertForm(f => ({ ...f, deal_start_date: e.target.value }))}
                    className="field focus:field-focus" />
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-800 space-y-1">
                <p className="font-semibold">This will atomically:</p>
                <p>• Create a new Partner record</p>
                <p>• Create an active {convertForm.commission_model} deal</p>
                <p>• Snapshot rates as Version 1</p>
                <p>• Mark this lead as Converted</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={() => setConvertLead(null)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button onClick={handleConvert} disabled={converting}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2">
                {converting ? "Converting…" : <><UserPlus className="h-4 w-4" /> Convert to Partner</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lead Detail Drawer ─────────────────────────────────────────── */}
      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={() => setDrawer(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] bg-white shadow-2xl flex flex-col border-l border-[var(--color-border-default)]">

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--color-border-default)]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {(drawer.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-[var(--color-text-heading)] text-base leading-tight">{drawer.name}</p>
                  {drawer.company && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{drawer.company}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${STAGE_COLOR[drawer.status]}`}>
                  {STAGE_LABEL[drawer.status]}
                </span>
                <button onClick={() => setDrawer(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Contact */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Contact</p>
                <div className="space-y-2 text-sm">
                  {drawer.email && <p className="text-[var(--color-text-body)]">{drawer.email}</p>}
                  {drawer.phone && <p className="text-[var(--color-text-muted)]">{drawer.phone}</p>}
                  {drawer.country && <p className="text-[var(--color-text-muted)]">{drawer.country}</p>}
                  {drawer.website_url && <p className="text-[var(--color-text-muted)] truncate">{drawer.website_url}</p>}
                </div>
              </section>

              {/* Lead details */}
              <section className="rounded-xl bg-[var(--color-surface-subtle)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Lead Details</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">Source</p><p className="font-semibold">{drawer.source ?? "—"}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">Est. Players/mo</p><p className="font-semibold">{drawer.estimated_monthly_players?.toLocaleString() ?? "—"}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">Created</p><p className="font-semibold">{fmtD(drawer.created_at)}</p></div>
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Status</p>
                    {drawer.status === "converted" ? (
                      <div className="flex flex-col gap-1">
                        <p className="font-semibold text-emerald-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Converted
                        </p>
                        {drawer.converted_partner_id && (
                          <button
                            onClick={() => window.open(`/partners?id=${drawer.converted_partner_id}`, '_blank')}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium underline text-left"
                          >
                            View Partner →
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="font-semibold">In Progress</p>
                    )}
                  </div>
                </div>
              </section>

              {/* Assignment */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Assignment</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Assigned to:</span>
                    <span className="font-medium text-[var(--color-text-body)]">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(drawer.assignee as any)?.full_name ?? "Unassigned"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Created by:</span>
                    <span className="font-medium text-[var(--color-text-body)]">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(drawer.creator as any)?.full_name ?? "—"}
                    </span>
                  </div>
                </div>
              </section>

              {/* Notes */}
              {drawer.notes && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Notes</p>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{drawer.notes}</p>
                </section>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--color-border-default)] flex gap-2">
              {(drawer.status === "qualified" || drawer.status === "negotiating") && !drawer.converted_partner_id && (
                <button
                  onClick={() => { openConvert(drawer); setDrawer(null); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
                  <UserPlus className="h-4 w-4" /> Convert to Partner
                </button>
              )}
              <button
                onClick={() => { openEdit(drawer); setDrawer(null); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
                <Edit className="h-4 w-4" /> Edit Lead
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
    </div>
  );
}
