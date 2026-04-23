/**
 * Vehicle maintenance log components — shared across driver and manager views.
 * Exports:
 *   - MaintenanceEntry (type)
 *   - MAINT_TYPE_META, MAINT_STATUS_META (constants)
 *   - AddMaintenanceDialog (add / edit a single maintenance entry)
 *   - ViewMaintenanceLogDialog (read-only log table for any driver)
 */
import { useEffect, useState } from 'react';
import { Wrench, Pencil, Trash2, Plus, Loader2, X } from 'lucide-react';
import { formatDate } from '@/utils/dateHelpers';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// ── types ─────────────────────────────────────────────────────────────────────

export type MaintenanceType =
  | 'oil_change' | 'service' | 'repair' | 'tyre_change'
  | 'mot' | 'wash_clean' | 'fuel' | 'other';

export type MaintenanceStatus = 'completed' | 'scheduled' | 'overdue';

export interface MaintenanceEntry {
  id: string;
  driver_id: string;
  vehicle_registration?: string;
  type: MaintenanceType;
  description?: string;
  date: string;
  current_mileage?: number;
  cost?: number;
  next_due_date?: string;
  next_due_mileage?: number;
  status: MaintenanceStatus;
  created_at: string;
}

// ── constants ─────────────────────────────────────────────────────────────────

export const MAINT_TYPE_META: Record<MaintenanceType, { label: string; cls: string }> = {
  oil_change:  { label: 'Oil Change',  cls: 'bg-amber-100 text-amber-700' },
  service:     { label: 'Service',     cls: 'bg-blue-100 text-blue-700' },
  repair:      { label: 'Repair',      cls: 'bg-red-100 text-red-700' },
  tyre_change: { label: 'Tyre Change', cls: 'bg-gray-100 text-gray-700' },
  mot:         { label: 'MOT',         cls: 'bg-green-100 text-green-700' },
  wash_clean:  { label: 'Wash/Clean',  cls: 'bg-cyan-100 text-cyan-700' },
  fuel:        { label: 'Fuel',        cls: 'bg-orange-100 text-orange-700' },
  other:       { label: 'Other',       cls: 'bg-gray-100 text-gray-600' },
};

export const MAINT_STATUS_META: Record<MaintenanceStatus, { label: string; cls: string }> = {
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700' },
  overdue:   { label: 'Overdue',   cls: 'bg-red-100 text-red-700' },
};

const MAINT_TYPE_OPTIONS: MaintenanceType[] = [
  'oil_change', 'service', 'repair', 'tyre_change', 'mot', 'wash_clean', 'fuel', 'other',
];

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => formatDate(iso);

function fmtCost(n: number) {
  return `£${n.toFixed(2)}`;
}

/** Compute effective status for an entry based on today's date */
export function computeStatus(entry: Pick<MaintenanceEntry, 'next_due_date' | 'status'>): MaintenanceStatus {
  if (!entry.next_due_date) return entry.status;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(entry.next_due_date + 'T12:00:00');
  if (due < today) return 'overdue';
  const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diff <= 7) return 'scheduled';
  return entry.status;
}

// ── AddMaintenanceDialog ──────────────────────────────────────────────────────

export interface AddMaintenanceDialogProps {
  open: boolean;
  onClose: () => void;
  driverId: string;
  vehicleRegistration?: string;
  /** Pre-fill the type (e.g. when opening from an alert) */
  preselectedType?: MaintenanceType;
  /** Entry to edit — if provided, form is in edit mode */
  editEntry?: MaintenanceEntry | null;
  onSaved: (entry: MaintenanceEntry) => void;
}

type NextDueMode = 'date' | 'mileage' | 'both';

