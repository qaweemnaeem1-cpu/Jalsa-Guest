import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useDelegations } from '@/hooks/useDelegations';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Calendar, ChevronDown, ChevronRight, Search,
  Star, UserCheck, UserMinus, UserPlus, Users, User, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { ProfileDialog, getRoleDisplayLabel } from '@/components/ProfileDialog';
import { DESK_NAV } from '@/lib/navItems';
import type { Guest } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MulaqatDay {
  id: string;
  date: string;
  label: string | null;
}

interface MulaqatSlot {
  id: string;
  name: string;
  day_id: string | null;
}

interface DelegationDetail {
  id: string;
  country: string;
  head_of_delegation_id: string | null;
  head_of_delegation_name: string | null;
  slot_id: string | null;
  managed_by: string | null;
  managed_by_name: string | null;
}

interface TableRow {
  dayId: string;
  dayDate: string;
  dayLabel: string | null;
  slotId: string;
  slotName: string;
  delegations: DelegationDetail[];
  isFirstSlotOfDay: boolean;
  daySlotCount: number;
}

interface DaftariDay {
  id: string;
  date: string;
  label: string | null;
  is_active: boolean;
}

interface DaftariSlot {
  id: string;
  name: string;
  day_id: string | null;
  guest_id: string | null;
  guest_name: string | null;
  assigned_by: string | null;
  assigned_by_name: string | null;
}

