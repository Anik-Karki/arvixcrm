import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { RefreshCw, Target, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle } from "lucide-react";

interface KPIRow {
  id: string; name: string; category: string; unit: string;
  value: number; target: number; trend: string; trend_value: number;
  status: string; description: string | null;
}

const STATUS_CONFIG: Record<string,{label:string;color:string;icon:any}> = {
  excellent: { label:"Excellent", color:"text-emerald-600 bg-emerald-50 border-emerald-200", icon:CheckCircle },
  good:      { label:"Good",      color:"text-blue-600 bg-blue-50 border-blue-200",         icon:CheckCircle },
  warning:   { label:"Warning",   color:"text-amber-600 bg-amber-50 border-amber-200",      icon:AlertCircle },
  critical:  { label:"Critical",  color:"text-red-600 bg-red-50 border-red-200",            icon:AlertCircle },
};

const CATEGORY_COLOR: Record<string,string> = {
  revenue:    "bg-emerald-50 text-emerald-700",
  growth:     "bg-blue-50 text-blue-700",
  efficiency: "bg-amber-50 text-amber-700",
  quality:    "bg-purple-50 text-purple-700",
};

function formatVal(value:number, unit:string): string {
  if (unit==="currency") return "$"+value.toLocaleString();
  if (unit==="percentage") return value.toFixed(1)+"%";
  return value.toLocaleString();
}

export default function KPIsPage() {
  const [kpis, setKpis]         = useState<KPIRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<string>("all");

  const fetchKpis = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("kpis") as any).select("*").order("category").order("name");
    setKpis(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchKpis(); }, []);

  const categories = [...new Set(kpis.map(k=>k.category))];
  const filtered   = filter==="all" ? kpis : kpis.filter(k=>k.category===filter);

  const overall = kpis.length===0 ? "good" : (() => {
    const counts = { excellent:0, good:0, warning:0, critical:0 };
    for (const k of kpis) counts[k.status as keyof typeof counts] = (counts[k.status as keyof typeof counts]??0)+1;
    if (counts.critical>0) return "critical";
    if (counts.warning>2)  return "warning";
    if (counts.excellent >= kpis.length*0.6) return "excellent";
    return "good";
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">KPIs Dashboard</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Key performance indicators and goal tracking</p>
        </div>
        <button onClick={fetchKpis} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh
        </button>
      </div>

      {/* Overall health */}
      {!loading && kpis.length>0 && (
        <div className={`premium-card p-5 border-l-4 ${overall==="excellent"?"border-emerald-500":overall==="good"?"border-blue-500":overall==="warning"?"border-amber-500":"border-red-500"}`}>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${overall==="excellent"?"bg-emerald-50":overall==="good"?"bg-blue-50":overall==="warning"?"bg-amber-50":"bg-red-50"}`}>
              <Target className={`h-6 w-6 ${overall==="excellent"?"text-emerald-600":overall==="good"?"text-blue-600":overall==="warning"?"text-amber-600":"text-red-600"}`}/>
            </div>
            <div>
              <p className="font-semibold text-[var(--color-text-heading)]">Overall Health: <span className="capitalize">{overall}</span></p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {kpis.filter(k=>k.status==="excellent").length} excellent · {kpis.filter(k=>k.status==="critical").length} critical · {kpis.length} total KPIs
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Category filter */}
      {categories.length>0 && (
        <div className="flex flex-wrap gap-2">
          {["all",...categories].map(c=>(
            <button key={c} onClick={()=>setFilter(c)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${filter===c?"bg-[var(--color-brand-blue)] text-white border-[var(--color-brand-blue)]":"bg-white text-[var(--color-text-secondary)] border-[var(--color-border-default)] hover:border-[var(--color-brand-blue)]"}`}>
              {c==="all"?"All Categories":c}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:6}).map((_,i)=><div key={i} className="premium-card p-5 h-36 animate-pulse bg-gray-50"/>)}</div>
      ) : filtered.length===0 ? (
        <div className="premium-card p-12 text-center">
          <Target className="h-10 w-10 text-[var(--color-text-muted)] mx-auto mb-3"/>
          <p className="text-[var(--color-text-secondary)]">No KPIs found. Add KPI records to your database.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(kpi=>{
            const cfg = STATUS_CONFIG[kpi.status] ?? STATUS_CONFIG["good"];
            const StatusIcon = cfg.icon;
            const progress = kpi.target>0 ? Math.min((kpi.value/kpi.target)*100,100) : 0;
            const TrendIcon = kpi.trend==="up"?TrendingUp:kpi.trend==="down"?TrendingDown:Minus;
            const trendColor = kpi.trend==="up"?"text-emerald-600":kpi.trend==="down"?"text-red-600":"text-[var(--color-text-muted)]";
            return (
              <div key={kpi.id} className="premium-card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="font-semibold text-[var(--color-text-heading)] text-sm">{kpi.name}</p>
                    {kpi.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{kpi.description}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ml-2 ${CATEGORY_COLOR[kpi.category]??"bg-slate-50 text-slate-600"}`}>{kpi.category}</span>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-bold text-[var(--color-text-heading)]">{formatVal(kpi.value,kpi.unit)}</span>
                  <div className={`flex items-center gap-0.5 text-sm ${trendColor}`}>
                    <TrendIcon className="h-3.5 w-3.5"/>
                    <span>{Math.abs(kpi.trend_value??0).toFixed(1)}%</span>
                  </div>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mb-3">Target: {formatVal(kpi.target,kpi.unit)}</p>
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-text-muted)]">Progress</span><span className="font-medium">{progress.toFixed(0)}%</span></div>
                  <div className="h-2 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${kpi.status==="excellent"?"bg-emerald-500":kpi.status==="good"?"bg-blue-500":kpi.status==="warning"?"bg-amber-500":"bg-red-500"}`} style={{width:`${progress}%`}}/>
                  </div>
                </div>
                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${cfg.color}`}>
                  <StatusIcon className="h-3 w-3"/>
                  {cfg.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