export function AddMaintenanceDialog({
  open, onClose, driverId, vehicleRegistration,
  preselectedType, editEntry, onSaved,
}: AddMaintenanceDialogProps) {
  const isEdit = !!editEntry;

  const [type,        setType]        = useState<MaintenanceType>('oil_change');
  const [date,        setDate]        = useState('');
  const [description, setDescription] = useState('');
  const [mileage,     setMileage]     = useState('');
  const [cost,        setCost]        = useState('');
  const [nextMode,    setNextMode]    = useState<NextDueMode>('date');
  const [nextDate,    setNextDate]    = useState('');
  const [nextMileage, setNextMileage] = useState('');
  const [saving,      setSaving]      = useState(false);

  // Reset / populate when dialog opens or editEntry changes
  useEffect(() => {
    if (!open) return;
    if (editEntry) {
      setType(editEntry.type);
      setDate(editEntry.date);
      setDescription(editEntry.description ?? '');
      setMileage(editEntry.current_mileage != null ? String(editEntry.current_mileage) : '');
      setCost(editEntry.cost != null ? String(editEntry.cost) : '');
      const hasBoth = !!(editEntry.next_due_date && editEntry.next_due_mileage);
      const hasDate = !!editEntry.next_due_date;
      const hasMile = !!editEntry.next_due_mileage;
      setNextMode(hasBoth ? 'both' : hasMile ? 'mileage' : 'date');
      setNextDate(editEntry.next_due_date ?? '');
      setNextMileage(editEntry.next_due_mileage != null ? String(editEntry.next_due_mileage) : '');
    } else {
      setType(preselectedType ?? 'oil_change');
      setDate(new Date().toISOString().split('T')[0]);
      setDescription(''); setMileage(''); setCost('');
      setNextMode('date'); setNextDate(''); setNextMileage('');
    }
  }, [open, editEntry, preselectedType]);

  const handleSave = async () => {
    if (!date) { toast.error('Date is required'); return; }
    setSaving(true);
    try {
      const record = {
        driver_id:          driverId,
        vehicle_registration: vehicleRegistration ?? null,
        type,
        description:        description || null,
        date,
        current_mileage:    mileage ? Number(mileage) : null,
        cost:               cost ? Number(cost) : null,
        next_due_date:      (nextMode === 'date' || nextMode === 'both') && nextDate ? nextDate : null,
        next_due_mileage:   (nextMode === 'mileage' || nextMode === 'both') && nextMileage ? Number(nextMileage) : null,
        status:             'completed' as MaintenanceStatus,
      };

      let data: MaintenanceEntry;
      if (isEdit && editEntry) {
        const { data: d, error } = await supabase
          .from('vehicle_maintenance')
          .update(record)
          .eq('id', editEntry.id)
          .select()
          .single();
        if (error) throw error;
        data = d as MaintenanceEntry;
        toast.success('Maintenance entry updated');
      } else {
        const { data: d, error } = await supabase
          .from('vehicle_maintenance')
          .insert(record)
          .select()
          .single();
        if (error) throw error;
        data = d as MaintenanceEntry;
        toast.success('Maintenance entry added');
      }
      onSaved(data);
      onClose();
    } catch {
      toast.error('Failed to save maintenance entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            {isEdit ? 'Edit Maintenance Entry' : 'Add Maintenance Entry'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select value={type} onChange={e => setType(e.target.value as MaintenanceType)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
              {MAINT_TYPE_OPTIONS.map(t => (
                <option key={t} value={t}>{MAINT_TYPE_META[t].label}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Date <span className="text-red-500">*</span></Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Front brake pads replaced"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>

          {/* Mileage + Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Current Mileage (km)</Label>
              <Input type="number" min={0} value={mileage} onChange={e => setMileage(e.target.value)}
                placeholder="e.g. 45230"
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <Label>Cost £ (optional)</Label>
              <Input type="number" min={0} step="0.01" value={cost} onChange={e => setCost(e.target.value)}
                placeholder="e.g. 85.00"
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            </div>
          </div>

          {/* Next Due */}
          <div className="space-y-2">
            <Label>Next Due</Label>
            <div className="flex gap-3">
              {(['date', 'mileage', 'both'] as NextDueMode[]).map(m => (
                <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="nextMode" value={m} checked={nextMode === m}
                    onChange={() => setNextMode(m)} className="accent-[#2D5A45]" />
                  {m === 'date' ? 'By Date' : m === 'mileage' ? 'By Mileage' : 'Both'}
                </label>
              ))}
            </div>
            {(nextMode === 'date' || nextMode === 'both') && (
              <Input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
                placeholder="Next due date"
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            )}
            {(nextMode === 'mileage' || nextMode === 'both') && (
              <div className="flex items-center gap-2">
                <Input type="number" min={0} value={nextMileage} onChange={e => setNextMileage(e.target.value)}
                  placeholder="e.g. 50000"
                  className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
                <span className="text-sm text-[#4A4A4A] shrink-0">km</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}
            className="bg-[#2D5A45] hover:bg-[#234839] text-white">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Saving…</> : 'Save Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ViewMaintenanceLogDialog ──────────────────────────────────────────────────

export interface ViewMaintenanceLogDialogProps {
  open: boolean;
  onClose: () => void;
  driverId: string;
  driverName: string;
  vehicleRegistration?: string;
  /** If provided, "Add Entry" button is shown and calls this */
  onAddEntry?: () => void;
}

export function ViewMaintenanceLogDialog({
  open, onClose, driverId, driverName, vehicleRegistration, onAddEntry,
}: ViewMaintenanceLogDialogProps) {
  const [entries,  setEntries]  = useState<MaintenanceEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editEntry, setEditEntry] = useState<MaintenanceEntry | null>(null);
  const [editOpen,  setEditOpen]  = useState(false);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);

  useEffect(() => {
    if (!open || !driverId) return;
    setLoading(true);
    supabase
      .from('vehicle_maintenance')
      .select('*')
      .eq('driver_id', driverId)
      .order('date', { ascending: false })
      .then(({ data }) => {
        setEntries((data ?? []) as MaintenanceEntry[]);
        setLoading(false);
      });
  }, [open, driverId]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('vehicle_maintenance').delete().eq('id', id);
    if (error) { toast.error('Failed to delete entry'); return; }
    toast.success('Entry deleted');
    setEntries(prev => prev.filter(e => e.id !== id));
    setDeleteId(null);
  };

  const handleSaved = (saved: MaintenanceEntry) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="w-4 h-4" /> Maintenance Log — {driverName}
              </DialogTitle>
              {onAddEntry && (
                <Button size="sm" onClick={onAddEntry}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white gap-1.5 mr-6">
                  <Plus className="w-3.5 h-3.5" /> Add Entry
                </Button>
              )}
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-[#4A4A4A]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : entries.length === 0 ? (
            <div className="py-10 text-center text-[#4A4A4A] text-sm">No maintenance entries yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]">
                    <th className="px-3 py-2.5 text-left font-medium text-[#4A4A4A]">Date</th>
                    <th className="px-3 py-2.5 text-left font-medium text-[#4A4A4A]">Type</th>
                    <th className="px-3 py-2.5 text-left font-medium text-[#4A4A4A]">Description</th>
                    <th className="px-3 py-2.5 text-left font-medium text-[#4A4A4A]">Mileage</th>
                    <th className="px-3 py-2.5 text-left font-medium text-[#4A4A4A]">Cost</th>
                    <th className="px-3 py-2.5 text-left font-medium text-[#4A4A4A]">Next Due</th>
                    <th className="px-3 py-2.5 text-left font-medium text-[#4A4A4A]">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium text-[#4A4A4A]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E3DB]">
                  {entries.map(e => {
                    const effectiveStatus = computeStatus(e);
                    const sm = MAINT_STATUS_META[effectiveStatus];
                    const tm = MAINT_TYPE_META[e.type];
                    const nextDue = [
                      e.next_due_date    ? fmtDate(e.next_due_date) : '',
                      e.next_due_mileage ? `${e.next_due_mileage.toLocaleString()} km` : '',
                    ].filter(Boolean).join(' / ');
                    return (
                      <tr key={e.id} className="hover:bg-[#F5F0E8]/50">
                        <td className="px-3 py-2.5 text-[#1A1A1A] whitespace-nowrap">{fmtDate(e.date)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tm.cls}`}>{tm.label}</span>
                        </td>
                        <td className="px-3 py-2.5 text-[#4A4A4A] max-w-[160px] truncate">{e.description ?? '—'}</td>
                        <td className="px-3 py-2.5 text-[#4A4A4A] whitespace-nowrap">
                          {e.current_mileage != null ? `${e.current_mileage.toLocaleString()} km` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[#4A4A4A] whitespace-nowrap">
                          {e.cost != null ? fmtCost(e.cost) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[#4A4A4A] text-xs whitespace-nowrap">{nextDue || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.label}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditEntry(e); setEditOpen(true); }} title="Edit"
                              className="p-1 rounded text-[#4A4A4A] hover:text-[#2D5A45] hover:bg-[#F5F0E8]">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {deleteId === e.id ? (
                              <>
                                <button onClick={() => handleDelete(e.id)}
                                  className="text-xs text-red-600 font-medium px-1.5 py-0.5 rounded hover:bg-red-50">Yes</button>
                                <button onClick={() => setDeleteId(null)}
                                  className="text-xs text-[#4A4A4A] px-1.5 py-0.5 rounded hover:bg-[#F5F0E8]">No</button>
                              </>
                            ) : (
                              <button onClick={() => setDeleteId(e.id)} title="Delete"
                                className="p-1 rounded text-[#4A4A4A] hover:text-red-600 hover:bg-red-50">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit sub-dialog */}
      <AddMaintenanceDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditEntry(null); }}
        driverId={driverId}
        vehicleRegistration={vehicleRegistration}
        editEntry={editEntry}
        onSaved={handleSaved}
      />
    </>
  );
}
