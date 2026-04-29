/**
 * Dialog used by Desk Incharge to REQUEST a Mulaqat day/slot change for a delegation
 * that already has an assigned day. Inserts a row into the `mulaqat_requests` table.
 * Super Admin then reviews from the SA Requests tab.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/utils/dateHelpers';

interface DayOption  { id: string; date: string; label: string | null }
interface SlotOption { id: string; name: string; day_id: string | null }

export interface MulaqatChangeRequestDialogProps {
  open: boolean;
  onClose: () => void;
  /** The delegation needing a change */
  delegationId: string;
  delegationName: string;       // shown in title and stored on the request row
  country: string;              // stored on the request row (for SA filtering)
  /** Current day + slot the delegation is assigned to */
  currentDayId: string;
  currentDayDate: string;
  currentDayName: string;
  currentSlotId: string;
  currentSlotName: string;
  /** Days available to pick (already filtered by earliest-departure logic by caller) */
  availableDays: DayOption[];
  /** All slots — caller passes the full list; the dialog filters by selected day */
  allSlots: SlotOption[];
  /** Called after a successful insert so the caller can refresh + show "Change Requested" badge */
  onSubmitted?: () => void;
}

export function MulaqatChangeRequestDialog({
  open, onClose,
  delegationId, delegationName, country,
  currentDayId, currentDayDate, currentDayName,
  currentSlotId, currentSlotName,
  availableDays, allSlots,
  onSubmitted,
}: MulaqatChangeRequestDialogProps) {
  const { user } = useAuth();
  const [newDayId,  setNewDayId]  = useState('');
  const [newSlotId, setNewSlotId] = useState('');
  const [reason,    setReason]    = useState('');
  const [error,     setError]     = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (!open) { setNewDayId(''); setNewSlotId(''); setReason(''); setError(null); setSaving(false); }
  }, [open]);

  // Exclude the current day from the picker — no point requesting the same day
  const dayOptions = availableDays.filter(d => d.id !== currentDayId);
  const slotOptions = newDayId ? allSlots.filter(s => s.day_id === newDayId) : [];

  const dayLabel = (d: DayOption) =>
    d.label ? `${formatDate(d.date)} — ${d.label}` : formatDate(d.date);

  const handleSubmit = async () => {
    if (!user) return;
    if (!newDayId)        { setError('Please pick a new date'); return; }
    if (!newSlotId)       { setError('Please pick a new slot'); return; }
    if (reason.trim().length < 5) { setError('Reason is required (at least 5 characters)'); return; }
    setError(null);
    setSaving(true);

    const newDay  = availableDays.find(d => d.id === newDayId);
    const newSlot = allSlots.find(s => s.id === newSlotId);

    const { error: insErr } = await supabase.from('mulaqat_requests').insert({
      delegation_id: delegationId,
      delegation_name: delegationName,
      country,
      requested_by: user.id,
      requested_by_name: user.name,
      requested_by_role: user.role,
      current_day_id: currentDayId,
      current_day_date: currentDayDate,
      current_day_name: currentDayName,
      current_slot: currentSlotId,
      requested_day_id: newDayId,
      requested_day_date: newDay?.date ?? null,
      requested_day_name: newDay ? dayLabel(newDay) : null,
      requested_slot: newSlotId,
      reason: reason.trim(),
      status: 'pending',
      seen_by_requester: true, // requester has seen their own pending request
    });
    setSaving(false);
    if (insErr) {
      console.error('[MulaqatRequest] Insert failed:', insErr);
      toast.error('Failed to submit request: ' + insErr.message);
      return;
    }
    toast.success('Change request submitted — waiting for Super Admin approval');
    onSubmitted?.();
    onClose();
    void newSlot; // referenced for type — kept for any future name-storage need
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Mulaqat Change</DialogTitle>
          <p className="text-sm text-[#4A4A4A] mt-1">{delegationName}</p>
          <p className="text-xs text-[#4A4A4A] mt-0.5">
            Current: <span className="font-medium text-[#1A1A1A]">{currentDayName} · {currentSlotName}</span>
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">New Date</label>
            <select
              value={newDayId}
              onChange={e => { setNewDayId(e.target.value); setNewSlotId(''); }}
              className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
            >
              <option value="">Select a day...</option>
              {dayOptions.length === 0
                ? <option value="" disabled>No other days available within delegation departure window</option>
                : [...dayOptions].sort((a, b) => a.date.localeCompare(b.date)).map(d => (
                    <option key={d.id} value={d.id}>{dayLabel(d)}</option>
                  ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">New Slot</label>
            <select
              value={newSlotId}
              onChange={e => setNewSlotId(e.target.value)}
              disabled={!newDayId}
              className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none disabled:opacity-50"
            >
              <option value="">Select a slot...</option>
              {slotOptions.map(s => (
                <option key={s.id} value={s.id} disabled={s.id === currentSlotId}>
                  {s.name}{s.id === currentSlotId ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">
              Reason for change <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why is this delegation being moved?"
              rows={4}
              className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none min-h-[80px]"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            ℹ️ This will be sent to Super Admin for approval. The current date will not change until approved.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-[#2D5A45] hover:bg-[#234839] text-white"
          >
            {saving ? 'Submitting…' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
