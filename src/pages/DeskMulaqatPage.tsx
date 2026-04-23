import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { formatDate, formatDateWithWeekday } from '@/utils/dateHelpers';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useDelegations } from '@/hooks/useDelegations';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Calendar, CalendarDays, ChevronDown, ChevronRight, Search,
  Plus, Star, UserCheck, UserMinus, UserPlus, Users, User, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { ProfileDialog, getRoleDisplayLabel } from '@/components/ProfileDialog';
import { LanguageSelect } from '@/components/LanguageSelect';
import { DESK_NAV } from '@/lib/navItems';
import { formatDesignation } from '@/lib/constants';
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
  language?: string | null;
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
  language?: string | null;
}

interface DaftariScheduleRow {
  dayId: string;
  dayDate: string;
  dayLabel: string | null;
  slotId: string;
  slotName: string;
  slotGuests: { id: string; name: string; country: string | null; designation: string | string[] | null; religion?: string | null }[];
  assignedByName: string | null;
  isFirstSlotOfDay: boolean;
  daySlotCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (d: string | null | undefined): string => d ? formatDateWithWeekday(d) : '';

function fmtDep(d: string | null | undefined): string {
  if (!d) return '—';
  // d may be "YYYY-MM-DDTHH:MM" (recombined) or just "YYYY-MM-DD"
  const datePart = formatDate(d);
  if (datePart === '—') return '—';
  const s = String(d);
  if (!s.includes('T')) return datePart;
  const timePart = s.split('T')[1]?.slice(0, 5) ?? '';
  if (!timePart || timePart === '00:00') return datePart;
  return `${datePart}, ${timePart}`;
}

function fmtFlight(flightNum: string | undefined, airport: string | undefined): string | null {
  if (!flightNum) return null;
  return airport ? `${flightNum} · ${airport}` : flightNum;
}

function dayHeader(day: MulaqatDay | DaftariDay): string {
  const dateStr = fmt(day.date);
  return day.label ? `${dateStr} — ${day.label}` : dateStr;
}

// ── Language helpers ──────────────────────────────────────────────────────────

const LANGUAGE_COLORS: Record<string, string> = {
  'English': 'bg-blue-100 text-blue-700',
  'Spanish': 'bg-orange-100 text-orange-700',
  'French': 'bg-indigo-100 text-indigo-700',
  'Arabic': 'bg-emerald-100 text-emerald-700',
  'German': 'bg-red-100 text-red-700',
};

function LanguageTag({ language }: { language?: string | null }) {
  if (!language) return <span className="text-gray-400 text-xs italic">Not set</span>;
  const cls = LANGUAGE_COLORS[language] ?? 'bg-gray-100 text-gray-700';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{language}</span>;
}

// ── Ahmadi helpers ────────────────────────────────────────────────────────────

const isAhmadi = (religion: string | null | undefined) => religion === 'Ahmadi Muslim';

function AhmadiTags({ a, na, tiny = false }: { a: number; na: number; tiny?: boolean }) {
  if (a === 0 && na === 0) return null;
  const px = tiny ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className="inline-flex items-center gap-1">
      {a > 0 && <span className={`bg-green-100 text-green-700 rounded-full font-medium ${px}`}>{a}A</span>}
      {a > 0 && na > 0 && <span className="text-gray-300">·</span>}
      {na > 0 && <span className={`bg-amber-100 text-amber-700 rounded-full font-medium ${px}`}>{na}NA</span>}
    </span>
  );
}

