/**
 * RolesPage — Admin creates/manages roles and toggles permissions per role.
 *
 * Layout:
 *   Left column  — role list (create, rename, delete)
 *   Right panel  — permission matrix for selected role
 *                  grouped by category, each row is a toggle switch
 *
 * All writes go through Supabase RPCs defined in 002_roles_permissions.sql:
 *   create_role(name, label, description)
 *   delete_role(name)
 *   update_role_permission(role_name, permission_key, enabled)
 */

import { useCallback, useEffect, useState } from "react";
import {
  Plus, Trash2, ShieldCheck, Edit2, X, Check,
  AlertTriangle, RefreshCw, ChevronRight, Lock,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  label: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
}

interface PermRow {
  permission_key: string;
  enabled: boolean;
}

// ── All permission keys grouped by category ───────────────────────────────────
// Must match the union in permissions.ts

const PERMISSION_GROUPS: { group: string; color: string; perms: { key: string; label: string; description: string }[] }[] = [
  {
    group: "Administration",
    color: "text-red-600 bg-red-50 border-red-200",
    perms: [
      { key: "admin.all", label: "Full Admin Access", description: "Grants all admin capabilities (user management, roles, settings)" },
    ],
  },
  {
    group: "Teams",
    color: "text-blue-600 bg-blue-50 border-blue-200",
    perms: [
      { key: "team.view", label: "View Teams", description: "See team list, members and structure" },
    ],
  },
  {
    group: "Leads",
    color: "text-amber-600 bg-amber-50 border-amber-200",
    perms: [
      { key: "leads.view",   label: "View Leads",   description: "Read leads and pipeline data" },
      { key: "leads.assign", label: "Assign Leads",  description: "Assign or reassign leads to managers" },
    ],
  },
  {
    group: "Partners",
    color: "text-purple-600 bg-purple-50 border-purple-200",
    perms: [
      { key: "partners.view",     label: "View Partners",         description: "Read partner/affiliate profiles" },
      { key: "partners.manage",   label: "Manage Partners",       description: "Create, edit and update partner records" },
      { key: "partners.pipeline", label: "Partner Pipeline",      description: "Access partner onboarding pipeline" },
      { key: "partners.payments", label: "Partner Payments View", description: "View payment history for partners" },
      { key: "partners.security", label: "Partner Security",      description: "View security flags on partners" },
    ],
  },
  {
    group: "Campaigns",
    color: "text-teal-600 bg-teal-50 border-teal-200",
    perms: [
      { key: "campaigns.view", label: "View Campaigns", description: "Read campaign data and performance" },
    ],
  },
  {
    group: "Deals",
    color: "text-indigo-600 bg-indigo-50 border-indigo-200",
    perms: [
      { key: "deals.view",   label: "View Deals",   description: "Read all deal records" },
      { key: "deals.manage", label: "Manage Deals",  description: "Create and update deals" },
    ],
  },
  {
    group: "Payments",
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    perms: [
      { key: "payments.request", label: "Request Payments",  description: "Submit new payment requests" },
      { key: "payments.verify",  label: "Verify Payments",   description: "Mark payments as reviewed" },
      { key: "payments.decide",  label: "Approve / Reject",  description: "Approve or reject payment requests" },
      { key: "payments.history", label: "Payment History",   description: "View full payment audit trail" },
    ],
  },
  {
    group: "Performance & Analytics",
    color: "text-cyan-600 bg-cyan-50 border-cyan-200",
    perms: [
      { key: "performance.view", label: "Performance Reports",   description: "View partner and team performance data" },
      { key: "kpis.view",        label: "KPIs Dashboard",         description: "Access KPI dashboard and goal tracking" },
      { key: "reports.team",     label: "Team Reports",           description: "Access team-level reports" },
      { key: "reports.affiliate",label: "Affiliate Reports",      description: "Access affiliate/partner reports" },
      { key: "reports.finance",  label: "Finance Reports",        description: "Access financial and commission reports" },
    ],
  },
  {
    group: "Tasks",
    color: "text-orange-600 bg-orange-50 border-orange-200",
    perms: [
      { key: "tasks.view",   label: "View Tasks",   description: "Read task list and assignments" },
      { key: "tasks.manage", label: "Manage Tasks",  description: "Create, assign and update tasks" },
    ],
  },
  {
    group: "Security",
    color: "text-rose-600 bg-rose-50 border-rose-200",
    perms: [
      { key: "security.review",  label: "Security Reviews",  description: "View security review queue" },
      { key: "security.decide",  label: "Security Decisions", description: "Approve, flag or reject reviews" },
      { key: "security.history", label: "Security History",   description: "Access full security audit trail" },
    ],
  },
];

