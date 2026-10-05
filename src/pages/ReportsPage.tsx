/**
 * Reports — full data-driven charts and tables
 *
 * Charts:
 *  1. Partners by type (pie)
 *  2. Payments by status — count + amount (dual axis bar)
 *  3. Top partners by NGR (horizontal bar)
 *  4. Players by KYC status (donut)
 *  5. Deals by stage (bar)
 *  6. Lead funnel (stepped bar)
 *
 * Summary cards + conversion funnel at bottom
 */
import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "@/lib/supabase/client";
import { RefreshCw, TrendingUp, DollarSign, Users, Target, Globe, Briefcase, Download } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (t: string) => (supabase.from(t) as any);
const COLORS = ["#2563EB","#10B981","#F5B800","#EF4444","#8B5CF6","#F59E0B","#06B6D4","#EC4899"];
const TOOLTIP_STYLE = { background:"white", border:"1px solid #E2E8F0", borderRadius:"10px", fontSize:"12px" };
const fmt = (n: number) => n>=1_000_000?`$${(n/1_000_000).toFixed(1)}M`:n>=1_000?`$${(n/1_000).toFixed(1)}K`:`$${n.toLocaleString()}`;

function Card({ label, value, sub, icon, color }: { label:string; value:string|number; sub?:string; icon:React.ReactNode; color:string }) {
  const bg:Record<string,string> = { blue:"bg-blue-50 text-blue-600", green:"bg-emerald-50 text-emerald-600", orange:"bg-amber-50 text-amber-600", purple:"bg-purple-50 text-purple-600" };
  return (
    <div className="premium-card p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${bg[color]??bg.blue}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-[var(--color-text-heading)]">{value}</p>
        <p className="text-sm text-[var(--color-text-secondary)]">{label}</p>
        {sub && <p className="text-xs text-[var(--color-text-muted)]">{sub}</p>}
      </div>
    </div>
  );
}

