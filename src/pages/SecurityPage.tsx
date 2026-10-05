import { useCallback, useEffect, useState } from "react";
import { Search, RefreshCw, Shield, AlertTriangle, CheckCircle, Clock, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type ReviewStatus = "pending"|"reviewing"|"approved"|"flagged"|"rejected";
type RiskLevel    = "low"|"medium"|"high"|"critical";

interface SecurityReview {
  id: string; partner_id: string|null; review_type: string;
  status: ReviewStatus; risk_level: RiskLevel; risk_score: number;
  findings: string|null; reviewer_id: string|null; created_at: string;
  partner?: { name: string };
}

const STATUS_COLOR: Record<ReviewStatus,string> = {
  pending:   "bg-amber-50 text-amber-700 border-amber-200",
  reviewing: "bg-blue-50 text-blue-700 border-blue-200",
  approved:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  flagged:   "bg-orange-50 text-orange-700 border-orange-200",
  rejected:  "bg-red-50 text-red-700 border-red-200",
};

const RISK_COLOR: Record<RiskLevel,string> = {
  low:      "bg-emerald-50 text-emerald-700",
  medium:   "bg-amber-50 text-amber-700",
  high:     "bg-orange-50 text-orange-700",
  critical: "bg-red-50 text-red-700",
};

export default function SecurityPage() {
  const [reviews, setReviews]   = useState<SecurityReview[]>([]);
  const [players, setPlayers]   = useState<{id:string;player_id:string;risk_score:number;status:string}[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [tab, setTab]           = useState<"reviews"|"players">("reviews");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [reviewsRes, playersRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("security_reviews") as any).select("*, partner:partners(name)").order("created_at",{ascending:false}).limit(200),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("players") as any).select("id,player_id,risk_score,status").gte("risk_score",60).order("risk_score",{ascending:false}).limit(200),
    ]);
    setReviews(reviewsRes.data ?? []);
    setPlayers(playersRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateReview = async (id:string, status:ReviewStatus) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("security_reviews") as any).update({ status, updated_at:new Date().toISOString() }).eq("id",id);
    setReviews(prev=>prev.map(r=>r.id===id?{...r,status}:r));
  };

  const filteredReviews = reviews.filter(r => {
    const q = search.toLowerCase();
    return !q || (r.partner as any)?.name?.toLowerCase().includes(q) || r.review_type?.toLowerCase().includes(q);
  });

  const stats = {
    pending:  reviews.filter(r=>r.status==="pending").length,
    flagged:  reviews.filter(r=>r.status==="flagged").length,
    critical: reviews.filter(r=>r.risk_level==="critical").length,
    highPlayers: players.filter(p=>p.risk_score>=70).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Security</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Risk management and fraud monitoring</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[["Pending Reviews",stats.pending,Clock,"orange"],["Flagged",stats.flagged,AlertTriangle,"red"],["Critical Risk",stats.critical,Shield,"red"],["High-Risk Players",stats.highPlayers,AlertTriangle,"orange"]].map(([l,v,I,c]:any)=>(
          <div key={l} className="premium-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c==="red"?"bg-red-50 text-red-600":"bg-amber-50 text-amber-600"}`}><I className="h-5 w-5"/></div>
            <div><p className="text-xl font-bold text-[var(--color-text-heading)]">{v}</p><p className="text-xs text-[var(--color-text-secondary)]">{l}</p></div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--color-surface-subtle)] rounded-xl w-fit">
        {(["reviews","players"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab===t?"bg-white shadow text-[var(--color-text-heading)]":"text-[var(--color-text-secondary)] hover:text-[var(--color-text-body)]"}`}>{t==="reviews"?"Security Reviews":"High-Risk Players"}</button>
        ))}
      </div>

      {tab==="reviews" && (
        <>
          <div className="premium-card p-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]"/>
              <input type="text" placeholder="Search reviews…" value={search} onChange={e=>setSearch(e.target.value)} className="field focus:field-focus pl-9"/>
            </div>
          </div>
          <div className="premium-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                    {["Partner","Type","Risk Level","Risk Score","Status","Date","Actions"].map(h=><th key={h} className="text-left px-4 py-3 font-semibold text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {loading?Array.from({length:4}).map((_,i)=><tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded"/></td></tr>)
                  :filteredReviews.length===0?<tr><td colSpan={7} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No reviews found</td></tr>
                  :filteredReviews.map(r=>(
                    <tr key={r.id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]">
                      <td className="px-4 py-3 font-medium text-[var(--color-text-heading)]">{(r.partner as any)?.name??"Unknown"}</td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)] capitalize">{r.review_type?.replace(/_/g," ")}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_COLOR[r.risk_level]}`}>{r.risk_level}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full"><div className={`h-full rounded-full ${r.risk_score>=70?"bg-red-500":r.risk_score>=40?"bg-amber-500":"bg-emerald-500"}`} style={{width:`${r.risk_score}%`}}/></div>
                          <span className="text-xs text-[var(--color-text-muted)]">{r.risk_score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_COLOR[r.status]}`}>{r.status}</span></td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {r.status==="pending" && <button onClick={()=>updateReview(r.id,"reviewing")} className="px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">Review</button>}
                          {["pending","reviewing"].includes(r.status) && <button onClick={()=>updateReview(r.id,"approved")} className="px-2 py-1 rounded text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">Approve</button>}
                          {["pending","reviewing"].includes(r.status) && <button onClick={()=>updateReview(r.id,"flagged")} className="px-2 py-1 rounded text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 font-medium">Flag</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab==="players" && (
        <div className="premium-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                  {["Player ID","Risk Score","Status"].map(h=><th key={h} className="text-left px-4 py-3 font-semibold text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading?Array.from({length:5}).map((_,i)=><tr key={i}><td colSpan={3} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded"/></td></tr>)
                :players.length===0?<tr><td colSpan={3} className="px-4 py-16 text-center text-[var(--color-text-muted)]">No high-risk players</td></tr>
                :players.map(p=>(
                  <tr key={p.id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]">
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-body)]">{p.player_id}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 rounded-full"><div className={`h-full rounded-full ${p.risk_score>=70?"bg-red-500":"bg-amber-500"}`} style={{width:`${p.risk_score}%`}}/></div>
                        <span className={`font-bold text-sm ${p.risk_score>=70?"text-red-600":"text-amber-600"}`}>{p.risk_score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${p.status==="active"?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-slate-50 text-slate-600 border-slate-200"}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
