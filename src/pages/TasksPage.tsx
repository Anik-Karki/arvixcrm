import { useCallback, useEffect, useState } from "react";
import { Search, RefreshCw, Plus, Edit, X, CheckSquare, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Pagination } from "@/components/Pagination";

type TaskStatus   = "todo"|"in_progress"|"done"|"cancelled";
type TaskPriority = "low"|"medium"|"high"|"urgent";

interface Task {
  id: string; title: string; description: string|null;
  status: TaskStatus; priority: TaskPriority; due_date: string|null;
  assigned_to: string|null; partner_id: string|null; created_at: string;
  partner?: {name:string};
  assignee?: {full_name:string};
}

const STATUS_COLOR: Record<TaskStatus,string> = {
  todo:        "bg-slate-50 text-slate-600 border-slate-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  done:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled:   "bg-red-50 text-red-700 border-red-200",
};

const PRIORITY_COLOR: Record<TaskPriority,string> = {
  low:    "bg-slate-50 text-slate-500",
  medium: "bg-blue-50 text-blue-600",
  high:   "bg-amber-50 text-amber-700",
  urgent: "bg-red-50 text-red-700",
};

const STATUSES:  TaskStatus[]   = ["todo","in_progress","done","cancelled"];
const PRIORITIES: TaskPriority[] = ["low","medium","high","urgent"];