function ChartBox({ title, subtitle, children }: { title:string; subtitle?:string; children:React.ReactNode }) {
  return (
    <div className="premium-card p-6">
      <h3 className="font-semibold text-[var(--color-text-heading)]">{title}</h3>
      {subtitle && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4"/>}
      {children}
    </div>
  );
}

export default function ReportsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [raw, setRaw] = useState<Record<string,any[]> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [partnersR, playersR, paymentsR, leadsR, dealsR, campaignsR] = await Promise.all([
        q("partners").select("id,name,status,partner_type,risk_level"),
        q("players").select("id,partner_id,ftd_date,ngr,kyc_status,status"),
        q("payments").select("id,status,total_amount,partner_id"),
        q("leads").select("id,status"),
        q("deals").select("id,stage,amount"),
        q("campaigns").select("id,status,channel,clicks,conversions,budget,spent"),
      ]);
      setRaw({
        partners:  partnersR.data  ?? [],
        players:   playersR.data   ?? [],
        payments:  paymentsR.data  ?? [],
        leads:     leadsR.data     ?? [],
        deals:     dealsR.data     ?? [],
        campaigns: campaignsR.data ?? [],
      });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── CSV exports ────────────────────────────────────────────────────────────

  const exportPartners = () => {
    if (!raw) return;
    downloadCSV("partners-report.csv", raw.partners ?? [], [
      { header: "ID",           accessor: (p) => p.id },
      { header: "Name",         accessor: (p) => p.name },
      { header: "Status",       accessor: (p) => p.status },
      { header: "Type",         accessor: (p) => p.partner_type },
      { header: "Risk Level",   accessor: (p) => p.risk_level ?? "" },
    ]);
  };

  const exportPlayers = () => {
    if (!raw) return;
    downloadCSV("players-report.csv", raw.players ?? [], [
      { header: "ID",           accessor: (p) => p.id },
      { header: "Partner ID",   accessor: (p) => p.partner_id ?? "" },
      { header: "NGR ($)",      accessor: (p) => p.ngr ?? 0 },
      { header: "FTD Date",     accessor: (p) => p.ftd_date ?? "" },
      { header: "KYC Status",   accessor: (p) => p.kyc_status ?? "" },
      { header: "Status",       accessor: (p) => p.status },
    ]);
  };

  const exportPayments = () => {
    if (!raw) return;
    downloadCSV("payments-ledger.csv", raw.payments ?? [], [
      { header: "ID",           accessor: (p) => p.id },
      { header: "Invoice",      accessor: (p) => p.invoice_number ?? "" },
      { header: "Status",       accessor: (p) => p.status },
      { header: "Amount ($)",   accessor: (p) => p.final_payable ?? p.total_amount ?? 0 },
      { header: "Method",       accessor: (p) => p.payment_method ?? "" },
      { header: "Requested By", accessor: (p) => p.requested_by_name ?? "" },
      { header: "Period",       accessor: (p) => p.payment_period ?? "" },
      { header: "Paid At",      accessor: (p) => p.paid_at ?? "" },
    ]);
  };

  if (loading || !raw) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-100 rounded-lg"/>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length:4}).map((_,i)=><div key={i} className="premium-card p-5 h-20 bg-gray-50"/>)}</div>
        <div className="grid gap-6 lg:grid-cols-2">{Array.from({length:4}).map((_,i)=><div key={i} className="premium-card p-6 h-64 bg-gray-50"/>)}</div>
      </div>
    );
  }

  const { partners, players, payments, leads, deals, campaigns } = raw;

  // ── derived data ──────────────────────────────────────────────────────────

  // partner type pie
  const typeMap: Record<string,number> = {};
  for (const p of partners) typeMap[p.partner_type??"other"] = (typeMap[p.partner_type??"other"]??0)+1;
  const partnersByType = Object.entries(typeMap).map(([name,value])=>({ name:name.replace(/_/g," "), value }));

  // payments per status — count + amount
  const payStatusMap: Record<string,{count:number;amt:number}> = {};
  for (const p of payments) {
    if (!payStatusMap[p.status]) payStatusMap[p.status] = { count:0, amt:0 };
    payStatusMap[p.status].count++;
    payStatusMap[p.status].amt += p.total_amount ?? 0;
  }
  const payColors: Record<string,string> = { paid:"#10B981", approved:"#2563EB", pending:"#F59E0B", rejected:"#EF4444", reviewed:"#8B5CF6", on_hold:"#94A3B8", below_minimum:"#F97316" };
  const paymentsByStatus = Object.entries(payStatusMap).map(([name,{count,amt}])=>({ name, count, amt, fill:payColors[name]??"#94A3B8" }));

  // top partners by NGR
  const ngrMap: Record<string,{name:string;ngr:number;players:number;ftds:number}> = {};
  for (const p of partners) ngrMap[p.id] = { name:p.name, ngr:0, players:0, ftds:0 };
  for (const pl of players) {
    if (pl.partner_id && ngrMap[pl.partner_id]) {
      ngrMap[pl.partner_id].ngr += pl.ngr??0;
      ngrMap[pl.partner_id].players++;
      if (pl.ftd_date) ngrMap[pl.partner_id].ftds++;
    }
  }
  const topPartners = Object.values(ngrMap).filter(p=>p.ngr>0||p.players>0).sort((a,b)=>b.ngr-a.ngr).slice(0,10);

  // players KYC donut
  const kycMap: Record<string,number> = {};
  for (const pl of players) kycMap[pl.kyc_status??"unknown"] = (kycMap[pl.kyc_status??"unknown"]??0)+1;
  const kycColors: Record<string,string> = { verified:"#10B981", pending:"#F59E0B", failed:"#EF4444", unverified:"#94A3B8" };
  const playersByKyc = Object.entries(kycMap).map(([name,value])=>({ name, value, fill:kycColors[name]??"#94A3B8" }));

  // deals by stage
  const stageMap: Record<string,{count:number;amt:number}> = {};
  for (const d of deals) {
    if (!stageMap[d.stage]) stageMap[d.stage] = {count:0,amt:0};
    stageMap[d.stage].count++;
    stageMap[d.stage].amt += d.amount??0;
  }
  const stageOrder = ["prospecting","qualification","proposal","negotiation","closed_won","closed_lost"];
  const dealsByStage = stageOrder.filter(s=>stageMap[s]).map(s=>({ name:s.replace(/_/g," "), count:stageMap[s].count, amt:stageMap[s].amt }));

  // leads funnel
  const leadStages = ["new","contacted","qualified","proposal","negotiation","converted","lost"];
  const leadsFunnel = leadStages.map(s=>({ name:s, count:leads.filter(l=>l.status===s).length }));

  // campaign performance (clicks vs conversions)
  const activeCampaigns = campaigns.filter(c=>c.channel).slice(0,8).map((c:any)=>({
    name: c.channel, clicks:c.clicks??0, conversions:c.conversions??0
  }));

  // summary numbers
  const paidAmt     = payments.filter(p=>p.status==="paid").reduce((s,p)=>s+p.total_amount,0);
  const pendingAmt  = payments.filter(p=>["pending","reviewed"].includes(p.status)).reduce((s,p)=>s+p.total_amount,0);
  const convertRate = leads.length ? ((leads.filter(l=>l.status==="converted").length/leads.length)*100).toFixed(1) : "0";

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Reports</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Platform-wide data analysis</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportPartners}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
            <Download className="h-4 w-4"/>Partners
          </button>
          <button onClick={exportPlayers}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
            <Download className="h-4 w-4"/>Players
          </button>
          <button onClick={exportPayments}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
            <Download className="h-4 w-4"/>Full Ledger
          </button>
          <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm font-medium hover:bg-[var(--color-surface-subtle)]">
            <RefreshCw className="h-4 w-4"/>Refresh
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Total Partners" value={`${partners.filter(p=>p.status==="active").length} / ${partners.length}`} sub="active / total" icon={<Globe className="h-5 w-5"/>} color="blue"/>
        <Card label="Total Players"  value={players.length} sub={`${players.filter(p=>p.ftd_date).length} FTD`} icon={<Target className="h-5 w-5"/>} color="purple"/>
        <Card label="Total Paid Out" value={fmt(paidAmt)} sub={`${payments.filter(p=>p.status==="paid").length} payments`} icon={<DollarSign className="h-5 w-5"/>} color="green"/>
        <Card label="Pending Amount" value={fmt(pendingAmt)} sub={`${payments.filter(p=>["pending","reviewed"].includes(p.status)).length} requests`} icon={<TrendingUp className="h-5 w-5"/>} color="orange"/>
      </div>

      {/* Row 1: Partners by type + KYC */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartBox title="Partners by Type" subtitle="Distribution across affiliate categories">
          {partnersByType.length===0
            ? <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No data</p>
            : <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={partnersByType} cx="50%" cy="50%" outerRadius={100} dataKey="value" paddingAngle={3}
                    label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {partnersByType.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE}/>
                </PieChart>
              </ResponsiveContainer>
          }
        </ChartBox>

        <ChartBox title="Players by KYC Status" subtitle="Know-your-customer verification breakdown">
          {playersByKyc.length===0
            ? <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No data</p>
            : <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={playersByKyc} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={3}
                    label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {playersByKyc.map((entry,i)=><Cell key={i} fill={entry.fill}/>)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE}/>
                  <Legend/>
                </PieChart>
              </ResponsiveContainer>
          }
        </ChartBox>
      </div>

      {/* Row 2: Payments by status */}
      <ChartBox title="Payments by Status" subtitle="Count and total amount per payment status">
        {paymentsByStatus.length===0
          ? <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No payments yet</p>
          : <ResponsiveContainer width="100%" height={280}>
              <BarChart data={paymentsByStatus} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                <YAxis yAxisId="left" tick={{fontSize:11}} tickLine={false} axisLine={false} label={{value:"Count",angle:-90,position:"insideLeft",fontSize:11}}/>
                <YAxis yAxisId="right" orientation="right" tick={{fontSize:11}} tickLine={false} axisLine={false} tickFormatter={v=>fmt(v)} label={{value:"Amount",angle:90,position:"insideRight",fontSize:11}}/>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v:any,name:string)=>[name==="count"?`${v} payments`:fmt(Number(v)),name==="count"?"Count":"Amount"]}/>
                <Legend/>
                <Bar yAxisId="left" dataKey="count" name="count" radius={[6,6,0,0]}>
                  {paymentsByStatus.map((entry,i)=><Cell key={i} fill={entry.fill}/>)}
                </Bar>
                <Bar yAxisId="right" dataKey="amt" name="amount" radius={[6,6,0,0]} opacity={0.35}>
                  {paymentsByStatus.map((entry,i)=><Cell key={i} fill={entry.fill}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        }
      </ChartBox>

      {/* Top partners by NGR — horizontal */}
      {topPartners.length>0 && (
        <ChartBox title="Top Partners by NGR" subtitle="Net Gaming Revenue — top 10 performers">
          <ResponsiveContainer width="100%" height={Math.max(topPartners.length*44,200)}>
            <BarChart data={topPartners} layout="vertical" barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false}/>
              <XAxis type="number" tick={{fontSize:11}} tickLine={false} axisLine={false} tickFormatter={v=>fmt(Number(v))}/>
              <YAxis type="category" dataKey="name" tick={{fontSize:11}} tickLine={false} axisLine={false} width={130}/>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v:any,name:string)=>[name==="ngr"?fmt(Number(v)):`${v}`,name==="ngr"?"NGR":"Players"]}/>
              <Legend/>
              <Bar dataKey="ngr" name="ngr" fill="#2563EB" radius={[0,6,6,0]}/>
              <Bar dataKey="players" name="players" fill="#10B981" radius={[0,6,6,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      {/* Row 3: Deals by stage + Leads funnel */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartBox title="Deals by Stage" subtitle="Count and value per deal stage">
          {dealsByStage.length===0
            ? <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No deals yet</p>
            : <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dealsByStage} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:10}} tickLine={false} axisLine={false}/>
                  <YAxis yAxisId="left" tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <YAxis yAxisId="right" orientation="right" tick={{fontSize:11}} tickLine={false} axisLine={false} tickFormatter={v=>fmt(v)}/>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v:any,name:string)=>[name==="count"?`${v} deals`:fmt(Number(v)),name==="count"?"Count":"Value"]}/>
                  <Legend/>
                  <Bar yAxisId="left" dataKey="count" name="count" fill="#2563EB" radius={[6,6,0,0]}/>
                  <Bar yAxisId="right" dataKey="amt" name="amount" fill="#10B981" radius={[6,6,0,0]} opacity={0.6}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </ChartBox>

        <ChartBox title="Lead Funnel" subtitle="Lead count through each pipeline stage">
          {leadsFunnel.every(l=>l.count===0)
            ? <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No leads yet</p>
            : <ResponsiveContainer width="100%" height={260}>
                <BarChart data={leadsFunnel.filter(l=>l.count>0)} barSize={30}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:10}} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={TOOLTIP_STYLE}/>
                  <Bar dataKey="count" radius={[6,6,0,0]}>
                    {leadsFunnel.filter(l=>l.count>0).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
          }
        </ChartBox>
      </div>

      {/* Campaign channels */}
      {activeCampaigns.length>0 && (
        <ChartBox title="Campaign Performance by Channel" subtitle="Clicks vs conversions per channel">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={activeCampaigns} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
              <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
              <Tooltip contentStyle={TOOLTIP_STYLE}/>
              <Legend/>
              <Bar dataKey="clicks" name="Clicks" fill="#2563EB" radius={[4,4,0,0]}/>
              <Bar dataKey="conversions" name="Conversions" fill="#10B981" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      {/* Conversion summary */}
      <div className="premium-card p-6">
        <h3 className="font-semibold text-[var(--color-text-heading)] mb-4">Conversion Summary</h3>
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="text-center p-4 rounded-xl bg-blue-50">
            <p className="text-3xl font-bold text-blue-700">{leads.length}</p>
            <p className="text-sm text-blue-600 mt-1">Total Leads</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-amber-50">
            <p className="text-3xl font-bold text-amber-700">{leads.filter(l=>l.status==="qualified").length}</p>
            <p className="text-sm text-amber-600 mt-1">Qualified</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-emerald-50">
            <p className="text-3xl font-bold text-emerald-700">{leads.filter(l=>l.status==="converted").length}</p>
            <p className="text-sm text-emerald-600 mt-1">Converted ({convertRate}%)</p>
          </div>
        </div>
      </div>

    </div>
  );
}