const ALL_PERM_KEYS = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key));

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({
  enabled, onChange, disabled = false,
}: {
  enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => !disabled && onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-blue)] focus:ring-offset-1
        ${enabled ? "bg-[var(--color-brand-blue)]" : "bg-gray-200"}
        ${disabled ? "cursor-not-allowed opacity-50" : ""}
      `}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
          ${enabled ? "translate-x-4" : "translate-x-0"}
        `}
      />
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const [roles, setRoles]           = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [permissions, setPermissions]   = useState<Record<string, boolean>>({});
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [toggling, setToggling]         = useState<string | null>(null); // perm key being toggled

  // Create role dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName]       = useState("");
  const [newLabel, setNewLabel]     = useState("");
  const [newDesc, setNewDesc]       = useState("");
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit label dialog
  const [editOpen, setEditOpen]   = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc]   = useState("");
  const [saving, setSaving]       = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [deleteError, setDeleteError]   = useState<string | null>(null);

  // Success messages
  const [success, setSuccess] = useState<string | null>(null);

  // ── Load roles ────────────────────────────────────────────────────────────

  const fetchRoles = useCallback(async () => {
    setLoadingRoles(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("roles") as any)
        .select("*")
        .order("is_system", { ascending: false })
        .order("label");
      
      if (error) {
        console.error("Error fetching roles:", error);
        alert(`Error loading roles: ${error.message}`);
        setRoles([]);
      } else {
        console.log("Fetched roles:", data);
        setRoles(data ?? []);
        // Auto-select first role
        if ((data ?? []).length > 0 && !selectedRole) {
          setSelectedRole((data as Role[])[0]);
        }
      }
    } catch (err) {
      console.error("Exception fetching roles:", err);
      alert(`Failed to load roles: ${err}`);
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  // ── Load permissions for selected role ────────────────────────────────────

  useEffect(() => {
    if (!selectedRole) return;
    setLoadingPerms(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("role_permissions") as any)
      .select("permission_key, enabled")
      .eq("role_id", selectedRole.id)
      .then(({ data, error }: { data: PermRow[] | null; error: any }) => {
        if (error) {
          console.error("Error fetching permissions:", error);
          alert(`Error loading permissions: ${error.message}`);
        } else {
          console.log(`Fetched permissions for ${selectedRole.name}:`, data);
          const map: Record<string, boolean> = {};
          // default everything to false
          ALL_PERM_KEYS.forEach(k => { map[k] = false; });
          // overlay what's in DB
          (data ?? []).forEach(row => { map[row.permission_key] = row.enabled; });
          setPermissions(map);
        }
        setLoadingPerms(false);
      })
      .catch((err: any) => {
        console.error("Exception fetching permissions:", err);
        alert(`Failed to load permissions: ${err}`);
        setLoadingPerms(false);
      });
  }, [selectedRole?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle a permission ───────────────────────────────────────────────────

  const togglePermission = async (permKey: string, newValue: boolean) => {
    if (!selectedRole || toggling) return;
    // Optimistic UI
    setPermissions(prev => ({ ...prev, [permKey]: newValue }));
    setToggling(permKey);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("update_role_permission", {
        p_role_name:      selectedRole.name,
        p_permission_key: permKey,
        p_enabled:        newValue,
      });
      if (error) {
        // Roll back
        setPermissions(prev => ({ ...prev, [permKey]: !newValue }));
        alert(error.message ?? "Failed to update permission.");
      } else {
        // Show success message
        const message = data?.message || `Permission ${newValue ? 'enabled' : 'disabled'} successfully`;
        setSuccess(message);
        setTimeout(() => setSuccess(null), 3000);
        console.log("Permission updated:", data);
      }
    } catch (err) {
      // Roll back on exception
      setPermissions(prev => ({ ...prev, [permKey]: !newValue }));
      console.error("Exception toggling permission:", err);
      alert(`Failed to update permission: ${err}`);
    } finally {
      setToggling(null);
    }
  };

  // ── Create role ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim() || !newLabel.trim()) {
      setCreateError("Name and label are required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("create_role", {
        p_name:        newName.trim().toLowerCase().replace(/\s+/g, "_"),
        p_label:       newLabel.trim(),
        p_description: newDesc.trim(),
      });
      if (error) throw new Error(error.message);
      setCreateOpen(false);
      setNewName(""); setNewLabel(""); setNewDesc("");
      await fetchRoles();
      setSuccess(`Role "${newLabel}" created successfully!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create role.");
    } finally {
      setCreating(false);
    }
  };

  // ── Edit label / description ──────────────────────────────────────────────

  const openEdit = (r: Role) => {
    setEditLabel(r.label);
    setEditDesc(r.description);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!selectedRole || !editLabel.trim()) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("roles") as any)
        .update({ label: editLabel.trim(), description: editDesc.trim(), updated_at: new Date().toISOString() })
        .eq("id", selectedRole.id);
      if (error) throw new Error(error.message);
      const updated = { ...selectedRole, label: editLabel.trim(), description: editDesc.trim() };
      setRoles(prev => prev.map(r => r.id === selectedRole.id ? updated : r));
      setSelectedRole(updated);
      setEditOpen(false);
      setSuccess(`Role "${updated.label}" updated successfully!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete role ───────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("delete_role", {
        p_role_name: deleteTarget.name,
      });
      if (error) throw new Error(error.message);
      setRoles(prev => prev.filter(r => r.id !== deleteTarget.id));
      if (selectedRole?.id === deleteTarget.id) setSelectedRole(null);
      setDeleteTarget(null);
      setSuccess(`Role "${deleteTarget.label}" deleted successfully!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete.");
    } finally {
      setDeleting(false);
    }
  };

  // ── Enabled count for a role ──────────────────────────────────────────────

  const enabledCount = Object.values(permissions).filter(Boolean).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Roles & Permissions</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Create roles and control exactly what each role can access.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchRoles} disabled={loadingRoles}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loadingRoles ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => { setCreateError(null); setCreateOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
            <Plus className="h-4 w-4" />
            New Role
          </button>
        </div>
      </div>

      {/* Success message */}
      {success && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <Check className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium flex-1">{success}</p>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex gap-6 items-start">

        {/* ── Left: Role list ─────────────────────────────────────────────── */}
        <div className="w-72 shrink-0 space-y-2">
          {loadingRoles
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="premium-card p-4 h-16 animate-pulse bg-gray-50" />
              ))
            : roles.map(role => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  className={`w-full text-left premium-card p-4 transition-all ${
                    selectedRole?.id === role.id
                      ? "border-[var(--color-brand-blue)] bg-[var(--color-brand-blue-soft)] shadow-md"
                      : "hover:shadow-md hover:border-[var(--color-border-strong)]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      role.is_system ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                    }`}>
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--color-text-heading)] truncate">
                          {role.label}
                        </p>
                        {role.is_system && (
                          <Lock className="h-3 w-3 text-[var(--color-text-muted)] shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono">{role.name}</p>
                    </div>
                    {selectedRole?.id === role.id && (
                      <ChevronRight className="h-4 w-4 text-[var(--color-brand-blue)] shrink-0" />
                    )}
                  </div>
                </button>
              ))
          }
        </div>

        {/* ── Right: Permission matrix ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {!selectedRole ? (
            <div className="premium-card p-12 text-center">
              <ShieldCheck className="h-10 w-10 text-[var(--color-text-muted)] mx-auto mb-3 opacity-40" />
              <p className="text-[var(--color-text-secondary)]">Select a role to configure its permissions.</p>
            </div>
          ) : (
            <div className="premium-card overflow-hidden">
              {/* Role header */}
              <div className="flex items-start justify-between p-6 border-b border-[var(--color-border-default)]">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-[var(--color-text-heading)]">{selectedRole.label}</h2>
                    {selectedRole.is_system && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                        <Lock className="h-3 w-3" />System role
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-1">{selectedRole.description || "No description."}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    <span className="font-mono">{selectedRole.name}</span>
                    {" · "}
                    <span className="font-semibold text-[var(--color-brand-blue)]">{enabledCount}</span>
                    {" of "}
                    {ALL_PERM_KEYS.length} permissions enabled
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(selectedRole)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] text-sm font-medium text-[var(--color-text-body)] hover:bg-[var(--color-surface-subtle)]">
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  {!selectedRole.is_system && (
                    <button onClick={() => { setDeleteError(null); setDeleteTarget(selectedRole); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {loadingPerms ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-8 bg-gray-50 animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border-subtle)]">
                  {PERMISSION_GROUPS.map(group => (
                    <div key={group.group} className="p-5">
                      {/* Group header */}
                      <div className="flex items-center gap-2 mb-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${group.color}`}>
                          {group.group}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {group.perms.filter(p => permissions[p.key]).length} / {group.perms.length} enabled
                        </span>
                      </div>

                      {/* Permission rows */}
                      <div className="space-y-3">
                        {group.perms.map(perm => {
                          const isEnabled = permissions[perm.key] ?? false;
                          const isLoading = toggling === perm.key;
                          // Admin.all is locked for the admin role and locked-off for others
                          const isAdminAllLocked = perm.key === "admin.all";

                          return (
                            <div key={perm.key}
                              className={`flex items-center justify-between gap-4 py-2 px-3 rounded-lg transition-colors ${
                                isEnabled
                                  ? "bg-[var(--color-brand-blue-soft)]/50"
                                  : "hover:bg-[var(--color-surface-subtle)]"
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`text-sm font-medium ${isEnabled ? "text-[var(--color-text-heading)]" : "text-[var(--color-text-body)]"}`}>
                                    {perm.label}
                                  </p>
                                  <code className="text-[10px] font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 rounded">
                                    {perm.key}
                                  </code>
                                </div>
                                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{perm.description}</p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isLoading && (
                                  <div className="w-3 h-3 border border-[var(--color-brand-blue)] border-t-transparent rounded-full animate-spin" />
                                )}
                                <Toggle
                                  enabled={isEnabled}
                                  onChange={(v) => togglePermission(perm.key, v)}
                                  disabled={isAdminAllLocked && selectedRole.is_system && selectedRole.name === "admin"}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Create Role Dialog ────────────────────────────────────────────── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-heading)]">Create New Role</h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  All permissions will be OFF by default — enable them in the matrix.
                </p>
              </div>
              <button onClick={() => setCreateOpen(false)}
                className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {createError && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{createError}</p>
              )}

              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                  Role Name <span className="text-red-500">*</span>
                  <span className="text-xs font-normal text-[var(--color-text-muted)] ml-1">(slug: lowercase, underscores)</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  className="field focus:field-focus font-mono"
                  placeholder="e.g. senior_manager"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                  Display Label <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  className="field focus:field-focus"
                  placeholder="e.g. Senior Manager"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Description</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  className="field focus:field-focus resize-none"
                  rows={2}
                  placeholder="Brief description of what this role can do…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating}
                className="px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60">
                {creating ? "Creating…" : "Create Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Label Dialog ─────────────────────────────────────────────── */}
      {editOpen && selectedRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <h2 className="text-lg font-bold text-[var(--color-text-heading)]">Edit Role</h2>
              <button onClick={() => setEditOpen(false)}
                className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                  Role Name (slug — cannot be changed)
                </label>
                <input type="text" value={selectedRole.name} disabled
                  className="field opacity-60 cursor-not-allowed font-mono" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Display Label</label>
                <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)}
                  className="field focus:field-focus" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Description</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  className="field focus:field-focus resize-none" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={() => setEditOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button onClick={handleEdit} disabled={saving}
                className="px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text-heading)]">Delete Role</h2>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    Are you sure you want to delete <strong>{deleteTarget.label}</strong>?
                    This cannot be undone. All users must be reassigned first.
                  </p>
                  {deleteError && (
                    <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                      {deleteError}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete Role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
