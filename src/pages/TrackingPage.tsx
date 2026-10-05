import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Activity, Globe, Link, MousePointerClick, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

interface TrackingEvent {
  id: string; event_type: string; partner_id: string|null;
  player_id: string|null; source: string|null; medium: string|null;
  campaign: string|null; country: string|null; device: string|null;
  ip_address: string|null; created_at: string;
  partner?: {name:string};
}

interface TrackingStats {
  totalEvents: number;
  byType: {name:string;count:number}[];
  byCountry: {name:string;count:number}[];
  byDevice: {name:string;count:number}[];
}

export default function TrackingPage() {
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [stats, setStats]   = useState<TrackingStats|null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"events"|"stats">("stats");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("tracking_events") as any)
        .select("*, partner:partners(name)")
        .order("created_at",{ascending:false})
        .limit(500);

      const evts: TrackingEvent[] = data ?? [];
      setEvents(evts);

      // build stats
      const typeMap: Record<string,number> = {};
      const countryMap: Record<string,number> = {};
      const deviceMap: Record<string,number> = {};
      for (const e of evts) {
        typeMap[e.event_type??'unknown'] = (typeMap[e.event_type??'unknown']??0)+1;
        if (e.country) countryMap[e.country] = (countryMap[e.country]??0)+1;
        if (e.device)  deviceMap[e.device]   = (deviceMap[e.device]??0)+1;
      }
      setStats({
        totalEvents: evts.length,
        byType:    Object.entries(typeMap).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,count])=>({name,count})),
        byCountry: Object.entries(countryMap).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,count])=>({name,count})),
        byDevice:  Object.entries(deviceMap).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
      });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Tracking & Attribution</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Partner traffic and conversion tracking</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Total Events",(stats?.totalEvents??0).toLocaleString(),Activity,"blue"],
          ["Event Types",(stats?.byType.length??0),Link,"purple"],
          ["Countries",(stats?.byCountry.length??0),Globe,"green"],
          ["Devices",(stats?.byDevice.length??0),MousePointerClick,"orange"],
        ].map(([l,v,I,c]:any)=>(
          <div key={l} className="premium-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c==="green"?"bg-emerald-50 text-emerald-600":c==="purple"?"bg-purple-50 text-purple-600":c==="orange"?"bg-amber-50 text-amber-600":"bg-blue-50 text-blue-600"}`}><I className="h-5 w-5"/></div>
            <div><p className="text-xl font-bold text-[var(--color-text-heading)]">{v}</p><p className="text-xs text-[var(--color-text-secondary)]">{l}</p></div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--color-surface-subtle)] rounded-xl w-fit">
        {(["stats","events"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab===t?"bg-white shadow text-[var(--color-text-heading)]":"text-[var(--color-text-secondary)] hover:text-[var(--color-text-body)]"}`}>{t==="stats"?"Analytics":"Raw Events"}</button>
        ))}
      </div>

      {tab==="stats" && stats && !loading && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Event Types */}
          <div className="premium-card p-6">
            <h3 className="font-semibold text-[var(--color-text-heading)] mb-4 flex items-center gap-2"><Activity className="h-4 w-4"/>Event Types</h3>
            {stats.byType.length===0 ? <p className="text-sm text-[var(--color-text-muted)]">No data</p> : (
              <div className="space-y-2">
                {stats.byType.map(item=>(
                  <div key={item.name} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--color-text-body)] capitalize truncate">{item.name.replace(/_/g," ")}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full"><div className="h-full bg-[var(--color-brand-blue)] rounded-full" style={{width:`${(item.count/stats.totalEvents)*100}%`}}/></div>
                      <span className="text-xs font-bold text-[var(--color-text-heading)] w-8 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Countries */}
          <div className="premium-card p-6">
            <h3 className="font-semibold text-[var(--color-text-heading)] mb-4 flex items-center gap-2"><Globe className="h-4 w-4"/>Top Countries</h3>
            {stats.byCountry.length===0 ? <p className="text-sm text-[var(--color-text-muted)]">No data</p> : (
              <div className="space-y-2">
                {stats.byCountry.map(item=>(
                  <div key={item.name} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--color-text-body)]">{item.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{width:`${(item.count/stats.totalEvents)*100}%`}}/></div>
                      <span className="text-xs font-bold text-[var(--color-text-heading)] w-8 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Devices */}
          <div className="premium-card p-6">
            <h3 className="font-semibold text-[var(--color-text-heading)] mb-4 flex items-center gap-2"><MousePointerClick className="h-4 w-4"/>Devices</h3>
            {stats.byDevice.length===0 ? <p className="text-sm text-[var(--color-text-muted)]">No data</p> : (
              <div className="space-y-2">
                {stats.byDevice.map(item=>(
                  <div key={item.name} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--color-text-body)] capitalize">{item.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full"><div className="h-full bg-purple-500 rounded-full" style={{width:`${(item.count/stats.totalEvents)*100}%`}}/></div>
                      <span className="text-xs font-bold text-[var(--color-text-heading)] w-8 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab==="events" && (
        <div className="premium-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                  {["Time","Event","Partner","Source","Country","Device"].map(h=><th key={h} className="text-left px-4 py-3 font-semibold text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading?Array.from({length:6}).map((_,i)=><tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded"/></td></tr>)
                :events.length===0?<tr><td colSpan={6} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No tracking events found</td></tr>
                :events.slice(0,200).map(e=>(
                  <tr key={e.id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]">
                    <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">{e.event_type?.replace(/_/g," ")}</span></td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{(e.partner as any)?.name??"—"}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{e.source??"—"}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{e.country??"—"}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] capitalize">{e.device??"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && events.length===0 && tab==="stats" && (
        <div className="premium-card p-12 text-center">
          <TrendingUp className="h-10 w-10 text-[var(--color-text-muted)] mx-auto mb-3"/>
          <p className="font-medium text-[var(--color-text-heading)]">No tracking data yet</p>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Events will appear here once partners send tracking postbacks.</p>
        </div>
      )}
    </div>
  );
}
