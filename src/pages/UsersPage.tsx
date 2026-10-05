/**
 * UsersPage — full user management with:
 *  • Create user → success dialog with copyable credentials
 *  • User detail drawer (click any row) — full profile + last login + all actions
 *  • Edit user (name, username, phone, role, status, team)
 *  • Activate / Suspend / Deactivate with confirmation
 *  • Reset password → shows new credentials dialog
 */

import { useCallback, useEffect, useState } from "react";
import {
  Search, UserPlus, RefreshCw, Edit, Ban, CheckCircle,
  Copy, Eye, Pause, Shield, X, KeyRound, CheckCircle2,
  AlertTriangle, Clock, Mail, Phone, User as UserIcon,
  Calendar, ArrowRight, ChevronRight, Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Pagination } from "@/components/Pagination";

// ── Types ──────────────────────────────────────────────────────────────────────

type Role   = "admin" | "team_leader" | "affiliate_manager" | "finance" | "security";
type Status = "active" | "inactive" | "suspended" | "pending";

interface User {
  id: string; email: string; full_name: string; username: string;
  phone: string; role: Role; team_id: string | null; status: Status;
  last_login: string | null; created_at: string; updated_at: string;
}

interface Credentials { username: string; email?: string; temporaryPassword: string; }

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin", team_leader: "Team Leader",
  affiliate_manager: "Affiliate Manager", finance: "Finance", security: "Security",
};

const ROLE_COLOR: Record<Role, string> = {
  admin:             "bg-red-50 text-red-700 border-red-200",
  team_leader:       "bg-blue-50 text-blue-700 border-blue-200",
  affiliate_manager: "bg-purple-50 text-purple-700 border-purple-200",
  finance:           "bg-emerald-50 text-emerald-700 border-emerald-200",
  security:          "bg-orange-50 text-orange-700 border-orange-200",
};

const STATUS_COLOR: Record<Status, string> = {
  active:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive:  "bg-slate-50 text-slate-600 border-slate-200",
  suspended: "bg-amber-50 text-amber-700 border-amber-200",
  pending:   "bg-blue-50 text-blue-700 border-blue-200",
};

const STATUS_ICON: Record<Status, React.ReactNode> = {
  active:    <CheckCircle2 className="h-3 w-3" />,
  inactive:  <Ban className="h-3 w-3" />,
  suspended: <Pause className="h-3 w-3" />,
  pending:   <Clock className="h-3 w-3" />,
};

// ── Edge Function callers ──────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated.");
  return session.access_token;
}

const FN_BASE = `${import.meta.env["VITE_SUPABASE_URL"]}/functions/v1`;
const ANON    = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string;

