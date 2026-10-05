/**
 * Admin PartnersPage
 * Matches CRM field set exactly. Admin sees ALL partners with manager/team/type filters.
 * CRUD: create, edit, pause, activate, suspend (with reason), delete.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Search, RefreshCw, Plus, Edit, Pause, Play, Ban, X,
  Globe, Trash2, UserCheck, AlertTriangle, UserCircle, CheckCircle2,
  ChevronRight, Mail, Phone, MapPin, Users, Building2, Calendar,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Pagination } from "@/components/Pagination";

// ── Types ─────────────────────────────────────────────────────────────────────
type PartnerStatus  = "active"|"onboarding"|"negotiation"|"paused"|"suspended"|"prospect"|"terminated";
type RiskLevel      = "low"|"medium"|"high";
type CommissionType = "CPA"|"RevShare"|"Hybrid";

interface Partner {
  id: string; affiliate_id: string; name: string; company_name: string|null;
  email: string; telegram: string|null; phone: string|null;
  partner_type: string; commission_model: CommissionType;
  cpa_amount: number; revshare_percentage: number;
  status: PartnerStatus; risk_level: RiskLevel|null;
  country: string|null; geo: string|null;
  assigned_manager_id: string|null; assigned_team_id: string|null;
  payment_method: string|null; minimum_payout: number|null;
  notes: string|null; created_at: string; updated_at: string;
  manager?: { full_name: string; username: string };
  team?:    { name: string };
}

interface UserRow { id: string; full_name: string; username: string; role: string; }
interface TeamRow { id: string; name: string; }

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<PartnerStatus, string> = {
  active:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  onboarding:  "bg-blue-50 text-blue-700 border-blue-200",
  negotiation: "bg-purple-50 text-purple-700 border-purple-200",
  paused:      "bg-amber-50 text-amber-700 border-amber-200",
  suspended:   "bg-red-50 text-red-700 border-red-200",
  prospect:    "bg-slate-50 text-slate-600 border-slate-200",
  terminated:  "bg-zinc-50 text-zinc-500 border-zinc-200",
};
const RISK_COLOR: Record<string, string> = {
  low:  "bg-emerald-50 text-emerald-700",
  medium:"bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
};
const PARTNER_TYPES = ["Media Buyer","Review Site","Content Creator","Influencer","SEO","Social","Email","Network"];
const PAYMENT_METHODS = ["USDT TRC20","USDT BEP20","USDT ERC20","BTC","Bank Transfer","PayPal","Skrill","Neteller","Other"];

const fmt = (n: number) => `$${(n||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2})}`;

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [users,    setUsers]    = useState<UserRow[]>([]);
  const [teams,    setTeams]    = useState<TeamRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Filters
  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState<PartnerStatus|"all">("all");
  const [typeFilter,     setTypeFilter]      = useState("all");
  const [managerFilter,  setManagerFilter]   = useState("all");
  const [riskFilter,     setRiskFilter]      = useState("all");
  const [sourceFilter,   setSourceFilter]    = useState("all"); // ✅ NEW: Source filter

  // Create/Edit
  const [createOpen, setCreateOpen] = useState(false);
  const [editPartner, setEditPartner] = useState<Partner|null>(null);
  const [form, setForm] = useState({
    // Partner info
    name:"", company_name:"", email:"", telegram:"", phone:"",
    partner_type:"Review Site",
    country:"", geo:"",
    assigned_manager_id:"", assigned_team_id:"",
    payment_method:"Bank Transfer", minimum_payout:"100",
    notes:"",
    image_url:"", // ✅ NEW: Partner image URL
    // Deal / commission config — creates a deal record alongside the partner
    commission_model:"CPA" as CommissionType,
    cpa_amount:"",
    revshare_percentage:"",
    rs_calculation_basis:"NGR",
    minimum_ftd:"0",
    payment_cycle:"Weekly",
    deal_status:"active",
    deal_start_date: new Date().toISOString().slice(0, 10),
    deal_end_date:"",
  });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string|null>(null);
  const [success, setSuccess] = useState(false); // ✅ NEW: Success state

  // ✅ NEW: Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);

  // Suspend dialog
  const [suspendTarget, setSuspendTarget] = useState<Partner|null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Partner|null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // Detail drawer
  const [drawer, setDrawer] = useState<Partner|null>(null);
  
  // ✅ NEW: Image preview modal
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [pRes, uRes, tRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("partners") as any)
        .select("*, creation_source, manager:users!partners_assigned_manager_id_fkey(full_name,username), team:teams(name)")
        .order("created_at", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("users") as any).select("id,full_name,username,role").in("role",["affiliate_manager","team_leader","admin"]).order("full_name"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("teams") as any).select("id,name").order("name"),
    ]);
    setPartners(pRes.data ?? []);
    setUsers(uRes.data ?? []);
    setTeams(tRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Filtered ───────────────────────────────────────────────────────────────
  const filtered = partners.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q)
      || p.email.toLowerCase().includes(q)
      || p.affiliate_id?.toLowerCase().includes(q)
      || p.manager?.full_name?.toLowerCase().includes(q);
    const matchS = statusFilter === "all" || p.status === statusFilter;
    const matchT = typeFilter   === "all" || p.partner_type === typeFilter;
    const matchM = managerFilter=== "all" || p.assigned_manager_id === managerFilter;
    const matchR = riskFilter   === "all" || p.risk_level === riskFilter;
    const matchSrc = sourceFilter === "all" 
      || (sourceFilter === "lead_converted" && (p as any).creation_source === "lead_converted")
      || (sourceFilter === "direct" && (p as any).creation_source !== "lead_converted");
    return matchQ && matchS && matchT && matchM && matchR && matchSrc;
  });

  const stats = {
    total:   partners.length,
    active:  partners.filter(p=>p.status==="active").length,
    paused:  partners.filter(p=>p.status==="paused").length,
    highRisk:partners.filter(p=>p.risk_level==="high").length,
  };

  // ── Status helpers ──────────────────────────────────────────────────────────
  const setStatus = async (id: string, status: PartnerStatus) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("partners") as any).update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setPartners(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  };

  const handleSuspend = async () => {
    if (!suspendTarget || !suspendReason.trim()) return;
    await setStatus(suspendTarget.id, "suspended");
    // Log reason in notes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("partners") as any)
      .update({ notes: `[SUSPENDED] ${suspendReason}\n${suspendTarget.notes||""}`.trim(), updated_at: new Date().toISOString() })
      .eq("id", suspendTarget.id);
    setSuspendTarget(null); setSuspendReason("");
  };

  // ── Create / Edit ──────────────────────────────────────────────────────────
  // ✅ NEW: Handle image upload
  const handleImageUpload = async (file: File) => {
    if (!file) return;
    
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Please upload a valid image file (JPG, PNG, GIF, or WebP)');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB');
      return;
    }
    
    setUploadingImage(true);
    setError(null);
    
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
        setForm(prev => ({ ...prev, image_url: urlData.publicUrl }));
      }
    } catch (err) {
      console.error('Image upload error:', err);
      setError('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.email) { setError("Name and email required."); return; }
    setSaving(true); setError(null);
    const payload = {
      name: form.name, company_name: form.company_name||null, email: form.email,
      telegram: form.telegram||form.phone||null,
      partner_type: form.partner_type,
      // Store commission model on partner for backwards compat
      commission_model: form.commission_model,
      cpa_amount: parseFloat(form.cpa_amount)||0,
      revshare_percentage: parseFloat(form.revshare_percentage)||0,
      country: form.country||null, geo: form.geo||null,
      assigned_manager_id: form.assigned_manager_id||null,
      assigned_team_id: form.assigned_team_id||null,
      payment_method: form.payment_method||null,
      minimum_payout: parseFloat(form.minimum_payout)||100,
      notes: form.notes||null,
      image_url: form.image_url||null, // ✅ NEW: Save partner image
      updated_at: new Date().toISOString(),
    };
    try {
      let partnerId: string;

      if (editPartner) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: err } = await (supabase.from("partners") as any)
          .update(payload).eq("id", editPartner.id)
          .select("*, manager:users!partners_assigned_manager_id_fkey(full_name,username), team:teams(name)").single();
        if (err) throw new Error(err.message);
        setPartners(prev => prev.map(p => p.id === editPartner.id ? data : p));
        setEditPartner(null);
        partnerId = editPartner.id;
        // ── Audit log ────────────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("activity_logs") as any).insert({
          user_role:      "admin",
          action:         "update_partner",
          entity_type:    "partner",
          entity_id:      editPartner.id,
          entity_name:    form.name,
          previous_value: { name: editPartner.name, commission_model: editPartner.commission_model, cpa_amount: editPartner.cpa_amount, revshare_percentage: editPartner.revshare_percentage, assigned_manager_id: editPartner.assigned_manager_id },
          new_value:      { name: form.name, commission_model: form.commission_model, cpa_amount: form.cpa_amount, revshare_percentage: form.revshare_percentage, assigned_manager_id: form.assigned_manager_id },
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: err } = await (supabase.from("partners") as any)
          .insert({ ...payload, status: "active", risk_level: "low" })
          .select("*, manager:users!partners_assigned_manager_id_fkey(full_name,username), team:teams(name)").single();
        if (err) throw new Error(err.message);
        setPartners(prev => [data, ...prev]);
        setCreateOpen(false);
        partnerId = data.id;
        // ── Audit log ────────────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("activity_logs") as any).insert({
          user_role:   "admin",
          action:      "create_partner",
          entity_type: "partner",
          entity_id:   data.id,
          entity_name: form.name,
          new_value:   { name: form.name, email: form.email, commission_model: form.commission_model, cpa_amount: form.cpa_amount, revshare_percentage: form.revshare_percentage, assigned_manager_id: form.assigned_manager_id, assigned_team_id: form.assigned_team_id },
        });
      }

      // ── Create / update the deal record for this partner ────────────────
      // This mirrors what the CRM app.partners.tsx does so the commission
      // calculation engine always has a deal to work from.
      const dealPayload = {
        partner_id:           partnerId,
        partner_name:         form.name,
        title:                `${form.name} — ${form.commission_model} Deal`,
        owner_id:             form.assigned_manager_id || null,
        team_id:              form.assigned_team_id || null,
        commission_type:      form.commission_model,
        cpa_amount:           parseFloat(form.cpa_amount) || 0,
        revshare_percentage:  parseFloat(form.revshare_percentage) || 0,
        rs_calculation_basis: form.rs_calculation_basis,
        minimum_ftd:          parseInt(form.minimum_ftd) || 0,
        payment_cycle:        form.payment_cycle,
        currency:             "USD",
        minimum_payout:       parseFloat(form.minimum_payout) || 100,
        deal_status:          form.deal_status,
        deal_start_date:      form.deal_start_date || null,
        deal_end_date:        form.deal_end_date || null,
        stage:                "active",
        updated_at:           new Date().toISOString(),
      };

      if (editPartner) {
        // Update the existing active deal for this partner
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("deals") as any)
          .update(dealPayload)
          .eq("partner_id", partnerId)
          .eq("deal_status", "active");
      } else {
        // Insert new deal — trigger auto-creates deal_version snapshot
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("deals") as any).insert(dealPayload);
      }

      resetForm();
      // ✅ Show success message
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setSaving(false); }
  };

  const resetForm = () => setForm({
    name:"", company_name:"", email:"", telegram:"", phone:"",
    partner_type:"Review Site", commission_model:"CPA",
    cpa_amount:"", revshare_percentage:"",
    rs_calculation_basis:"NGR", minimum_ftd:"0",
    payment_cycle:"Weekly", deal_status:"active",
    deal_start_date: new Date().toISOString().slice(0, 10), deal_end_date:"",
    country:"", geo:"",
    assigned_manager_id:"", assigned_team_id:"",
    payment_method:"Bank Transfer", minimum_payout:"100", notes:"",
    image_url:"",
  });

  const openCreate = () => { resetForm(); setError(null); setCreateOpen(true); };
  const openEdit   = async (p: Partner) => {
    setEditPartner(p);
    setError(null);
    // Base values from partner row
    const base = {
      name: p.name, company_name: p.company_name ?? "", email: p.email,
      telegram: "", phone: p.telegram ?? "",
      partner_type: p.partner_type, commission_model: p.commission_model,
      cpa_amount: String(p.cpa_amount || ""), revshare_percentage: String(p.revshare_percentage || ""),
      rs_calculation_basis: "NGR", minimum_ftd: "0",
      payment_cycle: "Weekly", deal_status: "active",
      deal_start_date: new Date().toISOString().slice(0, 10), deal_end_date: "",
      country: p.country ?? "", geo: p.geo ?? "",
      assigned_manager_id: p.assigned_manager_id ?? "",
      assigned_team_id: p.assigned_team_id ?? "",
      payment_method: p.payment_method ?? "Bank Transfer",
      minimum_payout: String(p.minimum_payout || 100), notes: p.notes ?? "",
      image_url: (p as any).image_url ?? "",
    };
    // Fetch the active deal to load the real commission config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deal } = await (supabase.from("deals") as any)
      .select("commission_type,cpa_amount,revshare_percentage,rs_calculation_basis,minimum_ftd,payment_cycle,deal_status,deal_start_date,deal_end_date")
      .eq("partner_id", p.id)
      .eq("deal_status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (deal) {
      base.commission_model     = deal.commission_type        ?? base.commission_model;
      base.cpa_amount           = String(deal.cpa_amount      ?? base.cpa_amount);
      base.revshare_percentage  = String(deal.revshare_percentage ?? base.revshare_percentage);
      base.rs_calculation_basis = deal.rs_calculation_basis   ?? base.rs_calculation_basis;
      base.minimum_ftd          = String(deal.minimum_ftd     ?? "0");
      base.payment_cycle        = deal.payment_cycle          ?? base.payment_cycle;
      base.deal_status          = deal.deal_status            ?? "active";
      base.deal_start_date      = deal.deal_start_date        ?? base.deal_start_date;
      base.deal_end_date        = deal.deal_end_date          ?? "";
    }
    setForm(base);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: err } = await (supabase.from("partners") as any).delete().eq("id", deleteTarget.id);
      if (err) throw new Error(err.message);
      setPartners(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed."); }
    finally { setDeleting(false); }
  };

  // ── Commission display helper ──────────────────────────────────────────────
  const commissionLabel = (p: Partner) => {
    if (p.commission_model === "CPA")      return `${fmt(p.cpa_amount)} CPA`;
    if (p.commission_model === "RevShare") return `${p.revshare_percentage}% RS`;
    return `${fmt(p.cpa_amount)} + ${p.revshare_percentage}%`;
  };

  // ── Form section helper ─────────────────────────────────────────────────────
  const field = (label: string, key: keyof typeof form, type = "text", className = "") => (
    <div className={className}>
      <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">{label}</label>
      <input type={type} value={form[key] as string} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className="field focus:field-focus"/>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Partners</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {filtered.length} of {partners.length} partners
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
            <Plus className="h-4 w-4"/>Add Partner
          </button>
        </div>
      </div>

      {/* ✅ Success Toast */}
      {success && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 border-2 border-green-500 shadow-lg">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-sm font-semibold text-green-700">
              Partner saved successfully!
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Total",stats.total,"blue"],["Active",stats.active,"green"],["Paused",stats.paused,"orange"],["High Risk",stats.highRisk,"red"]].map(([l,v,c])=>(
          <div key={l as string} className="premium-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c==="green"?"bg-emerald-50 text-emerald-600":c==="orange"?"bg-amber-50 text-amber-600":c==="red"?"bg-red-50 text-red-600":"bg-blue-50 text-blue-600"}`}>
              <Globe className="h-5 w-5"/>
            </div>
            <div><p className="text-xl font-bold text-[var(--color-text-heading)]">{v}</p><p className="text-xs text-[var(--color-text-secondary)]">{l}</p></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="premium-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, email, affiliate ID, manager…" className="field focus:field-focus pl-9"/>
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as any)} className="field focus:field-focus">
          <option value="all">All Statuses</option>
          {(["active","onboarding","negotiation","paused","suspended","prospect","terminated"] as PartnerStatus[]).map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={managerFilter} onChange={e=>setManagerFilter(e.target.value)} className="field focus:field-focus">
          <option value="all">All Managers</option>
          {users.filter(u=>["affiliate_manager","team_leader"].includes(u.role)).map(u=><option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>)}
        </select>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="field focus:field-focus">
          <option value="all">All Types</option>
          {PARTNER_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)} className="field focus:field-focus">
          <option value="all">All Sources</option>
          <option value="lead_converted">From Lead</option>
          <option value="direct">Direct Entry</option>
        </select>
      </div>

      {/* Table */}
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                {["Partner","Type","Commission","GEO","Manager","Team","Min Payout","Risk","Status","Actions"].map(h=>(
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:5}).map((_,i)=>(
                <tr key={i}><td colSpan={10} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded"/></td></tr>
              )) : filtered.length===0 ? (
                <tr><td colSpan={10} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No partners found</td></tr>
              ) : filtered.slice((page - 1) * pageSize, page * pageSize).map(p=>(
                <tr key={p.id}
                  onClick={() => setDrawer(p)}
                  className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)] cursor-pointer transition-colors group"
                >
                  <td className="px-3 py-3">
                    <p className="font-medium text-[var(--color-text-heading)]">{p.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{p.affiliate_id}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{p.email}</p>
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">{p.partner_type}</td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-medium text-[var(--color-text-heading)]">{commissionLabel(p)}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">{p.geo || p.country || "—"}</td>
                  <td className="px-3 py-3">
                    {p.manager ? (
                      <div>
                        <p className="text-sm text-[var(--color-text-body)]">{p.manager.full_name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">@{p.manager.username}</p>
                      </div>
                    ) : <span className="text-xs text-[var(--color-text-muted)]">Unassigned</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">{p.team?.name ?? "—"}</td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-body)]">{p.minimum_payout ? fmt(p.minimum_payout) : "—"}</td>
                  <td className="px-3 py-3">
                    {p.risk_level ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_COLOR[p.risk_level]}`}>{p.risk_level}</span> : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_COLOR[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={(e)=>{e.stopPropagation();openEdit(p);}} title="Edit" className="p-1.5 rounded hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)]"><Edit className="h-3.5 w-3.5"/></button>
                      {p.status==="active"  && <button onClick={(e)=>{e.stopPropagation();setStatus(p.id,"paused");}}  title="Pause"    className="p-1.5 rounded hover:bg-amber-50 text-[var(--color-text-secondary)] hover:text-amber-600"><Pause className="h-3.5 w-3.5"/></button>}
                      {p.status==="paused"  && <button onClick={(e)=>{e.stopPropagation();setStatus(p.id,"active");}}  title="Activate" className="p-1.5 rounded hover:bg-emerald-50 text-[var(--color-text-secondary)] hover:text-emerald-600"><Play className="h-3.5 w-3.5"/></button>}
                      {p.status!=="active" && p.status!=="suspended" && <button onClick={(e)=>{e.stopPropagation();setStatus(p.id,"active");}} title="Activate" className="p-1.5 rounded hover:bg-emerald-50 text-[var(--color-text-secondary)] hover:text-emerald-600"><UserCheck className="h-3.5 w-3.5"/></button>}
                      {p.status!=="suspended" && <button onClick={(e)=>{e.stopPropagation();setSuspendTarget(p);setSuspendReason("");}} title="Suspend" className="p-1.5 rounded hover:bg-red-50 text-[var(--color-text-secondary)] hover:text-red-600"><Ban className="h-3.5 w-3.5"/></button>}
                      <button onClick={(e)=>{e.stopPropagation();setDeleteTarget(p);}} title="Delete" className="p-1.5 rounded hover:bg-red-50 text-[var(--color-text-secondary)] hover:text-red-600"><Trash2 className="h-3.5 w-3.5"/></button>
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

      {/* ── Partner Detail Drawer ─────────────────────────────────────────── */}
      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={()=>setDrawer(null)}/>
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] bg-white shadow-2xl flex flex-col border-l border-[var(--color-border-default)]">
            <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--color-border-default)]">
              <div className="flex items-center gap-3">
                {/* Keep initials avatar - image is proof, not logo */}
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--color-brand-gold)] to-amber-500 flex items-center justify-center text-[#081A33] font-bold text-base shrink-0">
                  {(drawer.name||"?").slice(0,2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-[var(--color-text-heading)] text-base leading-tight">{drawer.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{drawer.affiliate_id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLOR[drawer.status]}`}>{drawer.status}</span>
                <button onClick={()=>setDrawer(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]"><X className="h-4 w-4"/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Contact</p>
                <div className="space-y-2">
                  {drawer.email && <div className="flex items-center gap-2.5 text-sm"><Mail className="h-4 w-4 text-[var(--color-text-muted)] shrink-0"/><span>{drawer.email}</span></div>}
                  {drawer.telegram && <div className="flex items-center gap-2.5 text-sm"><Phone className="h-4 w-4 text-[var(--color-text-muted)] shrink-0"/><span>{drawer.telegram}</span></div>}
                  {drawer.country && <div className="flex items-center gap-2.5 text-sm"><MapPin className="h-4 w-4 text-[var(--color-text-muted)] shrink-0"/><span>{drawer.country}</span></div>}
                  {drawer.company_name && <div className="flex items-center gap-2.5 text-sm"><Building2 className="h-4 w-4 text-[var(--color-text-muted)] shrink-0"/><span>{drawer.company_name}</span></div>}
                </div>
              </section>
              <section className="rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Commission</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-[10px] text-[var(--color-text-muted)] mb-1">Type</p><span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700">{drawer.commission_model}</span></div>
                  <div><p className="text-[10px] text-[var(--color-text-muted)] mb-1">Rate</p><p className="text-sm font-bold text-[var(--color-text-heading)]">{commissionLabel(drawer)}</p></div>
                  <div><p className="text-[10px] text-[var(--color-text-muted)] mb-1">Type</p><p className="text-xs">{drawer.partner_type}</p></div>
                  <div><p className="text-[10px] text-[var(--color-text-muted)] mb-1">Min Payout</p><p className="text-xs font-semibold">{drawer.minimum_payout ? fmt(drawer.minimum_payout) : "—"}</p></div>
                </div>
              </section>
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Assignment</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5"><Users className="h-4 w-4 text-[var(--color-text-muted)] shrink-0"/><div><p className="text-[10px] text-[var(--color-text-muted)]">Manager</p><p className="text-sm font-medium">{drawer.manager?.full_name ?? "Unassigned"}</p></div></div>
                  {drawer.team?.name && <div className="flex items-center gap-2.5"><Globe className="h-4 w-4 text-[var(--color-text-muted)] shrink-0"/><div><p className="text-[10px] text-[var(--color-text-muted)]">Team</p><p className="text-sm font-medium">{drawer.team.name}</p></div></div>}
                </div>
              </section>
              {/* ✅ TWO-COLUMN LAYOUT: Assignment/Timeline on LEFT, Proof Image on RIGHT */}
              <section className="grid grid-cols-2 gap-4">
                {/* Left Column: Timeline */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Timeline</p>
                  <div className="flex items-center gap-2.5 text-sm"><Calendar className="h-4 w-4 text-[var(--color-text-muted)] shrink-0"/><div><p className="text-[10px] text-[var(--color-text-muted)]">Created</p><p className="text-sm">{new Date(drawer.created_at).toLocaleDateString()}</p></div></div>
                </div>
                {/* Right Column: Proof Image */}
                {(drawer as any).image_url && <div><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Account Proof</p><button onClick={()=>setImagePreview((drawer as any).image_url)} className="block w-full rounded-lg overflow-hidden border-2 border-[var(--color-border-default)] hover:border-[var(--color-brand-gold)] transition-colors cursor-pointer group" title="Click to view full size"><img src={(drawer as any).image_url} alt="Partner account proof" className="w-full h-auto object-contain bg-gray-50 group-hover:opacity-90 transition-opacity"/></button><p className="text-xs text-[var(--color-text-muted)] mt-1 text-center">Click to enlarge</p></div>}
              </section>
              {drawer.notes && <section><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Notes</p><p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{drawer.notes}</p></section>}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border-default)] flex gap-2">
              <button onClick={()=>{openEdit(drawer);setDrawer(null);}}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
                <Edit className="h-4 w-4"/> Edit Partner
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ── Create / Edit Dialog ──────────────────────────────────────── */}
      {(createOpen || editPartner) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <h2 className="text-lg font-bold text-[var(--color-text-heading)]">{editPartner?"Edit Partner":"Add Partner"}</h2>
              <button onClick={()=>{setCreateOpen(false);setEditPartner(null);}} className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]"><X className="h-4 w-4"/></button>
            </div>
            <div className="p-6 space-y-5">
              {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</p>}

              {/* ── Partner Info ──────────────────────────────────────────── */}
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Partner Info</p>
              <div className="grid grid-cols-2 gap-4">
                {field("Partner Name *", "name", "text", "col-span-2")}
                {field("Company Name",   "company_name")}
                {field("Email *",        "email", "email")}
                {field("Phone / Telegram", "phone")}
                {field("Country",        "country")}
                {field("GEO",            "geo")}
                
                {/* ✅ Image upload field with thumbnail */}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                    Account Proof Screenshot (optional)
                  </label>
                  
                  <div className="flex items-start gap-4">
                    {/* Preview thumbnail */}
                    <div className="flex-shrink-0">
                      {form.image_url ? (
                        <div className="relative group">
                          <img 
                            src={form.image_url} 
                            alt="Partner logo" 
                            className="w-24 h-24 object-cover rounded-lg border-2 border-[var(--color-border-default)]"
                          />
                          <button
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, image_url: '' }))}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove image"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-lg border-2 border-dashed border-[var(--color-border-default)] flex items-center justify-center bg-[var(--color-surface-subtle)]">
                          <UserCircle className="h-12 w-12 text-[var(--color-text-muted)]" />
                        </div>
                      )}
                    </div>
                    
                    {/* Upload button */}
                    <div className="flex-1">
                      <label className="cursor-pointer">
                        <div className="field focus:field-focus flex items-center justify-center gap-2 text-center hover:bg-[var(--color-surface-subtle)] transition-colors">
                          {uploadingImage ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span>Uploading...</span>
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" />
                              <span>{form.image_url ? 'Change Image' : 'Upload Image'}</span>
                            </>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(file);
                          }}
                          disabled={uploadingImage}
                          className="hidden"
                        />
                      </label>
                      <p className="text-xs text-[var(--color-text-muted)] mt-2">
                        JPG, PNG, GIF, or WebP. Max 5MB.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Commission / Deal ─────────────────────────────────────── */}
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Commission Deal</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Deal Type *</label>
                  <select value={form.commission_model}
                    onChange={e => setForm(p => ({ ...p, commission_model: e.target.value as CommissionType }))}
                    className="field focus:field-focus">
                    <option value="CPA">CPA — Cost Per Acquisition</option>
                    <option value="RevShare">RevShare — Revenue Share</option>
                    <option value="Hybrid">Hybrid — CPA + RevShare</option>
                  </select>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {form.commission_model === "CPA"      && "Commission = Qualified FTDs × CPA Rate"}
                    {form.commission_model === "RevShare" && "Commission = Eligible Revenue × RS%"}
                    {form.commission_model === "Hybrid"   && "Commission = (FTDs × CPA Rate) + (Revenue × RS%)"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Deal Status</label>
                  <select value={form.deal_status}
                    onChange={e => setForm(p => ({ ...p, deal_status: e.target.value }))}
                    className="field focus:field-focus">
                    <option value="active">Active — earns commission</option>
                    <option value="draft">Draft — not yet earning</option>
                    <option value="paused">Paused — temporarily stopped</option>
                  </select>
                </div>
              </div>

              {(form.commission_model === "CPA" || form.commission_model === "Hybrid") && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-3">
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">CPA Configuration</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">CPA Rate ($ per qualified FTD) *</label>
                      <input type="text" inputMode="decimal" value={form.cpa_amount}
                        onChange={e => setForm(p => ({ ...p, cpa_amount: e.target.value }))}
                        className="field focus:field-focus" placeholder="e.g. 25.00" />
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">Amount paid per qualified First-Time Deposit</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Minimum Qualified FTDs</label>
                      <input type="text" inputMode="decimal" value={form.minimum_ftd}
                        onChange={e => setForm(p => ({ ...p, minimum_ftd: e.target.value }))}
                        className="field focus:field-focus" placeholder="0" />
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">Minimum FTDs before any CPA is earned (0 = no minimum)</p>
                    </div>
                  </div>
                </div>
              )}

              {(form.commission_model === "RevShare" || form.commission_model === "Hybrid") && (
                <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 space-y-3">
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">RevShare Configuration</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">RevShare Rate (%) *</label>
                      <input type="text" inputMode="decimal" value={form.revshare_percentage}
                        onChange={e => setForm(p => ({ ...p, revshare_percentage: e.target.value }))}
                        className="field focus:field-focus" placeholder="e.g. 12.00" />
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">Percentage of eligible revenue paid as commission</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">RS Basis</label>
                      <select value={form.rs_calculation_basis}
                        onChange={e => setForm(p => ({ ...p, rs_calculation_basis: e.target.value }))}
                        className="field focus:field-focus">
                        <option value="NGR">NGR (Net Gaming Revenue)</option>
                        <option value="GGR">GGR (Gross Gaming Revenue)</option>
                        <option value="Eligible Revenue">Eligible Revenue</option>
                        <option value="Gross Revenue">Gross Revenue</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Payment Cycle</label>
                  <select value={form.payment_cycle}
                    onChange={e => setForm(p => ({ ...p, payment_cycle: e.target.value }))}
                    className="field focus:field-focus">
                    <option value="Weekly">Weekly</option>
                    <option value="Bi-Weekly">Bi-Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Deal Start Date</label>
                  <input type="date" value={form.deal_start_date}
                    onChange={e => setForm(p => ({ ...p, deal_start_date: e.target.value }))}
                    className="field focus:field-focus" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Deal End Date <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></label>
                  <input type="date" value={form.deal_end_date}
                    min={form.deal_start_date}
                    onChange={e => setForm(p => ({ ...p, deal_end_date: e.target.value }))}
                    className="field focus:field-focus" />
                </div>
              </div>

              {/* ── Partner Type & Payment ─────────────────────────────────── */}
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Type & Payment</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Partner Type</label>
                  <select value={form.partner_type}
                    onChange={e => setForm(p => ({ ...p, partner_type: e.target.value }))}
                    className="field focus:field-focus">
                    {PARTNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Payment Method</label>
                  <select value={form.payment_method}
                    onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
                    className="field focus:field-focus">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Minimum Payout ($)</label>
                  <input type="text" inputMode="decimal" value={form.minimum_payout}
                    onChange={e => setForm(p => ({ ...p, minimum_payout: e.target.value }))}
                    className="field focus:field-focus" placeholder="100" />
                </div>
              </div>

              {/* ── Assignment (Admin-only section) ───────────────────────── */}
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Assignment</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                    Assigned Manager
                    <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">(affiliate manager or team leader)</span>
                  </label>
                  <select value={form.assigned_manager_id}
                    onChange={e => setForm(p => ({ ...p, assigned_manager_id: e.target.value }))}
                    className="field focus:field-focus">
                    <option value="">Unassigned</option>
                    {users.filter(u => ["affiliate_manager","team_leader"].includes(u.role)).map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Assigned Team</label>
                  <select value={form.assigned_team_id}
                    onChange={e => setForm(p => ({ ...p, assigned_team_id: e.target.value }))}
                    className="field focus:field-focus">
                    <option value="">No Team</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              {/* ── Notes ─────────────────────────────────────────────────── */}
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Notes</label>
                <textarea value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="field focus:field-focus resize-none" rows={3} />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={()=>{setCreateOpen(false);setEditPartner(null);}} className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60">
                {saving?"Saving…":editPartner?"Save Changes":"Add Partner"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Suspend Dialog ────────────────────────────────────────────── */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0"><Ban className="h-5 w-5 text-red-600"/></div>
              <div><p className="font-bold text-[var(--color-text-heading)]">Suspend {suspendTarget.name}?</p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">Provide a reason for suspension.</p>
              </div>
            </div>
            <textarea value={suspendReason} onChange={e=>setSuspendReason(e.target.value)} className="field focus:field-focus resize-none w-full" rows={3} placeholder="Reason for suspension…"/>
            <div className="flex gap-3 mt-4">
              <button onClick={()=>setSuspendTarget(null)} className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">Cancel</button>
              <button onClick={handleSuspend} disabled={!suspendReason.trim()} className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">Suspend</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Dialog ─────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0"><AlertTriangle className="h-5 w-5 text-red-600"/></div>
              <div><p className="font-bold text-[var(--color-text-heading)]">Delete {deleteTarget.name}?</p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">This permanently removes the partner. Cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={()=>setDeleteTarget(null)} className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">{deleting?"Deleting…":"Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Image Preview Modal */}
      {imagePreview && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setImagePreview(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setImagePreview(null)}
              className="absolute -top-12 right-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Close preview"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={imagePreview}
              alt="Partner image preview"
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
