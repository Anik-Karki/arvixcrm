import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/lib/supabase/client";
import { RefreshCw, TrendingUp, Users, Target, DollarSign } from "lucide-react";

interface PerfData {
  partnerPerf: { name:string; players:number; ftds:number; ngr:number }[];
  topNgr: number; avgNgr: number;
  totalFtds: number; totalPlayers: number;
}

export default function PerformancePage() {
  const [data, setData]       = useState<PerfData|null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy]   = useState<"ngr"|"ftds"|"players">("ngr");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [partnersR, playersR] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("partners") as any).select("id,name").eq("status","active"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("players") as any).select("id,partner_id,ftd_date,ngr"),
      ]);

      const partners = (partnersR.data ?? []) as {id:string;name:string}[];
      const players  = (playersR.data ?? []) as {id:string;partner_id:string|null;ftd_date:string|null;ngr:number}[];

      const perfMap: Record<string,{name:string;players:number;ftds:number;ngr:number}> = {};
      for (const p of partners) perfMap[p.id] = { name:p.name, players:0, ftds:0, ngr:0 };
      for (const pl of players) {
        if (!pl.partner_id || !perfMap[pl.partner_id]) continue;
        perfMap[pl.partner_id].players++;
        if (pl.ftd_date) perfMap[pl.partner_id].ftds++;
        perfMap[pl.partner_id].ngr += pl.ngr ?? 0;
      }

      const partnerPerf = Object.values(perfMap).filter(p=>p.players>0);
      const ngrValues   = partnerPerf.map(p=>p.ngr).filter(n=>n>0);

      setData({
        partnerPerf,
        topNgr:    ngrValues.length ? Math.max(...ngrValues) : 0,
        avgNgr:    ngrValues.length ? ngrValues.reduce((a,b)=>a+b,0)/ngrValues.length : 0,
        totalFtds:    players.filter(p=>p.ftd_date).length,
        totalPlayers: players.length,
      });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const sorted = data ? [...data.partnerPerf].sort((a,b)=>b[sortBy]-a[sortBy]).slice(0,20) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Performance</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Partner performance analytics</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-4">{Array.from({length:4}).map((_,i)=><div key={i} className="premium-card p-5 h-20 animate-pulse bg-gray-50"/>)}</div>
      ) : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              ["Total Players",data.totalPlayers,Users,"blue"],
              ["Total FTDs",data.totalFtds,Target,"green"],
              ["Top Partner NGR","$"+data.topNgr.toLocaleString(),TrendingUp,"purple"],
              ["Avg NGR / Partner","$"+Math.round(data.avgNgr).toLocaleString(),DollarSign,"orange"],
            ].map(([l,v,I,c]:any)=>(
              <div key={l} className="premium-card p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c==="green"?"bg-emerald-50 text-emerald-600":c==="purple"?"bg-purple-50 text-purple-600":c==="orange"?"bg-amber-50 text-amber-600":"bg-blue-50 text-blue-600"}`}><I className="h-5 w-5"/></div>
                <div><p className="font-bold text-[var(--color-text-heading)]">{v}</p><p className="text-xs text-[var(--color-text-secondary)]">{l}</p></div>
              </div>
            ))}
          </div>

          {/* Sort tabs */}
          <div className="flex gap-1 p-1 bg-[var(--color-surface-subtle)] rounded-xl w-fit">
            {(["ngr","ftds","players"] as const).map(s=>(
              <button key={s} onClick={()=>setSortBy(s)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors uppercase ${sortBy===s?"bg-white shadow text-[var(--color-text-heading)]":"text-[var(--color-text-secondary)] hover:text-[var(--color-text-body)]"}`}>{s==="ngr"?"NGR":s==="ftds"?"FTDs":"Players"}</button>
            ))}
          </div>

          {/* Chart */}
          {sorted.length>0 && (
            <div className="premium-card p-6">
              <h3 className="font-semibold text-[var(--color-text-heading)] mb-4">Top Partners by {sortBy.toUpperCase()}</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={sorted} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11}} tickLine={false} tickFormatter={v=>sortBy==="ngr"?"$"+Number(v).toLocaleString():String(v)}/>
                  <YAxis type="category" dataKey="name" tick={{fontSize:11}} tickLine={false} axisLine={false} width={130}/>
                  <Tooltip contentStyle={{background:"white",border:"1px solid #E2E8F0",borderRadius:"8px"}} formatter={(v:any)=>sortBy==="ngr"?"$"+Number(v).toLocaleString():v}/>
                  <Bar dataKey={sortBy} fill="#2563EB" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="premium-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                    {["#","Partner","Players","FTDs","FTD Rate","NGR","NGR / Player"].map(h=><th key={h} className="text-left px-4 py-3 font-semibold text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p,i)=>(
                    <tr key={p.name} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]">
                      <td className="px-4 py-3 text-[var(--color-text-muted)] font-bold">{i+1}</td>
                      <td className="px-4 py-3 font-medium text-[var(--color-text-heading)]">{p.name}</td>
                      <td className="px-4 py-3 text-[var(--color-text-body)]">{p.players}</td>
                      <td className="px-4 py-3 text-[var(--color-text-body)]">{p.ftds}</td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">{p.players>0?((p.ftds/p.players)*100).toFixed(1):0}%</td>
                      <td className="px-4 py-3 font-bold text-[var(--color-text-heading)]">${p.ngr.toLocaleString()}</td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">${p.players>0?Math.round(p.ngr/p.players).toLocaleString():0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