async function callFn(name: string, body: object): Promise<any> {
  const token = await getToken();
  let res: Response;
  try {
    res = await fetch(`${FN_BASE}/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": ANON,
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    // Network/CORS error — the request may have still succeeded server-side.
    // Throw with a clear message so the UI can distinguish this from a real failure.
    throw new Error("NETWORK_ERROR");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any).error ?? `${name} failed`);
  return json;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "w-7 h-7 text-[10px]" : size === "lg" ? "w-12 h-12 text-base" : "w-9 h-9 text-xs";
  return (
    <div className={`${s} rounded-xl bg-gradient-to-br from-[var(--color-brand-gold)] to-amber-500 flex items-center justify-center text-[#081A33] font-bold shrink-0`}>
      {(name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium border ${color}`}>{label}</span>;
}

function ConfirmModal({ title, body, danger, onConfirm, onCancel, loading }: {
  title: string; body: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${danger ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-[var(--color-text-heading)]">{title}</p>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{body}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600"}`}>
            {loading ? "Working…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers]     = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [search, setSearch]   = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");

  // Create
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", username: "", phone: "", role: "affiliate_manager" as Role });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Credentials (shown after create OR reset)
  const [creds, setCreds]           = useState<(Credentials & { isReset?: boolean }) | null>(null);
  const [credsCopied, setCredsCopied] = useState(false);

  // Drawer
  const [drawer, setDrawer]   = useState<User | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Confirm
  const [confirm, setConfirm] = useState<{ action: () => Promise<void>; title: string; body: string; danger?: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Reset password
  const [resetting, setResetting] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("users") as any)
      .select("*").order("created_at", { ascending: false });
    setUsers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || u.full_name?.toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q)
      || u.username?.toLowerCase().includes(q);
    const matchR = roleFilter === "all" || u.role === roleFilter;
    return matchQ && matchR;
  });

  const stats = {
    total:     users.length,
    active:    users.filter(u => u.status === "active").length,
    suspended: users.filter(u => u.status === "suspended").length,
    inactive:  users.filter(u => u.status === "inactive").length,
  };

  // ── Create user ────────────────────────────────────────────────────────────

  // ── Create user via RPC (no Edge Function needed) ─────────────────────────

  const handleCreate = async () => {
    if (!form.email || !form.name || !form.username || !form.role) {
      setCreateError("Email, name, username, and role are required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      // Call the admin_create_user SQL function directly
      // It runs SECURITY DEFINER server-side — generates password, creates auth user + profile
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("admin_create_user", {
        p_email:    form.email.trim().toLowerCase(),
        p_name:     form.name.trim(),
        p_username: form.username.trim().toLowerCase(),
        p_phone:    form.phone.trim(),
        p_role:     form.role,
        p_team_id:  null,
      });

      if (error) throw new Error(error.message);
      if (!data)  throw new Error("No data returned from user creation");

      const result = data as {
        user: { id: string; email: string; name: string; username: string; role: string; status: string };
        credentials: { username: string; email: string; temporaryPassword: string };
      };

      // Add to local list
      setUsers(prev => [{
        id:         result.user.id,
        email:      result.user.email,
        full_name:  result.user.name,
        username:   result.user.username,
        phone:      form.phone,
        role:       result.user.role as Role,
        team_id:    null,
        status:     "active" as Status,
        last_login: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, ...prev]);

      setCreateOpen(false);
      setForm({ email: "", name: "", username: "", phone: "", role: "affiliate_manager" });
      // Show credentials with username, email, and generated password
      setCreds({
        username:          result.credentials.username,
        email:             result.credentials.email,
        temporaryPassword: result.credentials.temporaryPassword,
        isReset:           false,
      });

    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create user.");
    } finally {
      setCreating(false);
    }
  };

  // ── Status change ──────────────────────────────────────────────────────────

  const changeStatus = async (userId: string, status: Status) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("users") as any)
      .update({ status, updated_at: new Date().toISOString() }).eq("id", userId);
    if (error) throw new Error(error.message);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
    if (drawer?.id === userId) setDrawer(prev => prev ? { ...prev, status } : null);
  };

  const askStatus = (user: User, status: Status) => {
    const labels: Record<Status, string> = { active: "activate", inactive: "deactivate", suspended: "suspend", pending: "set pending" };
    const danger = status === "inactive";
    setConfirm({
      title:  `${labels[status].charAt(0).toUpperCase() + labels[status].slice(1)} ${user.full_name}?`,
      body:   `This will ${labels[status]} the account. You can change it again at any time.`,
      danger,
      action: () => changeStatus(user.id, status),
    });
  };

  // ── Reset password via RPC ─────────────────────────────────────────────────

  const handleResetPassword = async (user: User) => {
    setResetting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("admin_reset_password", {
        p_user_id: user.id,
      });
      if (error) throw new Error(error.message);
      setCreds({
        username:          data.credentials.username,
        email:             user.email,
        temporaryPassword: data.credentials.temporaryPassword,
        isReset:           true,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to reset password.");
    } finally {
      setResetting(false);
    }
  };

  // Delete permanently via RPC ───────────────────────────────────────

  // Delete success state
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  // Edit success state
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const handleDeleteUser = (user: User) => {
    setConfirm({
      title:  `Permanently delete ${user.full_name}?`,
      body:   `This will permanently delete ${user.email} from both the database and authentication. This action CANNOT be undone.`,
      danger: true,
      action: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.rpc as any)("admin_delete_user", {
          p_user_id: user.id,
        });
        if (error) throw new Error(error.message);
        if (data?.success) {
          setUsers(prev => prev.filter(u => u.id !== user.id));
          setDrawer(null);
          setDeleteSuccess(`${user.full_name} (${user.email}) has been permanently deleted.`);
          setTimeout(() => setDeleteSuccess(null), 5000);
        }
      },
    });
  };

  // ── Save edit ──────────────────────────────────────────────────────────────

  const handleSaveEdit = async () => {
    if (!drawer) return;
    setSaving(true);
    setSaveError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("users") as any)
        .update({
          full_name:  editForm.full_name,
          username:   editForm.username,
          phone:      editForm.phone,
          role:       editForm.role,
          status:     editForm.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", drawer.id)
        .select().single();
      if (error) throw new Error(error.message);
      setUsers(prev => prev.map(u => u.id === drawer.id ? data : u));
      setDrawer(data);
      setEditMode(false);
      setEditSuccess(`${data.full_name} updated successfully!`);
      setTimeout(() => setEditSuccess(null), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // ── Confirm runner ─────────────────────────────────────────────────────────

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirming(true);
    try { await confirm.action(); setConfirm(null); }
    catch (e) { alert(e instanceof Error ? e.message : "Action failed."); }
    finally { setConfirming(false); }
  };

  // ── Copy credentials ────────────────────────────────────────────────────────

  const copyCreds = (c: Credentials) => {
    const text = c.temporaryPassword.startsWith("⚠")
      ? `Username: ${c.username}${c.email ? `\nEmail: ${c.email}` : ""}\nPassword: unavailable — please reset from admin panel`
      : `Username: ${c.username}${c.email ? `\nEmail: ${c.email}` : ""}\nPassword: ${c.temporaryPassword}`;
    navigator.clipboard.writeText(text);
    setCredsCopied(true);
    setTimeout(() => setCredsCopied(false), 2500);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">User Management</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {stats.total} total · {stats.active} active · {stats.suspended} suspended
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchUsers} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => { setCreateError(null); setCreateOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
            <UserPlus className="h-4 w-4" />
            Add User
          </button>
        </div>
      </div>

      {/* ── Delete success toast ────────────────────────────────────────── */}
      {deleteSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium flex-1">{deleteSuccess}</p>
          <button onClick={() => setDeleteSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Edit success toast ────────────────────────────────────────── */}
      {editSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium flex-1">{editSuccess}</p>
          <button onClick={() => setEditSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total",     val: stats.total,     color: "bg-blue-50 text-blue-600",    icon: <UserIcon className="h-4 w-4" /> },
          { label: "Active",    val: stats.active,    color: "bg-emerald-50 text-emerald-600", icon: <CheckCircle2 className="h-4 w-4" /> },
          { label: "Suspended", val: stats.suspended, color: "bg-amber-50 text-amber-600",  icon: <Pause className="h-4 w-4" /> },
          { label: "Inactive",  val: stats.inactive,  color: "bg-slate-50 text-slate-600",  icon: <Ban className="h-4 w-4" /> },
        ].map(k => (
          <div key={k.label} className="premium-card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${k.color}`}>{k.icon}</div>
            <div>
              <p className="text-xl font-bold text-[var(--color-text-heading)]">{k.val}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="premium-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
          <input type="text" placeholder="Search name, email or username…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="field focus:field-focus pl-9" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as any)}
          className="field focus:field-focus w-auto min-w-[160px]">
          <option value="all">All Roles</option>
          {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                {["User", "Email", "Role", "Status", "Last Login", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
                  ))
                : filtered.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No users found</td></tr>
                  : filtered.slice((page - 1) * pageSize, page * pageSize).map(u => (
                    <tr key={u.id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)] transition-colors group cursor-pointer"
                      onClick={() => { setDrawer(u); setEditMode(false); setSaveError(null); }}>
                      {/* Name */}
                      <td className="px-4 py-3">
                        <button className="flex items-center gap-3 text-left w-full"
                          onClick={() => { setDrawer(u); setEditMode(false); setSaveError(null); }}>
                          <Avatar name={u.full_name ?? u.email} />
                          <div>
                            <p className="font-medium text-[var(--color-text-heading)] group-hover:text-[var(--color-brand-blue)] transition-colors">
                              {u.full_name}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">@{u.username}</p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-body)]">{u.email}</td>
                      <td className="px-4 py-3"><Pill label={ROLE_LABELS[u.role]} color={ROLE_COLOR[u.role]} /></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium border ${STATUS_COLOR[u.status]}`}>
                          {STATUS_ICON[u.status]}{u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">
                        {u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {/* Suspend / Activate */}
                          {u.status === "active"
                            ? <button onClick={() => askStatus(u, "suspended")} title="Suspend"
                                className="p-1.5 rounded hover:bg-amber-50 text-[var(--color-text-secondary)] hover:text-amber-600">
                                <Pause className="h-4 w-4" />
                              </button>
                            : <button onClick={() => askStatus(u, "active")} title="Activate"
                                className="p-1.5 rounded hover:bg-emerald-50 text-[var(--color-text-secondary)] hover:text-emerald-600">
                                <CheckCircle className="h-4 w-4" />
                              </button>
                          }
                          {/* Deactivate */}
                          {u.status !== "inactive" &&
                            <button onClick={() => askStatus(u, "inactive")} title="Deactivate"
                              className="p-1.5 rounded hover:bg-red-50 text-[var(--color-text-secondary)] hover:text-red-600">
                              <Ban className="h-4 w-4" />
                            </button>
                          }
                          {/* Reset password */}
                          <button onClick={() => handleResetPassword(u)} disabled={resetting}
                            title="Reset Password"
                            className="p-1.5 rounded hover:bg-purple-50 text-[var(--color-text-secondary)] hover:text-purple-600 disabled:opacity-40">
                            <KeyRound className="h-4 w-4" />
                          </button>
                          {/* Delete permanently */}
                          <button onClick={() => handleDeleteUser(u)}
                            title="Delete permanently"
                            className="p-1.5 rounded hover:bg-red-50 text-[var(--color-text-secondary)] hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
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

      {/* ══════════════════════════════════════════════════════════════════
          CREATE USER DIALOG
      ══════════════════════════════════════════════════════════════════ */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-heading)]">Create New User</h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">A temporary password will be generated. Admin session stays unchanged.</p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {createError && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{createError}</p>}

              <div className="grid grid-cols-2 gap-4">
                {([
                  ["name",     "Full Name *",  "text",  "John Doe"],
                  ["email",    "Email *",      "email", "john@example.com"],
                  ["username", "Username *",   "text",  "johndoe"],
                  ["phone",    "Phone",        "text",  "+1 234 567 8900"],
                ] as [keyof typeof form, string, string, string][]).map(([field, label, type, ph]) => (
                  <div key={field} className={field === "name" || field === "email" ? "col-span-2" : ""}>
                    <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">{label}</label>
                    <input type={type} placeholder={ph}
                      value={form[field]}
                      onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                      className="field focus:field-focus" />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Role *</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as Role }))}
                  className="field focus:field-focus">
                  {(Object.entries(ROLE_LABELS) as [Role, string][]).filter(([v]) => v !== "admin").map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">Cancel</button>
              <button onClick={handleCreate} disabled={creating}
                className="px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60">
                {creating ? "Creating…" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CREDENTIALS SUCCESS DIALOG (after create OR reset)
      ══════════════════════════════════════════════════════════════════ */}
      {creds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            {/* Header */}
            <div className="p-6 border-b border-[var(--color-border-default)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text-heading)]">
                    {creds.isReset ? "Password Reset" : "User Created"} ✓
                  </h2>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    Send these credentials to the user. The password cannot be recovered.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Credential box */}
              <div className="rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border-default)] p-4 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Username</p>
                  <p className="font-mono text-base font-bold text-[var(--color-text-heading)] select-all">{creds.username}</p>
                </div>
                {creds.email && (
                  <div className="border-t border-[var(--color-border-subtle)] pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Email</p>
                    <p className="font-mono text-sm font-bold text-[var(--color-text-heading)] select-all">{creds.email}</p>
                  </div>
                )}
                <div className="border-t border-[var(--color-border-subtle)] pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Temporary Password</p>
                  {creds.temporaryPassword.startsWith("⚠") ? (
                    <p className="text-sm text-amber-700 font-medium">Password unavailable — use Reset Password in the user's profile.</p>
                  ) : (
                    <p className="font-mono text-base font-bold text-[var(--color-text-heading)] break-all select-all">{creds.temporaryPassword}</p>
                  )}
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <Shield className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Save or copy these credentials now. Once you close this dialog they cannot be retrieved.
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => copyCreds(creds)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                <Copy className="h-4 w-4" />
                {credsCopied ? "Copied!" : "Copy All"}
              </button>
              <button onClick={() => { setCreds(null); setCredsCopied(false); }}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          USER DETAIL DRAWER
      ══════════════════════════════════════════════════════════════════ */}
      {drawer && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => { setDrawer(null); setEditMode(false); }} />

          {/* Drawer panel */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-white shadow-2xl flex flex-col">

            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border-default)]">
              <div className="flex items-center gap-3">
                <Avatar name={drawer.full_name ?? drawer.email} size="lg" />
                <div>
                  <p className="font-bold text-[var(--color-text-heading)]">{drawer.full_name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">@{drawer.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!editMode && (
                  <button onClick={() => { setEditMode(true); setEditForm({ ...drawer }); setSaveError(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] text-sm font-medium text-[var(--color-text-body)] hover:bg-[var(--color-surface-subtle)]">
                    <Edit className="h-3.5 w-3.5" />Edit
                  </button>
                )}
                <button onClick={() => { setDrawer(null); setEditMode(false); }}
                  className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Drawer body — scrollable */}
            <div className="flex-1 overflow-y-auto">

              {editMode ? (
                /* ── Edit form ─────────────────────────────────────────── */
                <div className="p-6 space-y-4">
                  <p className="text-sm font-semibold text-[var(--color-text-heading)]">Edit User</p>

                  {saveError && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{saveError}</p>}

                  {([
                    ["full_name", "Full Name"],
                    ["username",  "Username"],
                    ["phone",     "Phone"],
                  ] as [keyof User, string][]).map(([field, label]) => (
                    <div key={field}>
                      <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">{label}</label>
                      <input type="text"
                        value={(editForm[field] as string) ?? ""}
                        onChange={e => setEditForm(p => ({ ...p, [field]: e.target.value }))}
                        className="field focus:field-focus" />
                    </div>
                  ))}

                  <div>
                    <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Role</label>
                    <select value={editForm.role ?? ""} onChange={e => setEditForm(p => ({ ...p, role: e.target.value as Role }))}
                      className="field focus:field-focus">
                      {(Object.entries(ROLE_LABELS) as [Role, string][]).filter(([v]) => v !== "admin").map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Status</label>
                    <select value={editForm.status ?? ""} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as Status }))}
                      className="field focus:field-focus">
                      {(["active", "inactive", "suspended"] as Status[]).map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

              ) : (
                /* ── View mode ─────────────────────────────────────────── */
                <div className="p-6 space-y-6">

                  {/* Status + role chips */}
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${STATUS_COLOR[drawer.status]}`}>
                      {STATUS_ICON[drawer.status]}
                      {drawer.status.charAt(0).toUpperCase() + drawer.status.slice(1)}
                    </span>
                    <Pill label={ROLE_LABELS[drawer.role]} color={ROLE_COLOR[drawer.role]} />
                  </div>

                  {/* Info grid */}
                  <div className="space-y-3">
                    {[
                      { icon: <Mail className="h-4 w-4" />,     label: "Email",      val: drawer.email },
                      { icon: <UserIcon className="h-4 w-4" />, label: "Username",   val: `@${drawer.username}` },
                      { icon: <Phone className="h-4 w-4" />,    label: "Phone",      val: drawer.phone || "—" },
                      { icon: <Clock className="h-4 w-4" />,    label: "Last Login", val: drawer.last_login ? new Date(drawer.last_login).toLocaleString() : "Never" },
                      { icon: <Calendar className="h-4 w-4" />, label: "Created",    val: new Date(drawer.created_at).toLocaleDateString() },
                    ].map(row => (
                      <div key={row.label} className="flex items-center gap-3 py-2 border-b border-[var(--color-border-subtle)] last:border-0">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-subtle)] flex items-center justify-center text-[var(--color-text-muted)] shrink-0">
                          {row.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[var(--color-text-muted)]">{row.label}</p>
                          <p className="text-sm font-medium text-[var(--color-text-heading)] truncate">{row.val}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action section */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Actions</p>
                    <div className="space-y-2">

                      {/* Reset password */}
                      <button onClick={() => handleResetPassword(drawer)} disabled={resetting}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--color-border-default)] hover:bg-[var(--color-surface-subtle)] transition-colors disabled:opacity-50 text-left">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                          <KeyRound className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-[var(--color-text-heading)]">Reset Password</p>
                          <p className="text-xs text-[var(--color-text-muted)]">Generate a new temporary password</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)]" />
                      </button>

                      {/* Suspend / Activate */}
                      {drawer.status === "active" ? (
                        <button onClick={() => askStatus(drawer, "suspended")}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 hover:bg-amber-50 transition-colors text-left">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <Pause className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-amber-800">Suspend Account</p>
                            <p className="text-xs text-amber-600">Temporarily block access</p>
                          </div>
                        </button>
                      ) : drawer.status === "suspended" || drawer.status === "inactive" ? (
                        <button onClick={() => askStatus(drawer, "active")}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 hover:bg-emerald-50 transition-colors text-left">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-emerald-800">Activate Account</p>
                            <p className="text-xs text-emerald-600">Restore full access</p>
                          </div>
                        </button>
                      ) : null}

                      {/* Deactivate */}
                      {drawer.status !== "inactive" && (
                        <button onClick={() => askStatus(drawer, "inactive")}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 hover:bg-red-50 transition-colors text-left">
                          <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                            <Ban className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-red-800">Deactivate Account</p>
                            <p className="text-xs text-red-500">Permanently disable — can be re-activated</p>
                          </div>
                        </button>
                      )}

                      {/* Permanent delete */}
                      <button onClick={() => handleDeleteUser(drawer)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-300 hover:bg-red-50 transition-colors text-left mt-4">
                        <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-red-800">Delete Permanently</p>
                          <p className="text-xs text-red-500">Removes from database and authentication. Cannot be undone.</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer footer — edit mode save/cancel */}
            {editMode && (
              <div className="px-6 py-4 border-t border-[var(--color-border-default)] flex gap-3">
                <button onClick={() => setEditMode(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                  Cancel
                </button>
                <button onClick={handleSaveEdit} disabled={saving}
                  className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60">
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Confirm modal ────────────────────────────────────────────────── */}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          body={confirm.body}
          danger={confirm.danger}
          loading={confirming}
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
