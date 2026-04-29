/**
 * Mulaqat change-request tab content.
 * - role='desk-in-charge' → DI's view of their OWN requests (Cancel pending, Mark seen)
 * - role='super-admin'    → SA's review queue (Approve / Reject pending requests)
 *
 * Reads from the `mulaqat_requests` table. Approve action also updates `delegations.slot_id`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Check, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { formatDate, formatTimestamp } from '@/utils/dateHelpers';

export interface MulaqatRequest {
  id: string;
  delegation_id: string;
  delegation_name: string;
  country: string;
  requested_by: string;
  requested_by_name: string;
  requested_by_role: string;
  current_day_id: string | null;
  current_day_date: string | null;
  current_day_name: string | null;
  current_slot: string | null;
  requested_day_id: string | null;
  requested_day_date: string | null;
  requested_day_name: string | null;
  requested_slot: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  seen_by_requester: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface MulaqatRequestsTabProps {
  /** When the request list changes (insert/update/delete) the parent may want to refresh
   *  delegations so the new slot shows up on Delegation tabs. */
  onRequestApproved?: (req: MulaqatRequest) => void;
}

function StatusPill({ status }: { status: MulaqatRequest['status'] }) {
  const cls = status === 'approved' ? 'bg-green-100 text-green-700'
            : status === 'rejected' ? 'bg-red-100 text-red-700'
            :                         'bg-amber-100 text-amber-700';
  const txt = status === 'approved' ? '✅ Approved'
            : status === 'rejected' ? '❌ Rejected'
            :                         '⏳ Pending';
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{txt}</span>;
}

