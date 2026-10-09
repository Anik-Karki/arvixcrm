/**
 * Payment Requests Management
 * 
 * Finance-grade payment approval system for Admin and Finance roles.
 * Features:
 * - Requests Tab: Review and approve/reject payment requests
 * - Ledger Tab: Complete payment history and audit trail
 * - Full deal breakdown with FTDs, deposits, NGR
 * - Payment method details with QR images
 * - Approve/Reject/Mark as Paid workflow
 */

import { useCallback, useEffect, useState } from 'react';
import {
  DollarSign, CheckCircle, XCircle, Clock, Eye, X, AlertTriangle,
  RefreshCw, Search, Download, Upload, Image as ImageIcon, FileText,
} from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { Pagination } from '../components/Pagination';

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'paid';

interface UserProfile { id: string; full_name: string | null; role: string | null; }

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  team_leader: 'Team Leader',
  affiliate_manager: 'Affiliate Manager',
  finance: 'Finance',
  security: 'Security',
};

interface DealCalculation {
  deal_id: string;
  deal_title: string;
  partner_name: string;
  commission_type: string;
  eligible: boolean;
  reason?: string;
  ftds: number;
  eligible_ftds: number;
  deposits: number;
  ngr: number;
  amount: number;
  details: string;
}

interface PaymentRequest {
  id: string;
  user_id: string;
  amount: number;
  status: PaymentStatus;
  period_start: string;
  period_end: string;
  deals_included: DealCalculation[];
  calculation_details: any;
  payment_method: string;
  payment_details: Record<string, string>;
  payment_qr_image: string | null;
  payment_proof_image: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  paid_by: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PaymentRequestsPage() {
  const [tab, setTab] = useState<'requests' | 'ledger'>('requests');
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // Detail view
  const [viewingRequest, setViewingRequest] = useState<PaymentRequest | null>(null);
  
  // Actions
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'pay' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionProcessing, setActionProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  
  // Payment proof upload
  const [proofImage, setProofImage] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Success message
  const [success, setSuccess] = useState<string | null>(null);

  // ── Fetch payment requests ────────────────────────────────────────────────

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('payment_requests')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      setRequests(data || []);
      setTotalCount(count || 0);

      // Fetch user profiles for all requests
      const userIds = [...new Set((data || []).map((r: PaymentRequest) => r.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: userData } = await (supabase.from('users') as any)
          .select('id, full_name, role')
          .in('id', userIds);
        const profileMap: Record<string, UserProfile> = {};
        (userData || []).forEach((u: UserProfile) => { profileMap[u.id] = u; });
        setUserProfiles(profileMap);
      }
    } catch (err) {
      console.error('Error fetching payment requests:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!viewingRequest) return;
    
    setActionProcessing(true);
    setActionError(null);

    try {
      const { error } = await supabase
        .from('payment_requests')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
        })
        .eq('id', viewingRequest.id);

      if (error) throw error;

      setSuccess(`Payment request approved: $${viewingRequest.amount.toFixed(2)}`);
      setViewingRequest(null);
      setActionType(null);
      await fetchRequests();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to approve request');
    } finally {
      setActionProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!viewingRequest || !actionNotes.trim()) {
      setActionError('Please provide a rejection reason');
      return;
    }

    setActionProcessing(true);
    setActionError(null);

    try {
      const { error } = await supabase
        .from('payment_requests')
        .update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejection_reason: actionNotes.trim(),
        })
        .eq('id', viewingRequest.id);

      if (error) throw error;