export default function TasksPage() {
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [users, setUsers]       = useState<{id:string;full_name:string}[]>([]);
  const [partners, setPartners] = useState<{id:string;name:string}[]>([]);
  const [loading, setLoading]   = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter]     = useState<TaskStatus|"all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority|"all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask]     = useState<Task|null>(null);
  const [form, setForm] = useState({ title:"", description:"", status:"todo" as TaskStatus, priority:"medium" as TaskPriority, due_date:"", assigned_to:"", partner_id:"" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string|null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const [tasksR, usersR, partnersR] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("tasks") as any).select("*, partner:partners(name), assignee:users(full_name)").order("created_at",{ascending:false}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("users") as any).select("id,full_name").eq("status","active").order("full_name"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("partners") as any).select("id,name").order("name"),
    ]);
    setTasks(tasksR.data ?? []);
    setUsers(usersR.data ?? []);
    setPartners(partnersR.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const filtered = tasks.filter(t => {
    const q = search.toLowerCase();
    const matchQ = !q || t.title.toLowerCase().includes(q) || (t.partner as any)?.name?.toLowerCase().includes(q);
    const matchS = statusFilter==="all" || t.status===statusFilter;
    const matchP = priorityFilter==="all" || t.priority===priorityFilter;
    return matchQ && matchS && matchP;
  });

  const stats = {
    todo: tasks.filter(t=>t.status==="todo").length,
    inProgress: tasks.filter(t=>t.status==="in_progress").length,
    done: tasks.filter(t=>t.status==="done").length,
    urgent: tasks.filter(t=>t.priority==="urgent"&&t.status!=="done").length,
  };

  const handleSave = async () => {
    if (!form.title) { setError("Title is required."); return; }
    setSaving(true); setError(null);
    try {
      const payload = { title:form.title, description:form.description||null, status:form.status, priority:form.priority, due_date:form.due_date||null, assigned_to:form.assigned_to||null, partner_id:form.partner_id||null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = editTask ? (supabase.from("tasks") as any).update({...payload,updated_at:new Date().toISOString()}).eq("id",editTask.id).select("*, partner:partners(name), assignee:users(full_name)").single()
                         : (supabase.from("tasks") as any).insert(payload).select("*, partner:partners(name), assignee:users(full_name)").single();
      const { data, error:err } = await q;
      if (err) throw new Error(err.message);
      if (editTask) setTasks(prev=>prev.map(t=>t.id===editTask.id?data:t));
      else setTasks(prev=>[data,...prev]);
      setCreateOpen(false); setEditTask(null);
    } catch(e) { setError(e instanceof Error?e.message:"Failed."); }
    finally { setSaving(false); }
  };

  const quickStatus = async (id:string, status:TaskStatus) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("tasks") as any).update({status,updated_at:new Date().toISOString()}).eq("id",id);
    setTasks(prev=>prev.map(t=>t.id===id?{...t,status}:t));
  };

  const openCreate = () => { setForm({title:"",description:"",status:"todo",priority:"medium",due_date:"",assigned_to:"",partner_id:""}); setError(null); setCreateOpen(true); };
  const openEdit   = (t:Task) => { setEditTask(t); setForm({title:t.title,description:t.description??"",status:t.status,priority:t.priority,due_date:t.due_date??"",assigned_to:t.assigned_to??"",partner_id:t.partner_id??""}); setError(null); };

  const isOverdue = (t:Task) => t.due_date && new Date(t.due_date)<new Date() && t.status!=="done";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Tasks</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{filtered.length} of {tasks.length} tasks</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTasks} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/></button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)]"><Plus className="h-4 w-4"/>New Task</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[["To Do",stats.todo,CheckSquare,"slate"],["In Progress",stats.inProgress,Clock,"blue"],["Done",stats.done,CheckSquare,"green"],["Urgent",stats.urgent,AlertCircle,"red"]].map(([l,v,I,c]:any)=>(
          <div key={l} className="premium-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c==="green"?"bg-emerald-50 text-emerald-600":c==="red"?"bg-red-50 text-red-600":c==="blue"?"bg-blue-50 text-blue-600":"bg-slate-50 text-slate-600"}`}><I className="h-5 w-5"/></div>
            <div><p className="text-xl font-bold text-[var(--color-text-heading)]">{v}</p><p className="text-xs text-[var(--color-text-secondary)]">{l}</p></div>
          </div>
        ))}
      </div>

      <div className="premium-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]"/>
          <input type="text" placeholder="Search tasks…" value={search} onChange={e=>setSearch(e.target.value)} className="field focus:field-focus pl-9"/>
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as any)} className="field focus:field-focus w-auto min-w-[130px]">
          <option value="all">All Statuses</option>
          {STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
        </select>
        <select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value as any)} className="field focus:field-focus w-auto min-w-[130px]">
          <option value="all">All Priorities</option>
          {PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                {["Title","Partner","Assignee","Priority","Due","Status","Actions"].map(h=><th key={h} className="text-left px-4 py-3 font-semibold text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading?Array.from({length:5}).map((_,i)=><tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded"/></td></tr>)
              :filtered.length===0?<tr><td colSpan={7} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No tasks found</td></tr>
              :filtered.slice((page - 1) * pageSize, page * pageSize).map(t=>(
                <tr key={t.id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--color-text-heading)]">{t.title}</p>
                    {t.description && <p className="text-xs text-[var(--color-text-muted)] truncate max-w-xs">{t.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{(t.partner as any)?.name??"—"}</td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{(t.assignee as any)?.full_name??"—"}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span></td>
                  <td className={`px-4 py-3 text-xs ${isOverdue(t)?"text-red-600 font-semibold":"text-[var(--color-text-secondary)]"}`}>
                    {t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}
                    {isOverdue(t) && <span className="ml-1">⚠</span>}
                  </td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_COLOR[t.status]}`}>{t.status.replace(/_/g," ")}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={()=>openEdit(t)} className="p-1.5 rounded hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)]"><Edit className="h-4 w-4"/></button>
                      {t.status==="todo" && <button onClick={()=>quickStatus(t.id,"in_progress")} className="px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">Start</button>}
                      {t.status==="in_progress" && <button onClick={()=>quickStatus(t.id,"done")} className="px-2 py-1 rounded text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">Done</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div>

      {(createOpen||editTask) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <h2 className="text-lg font-bold text-[var(--color-text-heading)]">{editTask?"Edit Task":"New Task"}</h2>
              <button onClick={()=>{setCreateOpen(false);setEditTask(null);}} className="p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]"><X className="h-4 w-4"/></button>
            </div>
            <div className="p-6 space-y-4">
              {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div><label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Title *</label><input type="text" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} className="field focus:field-focus"/></div>
              <div><label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Description</label><textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} className="field focus:field-focus resize-none" rows={2}/></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Status</label>
                  <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value as TaskStatus}))} className="field focus:field-focus">
                    {STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Priority</label>
                  <select value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value as TaskPriority}))} className="field focus:field-focus">
                    {PRIORITIES.map(pr=><option key={pr} value={pr}>{pr}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Due Date</label><input type="date" value={form.due_date} onChange={e=>setForm(p=>({...p,due_date:e.target.value}))} className="field focus:field-focus"/></div>
                <div><label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Assign To</label>
                  <select value={form.assigned_to} onChange={e=>setForm(p=>({...p,assigned_to:e.target.value}))} className="field focus:field-focus">
                    <option value="">Unassigned</option>
                    {users.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Partner</label>
                  <select value={form.partner_id} onChange={e=>setForm(p=>({...p,partner_id:e.target.value}))} className="field focus:field-focus">
                    <option value="">None</option>
                    {partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={()=>{setCreateOpen(false);setEditTask(null);}} className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm font-medium hover:bg-[var(--color-surface-subtle)]">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60">{saving?"Saving…":editTask?"Save":"Create"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
