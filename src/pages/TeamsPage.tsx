/**
 * TeamsPage — Admin manages teams and team membership.
 *
 * Features:
 *   • Create / edit / deactivate teams
 *   • Click a team card → right panel opens with:
 *       - Member list (name, role, joined date)
 *       - Set Team Leader (one user per team)
 *       - Add Member — picker from existing users not yet in a team
 *       - Remove Member — move user back to no-team
 */

import { useCallback, useEffect, useState } from "react";
import {
  Users, RefreshCw, Plus, X, Edit, ChevronRight,
  UserPlus, Trash2, AlertTriangle, Crown, UserMinus,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Team {
  id: string;
  name: string;
  description: string | null;
  team_leader_id: string | null;
  status: "active" | "inactive";
  created_at: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  username: string;
  email: string;
  role: string;
  team_id: string | null;
}

const ROLE_COLOR: Record<string, string> = {
  admin:             "bg-red-50 text-red-700",
  team_leader:       "bg-blue-50 text-blue-700",
  affiliate_manager: "bg-purple-50 text-purple-700",
  finance:           "bg-emerald-50 text-emerald-700",
  security:          "bg-orange-50 text-orange-700",
};

const ROLE_LABEL: Record<string, string> = {
  admin:             "Admin",
  team_leader:       "Team Leader",
  affiliate_manager: "Affiliate Manager",
  finance:           "Finance",
  security:          "Security",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function TeamsPage() {
  const [teams,   setTeams]   = useState<Team[]>([]);
  const [allUsers, setAllUsers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected team for the right panel
  const [selected, setSelected] = useState<Team | null>(null);

  // Create / edit team dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [editTeam,   setEditTeam]   = useState<Team | null>(null);
  const [form,       setForm]       = useState({ name: "", description: "" });
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState<string | null>(null);

  // Members staged inside the Create form (before the team is saved)
  const [pendingMembers,  setPendingMembers]  = useState<TeamMember[]>([]);
  const [pendingLeaderId, setPendingLeaderId] = useState<string | null>(null);
  const [formMemberSearch, setFormMemberSearch] = useState("");

  // Member management
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError,  setMemberError]  = useState<string | null>(null);

  // Add member picker
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addSearch,     setAddSearch]     = useState("");

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: teamsData }, { data: usersData }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("teams") as any).select("*").order("created_at", { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("users") as any).select("id,full_name,username,email,role,team_id").order("full_name"),
      ]);
      setTeams(teamsData ?? []);
      setAllUsers(usersData ?? []);

      // Re-sync selected team if it was open
      if (selected) {
        const refreshed = (teamsData ?? []).find((t: Team) => t.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Derived: members of the selected team ────────────────────────────────

  const teamMembers = selected
    ? allUsers.filter(u => u.team_id === selected.id)
    : [];

  // Users available to add (not already in any team, or not in THIS team)
  const availableToAdd = allUsers.filter(u =>
    u.team_id !== selected?.id &&
    u.role !== "admin" &&       // admins don't belong to teams
    (addSearch === "" ||
      u.full_name.toLowerCase().includes(addSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(addSearch.toLowerCase()) ||
      u.username.toLowerCase().includes(addSearch.toLowerCase()))
  );

  // ── Create team ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.name.trim()) { setFormError("Team name is required."); return; }
    setSaving(true); setFormError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("teams") as any)
        .insert({ name: form.name.trim(), description: form.description.trim() || null, status: "active" })
        .select().single();
      if (error) throw new Error(error.message);

      const newTeam: Team = data;

      // Assign pending members to the new team
      if (pendingMembers.length > 0) {
        const memberIds = pendingMembers.map(m => m.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("users") as any)
          .update({ team_id: newTeam.id, updated_at: new Date().toISOString() })
          .in("id", memberIds);

        // Set team leader role
        if (pendingLeaderId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("teams") as any)
            .update({ team_leader_id: pendingLeaderId })
            .eq("id", newTeam.id);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("users") as any)
            .update({ role: "team_leader", updated_at: new Date().toISOString() })
            .eq("id", pendingLeaderId);
        }
      }

      // Refresh to get accurate state
      await fetchAll();
      setCreateOpen(false);
      setForm({ name: "", description: "" });
      setPendingMembers([]);
      setPendingLeaderId(null);
      setFormMemberSearch("");

      // Auto-select the new team
      setSelected({ ...newTeam, team_leader_id: pendingLeaderId });
      setSaveSuccess(`Team "${newTeam.name}" created successfully!`);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create team.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete team ───────────────────────────────────────────────────────────

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting]                   = useState(false);
  const [deleteError, setDeleteError]             = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess]         = useState<string | null>(null);
  // Create/Edit success state
  const [saveSuccess, setSaveSuccess]             = useState<string | null>(null);

  const handleDeleteTeam = async () => {
    if (!selected) return;
    setDeleting(true); setDeleteError(null);
    try {
      // 1. Remove team from all members (set team_id = null)
      const memberIds = allUsers
        .filter(u => u.team_id === selected.id)
        .map(u => u.id);

      if (memberIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("users") as any)
          .update({ team_id: null, updated_at: new Date().toISOString() })
          .in("id", memberIds);
      }

      // 2. Delete the team record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("teams") as any)
        .delete()
        .eq("id", selected.id);
      if (error) throw new Error(error.message);

      const deletedName = selected.name;
      setTeams(prev => prev.filter(t => t.id !== selected.id));
      setAllUsers(prev => prev.map(u =>
        memberIds.includes(u.id) ? { ...u, team_id: null } : u
      ));
      setSelected(null);
      setDeleteConfirmOpen(false);
      setDeleteSuccess(`Team "${deletedName}" has been deleted. ${memberIds.length > 0 ? `${memberIds.length} member${memberIds.length !== 1 ? "s" : ""} moved to no team.` : ""}`);
      setTimeout(() => setDeleteSuccess(null), 6000);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete team.");
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = async () => {
    if (!editTeam || !form.name.trim()) return;
    setSaving(true); setFormError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("teams") as any)
        .update({ name: form.name.trim(), description: form.description.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", editTeam.id).select().single();
      if (error) throw new Error(error.message);
      setTeams(prev => prev.map(t => t.id === editTeam.id ? data : t));
      if (selected?.id === editTeam.id) setSelected(data);
      setEditTeam(null);
      setSaveSuccess(`Team "${data.name}" updated successfully!`);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // ── Add member to team ────────────────────────────────────────────────────

  const addMember = async (user: TeamMember) => {
    if (!selected) return;
    setMemberSaving(true); setMemberError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("users") as any)
        .update({ team_id: selected.id, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw new Error(error.message);

      // Update local allUsers state
      setAllUsers(prev => prev.map(u => u.id === user.id ? { ...u, team_id: selected.id } : u));
      setAddPickerOpen(false);
      setAddSearch("");
    } catch (e) {
      setMemberError(e instanceof Error ? e.message : "Failed to add member.");
    } finally {
      setMemberSaving(false);
    }
  };

  // ── Remove member from team ───────────────────────────────────────────────

  const removeMember = async (user: TeamMember) => {
    if (!selected) return;
    setMemberSaving(true); setMemberError(null);
    try {
      // If this user is the team leader, also clear that
      const clearLeader = selected.team_leader_id === user.id;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("users") as any)
        .update({ team_id: null, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw new Error(error.message);

      if (clearLeader) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("teams") as any)
          .update({ team_leader_id: null })
          .eq("id", selected.id);
        setSelected(prev => prev ? { ...prev, team_leader_id: null } : null);
        setTeams(prev => prev.map(t => t.id === selected.id ? { ...t, team_leader_id: null } : t));
      }

      setAllUsers(prev => prev.map(u => u.id === user.id ? { ...u, team_id: null } : u));
    } catch (e) {
      setMemberError(e instanceof Error ? e.message : "Failed to remove member.");
    } finally {
      setMemberSaving(false);
    }
  };

  // ── Set team leader ───────────────────────────────────────────────────────

  const setTeamLeader = async (user: TeamMember) => {
    if (!selected) return;
    setMemberSaving(true); setMemberError(null);
    try {
      // Update team record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("teams") as any)
        .update({ team_leader_id: user.id, updated_at: new Date().toISOString() })
        .eq("id", selected.id);
      if (error) throw new Error(error.message);

      // Ensure user role is team_leader
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("users") as any)
        .update({ role: "team_leader", updated_at: new Date().toISOString() })
        .eq("id", user.id);

      setSelected(prev => prev ? { ...prev, team_leader_id: user.id } : null);
      setTeams(prev => prev.map(t => t.id === selected.id ? { ...t, team_leader_id: user.id } : t));
      setAllUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: "team_leader" } : u));
    } catch (e) {
      setMemberError(e instanceof Error ? e.message : "Failed to set team leader.");
    } finally {
      setMemberSaving(false);
    }
  };

  const memberCount = (teamId: string) => allUsers.filter(u => u.team_id === teamId).length;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Teams</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {teams.length} team{teams.length !== 1 ? "s" : ""} · click a team to manage members
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => { setForm({ name: "", description: "" }); setFormError(null); setPendingMembers([]); setPendingLeaderId(null); setFormMemberSearch(""); setCreateOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
            <Plus className="h-4 w-4" /> New Team
          </button>
        </div>
      </div>

      {/* Delete success banner */}
      {deleteSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium flex-1">{deleteSuccess}</p>
          <button onClick={() => setDeleteSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Save success banner */}
      {saveSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium flex-1">{saveSuccess}</p>
          <button onClick={() => setSaveSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Two-column layout: team list + detail panel */}
      <div className="flex gap-6 items-start">
        {/* ── Left: Team cards ──────────────────────────────────────────────── */}
        <div className="w-80 shrink-0 space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="premium-card p-5 h-24 animate-pulse bg-gray-50" />
            ))
          ) : teams.length === 0 ? (
            <div className="premium-card p-10 text-center">
              <Users className="h-8 w-8 text-[var(--color-text-muted)] mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-secondary)]">No teams yet.</p>
            </div>
          ) : (
            teams.map(t => (
              <button key={t.id} onClick={() => { setSelected(t); setMemberError(null); }}
                className={`w-full text-left premium-card p-5 transition-all ${
                  selected?.id === t.id
                    ? "border-[var(--color-brand-blue)] bg-[var(--color-brand-blue-soft)] shadow-md"
                    : "hover:shadow-md hover:border-[var(--color-border-strong)]"
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[var(--color-brand-blue-soft)] flex items-center justify-center">
                      <Users className="h-4 w-4 text-[var(--color-brand-blue)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--color-text-heading)] text-sm">{t.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {memberCount(t.id)} member{memberCount(t.id) !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {t.status}
                    </span>
                    {selected?.id === t.id && <ChevronRight className="h-3.5 w-3.5 text-[var(--color-brand-blue)]" />}
                  </div>
                </div>
                {t.description && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-2 line-clamp-1">{t.description}</p>
                )}
              </button>
            ))
          )}
        </div>

        {/* ── Right: Team detail panel ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="premium-card p-12 text-center">
              <Users className="h-10 w-10 text-[var(--color-text-muted)] mx-auto mb-3 opacity-40" />
              <p className="text-[var(--color-text-secondary)]">Select a team to manage its members.</p>
            </div>
          ) : (
            <div className="premium-card overflow-hidden">

              {/* Panel header */}
              <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text-heading)]">{selected.name}</h2>
                  {selected.description && (
                    <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{selected.description}</p>
                  )}
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""}
                    {selected.team_leader_id && (() => {
                      const leader = allUsers.find(u => u.id === selected.team_leader_id);
                      return leader ? ` · Leader: ${leader.full_name}` : "";
                    })()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditTeam(selected); setForm({ name: selected.name, description: selected.description ?? "" }); setFormError(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] text-sm font-medium text-[var(--color-text-body)] hover:bg-[var(--color-surface-subtle)]">
                    <Edit className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => { setDeleteError(null); setDeleteConfirmOpen(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                  <button
                    onClick={() => { setAddSearch(""); setAddPickerOpen(true); setMemberError(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]">
                    <UserPlus className="h-3.5 w-3.5" /> Add Member
                  </button>
                </div>
              </div>

              {/* Error */}
              {memberError && (
                <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{memberError}</p>
                </div>
              )}

              {/* Member list */}
              {teamMembers.length === 0 ? (
                <div className="p-12 text-center">
                  <UserPlus className="h-8 w-8 text-[var(--color-text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-[var(--color-text-secondary)]">No members yet. Click "Add Member" to add users from the system.</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border-subtle)]">
                  {teamMembers.map(member => {
                    const isLeader = selected.team_leader_id === member.id;
                    return (
                      <div key={member.id} className="flex items-center justify-between px-6 py-4">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-brand-gold)] to-amber-500 flex items-center justify-center text-[#081A33] font-bold text-xs shrink-0">
                            {(member.full_name || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-[var(--color-text-heading)]">{member.full_name}</p>
                              {isLeader && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-700">
                                  <Crown className="h-2.5 w-2.5" /> Leader
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)]">@{member.username} · {member.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Role badge */}
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLOR[member.role] ?? "bg-slate-50 text-slate-600"}`}>
                            {ROLE_LABEL[member.role] ?? member.role}
                          </span>

                          {/* Set as team leader */}
                          {!isLeader && (
                            <button
                              onClick={() => setTeamLeader(member)}
                              disabled={memberSaving}
                              title="Set as Team Leader"
                              className="p-1.5 rounded hover:bg-amber-50 text-[var(--color-text-muted)] hover:text-amber-600 disabled:opacity-40">
                              <Crown className="h-4 w-4" />
                            </button>
                          )}

                          {/* Remove from team */}
                          <button
                            onClick={() => removeMember(member)}
                            disabled={memberSaving}
                            title="Remove from team"
                            className="p-1.5 rounded hover:bg-red-50 text-[var(--color-text-muted)] hover:text-red-600 disabled:opacity-40">
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit team dialog ─────────────────────────────────────── */}
      {(createOpen || editTeam) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <h2 className="text-lg font-bold text-[var(--color-text-heading)]">
                {editTeam ? "Edit Team" : "Create Team"}
              </h2>
              <button onClick={() => { setCreateOpen(false); setEditTeam(null); }}
                className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {formError && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{formError}</p>
              )}

              {/* Name + description */}
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Team Name *</label>
                <input type="text" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="field focus:field-focus" placeholder="e.g. Africa Team" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Description</label>
                <textarea value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="field focus:field-focus resize-none" rows={2}
                  placeholder="Optional description…" />
              </div>

              {/* Member selection — only shown when creating a new team */}
              {!editTeam && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-[var(--color-text-body)]">
                      Add Members <span className="text-xs font-normal text-[var(--color-text-muted)]">(optional — can add more later)</span>
                    </label>
                    {pendingMembers.length > 0 && (
                      <span className="text-xs text-[var(--color-brand-blue)] font-medium">
                        {pendingMembers.length} selected
                      </span>
                    )}
                  </div>

                  {/* Search input */}
                  <input
                    type="text"
                    value={formMemberSearch}
                    onChange={e => setFormMemberSearch(e.target.value)}
                    placeholder="Search users by name, email or username…"
                    className="field focus:field-focus mb-2"
                  />

                  {/* Available users list */}
                  <div className="border border-[var(--color-border-default)] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {allUsers
                      .filter(u =>
                        u.role !== "admin" &&
                        !pendingMembers.some(m => m.id === u.id) &&
                        (formMemberSearch === "" ||
                          u.full_name.toLowerCase().includes(formMemberSearch.toLowerCase()) ||
                          u.email.toLowerCase().includes(formMemberSearch.toLowerCase()) ||
                          u.username.toLowerCase().includes(formMemberSearch.toLowerCase()))
                      )
                      .map(u => (
                        <button key={u.id} type="button"
                          onClick={() => {
                            setPendingMembers(prev => [...prev, u]);
                            setFormMemberSearch("");
                          }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--color-surface-subtle)] text-left border-b border-[var(--color-border-subtle)] last:border-0 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-brand-gold)] to-amber-500 flex items-center justify-center text-[#081A33] font-bold text-[10px] shrink-0">
                              {(u.full_name || "?").slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-[var(--color-text-heading)] leading-tight">{u.full_name}</p>
                              <p className="text-xs text-[var(--color-text-muted)]">@{u.username}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${ROLE_COLOR[u.role] ?? "bg-slate-50 text-slate-600"}`}>
                            {ROLE_LABEL[u.role] ?? u.role}
                          </span>
                        </button>
                      ))
                    }
                    {allUsers.filter(u => u.role !== "admin" && !pendingMembers.some(m => m.id === u.id)).length === 0 && (
                      <p className="p-4 text-sm text-center text-[var(--color-text-muted)]">No more users to add.</p>
                    )}
                  </div>

                  {/* Selected members chips */}
                  {pendingMembers.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Selected members</p>
                      <div className="space-y-1.5">
                        {pendingMembers.map(m => (
                          <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)]">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-brand-gold)] to-amber-500 flex items-center justify-center text-[#081A33] font-bold text-[10px] shrink-0">
                                {(m.full_name || "?").slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[var(--color-text-heading)] leading-tight">{m.full_name}</p>
                                <p className="text-xs text-[var(--color-text-muted)]">@{m.username}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Set as leader toggle */}
                              <button type="button"
                                onClick={() => setPendingLeaderId(prev => prev === m.id ? null : m.id)}
                                title={pendingLeaderId === m.id ? "Remove as leader" : "Set as team leader"}
                                className={`p-1 rounded transition-colors ${pendingLeaderId === m.id ? "text-amber-600 bg-amber-50" : "text-[var(--color-text-muted)] hover:text-amber-600 hover:bg-amber-50"}`}>
                                <Crown className="h-3.5 w-3.5" />
                              </button>
                              {pendingLeaderId === m.id && (
                                <span className="text-[10px] text-amber-700 font-semibold">Leader</span>
                              )}
                              {/* Remove */}
                              <button type="button"
                                onClick={() => {
                                  setPendingMembers(prev => prev.filter(x => x.id !== m.id));
                                  if (pendingLeaderId === m.id) setPendingLeaderId(null);
                                }}
                                className="p-1 rounded text-[var(--color-text-muted)] hover:text-red-600 hover:bg-red-50">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={() => { setCreateOpen(false); setEditTeam(null); }}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button onClick={editTeam ? handleEdit : handleCreate} disabled={saving}
                className="px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60">
                {saving ? "Saving…" : editTeam ? "Save Changes" : `Create Team${pendingMembers.length > 0 ? ` + ${pendingMembers.length} member${pendingMembers.length !== 1 ? "s" : ""}` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Member picker ─────────────────────────────────────────────── */}
      {addPickerOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-heading)]">Add Member</h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Adding to <strong>{selected.name}</strong>. Users already in this team are hidden.
                </p>
              </div>
              <button onClick={() => setAddPickerOpen(false)}
                className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 border-b border-[var(--color-border-default)]">
              <input
                type="text"
                value={addSearch}
                onChange={e => setAddSearch(e.target.value)}
                placeholder="Search by name, email or username…"
                className="field focus:field-focus"
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-[var(--color-border-subtle)]">
              {availableToAdd.length === 0 ? (
                <p className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                  No available users found.
                </p>
              ) : (
                availableToAdd.map(u => (
                  <button key={u.id}
                    onClick={() => addMember(u)}
                    disabled={memberSaving}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--color-surface-subtle)] text-left transition-colors disabled:opacity-40">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-brand-gold)] to-amber-500 flex items-center justify-center text-[#081A33] font-bold text-xs shrink-0">
                        {(u.full_name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-heading)]">{u.full_name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">@{u.username} · {u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${ROLE_COLOR[u.role] ?? "bg-slate-50 text-slate-600"}`}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                      {u.team_id && u.team_id !== selected.id && (
                        <span className="text-[10px] text-amber-600 font-medium">
                          (moves from another team)
                        </span>
                      )}
                      <UserPlus className="h-4 w-4 text-[var(--color-text-muted)]" />
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="p-4 border-t border-[var(--color-border-default)] text-right">
              <button onClick={() => setAddPickerOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Team confirm ───────────────────────────────────────────── */}
      {deleteConfirmOpen && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-[var(--color-text-heading)]">Delete "{selected.name}"?</p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                  This will permanently delete the team.{" "}
                  {allUsers.filter(u => u.team_id === selected.id).length > 0
                    ? `The ${allUsers.filter(u => u.team_id === selected.id).length} member${allUsers.filter(u => u.team_id === selected.id).length !== 1 ? "s" : ""} will be moved to no team but their accounts will not be deleted.`
                    : "The team has no members."}
                </p>
                {deleteError && (
                  <p className="mt-2 text-sm text-red-600">{deleteError}</p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteConfirmOpen(false); setDeleteError(null); }}
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button
                onClick={handleDeleteTeam}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete Team"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