      setSuccess('Payment request rejected');
      setViewingRequest(null);
      setActionType(null);
      setActionNotes('');
      await fetchRequests();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject request');
    } finally {
      setActionProcessing(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!viewingRequest) return;

    setActionProcessing(true);
    setActionError(null);

    try {
      // Upload proof image if provided
      let proofUrl = null;
      if (proofImage) {
        setUploading(true);
        const fileExt = proofImage.name.split('.').pop();
        const fileName = `admin/${viewingRequest.id}-proof-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('payment-images')
          .upload(fileName, proofImage);

        if (uploadError) {
          setActionError(`Failed to upload proof: ${uploadError.message}`);
          return;
        }

        const { data: urlData } = supabase.storage
          .from('payment-images')
          .getPublicUrl(fileName);
        
        proofUrl = urlData?.publicUrl || null;
        setUploading(false);
      }

      const { error } = await supabase
        .from('payment_requests')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_proof_image: proofUrl,
        })
        .eq('id', viewingRequest.id);

      if (error) throw error;

      setSuccess(`Payment marked as paid: $${viewingRequest.amount.toFixed(2)}`);
      setViewingRequest(null);
      setActionType(null);
      setProofImage(null);
      setProofPreview(null);
      setActionNotes('');
      await fetchRequests();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to mark as paid');
    } finally {
      setActionProcessing(false);
      setUploading(false);
    }
  };

  const handleProofImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setActionError('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setActionError('Image must be less than 5MB');
      return;
    }

    setProofImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setProofPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Helper functions ───────────────────────────────────────────────────────

  const fmt = (n: number) =>
    `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const dateShort = (s: string) =>
    new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const dateTime = (s: string) =>
    new Date(s).toLocaleString('en-GB', { 
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

  const STATUS_COLOR: Record<PaymentStatus, string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-300',
    approved: 'bg-blue-50 text-blue-700 border-blue-300',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    rejected: 'bg-red-50 text-red-700 border-red-300',
  };

  const STATUS_ICON: Record<PaymentStatus, any> = {
    pending: Clock,
    approved: CheckCircle,
    paid: CheckCircle,
    rejected: XCircle,
  };

  const PAYMENT_METHOD_ICON: Record<string, string> = {
    mobile_banking: '🏦',
    esewa: '📱',
    binance: '₿',
    usdt: '₮',
  };

  const filteredRequests = requests.filter(req => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const userName = (userProfiles[req.user_id]?.full_name || '').toLowerCase();
      return (
        req.id.toLowerCase().includes(query) ||
        userName.includes(query) ||
        req.payment_method?.toLowerCase().includes(query) ||
        req.deals_included?.some(d => d.partner_name.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const stats = {
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    paid: requests.filter(r => r.status === 'paid').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    totalAmount: requests.reduce((sum, r) => sum + r.amount, 0),
  };

  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Payment Requests</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Review and process partner commission payments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchRequests}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm hover:bg-[var(--color-surface-subtle)]">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-700">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {([
          ['Pending Review', stats.pending, Clock, 'amber'],
          ['Approved', stats.approved, CheckCircle, 'blue'],
          ['Paid', stats.paid, CheckCircle, 'green'],
          ['Rejected', stats.rejected, XCircle, 'red'],
          ['Total Amount', fmt(stats.totalAmount), DollarSign, 'purple'],
        ] as [string, string | number, any, string][]).map(([label, value, Icon, color]) => (
          <div key={label} className="premium-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              color === 'green' ? 'bg-emerald-50 text-emerald-600' :
              color === 'amber' ? 'bg-amber-50 text-amber-600' :
              color === 'blue' ? 'bg-blue-50 text-blue-600' :
              color === 'red' ? 'bg-red-50 text-red-600' :
              'bg-purple-50 text-purple-600'
            }`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--color-text-heading)]">{value}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border-default)]">
        <div className="flex gap-6">
          {(['requests', 'ledger'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
                tab === t
                  ? 'border-[var(--color-brand-blue)] text-[var(--color-brand-blue)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-body)]'
              }`}>
              {t === 'requests' ? 'Payment Requests' : 'Payment Ledger'}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search by partner, ID, or method..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm"
            />
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          className="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm bg-white">
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Requests Table */}
      {tab === 'requests' && (
        <div className="premium-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-default)]">
                  {['Requested By', 'Partner', 'Period', 'Deals', 'Amount', 'Payment Method', 'Status', 'Submitted', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-[var(--color-text-muted)]">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No payment requests found</p>
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map(req => {
                    const Icon = STATUS_ICON[req.status];
                    const partners = req.deals_included?.map(d => d.partner_name).filter((v, i, a) => a.indexOf(v) === i) || [];
                    
                    return (
                      <tr 
                        key={req.id} 
                        onClick={() => setViewingRequest(req)}
                        className="border-b border-[var(--color-border-subtle)] hover:bg-blue-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3.5">
                          {(() => {
                            const profile = userProfiles[req.user_id];
                            const displayName = profile?.full_name || req.user_id?.slice(0, 8) || '—';
                            const roleLabel = profile?.role ? (ROLE_LABELS[profile.role] ?? profile.role) : null;
                            return (
                              <div>
                                <p className="font-medium text-[var(--color-text-heading)]">{displayName}</p>
                                {roleLabel && (
                                  <p className="text-xs text-[var(--color-text-muted)]">{roleLabel}</p>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-[var(--color-text-heading)]">
                            {partners.join(', ') || 'Unknown'}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {req.deals_included?.length || 0} deal(s)
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-[var(--color-text-secondary)]">
                          {dateShort(req.period_start)} → {dateShort(req.period_end)}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">
                            {req.deals_included?.length || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-lg text-[var(--color-text-heading)]">{fmt(req.amount)}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{PAYMENT_METHOD_ICON[req.payment_method] || '💳'}</span>
                            <span className="text-sm capitalize">{req.payment_method?.replace('_', ' ')}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLOR[req.status]}`}>
                            <Icon className="h-3 w-3" />
                            {req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)]">
                          {dateTime(req.created_at)}
                        </td>
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setViewingRequest(req)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium shadow-sm transition-all">
                            <Eye className="h-3.5 w-3.5" />
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalCount > pageSize && (
            <div className="px-6 py-4 border-t border-[var(--color-border-default)]">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={totalCount}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Ledger Tab */}
      {tab === 'ledger' && (
        <div className="premium-card p-6">
          <p className="text-[var(--color-text-secondary)]">
            Complete payment history and audit trail will be displayed here.
          </p>
        </div>
      )}

      {/* Detail View Dialog */}
      {viewingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--color-border-default)] flex items-center justify-between bg-gradient-to-r from-blue-50 to-purple-50">
              <div>
                <h2 className="text-xl font-bold text-[var(--color-text-heading)]">
                  Payment Request Details
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono">
                  ID: {viewingRequest.id}
                </p>
              </div>
              <button
                onClick={() => {
                  setViewingRequest(null);
                  setActionType(null);
                  setActionError(null);
                  setActionNotes('');
                  setProofImage(null);
                  setProofPreview(null);
                }}
                className="p-2 rounded-lg hover:bg-white/50 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Dialog Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Requested By */}
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Requested By</p>
                <p className="font-semibold text-[var(--color-text-heading)]">
                  {userProfiles[viewingRequest.user_id]?.full_name || viewingRequest.user_id?.slice(0, 8) || '—'}
                </p>
                {userProfiles[viewingRequest.user_id]?.role && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {ROLE_LABELS[userProfiles[viewingRequest.user_id].role!] ?? userProfiles[viewingRequest.user_id].role}
                  </p>
                )}
              </div>

              {/* Status & Amount */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200">
                <div>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-1">Request Amount</p>
                  <p className="text-3xl font-bold text-[var(--color-text-heading)]">{fmt(viewingRequest.amount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--color-text-secondary)] mb-1">Status</p>
                  {(() => {
                    const Icon = STATUS_ICON[viewingRequest.status];
                    return (
                      <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border ${STATUS_COLOR[viewingRequest.status]}`}>
                        <Icon className="h-4 w-4" />
                        {viewingRequest.status.toUpperCase()}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Period & Submitted */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-xs text-[var(--color-text-muted)] mb-1">Period</p>
                  <p className="font-semibold text-[var(--color-text-heading)]">
                    {dateShort(viewingRequest.period_start)} → {dateShort(viewingRequest.period_end)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-xs text-[var(--color-text-muted)] mb-1">Submitted</p>
                  <p className="font-semibold text-[var(--color-text-heading)]">
                    {dateTime(viewingRequest.created_at)}
                  </p>
                </div>
              </div>

              {/* Deal Breakdown */}
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text-heading)] mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Deal Breakdown ({viewingRequest.deals_included?.length || 0})
                </h3>
                <div className="space-y-3">
                  {viewingRequest.deals_included?.map((deal, i) => (
                    <div
                      key={deal.deal_id}
                      className={`p-4 rounded-lg border-2 ${
                        deal.eligible
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-gray-50 border-gray-300'
                      }`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1">
                          <p className="font-semibold text-[var(--color-text-heading)]">
                            {deal.deal_title || `Deal ${i + 1}`}
                          </p>
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            {deal.partner_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-bold ${deal.eligible ? 'text-emerald-700' : 'text-gray-500'}`}>
                            {fmt(deal.amount)}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)] capitalize">
                            {deal.commission_type}
                          </p>
                        </div>
                      </div>

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-4 gap-3 mb-2">
                        <div className="text-center p-2 rounded bg-white/50">
                          <p className="text-xs text-[var(--color-text-muted)]">FTDs</p>
                          <p className="font-bold text-[var(--color-text-heading)]">{deal.ftds}</p>
                        </div>
                        <div className="text-center p-2 rounded bg-white/50">
                          <p className="text-xs text-[var(--color-text-muted)]">Eligible</p>
                          <p className="font-bold text-[var(--color-text-heading)]">{deal.eligible_ftds}</p>
                        </div>
                        <div className="text-center p-2 rounded bg-white/50">
                          <p className="text-xs text-[var(--color-text-muted)]">Deposits</p>
                          <p className="font-bold text-[var(--color-text-heading)]">{fmt(deal.deposits)}</p>
                        </div>
                        <div className="text-center p-2 rounded bg-white/50">
                          <p className="text-xs text-[var(--color-text-muted)]">NGR</p>
                          <p className="font-bold text-[var(--color-text-heading)]">{fmt(deal.ngr)}</p>
                        </div>
                      </div>

                      {/* Calculation Details */}
                      {deal.details && (
                        <p className="text-xs text-[var(--color-text-secondary)] bg-white/60 px-3 py-2 rounded">
                          {deal.details}
                        </p>
                      )}

                      {/* Ineligible Reason */}
                      {!deal.eligible && deal.reason && (
                        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded bg-amber-50 border border-amber-200">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700">{deal.reason}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text-heading)] mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Payment Method
                </h3>
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{PAYMENT_METHOD_ICON[viewingRequest.payment_method] || '💳'}</span>
                    <div>
                      <p className="font-semibold text-[var(--color-text-heading)] capitalize">
                        {viewingRequest.payment_method?.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">Preferred payment method</p>
                    </div>
                  </div>

                  {/* Payment Details */}
                  {viewingRequest.payment_details && Object.keys(viewingRequest.payment_details).length > 0 && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      {Object.entries(viewingRequest.payment_details).map(([key, value]) => (
                        <div key={key} className="p-2 rounded bg-white/60">
                          <p className="text-xs text-[var(--color-text-muted)] capitalize">
                            {key.replace('_', ' ')}
                          </p>
                          <p className="font-mono text-sm font-medium text-[var(--color-text-heading)]">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* QR Image */}
                  {viewingRequest.payment_qr_image && (
                    <div className="mt-3">
                      <p className="text-xs text-[var(--color-text-muted)] mb-2">Payment QR Code</p>
                      <div className="relative w-48 h-48 rounded-lg overflow-hidden border-2 border-blue-300 bg-white">
                        <img
                          src={viewingRequest.payment_qr_image}
                          alt="Payment QR"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Error */}
              {actionError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{actionError}</p>
                  <button onClick={() => setActionError(null)} className="ml-auto text-red-400 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Action Forms */}
              {actionType === 'approve' && (
                <div className="p-4 rounded-lg bg-blue-50 border-2 border-blue-300">
                  <h4 className="font-semibold text-[var(--color-text-heading)] mb-2">
                    Approve Payment Request
                  </h4>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                    This will approve the payment request for {fmt(viewingRequest.amount)}. The user will be able to see the approved status.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleApprove}
                      disabled={actionProcessing}
                      className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      {actionProcessing ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          Confirm Approval
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setActionType(null)}
                      disabled={actionProcessing}
                      className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {actionType === 'reject' && (
                <div className="p-4 rounded-lg bg-red-50 border-2 border-red-300">
                  <h4 className="font-semibold text-[var(--color-text-heading)] mb-2">
                    Reject Payment Request
                  </h4>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-3">
                    Please provide a reason for rejecting this request.
                  </p>
                  <textarea
                    value={actionNotes}
                    onChange={e => setActionNotes(e.target.value)}
                    placeholder="E.g., Insufficient FTD count, missing documentation, incorrect period..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm mb-4 min-h-[80px]"
                    disabled={actionProcessing}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleReject}
                      disabled={actionProcessing || !actionNotes.trim()}
                      className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      {actionProcessing ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4" />
                          Confirm Rejection
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setActionType(null);
                        setActionNotes('');
                      }}
                      disabled={actionProcessing}
                      className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {actionType === 'pay' && (
                <div className="p-4 rounded-lg bg-emerald-50 border-2 border-emerald-300">
                  <h4 className="font-semibold text-[var(--color-text-heading)] mb-2">
                    Mark as Paid
                  </h4>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                    Upload payment proof (optional) and confirm payment of {fmt(viewingRequest.amount)}.
                  </p>

                  {/* Proof Upload */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-[var(--color-text-heading)] mb-2">
                      Payment Proof (Optional)
                    </label>
                    <div className="flex items-start gap-3">
                      <label className="flex-1 flex items-center justify-center gap-2 px-4 py-8 rounded-lg border-2 border-dashed border-gray-300 hover:border-emerald-400 bg-white cursor-pointer transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProofImageChange}
                          disabled={actionProcessing || uploading}
                          className="hidden"
                        />
                        <Upload className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-[var(--color-text-secondary)]">
                          {proofImage ? proofImage.name : 'Click to upload proof'}
                        </span>
                      </label>
                      {proofPreview && (
                        <div className="relative w-32 h-32 rounded-lg overflow-hidden border-2 border-emerald-300">
                          <img src={proofPreview} alt="Proof preview" className="w-full h-full object-cover" />
                          <button
                            onClick={() => {
                              setProofImage(null);
                              setProofPreview(null);
                            }}
                            className="absolute top-1 right-1 p-1 rounded bg-red-600 text-white hover:bg-red-700">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-2">
                      Upload transaction receipt or confirmation screenshot (max 5MB)
                    </p>
                  </div>

                  {/* Notes */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-[var(--color-text-heading)] mb-2">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={actionNotes}
                      onChange={e => setActionNotes(e.target.value)}
                      placeholder="Any additional notes about this payment..."
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm min-h-[60px]"
                      disabled={actionProcessing || uploading}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleMarkAsPaid}
                      disabled={actionProcessing || uploading}
                      className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      {actionProcessing || uploading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          {uploading ? 'Uploading...' : 'Processing...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          Confirm Payment
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setActionType(null);
                        setActionNotes('');
                        setProofImage(null);
                        setProofPreview(null);
                      }}
                      disabled={actionProcessing || uploading}
                      className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Dialog Footer - Action Buttons */}
            {!actionType && viewingRequest.status === 'pending' && (
              <div className="px-6 py-4 border-t border-[var(--color-border-default)] bg-gray-50 flex items-center justify-end gap-3">
                <button
                  onClick={() => setActionType('reject')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 font-semibold hover:bg-red-100">
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  onClick={() => setActionType('approve')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700">
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </button>
              </div>
            )}

            {!actionType && viewingRequest.status === 'approved' && (
              <div className="px-6 py-4 border-t border-[var(--color-border-default)] bg-gray-50 flex items-center justify-end gap-3">
                <button
                  onClick={() => setActionType('pay')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700">
                  <DollarSign className="h-4 w-4" />
                  Mark as Paid
                </button>
              </div>
            )}

            {viewingRequest.status === 'rejected' && viewingRequest.rejection_reason && (
              <div className="px-6 py-4 border-t border-[var(--color-border-default)] bg-red-50">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Rejection Reason</p>
                <p className="text-sm text-red-700 font-medium">{viewingRequest.rejection_reason}</p>
                {viewingRequest.rejected_at && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Rejected on {dateTime(viewingRequest.rejected_at)}
                  </p>
                )}
              </div>
            )}

            {viewingRequest.status === 'paid' && (
              <div className="px-6 py-4 border-t border-[var(--color-border-default)] bg-emerald-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-700">Payment Completed</p>
                    {viewingRequest.paid_at && (
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        Paid on {dateTime(viewingRequest.paid_at)}
                      </p>
                    )}
                  </div>
                  {viewingRequest.payment_proof_image && (
                    <a
                      href={viewingRequest.payment_proof_image}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 text-xs font-medium hover:bg-emerald-50">
                      <ImageIcon className="h-3.5 w-3.5" />
                      View Proof
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
