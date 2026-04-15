/**
 * Shared "Create Driver Task" dialog.
 * Features: guest autocomplete, batch passenger list, priority selector,
 *           vehicle capacity warning, auto-inserts driver_task_passengers.
 * Used by: DriverAllTasksPage, LocationDriversPage, DeptDriversPage, AdminDriversPage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, Plus, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useDesignations } from '@/hooks/useDesignations';
import { supabase } from '@/lib/supabase';
import type { DriverTaskType, DriverTaskPriority } from '@/types';
import { getAutoPriority } from '@/lib/driverTaskUtils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface DriverInfo {
  id: string;
  name: string;
  vehicle_type?: string;
  vehicle_model?: string;
  vehicle_capacity?: number;
  is_available?: boolean;
  location?: string;
}

export interface CreatedTask {
  id: string;
  driver_id: string;
  driver_name?: string;
  task_type: DriverTaskType;
  priority: DriverTaskPriority;
  status: string;
  scheduled_date: string;
  scheduled_time?: string;
  guest_name?: string;
  pickup_location?: string;
  dropoff_location?: string;
  [key: string]: unknown;
}

interface PassengerPill {
  guest_id: string;
  guest_name: string;
}

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  drivers: DriverInfo[];
  preselectedDriverId?: string;
  locationName?: string;
  departmentName?: string;
  onCreated?: (task: CreatedTask) => void;
}

// ── priority options ──────────────────────────────────────────────────────────

const PRIORITY_OPTIONS: { value: DriverTaskPriority; label: string; activeCls: string }[] = [
  { value: 'normal', label: 'Normal',    activeCls: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'urgent', label: '! Urgent',  activeCls: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'vip',    label: '⭐ VIP',    activeCls: 'bg-purple-100 text-purple-700 border-purple-300' },
];

// ── component ─────────────────────────────────────────────────────────────────

export function CreateTaskDialog({
  open, onClose, drivers, preselectedDriverId,
  locationName = '', departmentName, onCreated,
}: CreateTaskDialogProps) {
  const { user } = useAuth();
  const { guests } = useGuests();
  const { designations } = useDesignations();

  const [taskType, setTaskType]         = useState<DriverTaskType>('airport_pickup');
  const [priority, setPriority]         = useState<DriverTaskPriority>('normal');
  const [guestSearch, setGuestSearch]   = useState('');
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [guestOpen, setGuestOpen]       = useState(false);
  const [passengers, setPassengers]     = useState<PassengerPill[]>([]);
  const [paxSearch, setPaxSearch]       = useState('');
  const [paxOpen, setPaxOpen]           = useState(false);
  const [pickup, setPickup]             = useState('');
  const [dropoff, setDropoff]           = useState('');
  const [date, setDate]                 = useState('');
  const [time, setTime]                 = useState('');
  const [flight, setFlight]             = useState('');
  const [terminal, setTerminal]         = useState('');
  const [airport, setAirport]           = useState('');
  const [driverId, setDriverId]         = useState('');
  const [notes, setNotes]               = useState('');
  const [saving, setSaving]             = useState(false);
  const [scheduleWarning, setScheduleWarning] = useState<string | null>(null);

  const guestRef = useRef<HTMLDivElement>(null);
  const paxRef   = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setTaskType('airport_pickup'); setPriority('normal');
      setGuestSearch(''); setSelectedGuestId('');
      setPassengers([]); setPaxSearch(''); setPaxOpen(false);
      setPickup(''); setDropoff(''); setDate(''); setTime('');
      setFlight(''); setTerminal(''); setAirport('');
      setNotes(''); setGuestOpen(false);
      setScheduleWarning(null);
      setDriverId(preselectedDriverId ?? '');
    }
  }, [open, preselectedDriverId]);

  // Auto-fill from primary guest
  const selectedGuest = useMemo(() => guests.find(g => g.id === selectedGuestId), [guests, selectedGuestId]);

  // Resolve designation tiers for the selected guest
  const guestDesigTiers = useMemo(() => {
    if (!selectedGuest) return [];
    const names = selectedGuest.designation
      ? (Array.isArray(selectedGuest.designation) ? selectedGuest.designation : [selectedGuest.designation])
      : [];
    return designations.filter(d => names.includes(d.name)).map(d => d.tier);
  }, [selectedGuest, designations]);

  useEffect(() => {
    if (!selectedGuest) return;
    if (taskType === 'airport_pickup') {
      const d = selectedGuest.arrivalTime?.substring(0, 10) ?? '';
      const t = selectedGuest.arrivalTime?.includes('T') ? selectedGuest.arrivalTime.substring(11, 16) : '';
      setDate(d); setTime(t);
      setFlight(selectedGuest.arrivalFlightNumber ?? '');
      setAirport(selectedGuest.arrivalAirport ?? '');
      setTerminal(selectedGuest.arrivalTerminal ?? '');
      setPickup([selectedGuest.arrivalAirport, selectedGuest.arrivalTerminal].filter(Boolean).join(' ') || '');
      setDropoff(locationName);
      setPriority(getAutoPriority(selectedGuest.designation, d || undefined, t || undefined, guestDesigTiers));
    } else if (taskType === 'airport_dropoff') {
      const d = selectedGuest.departureTime?.substring(0, 10) ?? '';
      const t = selectedGuest.departureTime?.includes('T') ? selectedGuest.departureTime.substring(11, 16) : '';
      setDate(d); setTime(t);
      setFlight(selectedGuest.departureFlightNumber ?? '');
      setAirport(selectedGuest.departureAirport ?? '');
      setTerminal(selectedGuest.departureTerminal ?? '');
      setPickup(locationName);
      setDropoff([selectedGuest.departureAirport, selectedGuest.departureTerminal].filter(Boolean).join(' ') || '');
      setPriority(getAutoPriority(selectedGuest.designation, d || undefined, t || undefined, guestDesigTiers));
    }
  }, [selectedGuest, taskType, locationName, guestDesigTiers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (taskType === 'mulaqat_transport') { setPickup(locationName); setDropoff('Mulaqat Venue'); }
  }, [taskType, locationName]);

  // Close dropdowns on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (guestRef.current && !guestRef.current.contains(e.target as Node)) setGuestOpen(false);
      if (paxRef.current   && !paxRef.current.contains(e.target as Node))   setPaxOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filteredGuests = useMemo(() => {
    const q = guestSearch.toLowerCase();
    if (!q) return guests.slice(0, 20);
    return guests.filter(g =>
      g.fullName.toLowerCase().includes(q) ||
      g.referenceNumber.toLowerCase().includes(q) ||
      g.country.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [guests, guestSearch]);

  // Passenger search: exclude primary guest + already-added
  const addedIds = useMemo(
    () => new Set([selectedGuestId, ...passengers.map(p => p.guest_id)]),
    [selectedGuestId, passengers],
  );
  const filteredPax = useMemo(() => {
    const q = paxSearch.toLowerCase();
    return guests
      .filter(g => !addedIds.has(g.id))
      .filter(g => !q || g.fullName.toLowerCase().includes(q) || g.referenceNumber.toLowerCase().includes(q))
      .slice(0, 20);
  }, [guests, paxSearch, addedIds]);

  const addPassenger = (g: typeof guests[number]) => {
    setPassengers(prev => [...prev, { guest_id: g.id, guest_name: g.fullName }]);
    setPaxSearch(''); setPaxOpen(false);
  };

  const selectedDriver = useMemo(() => drivers.find(d => d.id === driverId), [drivers, driverId]);

  // Schedule-aware warning: check driver_schedules when driver + date both set
  useEffect(() => {
    setScheduleWarning(null);
    if (!driverId || !date) return;
    supabase
      .from('driver_schedules')
      .select('status')
      .eq('driver_id', driverId)
      .eq('date', date)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status === 'off_duty') {
          setScheduleWarning(`${selectedDriver?.name ?? 'This driver'} is marked Off Duty on ${date}. You can still assign the task.`);
        } else if (data?.status === 'leave') {
          setScheduleWarning(`${selectedDriver?.name ?? 'This driver'} is on Leave on ${date}. You can still assign the task.`);
        }
      });
  }, [driverId, date, selectedDriver]);

  // Total pax = 1 (primary guest) + extras; if no primary guest, just extras
  const totalPax = (selectedGuestId ? 1 : 0) + passengers.length;
  const capacityWarning = selectedDriver?.vehicle_capacity != null && totalPax > selectedDriver.vehicle_capacity;

  const isAirport = taskType === 'airport_pickup' || taskType === 'airport_dropoff';

  const handleSave = useCallback(async () => {
    if (!date) { toast.error('Date is required'); return; }
    if (!driverId) { toast.error('Assign to a driver'); return; }
    if (!pickup || !dropoff) { toast.error('Pickup and drop-off locations are required'); return; }
    if (!user) return;

    const guestLabel = passengers.length > 0 && flight
      ? `${totalPax} guests on ${flight}`
      : passengers.length > 0
        ? `${totalPax} guests`
        : (selectedGuest?.fullName ?? null);

    setSaving(true);
    try {
      const { data, error } = await supabase.from('driver_tasks').insert({
        driver_id:        driverId,
        driver_name:      selectedDriver?.name ?? null,
        task_type:        taskType,
        priority,
        guest_id:         selectedGuestId || null,
        guest_name:       guestLabel,
        guest_reference:  selectedGuest?.referenceNumber ?? null,
        pickup_location:  pickup,
        dropoff_location: dropoff,
        scheduled_date:   date,
        scheduled_time:   time || null,
        flight_number:    flight || null,
        airport:          airport || null,
        terminal:         terminal || null,
        passenger_count:  totalPax || 1,
        status:           'pending',
        is_suggestion:    false,
        notes:            notes || null,
        assigned_by:      user.id,
        assigned_by_name: user.name,
        location:         selectedDriver?.location ?? locationName,
        department:       departmentName ?? null,
      }).select().single();

      if (error) throw error;

      const taskId = (data as { id: string }).id;

      // Insert passenger records
      const paxRows = [
        ...(selectedGuestId ? [{ task_id: taskId, guest_id: selectedGuestId, guest_name: selectedGuest?.fullName ?? '' }] : []),
        ...passengers.map(p => ({ task_id: taskId, guest_id: p.guest_id, guest_name: p.guest_name })),
      ];
      if (paxRows.length > 0) {
        await supabase.from('driver_task_passengers').insert(paxRows);
      }

      toast.success(`Task created and assigned to ${selectedDriver?.name ?? 'driver'}`);
      onCreated?.(data as CreatedTask);
      onClose();
    } catch {
      toast.error('Failed to create task');
    } finally {
      setSaving(false);
    }
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    date, driverId, pickup, dropoff, user, selectedDriver, taskType, priority,
    selectedGuestId, selectedGuest, time, flight, airport, terminal,
    totalPax, passengers, notes, locationName, departmentName, onCreated, onClose,
  ]);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Task type */}
          <div className="space-y-1.5">
            <Label>Task Type</Label>
            <select value={taskType} onChange={e => setTaskType(e.target.value as DriverTaskType)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
              <option value="airport_pickup">Airport Pickup</option>
              <option value="airport_dropoff">Airport Drop-off</option>
              <option value="mulaqat_transport">Mulaqat Transport</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setPriority(opt.value)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                    priority === opt.value
                      ? opt.activeCls + ' ring-2 ring-offset-1 ring-current/40'
                      : 'border-[#E8E3DB] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Primary guest */}
          {taskType !== 'mulaqat_transport' && (
            <div className="space-y-1.5">
              <Label>Primary Guest</Label>
              <div className="relative" ref={guestRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                <input
                  value={guestSearch}
                  onChange={e => { setGuestSearch(e.target.value); setGuestOpen(true); setSelectedGuestId(''); }}
                  onFocus={() => setGuestOpen(true)}
                  placeholder="Search guest…"
                  className="w-full pl-9 pr-4 py-2 text-sm border border-[#E8E3DB] rounded-lg focus:outline-none focus:border-[#2D5A45] bg-white"
                />
                {guestOpen && filteredGuests.length > 0 && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-[#E8E3DB] rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredGuests.map(g => (
                      <button key={g.id} onClick={() => { setSelectedGuestId(g.id); setGuestSearch(g.fullName); setGuestOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#F5F0E8] transition-colors">
                        <span className="font-medium text-[#1A1A1A]">{g.fullName}</span>
                        <span className="text-[#4A4A4A] text-xs ml-2">{g.country} · {g.referenceNumber}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedGuest && <p className="text-xs text-[#4A4A4A] pl-1">✓ {selectedGuest.fullName} ({selectedGuest.referenceNumber})</p>}
            </div>
          )}

          {/* Additional passengers */}
          {taskType !== 'mulaqat_transport' && (
            <div className="space-y-1.5">
              <Label>Additional Passengers</Label>
              {passengers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {passengers.map(p => (
                    <span key={p.guest_id} className="inline-flex items-center gap-1 text-xs bg-[#2D5A45]/10 text-[#2D5A45] px-2 py-1 rounded-full">
                      {p.guest_name}
                      <button onClick={() => setPassengers(prev => prev.filter(x => x.guest_id !== p.guest_id))}
                        className="hover:text-red-600 ml-0.5"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative" ref={paxRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                <input value={paxSearch}
                  onChange={e => { setPaxSearch(e.target.value); setPaxOpen(true); }}
                  onFocus={() => setPaxOpen(true)}
                  placeholder="+ Add another guest…"
                  className="w-full pl-9 pr-4 py-2 text-sm border border-[#E8E3DB] rounded-lg focus:outline-none focus:border-[#2D5A45] bg-white"
                />
                {paxOpen && filteredPax.length > 0 && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-[#E8E3DB] rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {filteredPax.map(g => (
                      <button key={g.id} onClick={() => addPassenger(g)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#F5F0E8] transition-colors">
                        <span className="font-medium text-[#1A1A1A]">{g.fullName}</span>
                        <span className="text-[#4A4A4A] text-xs ml-2">{g.country} · {g.referenceNumber}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {totalPax > 1 && (
                <p className="text-xs text-[#4A4A4A] pl-1">{totalPax} passengers total</p>
              )}
              {capacityWarning && (
                <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ⚠️ {totalPax} passengers but vehicle capacity is {selectedDriver?.vehicle_capacity} — consider a larger vehicle
                </div>
              )}
            </div>
          )}

          {/* Route */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pickup Location</Label>
              <Input value={pickup} onChange={e => setPickup(e.target.value)} placeholder="e.g. Heathrow T2"
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <Label>Dropoff Location</Label>
              <Input value={dropoff} onChange={e => setDropoff(e.target.value)} placeholder="e.g. Jamia"
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            </div>
          </div>

          {/* Flight info */}
          {isAirport && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Flight No.</Label>
                <Input value={flight} onChange={e => setFlight(e.target.value)} placeholder="BA123"
                  className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
              </div>
              <div className="space-y-1.5">
                <Label>Airport</Label>
                <Input value={airport} onChange={e => setAirport(e.target.value)} placeholder="LHR"
                  className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
              </div>
              <div className="space-y-1.5">
                <Label>Terminal</Label>
                <Input value={terminal} onChange={e => setTerminal(e.target.value)} placeholder="T2"
                  className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
              </div>
            </div>
          )}

          {/* Driver */}
          <div className="space-y-1.5">
            <Label>Assign to Driver <span className="text-red-500">*</span></Label>
            <select value={driverId} onChange={e => setDriverId(e.target.value)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
              <option value="">Select driver…</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.location ? ` · ${d.location}` : ''}
                  {d.vehicle_type ? ` · ${d.vehicle_type}` : ''}
                  {d.vehicle_capacity != null ? ` (${d.vehicle_capacity} pax)` : ''}
                  {d.is_available === true ? ' 🟢' : d.is_available === false ? ' 🔴' : ''}
                </option>
              ))}
            </select>
          </div>

          {scheduleWarning && (
            <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              ⚠️ {scheduleWarning}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes…"
              rows={2} className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] resize-none bg-white" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Creating…</> : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