function AhmadiSingle({ religion }: { religion?: string | null }) {
  if (!religion) return null;
  return isAhmadi(religion)
    ? <span className="bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 text-[10px] font-medium">A</span>
    : <span className="bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 text-[10px] font-medium">NA</span>;
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

  // ── Checkbox + bulk-assign state ──────────────────────────────────────────────
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [assignDialog, setAssignDialog] = useState<'assign' | 'join' | null>(null);
  const [bulkDay, setBulkDay] = useState('');
  const [bulkSlot, setBulkSlot] = useState('');

  // ── Language state ────────────────────────────────────────────────────────────
  const [mulaqatLanguages, setMulaqatLanguages] = useState<string[]>([]);
  const [changeSlotLanguage, setChangeSlotLanguage] = useState('');
  const [bulkLanguage, setBulkLanguage] = useState('');
  const [daftariChangeSlotLanguage, setDaftariChangeSlotLanguage] = useState('');
  const [daftariBulkLanguage, setDaftariBulkLanguage] = useState('');

  // ── Change-slot dialog state ──────────────────────────────────────────────────
  const [changeSlotDialog, setChangeSlotDialog] = useState<{ country: string; currentSlotId: string | null } | null>(null);
  const [changeSlotDay, setChangeSlotDay] = useState('');
  const [changeSlotSlot, setChangeSlotSlot] = useState('');
  const [removeSlotDialog, setRemoveSlotDialog] = useState<{ country: string; slotName: string } | null>(null);

  // ── Delegation Section B state ─────────────────────────────────────────────────
  const [tableSearch, setTableSearch] = useState('');
  const [tableFilter, setTableFilter] = useState<'all' | 'available' | 'mine'>('all');

  // ── Daftari Section A state ───────────────────────────────────────────────────
  const [daftariSearch, setDaftariSearch] = useState('');
  const [guestSlotIds, setGuestSlotIds] = useState<Record<string, string>>({});

  // ── Daftari flat-table state ──────────────────────────────────────────────
  const [daftariSelectedGuests, setDaftariSelectedGuests] = useState<Set<string>>(new Set());
  const [daftariAssignDialog, setDaftariAssignDialog] = useState<'assign' | 'join' | null>(null);
  const [daftariBulkDay, setDaftariBulkDay] = useState('');
  const [daftariBulkSlot, setDaftariBulkSlot] = useState('');
  const [daftariChangeSlotDialog, setDaftariChangeSlotDialog] = useState<{ guestId: string; guestName: string; currentSlotId: string | null } | null>(null);
  const [daftariChangeSlotDay, setDaftariChangeSlotDay] = useState('');
  const [daftariChangeSlotSlot, setDaftariChangeSlotSlot] = useState('');
  const [daftariRemoveDialog, setDaftariRemoveDialog] = useState<{ guest: Guest } | null>(null);

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
      { data: langData },
    ] = await Promise.all([
      supabase
        .from('delegations')
        .select('id, country, head_of_delegation_id, head_of_delegation_name, slot_id, managed_by, managed_by_name, language')
        .order('country'),
      supabase.from('mulaqat_days').select('id, date, label').order('date'),
      supabase.from('mulaqat_slots').select('id, name, day_id').order('name'),
      supabase.from('daftari_days').select('id, date, label, is_active').eq('is_active', true).order('date'),
      supabase.from('daftari_slots').select('id, name, day_id, guest_id, guest_name, assigned_by, assigned_by_name, language').order('name'),
      supabase.from('mulaqat_languages').select('name').eq('is_active', true).order('name'),
    ]);
    if (delData) setDelegationDetails(delData as DelegationDetail[]);
    if (dayData) setDays(dayData as MulaqatDay[]);
    if (slotData) setSlots(slotData as MulaqatSlot[]);
    if (dDayData) setDaftariDays(dDayData as DaftariDay[]);
    if (dSlotData) {
      setDaftariSlots(dSlotData as DaftariSlot[]);
      const slotMap: Record<string, string> = {};
      (dSlotData as DaftariSlot[]).forEach(s => { if (s.guest_id) slotMap[s.guest_id] = s.id; });
      setGuestSlotIds(slotMap);
    }
    if (langData) setMulaqatLanguages((langData as { name: string }[]).map(l => l.name));
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

  const getAssignedDaftariSlot = (guestId: string): DaftariSlot | null => {
    const slotId = guestSlotIds[guestId];
    return slotId ? (daftariSlots.find(s => s.id === slotId) ?? null) : null;
  };

  const getAssignedDaftariDay = (guestId: string): DaftariDay | null => {
    const slot = getAssignedDaftariSlot(guestId);
    if (!slot?.day_id) return null;
    return daftariDays.find(d => d.id === slot.day_id) ?? null;
  };

  const getDaftariGuestsForCountry = (country: string): Guest[] =>
    guests.filter(g => g.country === country && (g.mulaqatType === 'Daftari' || g.mulaqatType === 'Both'));

  const getCountryDaftariSlot = (country: string): DaftariSlot | null => {
    const cGuests = getDaftariGuestsForCountry(country);
    if (cGuests.length === 0) return null;
    const slotIds = [...new Set(cGuests.map(g => guestSlotIds[g.id]).filter((id): id is string => !!id))];
    if (slotIds.length === 1) return daftariSlots.find(s => s.id === slotIds[0]) ?? null;
    return null;
  };

  const getCountryDaftariDay = (country: string): DaftariDay | null => {
    const slot = getCountryDaftariSlot(country);
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

  // ── Checkbox helpers ─────────────────────────────────────────────────────────

  const toggleCountry = (country: string) => {
    setSelectedCountries(prev => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country); else next.add(country);
      return next;
    });
  };

  const allSelected = sortedCountries.length > 0 && sortedCountries.every(c => selectedCountries.has(c));
  const someSelected = sortedCountries.some(c => selectedCountries.has(c)) && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedCountries(new Set());
    } else {
      setSelectedCountries(new Set(sortedCountries));
    }
  };

  const selectedList = sortedCountries.filter(c => selectedCountries.has(c));
  const selectedGuestTotal = selectedList.reduce((sum, c) => sum + getMulaqatGuests(c).length, 0);

  // ── Bulk assign handler ───────────────────────────────────────────────────────

  const handleBulkAssign = async () => {
    if (!bulkSlot || selectedList.length === 0) return;
    const slot = slots.find(s => s.id === bulkSlot);
    const updates = selectedList
      .map(c => getDelegationForCountry(c))
      .filter((d): d is DelegationDetail => d !== null);
    const langVal = bulkLanguage || null;

    await Promise.all(updates.map(d =>
      supabase.from('delegations').update({ slot_id: bulkSlot, language: langVal }).eq('id', d.id)
    ));

    setDelegationDetails(prev =>
      prev.map(d => updates.find(u => u.id === d.id) ? { ...d, slot_id: bulkSlot, language: langVal } : d)
    );

    toast.success(`${updates.length} delegation${updates.length !== 1 ? 's' : ''} assigned to ${slot?.name ?? 'slot'}`);
    setAssignDialog(null);
    setBulkDay('');
    setBulkSlot('');
    setBulkLanguage('');
    setSelectedCountries(new Set());
  };

  // ── Delegation slot actions ───────────────────────────────────────────────────

  const handleSlotChange = async (country: string, slotId: string, language?: string) => {
    const del = getDelegationForCountry(country);
    if (!del) return;
    const val = slotId === '__none__' ? null : slotId;
    const update: Record<string, unknown> = { slot_id: val };
    if (language !== undefined) update.language = language || null;
    const { error } = await supabase.from('delegations').update(update).eq('id', del.id);
    if (error) { toast.error('Failed to update slot'); return; }
    setDelegationDetails(prev => prev.map(d =>
      d.id === del.id ? { ...d, slot_id: val, ...(language !== undefined ? { language: language || null } : {}) } : d
    ));
    if (!language) toast.success(val ? 'Slot assigned' : 'Slot removed');
  };

  const handleSetDelegationLanguage = async (country: string, lang: string) => {
    const del = getDelegationForCountry(country);
    if (!del) return;
    const langVal = lang || null;
    const { error } = await supabase.from('delegations').update({ language: langVal }).eq('id', del.id);
    if (error) { toast.error('Failed to set language'); return; }
    setDelegationDetails(prev => prev.map(d => d.id === del.id ? { ...d, language: langVal } : d));
    if (lang) toast.success(`${country} delegation language set to ${lang}`);
  };

  const handleSetDaftariSlotLanguage = async (slotId: string, lang: string) => {
    const langVal = lang || null;
    const { error } = await supabase.from('daftari_slots').update({ language: langVal }).eq('id', slotId);
    if (error) { toast.error('Failed to set language'); return; }
    setDaftariSlots(prev => prev.map(s => s.id === slotId ? { ...s, language: langVal } : s));
  };

  const handleRemoveSlot = async (country: string) => handleSlotChange(country, '__none__');

  const handleOpenChangeSlot = (country: string, currentSlotId: string | null) => {
    const dayId = currentSlotId ? (slots.find(s => s.id === currentSlotId)?.day_id ?? '') : '';
    const del = getDelegationForCountry(country);
    setChangeSlotDay(dayId);
    setChangeSlotSlot(currentSlotId ?? '');
    setChangeSlotLanguage(del?.language ?? '');
    setChangeSlotDialog({ country, currentSlotId });
  };

  const handleConfirmChangeSlot = async () => {
    if (!changeSlotDialog || !changeSlotSlot) return;
    const slot = slots.find(s => s.id === changeSlotSlot);
    await handleSlotChange(changeSlotDialog.country, changeSlotSlot, changeSlotLanguage);
    toast.success(`${changeSlotDialog.country} delegation moved to ${slot?.name ?? 'slot'}`);
    setChangeSlotDialog(null);
    setChangeSlotDay('');
    setChangeSlotSlot('');
    setChangeSlotLanguage('');
  };

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
    console.log('[Daftari] AssignSlot triggered', { guestId: guest.id, slotId, guestName: guest.fullName });
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
    setGuestSlotIds(prev => ({ ...prev, [guest.id]: slotId }));
    toast.success(`${guest.fullName} assigned to ${slot.name}`);
  };

  const handleUnassignDaftariSlot = async (guest: Guest) => {
    console.log('[Daftari] UnassignSlot triggered', { guestId: guest.id, slotId: guestSlotIds[guest.id] });
    const slotId = guestSlotIds[guest.id];
    if (slotId) {
      const otherGuestIds = Object.entries(guestSlotIds)
        .filter(([gId, sId]) => gId !== guest.id && sId === slotId)
        .map(([gId]) => gId);
      const newGuestId = otherGuestIds.length > 0 ? otherGuestIds[otherGuestIds.length - 1] : null;
      await supabase.from('daftari_slots')
        .update({ guest_id: newGuestId, guest_name: null, assigned_by: null, assigned_by_name: null })
        .eq('id', slotId);
      setDaftariSlots(prev => prev.map(s =>
        s.id === slotId ? { ...s, guest_id: newGuestId } : s
      ));
    }
    await supabase.from('guests').update({ daftari_slot_id: null }).eq('id', guest.id);
    setGuestSlotIds(prev => {
      const next = { ...prev };
      delete next[guest.id];
      return next;
    });
  };

  const handleRemoveFromDaftari = async (guest: Guest) => {
    await handleUnassignDaftariSlot(guest);
    await setMulaqatType(guest, guest.mulaqatType === 'Both' ? 'Delegation' : 'No');
  };

  // ── Daftari bulk/change/remove handlers ──────────────────────────────────────

  const handleDaftariBulkAssign = async () => {
    if (!daftariBulkSlot || daftariSelectedGuestList.length === 0) return;
    const slot = daftariSlots.find(s => s.id === daftariBulkSlot);
    const guestList = daftariSelectedGuestList;
    const langVal = daftariBulkLanguage || null;
    console.log('[Daftari] BulkAssign triggered', { slotId: daftariBulkSlot, guests: guestList.map(g => g.id) });

    // Clear old slot assignments for guests that already have one
    const oldSlotIds = new Set(guestList.map(g => guestSlotIds[g.id]).filter(Boolean) as string[]);
    if (oldSlotIds.size > 0) {
      await Promise.all([...oldSlotIds].map(sId =>
        supabase.from('daftari_slots').update({ guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null }).eq('id', sId)
      ));
    }

    // For join: all names shown; for single: just that name
    const allNames = guestList.map(g => g.fullName).join(', ');
    await Promise.all(guestList.map(g =>
      supabase.from('guests').update({ daftari_slot_id: daftariBulkSlot }).eq('id', g.id)
    ));
    const { data: slotRes, error: slotErr } = await supabase.from('daftari_slots').update({
      guest_id: guestList[0].id,
      guest_name: allNames,
      assigned_by: user.id,
      assigned_by_name: user.name,
      language: langVal,
    }).eq('id', daftariBulkSlot).select().single();
    console.log('[Daftari] Slot update:', { slotRes, slotErr });

    setGuestSlotIds(prev => {
      const next = { ...prev };
      for (const g of guestList) next[g.id] = daftariBulkSlot;
      return next;
    });
    setDaftariSlots(prev => prev.map(s =>
      s.id === daftariBulkSlot
        ? { ...s, guest_id: guestList[0].id, guest_name: allNames, assigned_by: user.id, assigned_by_name: user.name, language: langVal }
        : s
    ));

    toast.success(`${guestList.length} guest${guestList.length !== 1 ? 's' : ''} assigned to ${slot?.name ?? 'slot'}`);
    setDaftariAssignDialog(null);
    setDaftariBulkDay('');
    setDaftariBulkSlot('');
    setDaftariBulkLanguage('');
    setDaftariSelectedGuests(new Set());
  };

  const handleDaftariOpenChangeSlot = (guest: Guest) => {
    const currentSlotId = guestSlotIds[guest.id] ?? null;
    const currentSlot = currentSlotId ? daftariSlots.find(s => s.id === currentSlotId) : null;
    const dayId = currentSlot?.day_id ?? '';
    setDaftariChangeSlotDay(dayId);
    setDaftariChangeSlotSlot(currentSlotId ?? '');
    setDaftariChangeSlotLanguage(currentSlot?.language ?? '');
    setDaftariChangeSlotDialog({ guestId: guest.id, guestName: guest.fullName, currentSlotId });
  };

  const handleDaftariConfirmChangeSlot = async () => {
    if (!daftariChangeSlotDialog || !daftariChangeSlotSlot) return;
    const newSlot = daftariSlots.find(s => s.id === daftariChangeSlotSlot);
    const guest = guests.find(g => g.id === daftariChangeSlotDialog.guestId);
    if (!guest) return;
    console.log('[Daftari] ChangeSlot triggered', { guestId: guest.id, oldSlotId: daftariChangeSlotDialog.currentSlotId, newSlotId: daftariChangeSlotSlot });

    // Clear old slot
    const oldSlotId = daftariChangeSlotDialog.currentSlotId;
    if (oldSlotId) {
      const otherGuestsInOldSlot = Object.entries(guestSlotIds)
        .filter(([gId, sId]) => gId !== guest.id && sId === oldSlotId)
        .map(([gId]) => gId);
      const { error: clearErr } = await supabase.from('daftari_slots').update({
        guest_id: otherGuestsInOldSlot.length > 0 ? otherGuestsInOldSlot[otherGuestsInOldSlot.length - 1] : null,
        guest_name: null, assigned_by: null, assigned_by_name: null,
      }).eq('id', oldSlotId);
      console.log('[Daftari] Clear old slot:', { clearErr });
      setDaftariSlots(prev => prev.map(s =>
        s.id === oldSlotId
          ? { ...s, guest_id: otherGuestsInOldSlot.length > 0 ? otherGuestsInOldSlot[otherGuestsInOldSlot.length - 1] : null }
          : s
      ));
    }

    const langVal = daftariChangeSlotLanguage || null;
    const { data: guestRes, error: guestErr } = await supabase.from('guests').update({ daftari_slot_id: daftariChangeSlotSlot }).eq('id', guest.id).select().single();
    const { data: slotRes, error: slotErr } = await supabase.from('daftari_slots').update({
      guest_id: guest.id,
      guest_name: guest.fullName,
      assigned_by: user.id,
      assigned_by_name: user.name,
      language: langVal,
    }).eq('id', daftariChangeSlotSlot).select().single();
    console.log('[Daftari] Assign new slot:', { guestRes, guestErr, slotRes, slotErr });

    if (guestErr || slotErr) { toast.error('Failed to change slot: ' + (guestErr?.message ?? slotErr?.message)); return; }

    setGuestSlotIds(prev => ({ ...prev, [guest.id]: daftariChangeSlotSlot }));
    setDaftariSlots(prev => prev.map(s =>
      s.id === daftariChangeSlotSlot
        ? { ...s, guest_id: guest.id, guest_name: guest.fullName, assigned_by: user.id, assigned_by_name: user.name, language: langVal }
        : s
    ));

    toast.success(`${guest.fullName} moved to ${newSlot?.name ?? 'slot'}`);
    setDaftariChangeSlotDialog(null);
    setDaftariChangeSlotDay('');
    setDaftariChangeSlotSlot('');
    setDaftariChangeSlotLanguage('');
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

  // ── Daftari flat-table computed values ───────────────────────────────────────

  const filteredDaftariGuests = useMemo(() => {
    const search = daftariSearch.toLowerCase();
    const list = daftariGuests.filter(g =>
      !search ||
      g.fullName.toLowerCase().includes(search) ||
      g.country.toLowerCase().includes(search) ||
      formatDesignation(g.designation).toLowerCase().includes(search)
    );
    return [...list].sort((a, b) => {
      const cmp = a.country.localeCompare(b.country);
      return cmp !== 0 ? cmp : a.fullName.localeCompare(b.fullName);
    });
  }, [daftariGuests, daftariSearch]);

  const daftariAllGuestsSelected = filteredDaftariGuests.length > 0 && filteredDaftariGuests.every(g => daftariSelectedGuests.has(g.id));
  const daftariSomeGuestsSelected = filteredDaftariGuests.some(g => daftariSelectedGuests.has(g.id)) && !daftariAllGuestsSelected;

  const toggleDaftariGuest = (guestId: string) => {
    setDaftariSelectedGuests(prev => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId); else next.add(guestId);
      return next;
    });
  };

  const toggleDaftariSelectAll = () => {
    if (daftariAllGuestsSelected) setDaftariSelectedGuests(new Set());
    else setDaftariSelectedGuests(new Set(filteredDaftariGuests.map(g => g.id)));
  };

  const daftariSelectedGuestList = filteredDaftariGuests.filter(g => daftariSelectedGuests.has(g.id));
  const daftariSelectedGuestTotal = daftariSelectedGuestList.length;

  // Sorted unique slot IDs used by daftari guests → group numbering
  const daftariGroupsOrder = useMemo(() => {
    const slotIds = new Set<string>();
    assignedCountries.forEach(c => {
      guests.filter(g => g.country === c && (g.mulaqatType === 'Daftari' || g.mulaqatType === 'Both'))
        .forEach(g => { if (guestSlotIds[g.id]) slotIds.add(guestSlotIds[g.id]); });
    });
    return [...slotIds].sort();
  }, [assignedCountries, guests, guestSlotIds]);

  const DAFTARI_GROUP_COLORS = [
    'bg-blue-50 text-blue-700 border-blue-200',
    'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bg-purple-50 text-purple-700 border-purple-200',
    'bg-orange-50 text-orange-700 border-orange-200',
    'bg-pink-50 text-pink-700 border-pink-200',
    'bg-cyan-50 text-cyan-700 border-cyan-200',
  ];

  // ── Daftari Section B: schedule rows ─────────────────────────────────────────

  const daftariScheduleRows = useMemo((): DaftariScheduleRow[] => {
    const sortedDays = [...daftariDays].sort((a, b) => a.date.localeCompare(b.date));
    const rows: DaftariScheduleRow[] = [];
    for (const day of sortedDays) {
      const daySlots = getDaftariSlotsForDay(day.id);
      for (let i = 0; i < daySlots.length; i++) {
        const slot = daySlots[i];
        const slotGuestIds = Object.entries(guestSlotIds)
          .filter(([, sId]) => sId === slot.id)
          .map(([gId]) => gId);
        const slotGuests = slotGuestIds.map(gId => {
          const g = guests.find(guest => guest.id === gId);
          return { id: gId, name: g?.fullName ?? '—', country: g?.country ?? null, designation: g?.designation ?? null, religion: g?.religion ?? null };
        });
        rows.push({
          dayId: day.id, dayDate: day.date, dayLabel: day.label,
          slotId: slot.id, slotName: slot.name,
          slotGuests,
          assignedByName: slot.assigned_by_name,
          isFirstSlotOfDay: i === 0,
          daySlotCount: daySlots.length,
        });
      }
    }
    const dayCount: Record<string, number> = {};
    rows.forEach(r => { dayCount[r.dayId] = (dayCount[r.dayId] ?? 0) + 1; });
    const dayFirst = new Set<string>();
    return rows.map(row => {
      const isFirst = !dayFirst.has(row.dayId);
      if (isFirst) dayFirst.add(row.dayId);
      return { ...row, isFirstSlotOfDay: isFirst, daySlotCount: dayCount[row.dayId] ?? 1 };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daftariDays, daftariSlots, guests, guestSlotIds]);

  const daftariTotalSlots = daftariScheduleRows.length;
  const daftariAvailableSlots = daftariScheduleRows.filter(r => r.slotGuests.length === 0).length;

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
                  <div className="mb-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-[#2D5A45]" />
                      <h2 className="text-lg font-semibold text-[#1A1A1A]">My Delegations</h2>
                      <span className="text-sm text-[#4A4A4A]">({assignedCountries.length})</span>
                    </div>
                    {assignedCountries.length > 0 && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => { setBulkDay(''); setBulkSlot(''); setAssignDialog('assign'); }}
                          disabled={selectedList.length === 0}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#2D5A45] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#234839] transition-colors"
                        >
                          Assign Mulaqat
                        </button>
                        <button
                          onClick={() => { setBulkDay(''); setBulkSlot(''); setAssignDialog('join'); }}
                          disabled={selectedList.length < 2}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#2D5A45] border border-[#2D5A45] rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F0F7F4] transition-colors"
                        >
                          Join &amp; Assign Mulaqat
                        </button>
                        {selectedList.length > 0 && (
                          <span className="text-sm text-gray-500">
                            Selected: {selectedList.length} countr{selectedList.length !== 1 ? 'ies' : 'y'} ({selectedGuestTotal} guest{selectedGuestTotal !== 1 ? 's' : ''} total)
                          </span>
                        )}
                        <div className="ml-auto relative w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                          <Input
                            value={myDelegationsSearch}
                            onChange={e => setMyDelegationsSearch(e.target.value)}
                            placeholder="Search countries..."
                            className="pl-9 border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                          />
                        </div>
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
                                <th className="px-4 py-3 w-10">
                                  <Checkbox
                                    checked={allSelected}
                                    data-state={someSelected ? 'indeterminate' : allSelected ? 'checked' : 'unchecked'}
                                    onCheckedChange={toggleSelectAll}
                                    className="border-gray-300 data-[state=checked]:bg-[#2D5A45] data-[state=checked]:border-[#2D5A45] data-[state=indeterminate]:bg-[#2D5A45] data-[state=indeterminate]:border-[#2D5A45]"
                                  />
                                </th>
                                {['Country', 'Members', 'Head of Delegation', 'Language', 'Assigned Day', 'Assigned Slot', 'Actions'].map(h => (
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
                                      <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                                        <Checkbox
                                          checked={selectedCountries.has(country)}
                                          onCheckedChange={() => toggleCountry(country)}
                                          className="border-gray-300 data-[state=checked]:bg-[#2D5A45] data-[state=checked]:border-[#2D5A45]"
                                        />
                                      </td>
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
                                          ? <span className="flex items-center gap-1.5">
                                              <span className="text-green-700 font-medium">{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
                                              <AhmadiTags a={members.filter(g => isAhmadi(g.religion)).length} na={members.filter(g => !isAhmadi(g.religion)).length} tiny />
                                            </span>
                                          : <span className="text-gray-400">0 members</span>}
                                      </td>
                                      <td className={`px-4 py-3 whitespace-nowrap ${rowTextCls}`}>
                                        {del?.head_of_delegation_name
                                          ? <span className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /><span className="text-[#1A1A1A]">{del.head_of_delegation_name}</span></span>
                                          : <span className="text-gray-400 italic">Not assigned</span>}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                        {del ? (
                                          <LanguageSelect
                                            value={del.language}
                                            onValueChange={v => handleSetDelegationLanguage(country, v)}
                                            languages={mulaqatLanguages}
                                            className="min-w-[140px]"
                                            stopPropagation
                                          />
                                        ) : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className={`px-4 py-3 whitespace-nowrap ${rowTextCls}`}>
                                        {assignedDay ? <span className="text-[#1A1A1A]">{fmt(assignedDay.date)}</span> : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className={`px-4 py-3 whitespace-nowrap ${rowTextCls}`}>
                                        {assignedSlot ? <span className="text-[#1A1A1A]">{assignedSlot.name}</span> : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => handleOpenChangeSlot(country, del?.slot_id ?? null)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#2D5A45] hover:bg-[#D6E4D9] transition-colors"
                                          >
                                            <CalendarDays className="w-3.5 h-3.5" />
                                            {hasSlot ? 'Change' : 'Assign'}
                                          </button>
                                          {hasSlot && (
                                            <button
                                              onClick={() => setRemoveSlotDialog({ country, slotName: assignedSlot?.name ?? '' })}
                                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-50 transition-colors"
                                            >
                                              <X className="w-3.5 h-3.5" />
                                              Remove
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>

                                    {/* ── Expandable member section ── */}
                                    {isExpanded && (
                                      <tr>
                                        <td colSpan={8} className="p-0 border-b border-[#E8E3DB]">
                                          <div className="border-l-4 border-l-[#2D5A45] bg-gray-50/50 pl-8 pr-6 py-4 space-y-3">
                                            {/* Slot info */}
                                            <div className="flex items-center gap-2 text-sm">
                                              <CalendarDays className="w-3.5 h-3.5 text-[#2D5A45] flex-shrink-0" />
                                              {assignedSlot
                                                ? <span className="text-[#4A4A4A]"><span className="font-medium text-[#1A1A1A]">{assignedDay ? fmt(assignedDay.date) : ''}</span>{assignedDay ? ' — ' : ''}{assignedSlot.name}</span>
                                                : <span className="text-amber-600 font-medium">No slot assigned</span>}
                                              <button
                                                onClick={() => handleOpenChangeSlot(country, del?.slot_id ?? null)}
                                                className="text-xs text-[#2D5A45] hover:underline font-medium"
                                              >
                                                {assignedSlot ? 'Change' : 'Assign slot'}
                                              </button>
                                            </div>
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
                                                      {['#', 'Name', 'Designation', 'Departure', 'Actions'].map(h => (
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
                                                          <td className="px-4 py-2.5 font-medium text-[#1A1A1A]">
                                                            <div className="flex items-center gap-1.5">
                                                              {isHead && <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                                                              {g.fullName}
                                                              <AhmadiSingle religion={g.religion} />
                                                            </div>
                                                          </td>
                                                          <td className="px-4 py-2.5 text-xs text-[#4A4A4A]">{formatDesignation(g.designation)}</td>
                                                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                                                            <div className="text-[#4A4A4A]">{fmtDep(g.departureTime)}</div>
                                                            {fmtFlight(g.departureFlightNumber, g.departureAirport) && (
                                                              <div className="text-xs text-gray-400 mt-0.5">{fmtFlight(g.departureFlightNumber, g.departureAirport)}</div>
                                                            )}
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
                {/* ── Section A: My Daftari Guests (flat per-guest table) ── */}
                <section>
                  <div className="mb-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-[#2D5A45]" />
                      <h2 className="text-lg font-semibold text-[#1A1A1A]">My Daftari Guests</h2>
                      <span className="text-sm text-[#4A4A4A]">({daftariGuests.length})</span>
                    </div>
                    {daftariGuests.length > 0 && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => { setDaftariBulkDay(''); setDaftariBulkSlot(''); setDaftariAssignDialog('assign'); }}
                          disabled={daftariSelectedGuestTotal === 0}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#2D5A45] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#234839] transition-colors"
                        >
                          Assign Mulaqat
                        </button>
                        <button
                          onClick={() => { setDaftariBulkDay(''); setDaftariBulkSlot(''); setDaftariAssignDialog('join'); }}
                          disabled={daftariSelectedGuestTotal < 2}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#2D5A45] border border-[#2D5A45] rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F0F7F4] transition-colors"
                        >
                          Join &amp; Assign Mulaqat
                        </button>
                        {daftariSelectedGuestTotal > 0 && (
                          <span className="text-sm text-gray-500">
                            Selected: {daftariSelectedGuestTotal} guest{daftariSelectedGuestTotal !== 1 ? 's' : ''}
                          </span>
                        )}
                        <div className="ml-auto relative w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                          <Input
                            value={daftariSearch}
                            onChange={e => setDaftariSearch(e.target.value)}
                            placeholder="Search guests..."
                            className="pl-9 border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                          />
                        </div>
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
                        <div className="w-full overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-[#F9F8F6]">
                                <th className="px-4 py-3 w-10">
                                  <Checkbox
                                    checked={daftariAllGuestsSelected}
                                    data-state={daftariSomeGuestsSelected ? 'indeterminate' : daftariAllGuestsSelected ? 'checked' : 'unchecked'}
                                    onCheckedChange={toggleDaftariSelectAll}
                                    className="border-gray-300 data-[state=checked]:bg-[#2D5A45] data-[state=checked]:border-[#2D5A45] data-[state=indeterminate]:bg-[#2D5A45] data-[state=indeterminate]:border-[#2D5A45]"
                                  />
                                </th>
                                {['Country', 'Name', 'Designation', 'Departure', 'Language', 'Assigned Day', 'Assigned Slot', 'Group', 'Actions'].map(h => (
                                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredDaftariGuests.map((g) => {
                                const gSlotId = guestSlotIds[g.id];
                                const assignedSlot = gSlotId ? daftariSlots.find(s => s.id === gSlotId) : null;
                                const assignedDay = assignedSlot?.day_id ? daftariDays.find(d => d.id === assignedSlot.day_id) : null;
                                const gGroupNum = gSlotId ? (daftariGroupsOrder.indexOf(gSlotId) + 1) : null;
                                const hasSlot = !!gSlotId;
                                const borderCls = hasSlot ? '' : 'border-l-4 border-l-amber-300';
                                return (
                                  <tr key={g.id} className={`border-b border-[#E8E3DB] bg-white hover:bg-[#FAFAFA] ${borderCls}`}>
                                    <td className="px-4 py-3 w-10">
                                      <Checkbox
                                        checked={daftariSelectedGuests.has(g.id)}
                                        onCheckedChange={() => toggleDaftariGuest(g.id)}
                                        className="border-gray-300 data-[state=checked]:bg-[#2D5A45] data-[state=checked]:border-[#2D5A45]"
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#4A4A4A] whitespace-nowrap">{g.country}</td>
                                    <td className="px-4 py-3 font-medium text-[#1A1A1A] whitespace-nowrap">
                                      <div className="flex items-center gap-1.5">
                                        {g.fullName}
                                        <AhmadiSingle religion={g.religion} />
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#4A4A4A]">{formatDesignation(g.designation)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <div className="text-sm text-[#4A4A4A]">{fmtDep(g.departureTime)}</div>
                                      {fmtFlight(g.departureFlightNumber, g.departureAirport) && (
                                        <div className="text-xs text-gray-400 mt-0.5">{fmtFlight(g.departureFlightNumber, g.departureAirport)}</div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {assignedSlot ? (
                                        <LanguageSelect
                                          value={assignedSlot.language}
                                          onValueChange={v => handleSetDaftariSlotLanguage(assignedSlot.id, v)}
                                          languages={mulaqatLanguages}
                                          className="min-w-[130px]"
                                        />
                                      ) : <LanguageTag />}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {assignedDay
                                        ? <span className="text-[#1A1A1A] text-sm">{fmt(assignedDay.date)}</span>
                                        : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {assignedSlot
                                        ? <span className="text-[#1A1A1A] font-medium">{assignedSlot.name}</span>
                                        : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {gGroupNum && gGroupNum > 0
                                        ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${DAFTARI_GROUP_COLORS[(gGroupNum - 1) % DAFTARI_GROUP_COLORS.length]}`}>Group {gGroupNum}</span>
                                        : <span className="text-gray-400 text-xs">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleDaftariOpenChangeSlot(g)}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#2D5A45] hover:bg-[#D6E4D9] transition-colors"
                                        >
                                          <CalendarDays className="w-3.5 h-3.5" />
                                          {hasSlot ? 'Change' : 'Assign'}
                                        </button>
                                        <button
                                          onClick={() => setDaftariRemoveDialog({ guest: g })}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                          Remove
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
                                {['Day', 'Slot', 'Guest(s)', 'Country', 'Group', 'Managed By', 'Status'].map(h => (
                                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {daftariScheduleRows.map((row, i) => {
                                const isEmpty = row.slotGuests.length === 0;
                                const hasMine = row.slotGuests.some(sg => assignedCountries.includes(sg.country ?? ''));
                                const isNewDay = row.isFirstSlotOfDay && i > 0;
                                const groupNum = !isEmpty ? (daftariGroupsOrder.indexOf(row.slotId) + 1) : null;
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
                                      {isEmpty ? <span className="text-gray-400">—</span> : (
                                        <div className="space-y-0.5">
                                          {row.slotGuests.map(sg => {
                                            const isMineGuest = assignedCountries.includes(sg.country ?? '');
                                            return (
                                              <div key={sg.id} className={`flex items-center gap-1 text-xs ${isMineGuest ? 'text-[#1A1A1A] font-medium' : 'text-gray-400'}`}>
                                                {sg.name}
                                                <AhmadiSingle religion={sg.religion} />
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {isEmpty ? <span className="text-gray-400">—</span> : (
                                        <div className="space-y-0.5">
                                          {row.slotGuests.map(sg => {
                                            const isMineGuest = assignedCountries.includes(sg.country ?? '');
                                            return (
                                              <div key={sg.id} className={`text-xs ${isMineGuest ? 'text-[#4A4A4A]' : 'text-gray-400'}`}>{sg.country ?? '—'}</div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {isEmpty || !groupNum || groupNum <= 0
                                        ? <span className="text-gray-400">—</span>
                                        : <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${DAFTARI_GROUP_COLORS[(groupNum - 1) % DAFTARI_GROUP_COLORS.length]}`}>Group {groupNum}</span>
                                      }
                                    </td>
                                    <td className={`px-4 py-3 text-sm ${isEmpty ? 'text-gray-400' : hasMine ? 'font-medium text-[#1A1A1A]' : 'text-gray-400'}`}>
                                      {row.assignedByName ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {isEmpty
                                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">Available</span>
                                        : <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${hasMine ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                            {hasMine ? `Assigned (${row.slotGuests.length})` : 'Assigned'}
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

      {/* ── Remove Slot Confirm Dialog ── */}
      <Dialog open={!!removeSlotDialog} onOpenChange={open => { if (!open) setRemoveSlotDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Slot Assignment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Remove <span className="font-semibold">{removeSlotDialog?.country}</span> delegation from{' '}
            <span className="font-semibold">{removeSlotDialog?.slotName}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveSlotDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!removeSlotDialog) return;
                await handleRemoveSlot(removeSlotDialog.country);
                toast.success(`${removeSlotDialog.country} removed from slot`);
                setRemoveSlotDialog(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change / Assign Slot Dialog ── */}
      {changeSlotDialog && (() => {
        const cDel = getDelegationForCountry(changeSlotDialog.country);
        const currentSlot = slots.find(s => s.id === changeSlotDialog.currentSlotId);
        const currentDay = getAssignedDay(changeSlotDialog.currentSlotId);
        const isChange = !!changeSlotDialog.currentSlotId;
        return (
          <Dialog open onOpenChange={open => { if (!open) { setChangeSlotDialog(null); setChangeSlotDay(''); setChangeSlotSlot(''); setChangeSlotLanguage(''); } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{isChange ? 'Change Mulaqat Slot' : 'Assign Mulaqat Slot'}</DialogTitle>
                {isChange && currentSlot && (
                  <p className="text-sm text-[#4A4A4A] mt-1">
                    Currently assigned: <span className="font-medium text-[#1A1A1A]">{currentDay ? fmt(currentDay.date) : ''}{currentDay ? ' — ' : ''}{currentSlot.name}</span>
                  </p>
                )}
                <p className="text-sm text-[#4A4A4A]">
                  {changeSlotDialog.country} delegation
                </p>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Mulaqat Day</label>
                  <select
                    value={changeSlotDay}
                    onChange={e => { setChangeSlotDay(e.target.value); setChangeSlotSlot(''); }}
                    className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
                  >
                    <option value="">Select a day...</option>
                    {[...days].sort((a, b) => a.date.localeCompare(b.date)).map(d => (
                      <option key={d.id} value={d.id}>{fmt(d.date)}{d.label ? ` — ${d.label}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Slot</label>
                  <select
                    value={changeSlotSlot}
                    onChange={e => setChangeSlotSlot(e.target.value)}
                    disabled={!changeSlotDay}
                    className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Select a slot...</option>
                    {getSlotsForDay(changeSlotDay).map(s => {
                      const isCurrent = s.id === changeSlotDialog.currentSlotId;
                      const taken = delegationDetails.filter(d => d.slot_id === s.id && d.id !== cDel?.id).length;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name}{isCurrent ? ' (current)' : taken === 0 ? ' — Available' : ` — ${taken} delegation${taken !== 1 ? 's' : ''} assigned`}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Language</label>
                  <LanguageSelect
                    value={changeSlotLanguage}
                    onValueChange={setChangeSlotLanguage}
                    languages={mulaqatLanguages}
                    className="w-full"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setChangeSlotDialog(null); setChangeSlotDay(''); setChangeSlotSlot(''); setChangeSlotLanguage(''); }}>Cancel</Button>
                <Button
                  onClick={handleConfirmChangeSlot}
                  disabled={!changeSlotSlot || changeSlotSlot === changeSlotDialog.currentSlotId}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white"
                >
                  {isChange ? 'Change Slot' : 'Assign Slot'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Assign Mulaqat Dialog ── */}
      <Dialog open={assignDialog === 'assign' || assignDialog === 'join'} onOpenChange={open => { if (!open) { setAssignDialog(null); setBulkDay(''); setBulkSlot(''); setBulkLanguage(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {assignDialog === 'join' ? 'Join Delegations & Assign Slot' : 'Assign Mulaqat Slot'}
            </DialogTitle>
            <p className="text-sm text-[#4A4A4A] mt-1">
              {assignDialog === 'join'
                ? 'These delegations will share the same Mulaqat slot'
                : `Assign ${selectedList.length} delegation${selectedList.length !== 1 ? 's' : ''} to a slot`}
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Country pills */}
            <div className="flex flex-wrap gap-1.5">
              {selectedList.map(c => {
                const count = getMulaqatGuests(c).length;
                return (
                  <span key={c} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-[#EBF4EE] text-[#2D5A45] border border-[#C8E0D0] font-medium">
                    {c}{assignDialog === 'join' ? ` (${count})` : ''}
                  </span>
                );
              })}
            </div>
            {assignDialog === 'join' && (
              <p className="text-sm text-[#4A4A4A]">
                <span className="font-medium text-[#1A1A1A]">{selectedGuestTotal}</span> guests total
              </p>
            )}

            {/* Day selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Mulaqat Day</label>
              <select
                value={bulkDay}
                onChange={e => { setBulkDay(e.target.value); setBulkSlot(''); }}
                className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
              >
                <option value="">Select a day...</option>
                {[...days].sort((a, b) => a.date.localeCompare(b.date)).map(d => (
                  <option key={d.id} value={d.id}>{fmt(d.date)}{d.label ? ` — ${d.label}` : ''}</option>
                ))}
              </select>
            </div>

            {/* Slot selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Slot</label>
              <select
                value={bulkSlot}
                onChange={e => setBulkSlot(e.target.value)}
                disabled={!bulkDay}
                className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none disabled:opacity-50"
              >
                <option value="">Select a slot...</option>
                {getSlotsForDay(bulkDay).map(s => {
                  const taken = delegationDetails.filter(d => d.slot_id === s.id).length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} — {taken === 0 ? 'Available' : `${taken} delegation${taken !== 1 ? 's' : ''} already`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Language selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Language</label>
              <LanguageSelect
                value={bulkLanguage}
                onValueChange={setBulkLanguage}
                languages={mulaqatLanguages}
                className="w-full"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignDialog(null); setBulkDay(''); setBulkSlot(''); setBulkLanguage(''); }}>Cancel</Button>
            <Button
              onClick={handleBulkAssign}
              disabled={!bulkSlot}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              {assignDialog === 'join' ? 'Join & Assign' : 'Assign to Slot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Daftari: Remove from Daftari confirm ── */}
      <Dialog open={!!daftariRemoveDialog} onOpenChange={open => { if (!open) setDaftariRemoveDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove from Daftari</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Remove <span className="font-semibold">{daftariRemoveDialog?.guest.fullName}</span> from Daftari Mulaqat?
            {daftariRemoveDialog?.guest.mulaqatType === 'Both' && (
              <span className="block mt-1 text-xs text-gray-500">They will remain in the Delegation list.</span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDaftariRemoveDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!daftariRemoveDialog) return;
                await handleRemoveFromDaftari(daftariRemoveDialog.guest);
                setDaftariRemoveDialog(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Daftari: Change / Assign Slot (per-guest) ── */}
      {daftariChangeSlotDialog && (() => {
        const isChange = !!daftariChangeSlotDialog.currentSlotId;
        const currentSlot = daftariSlots.find(s => s.id === daftariChangeSlotDialog.currentSlotId);
        const currentDay = currentSlot?.day_id ? daftariDays.find(d => d.id === currentSlot.day_id) : null;
        return (
          <Dialog open onOpenChange={open => { if (!open) { setDaftariChangeSlotDialog(null); setDaftariChangeSlotDay(''); setDaftariChangeSlotSlot(''); setDaftariChangeSlotLanguage(''); } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{isChange ? 'Change Daftari Slot' : 'Assign Daftari Slot'}</DialogTitle>
                {isChange && currentSlot && (
                  <p className="text-sm text-[#4A4A4A] mt-1">
                    Currently: <span className="font-medium text-[#1A1A1A]">{currentDay ? fmt(currentDay.date) : ''}{currentDay ? ' — ' : ''}{currentSlot.name}</span>
                  </p>
                )}
                <p className="text-sm text-[#4A4A4A]">{daftariChangeSlotDialog.guestName}</p>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Daftari Day</label>
                  <select
                    value={daftariChangeSlotDay}
                    onChange={e => { setDaftariChangeSlotDay(e.target.value); setDaftariChangeSlotSlot(''); }}
                    className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
                  >
                    <option value="">Select a day...</option>
                    {[...daftariDays].sort((a, b) => a.date.localeCompare(b.date)).map(d => (
                      <option key={d.id} value={d.id}>{fmt(d.date)}{d.label ? ` — ${d.label}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Slot</label>
                  <select
                    value={daftariChangeSlotSlot}
                    onChange={e => setDaftariChangeSlotSlot(e.target.value)}
                    disabled={!daftariChangeSlotDay}
                    className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Select a slot...</option>
                    {getDaftariSlotsForDay(daftariChangeSlotDay).map(s => {
                      const isCurrent = s.id === daftariChangeSlotDialog.currentSlotId;
                      const occupants = Object.values(guestSlotIds).filter(sId => sId === s.id).length;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name}{isCurrent ? ' (current)' : occupants === 0 ? ' — Available' : ` — ${occupants} guest${occupants !== 1 ? 's' : ''}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Language</label>
                  <LanguageSelect
                    value={daftariChangeSlotLanguage}
                    onValueChange={setDaftariChangeSlotLanguage}
                    languages={mulaqatLanguages}
                    className="w-full"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDaftariChangeSlotDialog(null); setDaftariChangeSlotDay(''); setDaftariChangeSlotSlot(''); setDaftariChangeSlotLanguage(''); }}>Cancel</Button>
                <Button
                  onClick={handleDaftariConfirmChangeSlot}
                  disabled={!daftariChangeSlotSlot || daftariChangeSlotSlot === daftariChangeSlotDialog.currentSlotId}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white"
                >
                  {isChange ? 'Change Slot' : 'Assign Slot'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Daftari: Assign / Join & Assign Dialog ── */}
      <Dialog open={daftariAssignDialog === 'assign' || daftariAssignDialog === 'join'} onOpenChange={open => { if (!open) { setDaftariAssignDialog(null); setDaftariBulkDay(''); setDaftariBulkSlot(''); setDaftariBulkLanguage(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {daftariAssignDialog === 'join' ? 'Join & Assign Daftari Slot' : 'Assign Daftari Slot'}
            </DialogTitle>
            <p className="text-sm text-[#4A4A4A] mt-1">
              {daftariAssignDialog === 'join'
                ? `${daftariSelectedGuestTotal} guests will share one slot and form a group`
                : `Assign ${daftariSelectedGuestTotal} selected guest${daftariSelectedGuestTotal !== 1 ? 's' : ''} to a slot`}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-1.5">
              {daftariSelectedGuestList.map(g => (
                <span key={g.id} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-[#EBF4EE] text-[#2D5A45] border border-[#C8E0D0] font-medium">
                  {g.fullName}
                </span>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Daftari Day</label>
              <select
                value={daftariBulkDay}
                onChange={e => { setDaftariBulkDay(e.target.value); setDaftariBulkSlot(''); }}
                className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
              >
                <option value="">Select a day...</option>
                {[...daftariDays].sort((a, b) => a.date.localeCompare(b.date)).map(d => (
                  <option key={d.id} value={d.id}>{fmt(d.date)}{d.label ? ` — ${d.label}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Slot</label>
              <select
                value={daftariBulkSlot}
                onChange={e => setDaftariBulkSlot(e.target.value)}
                disabled={!daftariBulkDay}
                className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none disabled:opacity-50"
              >
                <option value="">Select a slot...</option>
                {getDaftariSlotsForDay(daftariBulkDay).map(s => {
                  const occupants = Object.values(guestSlotIds).filter(sId => sId === s.id).length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} — {occupants === 0 ? 'Available' : `${occupants} guest${occupants !== 1 ? 's' : ''} assigned`}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Language</label>
              <LanguageSelect
                value={daftariBulkLanguage}
                onValueChange={setDaftariBulkLanguage}
                languages={mulaqatLanguages}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDaftariAssignDialog(null); setDaftariBulkDay(''); setDaftariBulkSlot(''); setDaftariBulkLanguage(''); }}>Cancel</Button>
            <Button
              onClick={handleDaftariBulkAssign}
              disabled={!daftariBulkSlot}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              {daftariAssignDialog === 'join' ? 'Join & Assign' : 'Assign to Slot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
