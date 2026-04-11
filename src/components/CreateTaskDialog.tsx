/**
 * Shared "Create Driver Task" dialog.
 * Used by: DriverAllTasksPage, LocationDriversPage, DeptDriversPage, AdminDriversPage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { supabase } from '@/lib/supabase';
import type { DriverTaskType } from '@/types';
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
  status: string;
  scheduled_date: string;
  scheduled_time?: string;
  guest_name?: string;
  pickup_location?: string;
  dropoff_location?: string;
  [key: string]: unknown;
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

export function CreateTaskDialog({
  open, onClose, drivers, preselectedDriverId,
  locationName = '', departmentName, onCreated,
}: CreateTaskDialogProps) {
  const { user } = useAuth();
  const { guests } = useGuests();

  const [taskType, setTaskType]         = useState<DriverTaskType>('airport_pickup');
  const [guestSearch, setGuestSearch]   = useState('');
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [guestOpen, setGuestOpen]       = useState(false);
  const [pickup, setPickup]             = useState('');
  const [dropoff, setDropoff]           = useState('');
  const [date, setDate]                 = useState('');
  const [time, setTime]                 = useState('');
  const [flight, setFlight]             = useState('');
  const [terminal, setTerminal]         = useState('');
  const [airport, setAirport]           = useState('');
  const [pax, setPax]                   = useState('1');
  const [driverId, setDriverId]         = useState('');
  const [notes, setNotes]               = useState('');
  const [saving, setSaving]             = useState(false);

  const guestRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setTaskType('airport_pickup'); setGuestSearch(''); setSelectedGuestId('');
      setPickup(''); setDropoff(''); setDate(''); setTime('');
      setFlight(''); setTerminal(''); setAirport('');
      setPax('1'); setNotes(''); setGuestOpen(false);
      setDriverId(preselectedDriverId ?? '');
    }
  }, [open, preselectedDriverId]);

  // Auto-fill from guest
  const selectedGuest = useMemo(() => guests.find(g => g.id === selectedGuestId), [guests, selectedGuestId]);

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
    } else if (taskType === 'airport_dropoff') {
      const d = selectedGuest.departureTime?.substring(0, 10) ?? '';
      const t = selectedGuest.departureTime?.includes('T') ? selectedGuest.departureTime.substring(11, 16) : '';
      setDate(d); setTime(t);
      setFlight(selectedGuest.departureFlightNumber ?? '');
      setAirport(selectedGuest.departureAirport ?? '');
      setTerminal(selectedGuest.departureTerminal ?? '');
      setPickup(locationName);
      setDropoff([selectedGuest.departureAirport, selectedGuest.departureTerminal].filter(Boolean).join(' ') || '');
    }
  }, [selectedGuest, taskType, locationName]);

  useEffect(() => {
    if (taskType === 'mulaqat_transport') { setPickup(locationName); setDropoff('Mulaqat Venue'); }
  }, [taskType, locationName]);

  // Close guest dropdown on outside click
  useEffect(() => {
    function h(e: MouseEvent) { if (guestRef.current && !guestRef.current.contains(e.target as Node)) setGuestOpen(false); }
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

  const selectedDriver = useMemo(() => drivers.find(d => d.id === driverId), [drivers, driverId]);

  const handleSave = useCallback(async () => {
    if (!date) { toast.error('Date is required'); return; }
    if (!driverId) { toast.error('Assign to a driver'); return; }
    if (!pickup || !dropoff) { toast.error('Pickup and drop-off locations are required'); return; }
    if (!user) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('driver_tasks').insert({
        driver_id:        driverId,
        driver_name:      selectedDriver?.name ?? null,
        task_type:        taskType,
        guest_id:         selectedGuestId || null,
        guest_name:       selectedGuest?.fullName ?? null,
        guest_reference:  selectedGuest?.referenceNumber ?? null,
        pickup_location:  pickup,
        dropoff_location: dropoff,
        scheduled_date:   date,
        scheduled_time:   time || null,
        flight_number:    flight || null,
        airport:          airport || null,
        terminal:         terminal || null,
        passenger_count:  Number(pax) || 1,
        status:           'pending',
        is_suggestion:    false,
        notes:            notes || null,
        assigned_by:      user.id,
        assigned_by_name: user.name,
        location:         selectedDriver?.location ?? locationName,
        department:       departmentName ?? null,
      }).select().single();
      if (error) throw error;
      toast.success(`Task created and assigned to ${selectedDriver?.name ?? 'driver'}`);
      onCreated?.(data as CreatedTask);
      onClose();
    } catch {
      toast.error('Failed to create task');
    } finally {
      setSaving(false);
    }
  }, [date, driverId, pickup, dropoff, user, selectedDriver, taskType, selectedGuestId, selectedGuest, time, flight, airport, terminal, pax, notes, locationName, departmentName, onCreated, onClose]);

  const isAirport = taskType === 'airport_pickup' || taskType === 'airport_dropoff';

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

          {/* Guest search */}
          {taskType !== 'mulaqat_transport' && (
            <div className="space-y-1.5">
              <Label>Guest</Label>
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

          {/* Passengers */}
          <div className="space-y-1.5">
            <Label>Passengers</Label>
            <Input type="number" min={1} max={99} value={pax} onChange={e => setPax(e.target.value)}
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45] w-24" />
          </div>

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