export function MulaqatRequestsTab({ onRequestApproved }: MulaqatRequestsTabProps) {
  const { user } = useAuth();
  const isAdmin   = user?.role === 'super-admin';
  const isDI      = user?.role === 'desk-in-charge';
  const [requests, setRequests] = useState<MulaqatRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState<MulaqatRequest | null>(null);
  const [confirmCancel,  setConfirmCancel]  = useState<MulaqatRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const q = supabase.from('mulaqat_requests').select('*').order('created_at', { ascending: false });
    if (isDI && user?.id) q.eq('requested_by', user.id);
    const { data, error } = await q;
    if (error) console.error('[MulaqatRequests] fetch error:', error);
    setRequests((data ?? []) as MulaqatRequest[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('mulaqat-requests-tab')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'mulaqat_requests' }, (payload: { eventType: string; new?: MulaqatRequest; old?: { id?: string } }) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          if (isDI && payload.new.requested_by !== user?.id) return;
          setRequests(prev => [payload.new as MulaqatRequest, ...prev]);
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          if (isDI && payload.new.requested_by !== user?.id) return;
          setRequests(prev => prev.map(r => r.id === payload.new!.id ? payload.new as MulaqatRequest : r));
        } else if (payload.eventType === 'DELETE' && payload.old?.id) {
          setRequests(prev => prev.filter(r => r.id !== payload.old!.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isDI]);

  const pending   = useMemo(() => requests.filter(r => r.status === 'pending'),   [requests]);
  const completed = useMemo(() => requests.filter(r => r.status !== 'pending'),  [requests]);

  // ── SA actions ───────────────────────────────────────────────────────────────

  const doApprove = async (req: MulaqatRequest) => {
    if (!user) return;
    setBusy(true);
    const now = new Date().toISOString();

    // 1. Move the delegation to the new slot
    if (req.requested_slot) {
      const { error: delErr } = await supabase
        .from('delegations')
        .update({ slot_id: req.requested_slot })
        .eq('id', req.delegation_id);
      if (delErr) {
        console.error('[Approve] Failed to move delegation:', delErr);
        toast.error('Failed to move delegation: ' + delErr.message);
        setBusy(false);
        return;
      }
    }

    // 2. Mark the request approved
    const { error: reqErr } = await supabase.from('mulaqat_requests').update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_by_name: user.name,
      reviewed_at: now,
      seen_by_requester: false,
      updated_at: now,
    }).eq('id', req.id);
    setBusy(false);
    setConfirmApprove(null);
    if (reqErr) { console.error('[Approve] Failed:', reqErr); toast.error('Failed: ' + reqErr.message); return; }
    toast.success(`Approved — ${req.delegation_name} moved to ${req.requested_day_name ?? '?'}`);
    onRequestApproved?.(req);
  };

  const doReject = async (req: MulaqatRequest) => {
    if (!user) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('mulaqat_requests').update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_by_name: user.name,
      reviewed_at: now,
      seen_by_requester: false,
      updated_at: now,
    }).eq('id', req.id);
    if (error) { console.error('[Reject] Failed:', error); toast.error('Failed: ' + error.message); return; }
    toast.info(`Rejected — ${req.delegation_name} stays on ${req.current_day_name ?? '?'}`);
  };

  // ── DI actions ───────────────────────────────────────────────────────────────

  const doCancel = async (req: MulaqatRequest) => {
    setBusy(true);
    const { error } = await supabase.from('mulaqat_requests').delete().eq('id', req.id);
    setBusy(false);
    setConfirmCancel(null);
    if (error) { console.error('[Cancel] Failed:', error); toast.error('Failed: ' + error.message); return; }
    toast.info('Request cancelled');
  };

  const markSeen = async (req: MulaqatRequest) => {
    if (req.seen_by_requester) return;
    const { error } = await supabase.from('mulaqat_requests')
      .update({ seen_by_requester: true })
      .eq('id', req.id);
    if (error) console.error('[MarkSeen] Failed:', error);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#4A4A4A]">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading requests…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── PENDING ── */}
      <div>
        <h2 className="text-base font-semibold text-[#1A1A1A] mb-3">
          {isAdmin ? 'Pending Change Requests' : 'My Pending Requests'}
          <span className="ml-2 text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400 italic px-1">No pending requests.</p>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">{isAdmin ? 'Country' : 'Delegation'}</th>
                  {isAdmin && <th className="px-3 py-2 text-left">Requested By</th>}
                  <th className="px-3 py-2 text-left">Current</th>
                  <th className="px-3 py-2 text-left">Requested</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Submitted</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E3DB]">
                {pending.map(r => (
                  <tr key={r.id} className="hover:bg-[#F5F0E8]/40">
                    <td className="px-3 py-3 font-medium text-[#1A1A1A]">{isAdmin ? r.country : r.delegation_name}</td>
                    {isAdmin && <td className="px-3 py-3 text-[#4A4A4A] text-sm">{r.requested_by_name}</td>}
                    <td className="px-3 py-3 text-[#4A4A4A] text-xs">{r.current_day_name ?? '—'}</td>
                    <td className="px-3 py-3 text-[#2D5A45] font-medium text-xs">{r.requested_day_name ?? '—'}</td>
                    <td className="px-3 py-3 text-[#4A4A4A] italic text-xs max-w-[220px] truncate" title={r.reason ?? ''}>{r.reason ?? '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {isAdmin ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setConfirmApprove(r)}
                            disabled={busy}
                            className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1"
                          ><Check className="w-3 h-3" /> Approve</button>
                          <button
                            onClick={() => doReject(r)}
                            disabled={busy}
                            className="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-100 disabled:opacity-50 inline-flex items-center gap-1"
                          ><X className="w-3 h-3" /> Reject</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmCancel(r)}
                          disabled={busy}
                          className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"
                        ><Trash2 className="w-3 h-3" /> Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── COMPLETED (collapsible) ── */}
      <div>
        <button
          onClick={() => setShowCompleted(s => !s)}
          className="flex items-center justify-between w-full py-2 border-t border-gray-200 mt-2"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Completed</span>
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">{completed.length}</span>
          </div>
          {showCompleted ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showCompleted && completed.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">{isAdmin ? 'Country' : 'Delegation'}</th>
                  {isAdmin && <th className="px-3 py-2 text-left">Requested By</th>}
                  <th className="px-3 py-2 text-left">Change</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Reviewed By</th>
                  <th className="px-3 py-2 text-left">Reviewed At</th>
                  {!isAdmin && <th className="px-3 py-2 text-left"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E3DB]">
                {completed.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => !isAdmin && markSeen(r)}
                    className={`${!r.seen_by_requester && !isAdmin ? 'bg-amber-50/40' : ''} hover:bg-[#F5F0E8]/40 cursor-pointer`}
                  >
                    <td className="px-3 py-3 font-medium text-[#1A1A1A]">{isAdmin ? r.country : r.delegation_name}</td>
                    {isAdmin && <td className="px-3 py-3 text-[#4A4A4A] text-sm">{r.requested_by_name}</td>}
                    <td className="px-3 py-3 text-[#4A4A4A] text-xs">
                      {r.current_day_name ?? '—'} → <span className="text-[#2D5A45] font-medium">{r.requested_day_name ?? '—'}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap"><StatusPill status={r.status} /></td>
                    <td className="px-3 py-3 text-[#4A4A4A] text-sm">{r.reviewed_by_name ?? '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">{r.reviewed_at ? formatTimestamp(r.reviewed_at) : '—'}</td>
                    {!isAdmin && <td className="px-3 py-3">{!r.seen_by_requester && <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">NEW</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SA Approve confirm */}
      <Dialog open={!!confirmApprove} onOpenChange={o => { if (!o) setConfirmApprove(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Approve Change Request?</DialogTitle>
          </DialogHeader>
          {confirmApprove && (
            <div className="text-sm text-[#4A4A4A] space-y-2 py-2">
              <p><span className="font-medium text-[#1A1A1A]">{confirmApprove.delegation_name}</span></p>
              <p>{confirmApprove.current_day_name} → <span className="text-[#2D5A45] font-medium">{confirmApprove.requested_day_name}</span></p>
              <p className="text-xs text-gray-500 italic">This will move the delegation to the new slot.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApprove(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={() => confirmApprove && doApprove(confirmApprove)}
              disabled={busy}
              className="bg-green-600 hover:bg-green-700 text-white"
            >{busy ? 'Approving…' : 'Approve'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DI Cancel confirm */}
      <Dialog open={!!confirmCancel} onOpenChange={o => { if (!o) setConfirmCancel(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel this request?</DialogTitle>
          </DialogHeader>
          {confirmCancel && (
            <p className="text-sm text-[#4A4A4A] py-2">
              Cancel the change request for <span className="font-medium text-[#1A1A1A]">{confirmCancel.delegation_name}</span>?
              The delegation will stay on {confirmCancel.current_day_name}.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(null)} disabled={busy}>Keep Request</Button>
            <Button
              onClick={() => confirmCancel && doCancel(confirmCancel)}
              disabled={busy}
              className="bg-red-600 hover:bg-red-700 text-white"
            >{busy ? 'Cancelling…' : 'Cancel Request'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