interface DaftariScheduleRow {
  dayId: string;
  dayDate: string;
  dayLabel: string | null;
  slotId: string;
  slotName: string;
  guestId: string | null;
  guestName: string | null;
  guestCountry: string | null;
  guestDesignation: string | null;
  assignedByName: string | null;
  isFirstSlotOfDay: boolean;
  daySlotCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dayHeader(day: MulaqatDay | DaftariDay): string {
  const dateStr = fmt(day.date);
  return day.label ? `${dateStr} — ${day.label}` : dateStr;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeskMulaqatPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();
  const { enableMulaqat, disableMulaqat, setMulaqatType } = useDelegations();

  // ── Sub-tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'delegation' | 'daftari'>('delegation');

  // ── Delegation data ───────────────────────────────────────────────────────────
  const [delegationDetails, setDelegationDetails] = useState<DelegationDetail[]>([]);
  const [days, setDays] = useState<MulaqatDay[]>([]);
  const [slots, setSlots] = useState<MulaqatSlot[]>([]);

  // ── Daftari data ──────────────────────────────────────────────────────────────
  const [daftariDays, setDaftariDays] = useState<DaftariDay[]>([]);
  const [daftariSlots, setDaftariSlots] = useState<DaftariSlot[]>([]);

  // ── Delegation Section A state ─────────────────────────────────────────────────
  const [myDelegationsSearch, setMyDelegationsSearch] = useState('');
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [selectedGuestId, setSelectedGuestId] = useState('');

  // ── Delegation Section B state ─────────────────────────────────────────────────
  const [tableSearch, setTableSearch] = useState('');
  const [tableFilter, setTableFilter] = useState<'all' | 'available' | 'mine'>('all');

  // ── Daftari Section A state ───────────────────────────────────────────────────
  const [daftariSearch, setDaftariSearch] = useState('');

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const assignedCountries = useMemo(() => user?.assignedCountries ?? [], [user?.assignedCountries]);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const [
      { data: delData },
      { data: dayData },
      { data: slotData },
      { data: dDayData },
      { data: dSlotData },
    ] = await Promise.all([
      supabase
        .from('delegations')
        .select('id, country, head_of_delegation_id, head_of_delegation_name, slot_id, managed_by, managed_by_name')
        .order('country'),
      supabase.from('mulaqat_days').select('id, date, label').order('date'),
      supabase.from('mulaqat_slots').select('id, name, day_id').order('name'),
      supabase.from('daftari_days').select('id, date, label, is_active').eq('is_active', true).order('date'),
      supabase.from('daftari_slots').select('id, name, day_id, guest_id, guest_name, assigned_by, assigned_by_name').order('name'),
    ]);
    if (delData) setDelegationDetails(delData as DelegationDetail[]);
    if (dayData) setDays(dayData as MulaqatDay[]);
    if (slotData) setSlots(slotData as MulaqatSlot[]);
    if (dDayData) setDaftariDays(dDayData as DaftariDay[]);
    if (dSlotData) setDaftariSlots(dSlotData as DaftariSlot[]);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Sidebar badge counts ─────────────────────────────────────────────────────

  const reviewCount = useMemo(() =>
    guests.filter(g => assignedCountries.includes(g.country) && g.status === 'Awaiting Review').length,
    [guests, assignedCountries]);

  const rejectedCount = useMemo(() =>
    guests.filter(g => assignedCountries.includes(g.country) && g.status === 'Rejected').length,
    [guests, assignedCountries]);

  if (!user) return null;

  // ── Delegation helpers ────────────────────────────────────────────────────────

  const getDelegationForCountry = (country: string) =>
    delegationDetails.find(d => d.country === country) ?? null;

  const getMulaqatGuests = (country: string): Guest[] =>
    guests.filter(g => g.country === country && g.mulaqat === true);

  const getEligibleGuests = (country: string): Guest[] =>
    guests.filter(g => g.country === country && !g.mulaqat &&
      (g.status === 'Approved' || g.status === 'Accommodated'));

  const getSlotsForDay = (dayId: string) =>
    slots.filter(s => s.day_id === dayId).sort((a, b) => a.name.localeCompare(b.name));

  const getAssignedDay = (slotId: string | null): MulaqatDay | null => {
    if (!slotId) return null;
    const slot = slots.find(s => s.id === slotId);
    if (!slot?.day_id) return null;
    return days.find(d => d.id === slot.day_id) ?? null;
  };

  const getAssignedSlot = (slotId: string | null): MulaqatSlot | null => {
    if (!slotId) return null;
    return slots.find(s => s.id === slotId) ?? null;
  };

  // ── Daftari helpers ───────────────────────────────────────────────────────────

  const getDaftariSlotsForDay = (dayId: string) =>
    daftariSlots.filter(s => s.day_id === dayId).sort((a, b) => a.name.localeCompare(b.name));

  const getAssignedDaftariSlot = (guestId: string): DaftariSlot | null =>
    daftariSlots.find(s => s.guest_id === guestId) ?? null;

  const getAssignedDaftariDay = (guestId: string): DaftariDay | null => {
    const slot = getAssignedDaftariSlot(guestId);
    if (!slot?.day_id) return null;
    return daftariDays.find(d => d.id === slot.day_id) ?? null;
  };

  // ── Delegation Section A: sorted countries ────────────────────────────────────

  const sortedCountries = useMemo(() => {
    const filtered = myDelegationsSearch
      ? assignedCountries.filter(c => c.toLowerCase().includes(myDelegationsSearch.toLowerCase()))
      : assignedCountries;
    return [...filtered].sort((a, b) => {
      const aCount = getMulaqatGuests(a).length;
      const bCount = getMulaqatGuests(b).length;
      if (aCount === 0 && bCount === 0) return a.localeCompare(b);
      if (aCount === 0) return 1;
      if (bCount === 0) return -1;
      return bCount - aCount;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedCountries, guests, myDelegationsSearch]);

  // ── Delegation slot actions ───────────────────────────────────────────────────

  const handleSlotChange = async (country: string, slotId: string) => {
    const del = getDelegationForCountry(country);
    if (!del) return;
    const val = slotId === '__none__' ? null : slotId;
    const { error } = await supabase.from('delegations').update({ slot_id: val }).eq('id', del.id);
    if (error) { toast.error('Failed to update slot'); return; }
    setDelegationDetails(prev => prev.map(d => d.id === del.id ? { ...d, slot_id: val } : d));
    toast.success(val ? 'Slot assigned' : 'Slot removed');
  };

  const handleRemoveSlot = async (country: string) => handleSlotChange(country, '__none__');

  // ── Delegation member actions ─────────────────────────────────────────────────

  const handleMakeHead = async (guest: Guest, delegationId: string) => {
    await supabase.from('delegation_members').update({ is_head: false }).eq('delegation_id', delegationId);
    await supabase.from('delegation_members').update({ is_head: true }).eq('delegation_id', delegationId).eq('guest_id', guest.id);
    const { error } = await supabase.from('delegations')
      .update({ head_of_delegation_id: guest.id, head_of_delegation_name: guest.fullName })
      .eq('id', delegationId);
    if (error) { toast.error('Failed to update head'); return; }
    setDelegationDetails(prev =>
      prev.map(d => d.id === delegationId
        ? { ...d, head_of_delegation_id: guest.id, head_of_delegation_name: guest.fullName }
        : d));
    toast.success(`${guest.fullName} is now head of delegation`);
  };

  const handleRemoveMember = async (guest: Guest) => { await disableMulaqat(guest); };

  const handleAddGuest = async () => {
    if (!expandedCountry || !selectedGuestId) return;
    const guest = guests.find(g => g.id === selectedGuestId);
    if (!guest) return;
    await enableMulaqat(guest);
    setSelectedGuestId('');
    setAddingGuest(false);
  };

  // ── Daftari actions ───────────────────────────────────────────────────────────

  const handleAssignDaftariSlot = async (guest: Guest, slotId: string) => {
    const slot = daftariSlots.find(s => s.id === slotId);
    if (!slot) return;
    const { error } = await supabase
      .from('daftari_slots')
      .update({ guest_id: guest.id, guest_name: guest.fullName, assigned_by: user.id, assigned_by_name: user.name })
      .eq('id', slotId);
    if (error) { toast.error('Failed to assign slot'); return; }
    await supabase.from('guests').update({ daftari_slot_id: slotId }).eq('id', guest.id);
    setDaftariSlots(prev => prev.map(s =>
      s.id === slotId
        ? { ...s, guest_id: guest.id, guest_name: guest.fullName, assigned_by: user.id, assigned_by_name: user.name }
        : s
    ));
    toast.success(`${guest.fullName} assigned to ${slot.name}`);
  };

  const handleUnassignDaftariSlot = async (guest: Guest) => {
    const currentSlot = daftariSlots.find(s => s.guest_id === guest.id);
    if (currentSlot) {
      await supabase.from('daftari_slots')
        .update({ guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null })
        .eq('id', currentSlot.id);
      setDaftariSlots(prev => prev.map(s =>
        s.id === currentSlot.id
          ? { ...s, guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null }
          : s
      ));
    }
    await supabase.from('guests').update({ daftari_slot_id: null }).eq('id', guest.id);
  };

  const handleRemoveFromDaftari = async (guest: Guest) => {
    await handleUnassignDaftariSlot(guest);
    await setMulaqatType(guest, guest.mulaqatType === 'Both' ? 'Delegation' : 'No');
  };

  // ── Grouped slot selects ──────────────────────────────────────────────────────

  const SlotGroupedSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-2 py-1.5 border border-[#D4CFC7] rounded-md text-xs bg-white focus:border-[#2D5A45] focus:outline-none"
    >
      <option value="__none__">— No slot —</option>
      {[...days].sort((a, b) => a.date.localeCompare(b.date)).map(day => {
        const daySlotsForDay = getSlotsForDay(day.id);
        if (daySlotsForDay.length === 0) return null;
        return (
          <optgroup key={day.id} label={dayHeader(day)}>
            {daySlotsForDay.map(s => {
              const taken = delegationDetails.filter(d => d.slot_id === s.id).length;
              return (
                <option key={s.id} value={s.id}>
                  {s.name}{taken === 0 ? ' ✓' : ` (${taken})`}
                </option>
              );
            })}
          </optgroup>
        );
      })}
      {slots.filter(s => !s.day_id).map(s => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );

  const DaftariSlotSelect = ({ guestId, onChange }: { guestId: string; onChange: (slotId: string) => void }) => {
    const sortedDDays = [...daftariDays].sort((a, b) => a.date.localeCompare(b.date));
    return (
      <select
        defaultValue=""
        onChange={e => { if (e.target.value) onChange(e.target.value); }}
        className="w-full px-2 py-1.5 border border-[#D4CFC7] rounded-md text-xs bg-white focus:border-[#2D5A45] focus:outline-none"
      >
        <option value="">Assign slot...</option>
        {sortedDDays.map(day => {
          const daySlots = getDaftariSlotsForDay(day.id).filter(s => !s.guest_id || s.guest_id === guestId);
          if (daySlots.length === 0) return null;
          return (
            <optgroup key={day.id} label={dayHeader(day)}>
              {daySlots.map(s => (
                <option key={s.id} value={s.id}>{s.name} ✓</option>
              ))}
            </optgroup>
          );
        })}
        {daftariSlots.filter(s => !s.day_id && (!s.guest_id || s.guest_id === guestId)).map(s => (
          <option key={s.id} value={s.id}>{s.name} ✓</option>
        ))}
      </select>
    );
  };

  // ── Delegation Section B: table rows ─────────────────────────────────────────

  const tableRows = useMemo((): TableRow[] => {
    const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const rows: TableRow[] = [];
    for (const day of sortedDays) {
      const daySlotsForDay = getSlotsForDay(day.id);
      for (let i = 0; i < daySlotsForDay.length; i++) {
        const slot = daySlotsForDay[i];
        rows.push({
          dayId: day.id, dayDate: day.date, dayLabel: day.label,
          slotId: slot.id, slotName: slot.name,
          delegations: delegationDetails.filter(d => d.slot_id === slot.id),
          isFirstSlotOfDay: i === 0,
          daySlotCount: daySlotsForDay.length,
        });
      }
    }
    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, slots, delegationDetails]);

  const filteredTableRows = useMemo((): TableRow[] => {
    const base = tableRows.filter(row => {
      if (tableFilter === 'available' && row.delegations.length > 0) return false;
      if (tableFilter === 'mine' && !row.delegations.some(d => assignedCountries.includes(d.country))) return false;
      if (tableSearch) {
        const s = tableSearch.toLowerCase();
        if (!row.slotName.toLowerCase().includes(s) &&
            !row.delegations.some(d => d.country.toLowerCase().includes(s))) return false;
      }
      return true;
    });
    const dayCount: Record<string, number> = {};
    base.forEach(r => { dayCount[r.dayId] = (dayCount[r.dayId] ?? 0) + 1; });
    const dayFirst = new Set<string>();
    return base.map(row => {
      const isFirst = !dayFirst.has(row.dayId);
      if (isFirst) dayFirst.add(row.dayId);
      return { ...row, isFirstSlotOfDay: isFirst, daySlotCount: dayCount[row.dayId] ?? 1 };
    });
  }, [tableRows, tableFilter, tableSearch, assignedCountries]);

  const chipCls = (active: boolean) =>
    active
      ? 'bg-[#2D5A45] text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all'
      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#F5F0E8] transition-all';

  const totalSlots = tableRows.length;
  const availableSlots = tableRows.filter(r => r.delegations.length === 0).length;


  // ── Daftari Section A: guests ─────────────────────────────────────────────────

  const daftariGuests = useMemo(() =>
    guests.filter(g =>
      assignedCountries.includes(g.country) &&
      (g.mulaqatType === 'Daftari' || g.mulaqatType === 'Both')
    ),
    [guests, assignedCountries]
  );

  const filteredDaftariGuests = useMemo(() => {
    const search = daftariSearch.toLowerCase();
    const list = search
      ? daftariGuests.filter(g =>
          g.fullName.toLowerCase().includes(search) ||
          g.country.toLowerCase().includes(search) ||
          (g.designation ?? '').toLowerCase().includes(search)
        )
      : daftariGuests;

    return [...list].sort((a, b) => {
      const aSlot = daftariSlots.find(s => s.guest_id === a.id);
      const bSlot = daftariSlots.find(s => s.guest_id === b.id);
      if (aSlot && !bSlot) return 1;
      if (!aSlot && bSlot) return -1;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [daftariGuests, daftariSlots, daftariSearch]);

  // ── Daftari Section B: schedule rows ─────────────────────────────────────────

  const daftariScheduleRows = useMemo((): DaftariScheduleRow[] => {
    const sortedDays = [...daftariDays].sort((a, b) => a.date.localeCompare(b.date));
    const rows: DaftariScheduleRow[] = [];
    for (const day of sortedDays) {
      const daySlots = getDaftariSlotsForDay(day.id);
      for (let i = 0; i < daySlots.length; i++) {
        const slot = daySlots[i];
        const assignedGuest = slot.guest_id
          ? guests.find(g => g.id === slot.guest_id) ?? null
          : null;
        rows.push({
          dayId: day.id, dayDate: day.date, dayLabel: day.label,
          slotId: slot.id, slotName: slot.name,
          guestId: slot.guest_id,
          guestName: slot.guest_name,
          guestCountry: assignedGuest?.country ?? null,
          guestDesignation: assignedGuest?.designation ?? null,
          assignedByName: slot.assigned_by_name,
          isFirstSlotOfDay: i === 0,
          daySlotCount: daySlots.length,
        });
      }
    }
    // Recompute rowSpan
    const dayCount: Record<string, number> = {};
    rows.forEach(r => { dayCount[r.dayId] = (dayCount[r.dayId] ?? 0) + 1; });
    const dayFirst = new Set<string>();
    return rows.map(row => {
      const isFirst = !dayFirst.has(row.dayId);
      if (isFirst) dayFirst.add(row.dayId);
      return { ...row, isFirstSlotOfDay: isFirst, daySlotCount: dayCount[row.dayId] ?? 1 };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daftariDays, daftariSlots, guests]);

  const daftariTotalSlots = daftariScheduleRows.length;
  const daftariAvailableSlots = daftariScheduleRows.filter(r => !r.guestId).length;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        {/* ── Sidebar ── */}
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0 flex flex-col">
          <div className="p-4 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
              <div>
                <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
                <p className="text-xs text-[#4A4A4A]">Desk Incharge View</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {DESK_NAV.map((item, i) => (
              <button
                key={i}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/desk/mulaqat' ? 'bg-[#2D5A45] text-white' : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </span>
                {item.href === '/desk/review' && reviewCount > 0 && (
                  <span className="bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{reviewCount}</span>
                )}
                {item.href === '/desk/rejected' && rejectedCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{rejectedCount}</span>
                )}
              </button>
            ))}
          </nav>
          <SidebarUserFooter />
        </aside>

        <main className="flex-1 ml-64">
          {/* ── Header ── */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-[#2D5A45]" />
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Mulaqat</h1>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    {assignedCountries.length} countries
                  </Badge>
                </div>
                {/* Sub-tabs */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('delegation')}
                    className={activeTab === 'delegation'
                      ? 'bg-[#2D5A45] text-white rounded-full px-4 py-1.5 text-sm font-medium transition-all'
                      : 'bg-white text-gray-600 border border-gray-200 rounded-full px-4 py-1.5 text-sm font-medium hover:border-[#2D5A45] transition-all'}
                  >
                    Delegation
                  </button>
                  <button
                    onClick={() => setActiveTab('daftari')}
                    className={activeTab === 'daftari'
                      ? 'bg-[#2D5A45] text-white rounded-full px-4 py-1.5 text-sm font-medium transition-all'
                      : 'bg-white text-gray-600 border border-gray-200 rounded-full px-4 py-1.5 text-sm font-medium hover:border-[#2D5A45] transition-all'}
                  >
                    Daftari
                  </button>
                </div>
              </div>
              <div className="relative">
                <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-3 hover:bg-[#F5F0E8] rounded-lg px-3 py-2 transition-colors">
                  <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-medium">{user.name.charAt(0)}</div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                    <p className="text-xs text-[#4A4A4A]">{getRoleDisplayLabel(user)}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#4A4A4A]" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-[#E8E3DB] py-1 z-50">
                    <button onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8]">
                      <User className="w-4 h-4 text-[#4A4A4A]" />Profile
                    </button>
                    <button onClick={() => { logout(); navigate('/login'); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      <ChevronDown className="w-4 h-4 rotate-90" />Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="px-4 py-6 space-y-8">

            {/* ══════════════════════════════════════════════════════════════════
                DELEGATION TAB
            ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'delegation' && (
              <>
                {/* ── Section A: My Delegations ── */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-[#2D5A45]" />
                      <h2 className="text-lg font-semibold text-[#1A1A1A]">My Delegations</h2>
                      <span className="text-sm text-[#4A4A4A]">({assignedCountries.length})</span>
                    </div>
                    {assignedCountries.length > 0 && (
                      <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                        <Input
                          value={myDelegationsSearch}
                          onChange={e => setMyDelegationsSearch(e.target.value)}
                          placeholder="Search countries..."
                          className="pl-9 border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                        />
                      </div>
                    )}
                  </div>

                  <Card className="shadow-sm">
                    <CardContent className="p-0">
                      {assignedCountries.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2">
                          <Users className="w-10 h-10 text-gray-300" />
                          <p className="text-sm text-[#4A4A4A]">No countries assigned to you.</p>
                        </div>
                      ) : sortedCountries.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2">
                          <Search className="w-8 h-8 text-gray-300" />
                          <p className="text-sm text-[#4A4A4A]">No countries match your search.</p>
                        </div>
                      ) : (
                        <div className="w-full overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-[#F9F8F6]">
                                {['Country', 'Members', 'Head of Delegation', 'Assigned Day', 'Assigned Slot', 'Actions'].map(h => (
                                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sortedCountries.map((country) => {
                                const del = getDelegationForCountry(country);
                                const members = getMulaqatGuests(country);
                                const memberCount = members.length;
                                const hasSlot = !!del?.slot_id;
                                const assignedDay = getAssignedDay(del?.slot_id ?? null);
                                const assignedSlot = getAssignedSlot(del?.slot_id ?? null);
                                const borderCls = memberCount === 0 ? '' : hasSlot ? 'border-l-4 border-l-[#2D5A45]' : 'border-l-4 border-l-amber-400';
                                const rowTextCls = memberCount === 0 ? 'text-gray-400' : '';
                                const isExpanded = expandedCountry === country;
                                const eligible = getEligibleGuests(country);
                                return (
                                  <Fragment key={country}>
                                    <tr
                                      className={['border-b border-[#E8E3DB] bg-white hover:bg-[#FAFAFA] cursor-pointer select-none', borderCls].join(' ')}
                                      onClick={() => {
                                        if (expandedCountry === country) {
                                          setExpandedCountry(null);
                                          setAddingGuest(false);
                                          setSelectedGuestId('');
                                        } else {
                                          setExpandedCountry(country);
                                          setAddingGuest(false);
                                          setSelectedGuestId('');
                                        }
                                      }}
                                    >
                                      <td className={`px-4 py-3 font-medium text-[#1A1A1A] whitespace-nowrap ${rowTextCls}`}>
                                        <div className="flex items-center gap-2">
                                          {isExpanded
                                            ? <ChevronDown className="w-4 h-4 text-[#2D5A45] shrink-0 transition-transform" />
                                            : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 transition-transform" />}
                                          {country}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        {memberCount > 0
                                          ? <span className="text-green-700 font-medium">{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
                                          : <span className="text-gray-400">0 members</span>}
                                      </td>
                                      <td className={`px-4 py-3 whitespace-nowrap ${rowTextCls}`}>
                                        {del?.head_of_delegation_name
                                          ? <span className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /><span className="text-[#1A1A1A]">{del.head_of_delegation_name}</span></span>
                                          : <span className="text-gray-400 italic">Not assigned</span>}
                                      </td>
                                      <td className={`px-4 py-3 whitespace-nowrap ${rowTextCls}`}>
                                        {assignedDay ? <span className="text-[#1A1A1A]">{fmt(assignedDay.date)}</span> : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className={`px-4 py-3 whitespace-nowrap ${rowTextCls}`}>
                                        {assignedSlot ? <span className="text-[#1A1A1A]">{assignedSlot.name}</span> : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                          {days.length > 0 && del && (
                                            <div className="w-44">
                                              <SlotGroupedSelect value={del.slot_id ?? '__none__'} onChange={v => handleSlotChange(country, v)} />
                                            </div>
                                          )}
                                          {hasSlot && (
                                            <button
                                              onClick={() => handleRemoveSlot(country)}
                                              title="Remove slot assignment"
                                              className="p-1.5 rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0"
                                            >
                                              <X className="w-4 h-4" />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>

                                    {/* ── Expandable member section ── */}
                                    {isExpanded && (
                                      <tr>
                                        <td colSpan={6} className="p-0 border-b border-[#E8E3DB]">
                                          <div className="border-l-4 border-l-[#2D5A45] bg-gray-50/50 pl-8 pr-6 py-4 space-y-3">
                                            {/* Members sub-table */}
                                            {members.length === 0 ? (
                                              <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
                                                <Users className="w-4 h-4" />
                                                No members in this delegation yet.
                                              </div>
                                            ) : (
                                              <div className="border border-[#E8E3DB] rounded-lg overflow-hidden">
                                                <table className="w-full text-sm border-collapse">
                                                  <thead>
                                                    <tr className="bg-[#F9F8F6]">
                                                      {['#', 'Name', 'Designation', 'Departure Date', 'Departure Flight', 'Role', 'Actions'].map(h => (
                                                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                                      ))}
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {members.map((g, idx) => {
                                                      const isHead = del?.head_of_delegation_id === g.id;
                                                      return (
                                                        <tr key={g.id} className="border-t border-[#E8E3DB] bg-white hover:bg-[#FAFAFA]">
                                                          <td className="px-4 py-2.5 text-xs text-gray-400 tabular-nums w-8">{idx + 1}</td>
                                                          <td className="px-4 py-2.5 font-medium text-[#1A1A1A]">{g.fullName}</td>
                                                          <td className="px-4 py-2.5 text-xs text-[#4A4A4A]">{g.designation || '—'}</td>
                                                          <td className="px-4 py-2.5 text-xs text-[#4A4A4A] whitespace-nowrap">{fmtDate(g.departureTime)}</td>
                                                          <td className="px-4 py-2.5 text-xs text-[#4A4A4A] whitespace-nowrap">
                                                            {g.departureFlightNumber
                                                              ? g.departureAirport
                                                                ? `${g.departureFlightNumber} (${g.departureAirport})`
                                                                : g.departureFlightNumber
                                                              : '—'}
                                                          </td>
                                                          <td className="px-4 py-2.5">
                                                            {isHead
                                                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200 font-medium"><Star className="w-3 h-3" />Head of Delegation</span>
                                                              : <span className="text-xs text-[#4A4A4A]">Member</span>}
                                                          </td>
                                                          <td className="px-4 py-2.5">
                                                            <div className="flex items-center gap-1.5">
                                                              {!isHead && del && (
                                                                <button
                                                                  onClick={() => handleMakeHead(g, del.id)}
                                                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
                                                                >
                                                                  <UserCheck className="w-3 h-3" />Make Head
                                                                </button>
                                                              )}
                                                              <button
                                                                onClick={() => handleRemoveMember(g)}
                                                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                                                              >
                                                                <UserMinus className="w-3 h-3" />Remove
                                                              </button>
                                                            </div>
                                                          </td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                </table>
                                              </div>
                                            )}

                                            {/* Add guest section */}
                                            <div className="pt-1">
                                              {!addingGuest ? (
                                                <button
                                                  onClick={() => setAddingGuest(true)}
                                                  disabled={eligible.length === 0}
                                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-[#2D5A45] text-[#2D5A45] rounded-md text-xs font-medium hover:bg-[#F0F7F4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                  <UserPlus className="w-3.5 h-3.5" />
                                                  {eligible.length === 0 ? 'No eligible guests to add' : `+ Add Guest (${eligible.length} eligible)`}
                                                </button>
                                              ) : (
                                                <div className="flex items-center gap-2">
                                                  <select
                                                    value={selectedGuestId}
                                                    onChange={e => setSelectedGuestId(e.target.value)}
                                                    className="flex-1 max-w-xs px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
                                                  >
                                                    <option value="">Select a guest...</option>
                                                    {eligible.map(g => (
                                                      <option key={g.id} value={g.id}>{g.fullName} ({g.referenceNumber})</option>
                                                    ))}
                                                  </select>
                                                  <button
                                                    onClick={handleAddGuest}
                                                    disabled={!selectedGuestId}
                                                    className="px-3 py-2 bg-[#2D5A45] hover:bg-[#234839] text-white rounded-md text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                  >
                                                    Add
                                                  </button>
                                                  <button
                                                    onClick={() => { setAddingGuest(false); setSelectedGuestId(''); }}
                                                    className="px-3 py-2 border border-[#D4CFC7] text-[#4A4A4A] rounded-md text-sm hover:bg-[#F5F0E8] transition-colors"
                                                  >
                                                    Cancel
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>

                {/* ── Section B: Mulaqat Schedule ── */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[#2D5A45]" />
                      <h2 className="text-lg font-semibold text-[#1A1A1A]">Mulaqat Schedule</h2>
                      <span className="text-sm text-[#4A4A4A]">
                        ({totalSlots} slot{totalSlots !== 1 ? 's' : ''},&nbsp;
                        <span className="text-green-600 font-medium">{availableSlots} available</span>)
                      </span>
                    </div>
                  </div>

                  <Card className="shadow-sm">
                    <CardContent className="p-0">
                      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[#E8E3DB]">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                          <Input value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder="Search by country or slot name..." className="pl-9 border-[#D4CFC7] focus:border-[#2D5A45] h-9" />
                        </div>
                        <div className="flex gap-1.5">
                          {([{ value: 'all', label: 'All Slots' }, { value: 'available', label: 'Available Only' }, { value: 'mine', label: 'My Delegations' }] as const).map(chip => (
                            <button key={chip.value} onClick={() => setTableFilter(chip.value)} className={chipCls(tableFilter === chip.value)}>{chip.label}</button>
                          ))}
                        </div>
                      </div>

                      {days.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2">
                          <Calendar className="w-10 h-10 text-gray-300" />
                          <p className="text-sm text-[#4A4A4A]">No mulaqat days configured yet.</p>
                          <p className="text-xs text-gray-400">Days and slots are managed by the super admin.</p>
                        </div>
                      ) : filteredTableRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2">
                          <Search className="w-8 h-8 text-gray-300" />
                          <p className="text-sm text-[#4A4A4A]">No slots match the current filter.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-[#F9F8F6]">
                                {['Day', 'Slot', 'Delegations', 'Guests', 'Head of Delegation', 'Managed By', 'Status'].map(h => (
                                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredTableRows.map((row, i) => {
                                const isEmpty = row.delegations.length === 0;
                                const hasMine = row.delegations.some(d => assignedCountries.includes(d.country));
                                const guestCount = row.delegations.reduce((sum, d) => sum + getMulaqatGuests(d.country).length, 0);
                                const heads = row.delegations.map(d => d.head_of_delegation_name).filter(Boolean) as string[];
                                const managedBy = [...new Set(row.delegations.map(d => d.managed_by_name).filter(Boolean) as string[])];
                                const isNewDay = row.isFirstSlotOfDay && i > 0;
                                return (
                                  <tr key={row.slotId} className={['border-b border-[#E8E3DB]', isEmpty ? 'bg-green-50/40' : 'bg-white hover:bg-[#FAFAFA]', isNewDay ? 'border-t-2 border-t-[#E8E3DB]' : ''].join(' ')}>
                                    {row.isFirstSlotOfDay && (
                                      <td rowSpan={row.daySlotCount} className="px-4 py-3 align-top font-semibold text-[#1A1A1A] bg-[#F9F8F6] border-r border-[#E8E3DB] whitespace-nowrap">
                                        {fmt(row.dayDate)}
                                        {row.dayLabel && <div className="text-xs font-normal text-[#4A4A4A] mt-0.5">{row.dayLabel}</div>}
                                      </td>
                                    )}
                                    <td className="px-4 py-3 font-medium text-[#1A1A1A] whitespace-nowrap">{row.slotName}</td>
                                    <td className="px-4 py-3">
                                      {isEmpty ? <span className="text-[#4A4A4A]">—</span> : (
                                        <div className="flex flex-wrap gap-1">
                                          {row.delegations.map(d => {
                                            const isMine = assignedCountries.includes(d.country);
                                            return (
                                              <span key={d.id} className={['inline-flex items-center px-2 py-0.5 rounded-full text-xs border', isMine ? 'bg-green-50 text-green-700 border-green-200 font-medium' : 'bg-gray-50 text-gray-400 border-gray-200'].join(' ')}>
                                                {d.country}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-[#4A4A4A] tabular-nums">
                                      {isEmpty ? <span className="text-[#4A4A4A]">—</span> : <span className={guestCount > 0 ? 'font-medium text-[#1A1A1A]' : ''}>{guestCount}</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {heads.length === 0 ? <span className="text-[#4A4A4A]">—</span> : (
                                        <div className="space-y-0.5">
                                          {heads.map((h, hi) => {
                                            const d = row.delegations[hi];
                                            const isMine = d && assignedCountries.includes(d.country);
                                            return (
                                              <div key={hi} className={`flex items-center gap-1 text-xs ${isMine ? 'text-[#1A1A1A]' : 'text-gray-400'}`}>
                                                <Star className={`w-3 h-3 flex-shrink-0 ${isMine ? 'text-amber-500' : 'text-gray-300'}`} />{h}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {managedBy.length === 0 ? <span className="text-[#4A4A4A]">—</span> : (
                                        <div className="space-y-0.5">
                                          {managedBy.map((name, mi) => (
                                            <div key={mi} className={`text-xs ${name === user.name ? 'font-medium text-[#1A1A1A]' : 'text-gray-400'}`}>{name}</div>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {isEmpty
                                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">Available</span>
                                        : <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${hasMine ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{hasMine ? 'My Delegation' : 'Assigned'}</span>
                                      }
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                DAFTARI TAB
            ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'daftari' && (
              <>
                {/* ── Section A: Daftari Guests ── */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-[#2D5A45]" />
                      <h2 className="text-lg font-semibold text-[#1A1A1A]">Daftari Mulaqat Guests</h2>
                      <span className="text-sm text-[#4A4A4A]">({daftariGuests.length})</span>
                    </div>
                    {daftariGuests.length > 0 && (
                      <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                        <Input
                          value={daftariSearch}
                          onChange={e => setDaftariSearch(e.target.value)}
                          placeholder="Search guests..."
                          className="pl-9 border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                        />
                      </div>
                    )}
                  </div>

                  <Card className="shadow-sm">
                    <CardContent className="p-0">
                      {daftariGuests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2">
                          <Users className="w-10 h-10 text-gray-300" />
                          <p className="text-sm text-[#4A4A4A]">No Daftari guests in your assigned countries.</p>
                          <p className="text-xs text-gray-400">Set a guest's Mulaqat Type to "Daftari" or "Both" to see them here.</p>
                        </div>
                      ) : filteredDaftariGuests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2">
                          <Search className="w-8 h-8 text-gray-300" />
                          <p className="text-sm text-[#4A4A4A]">No guests match your search.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-[#F9F8F6]">
                                {['#', 'Guest Name', 'Country', 'Designation', 'Assigned Day', 'Assigned Slot', 'Actions'].map(h => (
                                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredDaftariGuests.map((g, idx) => {
                                const assignedSlot = getAssignedDaftariSlot(g.id);
                                const assignedDay = getAssignedDaftariDay(g.id);
                                const hasSlot = !!assignedSlot;
                                const borderCls = hasSlot ? 'border-l-4 border-l-[#2D5A45]' : 'border-l-4 border-l-amber-400';
                                return (
                                  <tr key={g.id} className={`border-b border-[#E8E3DB] bg-white hover:bg-[#FAFAFA] ${borderCls}`}>
                                    <td className="px-4 py-3 text-xs text-gray-400 tabular-nums w-8">{idx + 1}</td>
                                    <td className="px-4 py-3 font-medium text-[#1A1A1A]">{g.fullName}</td>
                                    <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.country}</td>
                                    <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.designation || '—'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {assignedDay
                                        ? <span className="text-[#1A1A1A] text-sm">{fmt(assignedDay.date)}</span>
                                        : <span className="text-gray-400 text-sm">—</span>}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {assignedSlot
                                        ? <span className="text-[#1A1A1A] text-sm font-medium">{assignedSlot.name}</span>
                                        : <span className="text-gray-400 text-sm">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        {daftariDays.length > 0 && (
                                          <div className="w-44">
                                            <DaftariSlotSelect guestId={g.id} onChange={slotId => handleAssignDaftariSlot(g, slotId)} />
                                          </div>
                                        )}
                                        {hasSlot && (
                                          <button
                                            onClick={() => handleUnassignDaftariSlot(g)}
                                            title="Remove slot assignment"
                                            className="p-1.5 rounded-md text-orange-400 hover:bg-orange-50 hover:text-orange-600 transition-colors flex-shrink-0"
                                          >
                                            <X className="w-4 h-4" />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleRemoveFromDaftari(g)}
                                          title="Remove from Daftari"
                                          className="p-1.5 rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0"
                                        >
                                          <UserMinus className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>

                {/* ── Section B: Daftari Schedule ── */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[#2D5A45]" />
                      <h2 className="text-lg font-semibold text-[#1A1A1A]">Daftari Schedule</h2>
                      <span className="text-sm text-[#4A4A4A]">
                        ({daftariTotalSlots} slot{daftariTotalSlots !== 1 ? 's' : ''},&nbsp;
                        <span className="text-green-600 font-medium">{daftariAvailableSlots} available</span>)
                      </span>
                    </div>
                  </div>

                  <Card className="shadow-sm">
                    <CardContent className="p-0">
                      {daftariDays.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2">
                          <Calendar className="w-10 h-10 text-gray-300" />
                          <p className="text-sm text-[#4A4A4A]">No Daftari days configured yet.</p>
                          <p className="text-xs text-gray-400">Daftari days and slots are managed by the super admin.</p>
                        </div>
                      ) : daftariScheduleRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2">
                          <Calendar className="w-8 h-8 text-gray-300" />
                          <p className="text-sm text-[#4A4A4A]">No Daftari slots configured yet.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-[#F9F8F6]">
                                {['Day', 'Slot', 'Guest Name', 'Country', 'Designation', 'Managed By', 'Status'].map(h => (
                                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {daftariScheduleRows.map((row, i) => {
                                const isEmpty = !row.guestId;
                                const isMine = row.assignedByName === user.name;
                                const isNewDay = row.isFirstSlotOfDay && i > 0;
                                return (
                                  <tr key={row.slotId} className={['border-b border-[#E8E3DB]', isEmpty ? 'bg-green-50/40' : 'bg-white hover:bg-[#FAFAFA]', isNewDay ? 'border-t-2 border-t-[#E8E3DB]' : ''].join(' ')}>
                                    {row.isFirstSlotOfDay && (
                                      <td rowSpan={row.daySlotCount} className="px-4 py-3 align-top font-semibold text-[#1A1A1A] bg-[#F9F8F6] border-r border-[#E8E3DB] whitespace-nowrap">
                                        {fmt(row.dayDate)}
                                        {row.dayLabel && <div className="text-xs font-normal text-[#4A4A4A] mt-0.5">{row.dayLabel}</div>}
                                      </td>
                                    )}
                                    <td className="px-4 py-3 font-medium text-[#1A1A1A] whitespace-nowrap">{row.slotName}</td>
                                    <td className={`px-4 py-3 ${isEmpty ? 'text-gray-400' : isMine ? 'text-[#1A1A1A]' : 'text-gray-400'}`}>
                                      {row.guestName ?? '—'}
                                    </td>
                                    <td className={`px-4 py-3 text-sm ${isEmpty || !isMine ? 'text-gray-400' : 'text-[#4A4A4A]'}`}>
                                      {row.guestCountry ?? '—'}
                                    </td>
                                    <td className={`px-4 py-3 text-sm ${isEmpty || !isMine ? 'text-gray-400' : 'text-[#4A4A4A]'}`}>
                                      {row.guestDesignation ?? '—'}
                                    </td>
                                    <td className={`px-4 py-3 text-sm ${isEmpty ? 'text-gray-400' : isMine ? 'font-medium text-[#1A1A1A]' : 'text-gray-400'}`}>
                                      {row.assignedByName ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {isEmpty
                                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">Available</span>
                                        : <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${isMine ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                            {isMine ? 'Assigned (me)' : 'Assigned'}
                                          </span>
                                      }
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>
              </>
            )}
          </div>
        </main>
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
