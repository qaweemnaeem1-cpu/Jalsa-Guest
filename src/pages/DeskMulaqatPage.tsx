import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useDelegations } from '@/hooks/useDelegations';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Calendar, ChevronDown, Eye, Search,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function dayHeader(day: MulaqatDay): string {
  const dateStr = fmt(day.date);
  return day.label ? `${dateStr} — ${day.label}` : dateStr;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeskMulaqatPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();
  const { enableMulaqat, disableMulaqat } = useDelegations();

  const [delegationDetails, setDelegationDetails] = useState<DelegationDetail[]>([]);
  const [days, setDays] = useState<MulaqatDay[]>([]);
  const [slots, setSlots] = useState<MulaqatSlot[]>([]);

  // Section A state
  const [myDelegationsSearch, setMyDelegationsSearch] = useState('');
  const [viewMembersDialog, setViewMembersDialog] = useState<{ country: string; delegationId: string } | null>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [selectedGuestId, setSelectedGuestId] = useState('');

  // Section B state
  const [tableSearch, setTableSearch] = useState('');
  const [tableFilter, setTableFilter] = useState<'all' | 'available' | 'mine'>('all');

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const assignedCountries = useMemo(() => user?.assignedCountries ?? [], [user?.assignedCountries]);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const [{ data: delData }, { data: dayData }, { data: slotData }] = await Promise.all([
      supabase
        .from('delegations')
        .select('id, country, head_of_delegation_id, head_of_delegation_name, slot_id, managed_by, managed_by_name')
        .order('country'),
      supabase.from('mulaqat_days').select('id, date, label').order('date'),
      supabase.from('mulaqat_slots').select('id, name, day_id').order('name'),
    ]);
    if (delData) setDelegationDetails(delData as DelegationDetail[]);
    if (dayData) setDays(dayData as MulaqatDay[]);
    if (slotData) setSlots(slotData as MulaqatSlot[]);
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

  // ── Helpers ──────────────────────────────────────────────────────────────────

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

  // ── Section A: sorted countries ───────────────────────────────────────────────

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

  // ── Slot actions ──────────────────────────────────────────────────────────────

  const handleSlotChange = async (country: string, slotId: string) => {
    const del = getDelegationForCountry(country);
    if (!del) return;
    const val = slotId === '__none__' ? null : slotId;
    const { error } = await supabase.from('delegations').update({ slot_id: val }).eq('id', del.id);
    if (error) { toast.error('Failed to update slot'); return; }
    setDelegationDetails(prev => prev.map(d => d.id === del.id ? { ...d, slot_id: val } : d));
    toast.success(val ? 'Slot assigned' : 'Slot removed');
  };

  const handleRemoveSlot = async (country: string) => {
    await handleSlotChange(country, '__none__');
  };

  // ── Member actions ────────────────────────────────────────────────────────────

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

  const handleRemoveMember = async (guest: Guest) => {
    await disableMulaqat(guest);
  };

  const handleAddGuest = async () => {
    if (!viewMembersDialog || !selectedGuestId) return;
    const guest = guests.find(g => g.id === selectedGuestId);
    if (!guest) return;
    await enableMulaqat(guest);
    setSelectedGuestId('');
    setAddingGuest(false);
  };

  // ── Grouped slot select ───────────────────────────────────────────────────────

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

  // ── Section B: table data ─────────────────────────────────────────────────────

  const tableRows = useMemo((): TableRow[] => {
    const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const rows: TableRow[] = [];
    for (const day of sortedDays) {
      const daySlotsForDay = getSlotsForDay(day.id);
      for (let i = 0; i < daySlotsForDay.length; i++) {
        const slot = daySlotsForDay[i];
        rows.push({
          dayId: day.id,
          dayDate: day.date,
          dayLabel: day.label,
          slotId: slot.id,
          slotName: slot.name,
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
        const slotMatch = row.slotName.toLowerCase().includes(s);
        const delMatch = row.delegations.some(d => d.country.toLowerCase().includes(s));
        if (!slotMatch && !delMatch) return false;
      }
      return true;
    });

    // Recompute rowSpan after filtering
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

  // ── View Members dialog data ──────────────────────────────────────────────────

  const viewMembersData = useMemo(() => {
    if (!viewMembersDialog) return null;
    const { country, delegationId } = viewMembersDialog;
    const del = delegationDetails.find(d => d.id === delegationId);
    const members = getMulaqatGuests(country);
    const eligible = getEligibleGuests(country);
    return { country, delegationId, del, members, eligible };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMembersDialog, delegationDetails, guests]);

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
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-[#2D5A45]" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Mulaqat</h1>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  {assignedCountries.length} countries
                </Badge>
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

          <div className="p-6 max-w-7xl mx-auto space-y-8">

            {/* ══ SECTION A: My Delegations — table ══ */}
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
                    <div className="overflow-x-auto">
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
                          {sortedCountries.map((country, i) => {
                            const del = getDelegationForCountry(country);
                            const members = getMulaqatGuests(country);
                            const memberCount = members.length;
                            const hasSlot = !!del?.slot_id;
                            const assignedDay = getAssignedDay(del?.slot_id ?? null);
                            const assignedSlot = getAssignedSlot(del?.slot_id ?? null);

                            // Row left-border colour class
                            const borderCls = memberCount === 0
                              ? ''
                              : hasSlot
                                ? 'border-l-4 border-l-[#2D5A45]'
                                : 'border-l-4 border-l-amber-400';

                            // Muted row for empty delegations
                            const rowTextCls = memberCount === 0 ? 'text-gray-400' : '';

                            return (
                              <tr
                                key={country}
                                className={[
                                  'border-b border-[#E8E3DB] bg-white hover:bg-[#FAFAFA]',
                                  borderCls,
                                  i > 0 ? '' : '',
                                ].join(' ')}
                              >
                                {/* Country */}
                                <td className={`px-4 py-3 font-medium text-[#1A1A1A] whitespace-nowrap ${rowTextCls}`}>
                                  {country}
                                </td>

                                {/* Members */}
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {memberCount > 0 ? (
                                    <span className="text-green-700 font-medium">{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
                                  ) : (
                                    <span className="text-gray-400">0 members</span>
                                  )}
                                </td>

                                {/* Head of Delegation */}
                                <td className={`px-4 py-3 whitespace-nowrap ${rowTextCls}`}>
                                  {del?.head_of_delegation_name ? (
                                    <span className="flex items-center gap-1.5">
                                      <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                      <span className="text-[#1A1A1A]">{del.head_of_delegation_name}</span>
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 italic">Not assigned</span>
                                  )}
                                </td>

                                {/* Assigned Day */}
                                <td className={`px-4 py-3 whitespace-nowrap ${rowTextCls}`}>
                                  {assignedDay ? (
                                    <span className="text-[#1A1A1A]">{fmt(assignedDay.date)}</span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>

                                {/* Assigned Slot */}
                                <td className={`px-4 py-3 whitespace-nowrap ${rowTextCls}`}>
                                  {assignedSlot ? (
                                    <span className="text-[#1A1A1A]">{assignedSlot.name}</span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>

                                {/* Actions */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {/* Assign Slot dropdown */}
                                    {days.length > 0 && del && (
                                      <div className="w-44">
                                        <SlotGroupedSelect
                                          value={del.slot_id ?? '__none__'}
                                          onChange={v => handleSlotChange(country, v)}
                                        />
                                      </div>
                                    )}

                                    {/* View Members */}
                                    {del && (
                                      <button
                                        onClick={() => {
                                          setViewMembersDialog({ country, delegationId: del.id });
                                          setAddingGuest(false);
                                          setSelectedGuestId('');
                                        }}
                                        title="View members"
                                        className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors flex-shrink-0"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                    )}

                                    {/* Remove Slot */}
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
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* ══ SECTION B: Mulaqat Schedule — table ══ */}
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
                  {/* Filter bar */}
                  <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[#E8E3DB]">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                      <Input
                        value={tableSearch}
                        onChange={e => setTableSearch(e.target.value)}
                        placeholder="Search by country or slot name..."
                        className="pl-9 border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      {([
                        { value: 'all', label: 'All Slots' },
                        { value: 'available', label: 'Available Only' },
                        { value: 'mine', label: 'My Delegations' },
                      ] as const).map(chip => (
                        <button key={chip.value} onClick={() => setTableFilter(chip.value)} className={chipCls(tableFilter === chip.value)}>
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Table */}
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
                              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTableRows.map((row, i) => {
                            const isEmpty = row.delegations.length === 0;
                            const hasMine = row.delegations.some(d => assignedCountries.includes(d.country));

                            const guestCount = row.delegations.reduce((sum, d) => {
                              return sum + getMulaqatGuests(d.country).length;
                            }, 0);

                            const heads = row.delegations
                              .map(d => d.head_of_delegation_name)
                              .filter(Boolean) as string[];

                            const managedBy = [...new Set(
                              row.delegations.map(d => d.managed_by_name).filter(Boolean) as string[]
                            )];

                            const isNewDay = row.isFirstSlotOfDay && i > 0;

                            return (
                              <tr
                                key={row.slotId}
                                className={[
                                  'border-b border-[#E8E3DB]',
                                  isEmpty ? 'bg-green-50/40' : 'bg-white hover:bg-[#FAFAFA]',
                                  isNewDay ? 'border-t-2 border-t-[#E8E3DB]' : '',
                                ].join(' ')}
                              >
                                {row.isFirstSlotOfDay && (
                                  <td
                                    rowSpan={row.daySlotCount}
                                    className="px-4 py-3 align-top font-semibold text-[#1A1A1A] bg-[#F9F8F6] border-r border-[#E8E3DB] whitespace-nowrap"
                                  >
                                    {fmt(row.dayDate)}
                                    {row.dayLabel && (
                                      <div className="text-xs font-normal text-[#4A4A4A] mt-0.5">{row.dayLabel}</div>
                                    )}
                                  </td>
                                )}

                                <td className="px-4 py-3 font-medium text-[#1A1A1A] whitespace-nowrap">
                                  {row.slotName}
                                </td>

                                <td className="px-4 py-3">
                                  {isEmpty ? (
                                    <span className="text-[#4A4A4A]">—</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {row.delegations.map(d => {
                                        const isMine = assignedCountries.includes(d.country);
                                        return (
                                          <span
                                            key={d.id}
                                            className={[
                                              'inline-flex items-center px-2 py-0.5 rounded-full text-xs border',
                                              isMine
                                                ? 'bg-green-50 text-green-700 border-green-200 font-medium'
                                                : 'bg-gray-50 text-gray-400 border-gray-200',
                                            ].join(' ')}
                                          >
                                            {d.country}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>

                                <td className="px-4 py-3 text-[#4A4A4A] tabular-nums">
                                  {isEmpty ? <span className="text-[#4A4A4A]">—</span> : (
                                    <span className={guestCount > 0 ? 'font-medium text-[#1A1A1A]' : ''}>{guestCount}</span>
                                  )}
                                </td>

                                <td className="px-4 py-3 text-sm">
                                  {heads.length === 0 ? (
                                    <span className="text-[#4A4A4A]">—</span>
                                  ) : (
                                    <div className="space-y-0.5">
                                      {heads.map((h, hi) => {
                                        const d = row.delegations[hi];
                                        const isMine = d && assignedCountries.includes(d.country);
                                        return (
                                          <div key={hi} className={`flex items-center gap-1 text-xs ${isMine ? 'text-[#1A1A1A]' : 'text-gray-400'}`}>
                                            <Star className={`w-3 h-3 flex-shrink-0 ${isMine ? 'text-amber-500' : 'text-gray-300'}`} />
                                            {h}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>

                                <td className="px-4 py-3 text-sm">
                                  {managedBy.length === 0 ? (
                                    <span className="text-[#4A4A4A]">—</span>
                                  ) : (
                                    <div className="space-y-0.5">
                                      {managedBy.map((name, mi) => {
                                        const isMine = name === user.name;
                                        return (
                                          <div key={mi} className={`text-xs ${isMine ? 'font-medium text-[#1A1A1A]' : 'text-gray-400'}`}>
                                            {name}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>

                                <td className="px-4 py-3 whitespace-nowrap">
                                  {isEmpty ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                                      Available
                                    </span>
                                  ) : (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${
                                      hasMine
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                    }`}>
                                      {hasMine ? 'My Delegation' : 'Assigned'}
                                    </span>
                                  )}
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
          </div>
        </main>
      </div>

      {/* ── View Members Dialog ── */}
      <Dialog
        open={!!viewMembersDialog}
        onOpenChange={open => {
          if (!open) {
            setViewMembersDialog(null);
            setAddingGuest(false);
            setSelectedGuestId('');
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#2D5A45]" />
              {viewMembersData?.country} Delegation
              <span className="text-sm font-normal text-[#4A4A4A] ml-1">
                — {viewMembersData?.members.length ?? 0} member{viewMembersData?.members.length !== 1 ? 's' : ''}
              </span>
            </DialogTitle>
          </DialogHeader>

          {viewMembersData && (
            <div className="space-y-4">
              {/* Members table */}
              {viewMembersData.members.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 border border-dashed border-[#D4CFC7] rounded-lg">
                  <Users className="w-8 h-8 text-gray-300" />
                  <p className="text-sm text-[#4A4A4A]">No members in this delegation yet.</p>
                </div>
              ) : (
                <div className="border border-[#E8E3DB] rounded-lg overflow-hidden">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-[#F9F8F6]">
                        {['Name', 'Designation', 'Role', 'Actions'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {viewMembersData.members.map(g => {
                        const isHead = viewMembersData.del?.head_of_delegation_id === g.id;
                        return (
                          <tr key={g.id} className="border-t border-[#E8E3DB] bg-white hover:bg-[#FAFAFA]">
                            <td className="px-4 py-2.5 font-medium text-[#1A1A1A]">{g.fullName}</td>
                            <td className="px-4 py-2.5 text-[#4A4A4A] text-xs">{g.designation || '—'}</td>
                            <td className="px-4 py-2.5">
                              {isHead ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                  <Star className="w-3 h-3" />Head
                                </span>
                              ) : (
                                <span className="text-xs text-[#4A4A4A]">Member</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {!isHead && (
                                  <button
                                    onClick={() => handleMakeHead(g, viewMembersData.delegationId)}
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

              {/* Add Guest section */}
              <div className="border-t border-[#E8E3DB] pt-4">
                {!addingGuest ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAddingGuest(true)}
                    disabled={viewMembersData.eligible.length === 0}
                    className="border-dashed border-[#2D5A45] text-[#2D5A45] hover:bg-[#F0F7F4]"
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                    {viewMembersData.eligible.length === 0
                      ? 'No eligible guests to add'
                      : `+ Add Guest (${viewMembersData.eligible.length} eligible)`}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedGuestId}
                      onChange={e => setSelectedGuestId(e.target.value)}
                      className="flex-1 px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
                    >
                      <option value="">Select a guest...</option>
                      {viewMembersData.eligible.map(g => (
                        <option key={g.id} value={g.id}>{g.fullName} ({g.referenceNumber})</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={handleAddGuest}
                      disabled={!selectedGuestId}
                      className="bg-[#2D5A45] hover:bg-[#234839] text-white"
                    >
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setAddingGuest(false); setSelectedGuestId(''); }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
