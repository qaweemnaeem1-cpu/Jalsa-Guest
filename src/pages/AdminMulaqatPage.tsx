import { useState, useEffect, useCallback, useMemo, Fragment, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Calendar, CalendarDays, ChevronDown, ChevronRight, GripVertical, LogOut, User,
  Plus, Pencil, Trash2, Eye, X, Star, Users, AlertTriangle, Search, UserMinus, UserPlus,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ROLE_LABELS, formatDesignation } from '@/lib/constants';
import { ProfileDialog } from '@/components/ProfileDialog';
import { SUPER_ADMIN_NAV } from '@/lib/navItems';
import type { Guest } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MulaqatDay {
  id: string;
  date: string;
  label: string | null;
  created_by: string | null;
}

interface MulaqatSlot {
  id: string;
  name: string;
  day_id: string | null;
  date: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
}

interface DelegationMember {
  id: string;
  guest_id: string;
  guest_name: string;
  is_head: boolean;
}

interface Delegation {
  id: string;
  country: string;
  managed_by: string | null;
  managed_by_name: string | null;
  head_of_delegation_id: string | null;
  head_of_delegation_name: string | null;
  slot_id: string | null;
  delegation_members: DelegationMember[];
}

interface DaftariDay {
  id: string;
  date: string;
  label: string | null;
  is_active: boolean;
  created_by: string | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtShort(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// "28 Jun 2026" or "28 Jun 2026, 14:30" — used for combined departure column
function fmtDep(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  const datePart = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const h = dt.getHours(), m = dt.getMinutes();
  if (h === 0 && m === 0) return datePart;
  return `${datePart}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtFlight(flightNum: string | undefined, airport: string | undefined): string | null {
  if (!flightNum) return null;
  return airport ? `${flightNum} · ${airport}` : flightNum;
}

function dayHeader(day: MulaqatDay | DaftariDay): string {
  const dateStr = fmt(day.date);
  return day.label ? `${dateStr} — ${day.label}` : dateStr;
}

// ── Sortable slot helpers ─────────────────────────────────────────────────────

const DragHandleCtx = createContext<React.HTMLAttributes<HTMLButtonElement>>({});

function SortableSlotItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <DragHandleCtx.Provider value={{ ...(attributes as React.HTMLAttributes<HTMLButtonElement>), ...(listeners as React.HTMLAttributes<HTMLButtonElement>) }}>
      <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50 shadow-lg scale-[1.01]' : ''}>
        {children}
      </div>
    </DragHandleCtx.Provider>
  );
}

function SlotDragHandle() {
  const handleProps = useContext(DragHandleCtx);
  return (
    <button
      {...handleProps}
      className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none p-0.5 flex-shrink-0"
      title="Drag to reorder"
    >
      <GripVertical className="w-5 h-5" />
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminMulaqatPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();

  // Tab
  const [activeTab, setActiveTab] = useState<'delegation' | 'daftari'>('delegation');

  // Delegation data
  const [days, setDays] = useState<MulaqatDay[]>([]);
  const [slots, setSlots] = useState<MulaqatSlot[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);

  // Daftari data
  const [daftariDays, setDaftariDays] = useState<DaftariDay[]>([]);
  const [daftariSlots, setDaftariSlots] = useState<DaftariSlot[]>([]);
  const [daftariGuestSlotIds, setDaftariGuestSlotIds] = useState<Record<string, string>>({});
  const [daftariLoading, setDaftariLoading] = useState(true);

  // UI state
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [delegationFilter, setDelegationFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [delegationSearch, setDelegationSearch] = useState('');

  // Add Day dialog (delegation)
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [addDayDate, setAddDayDate] = useState('');
  const [addDayLabel, setAddDayLabel] = useState('');
  const [addDaySlotCount, setAddDaySlotCount] = useState(1);
  const [daySaving, setDaySaving] = useState(false);

  // Edit Day dialog (delegation)
  const [editDayDialog, setEditDayDialog] = useState<MulaqatDay | null>(null);
  const [editDayDate, setEditDayDate] = useState('');
  const [editDayLabel, setEditDayLabel] = useState('');

  // Delete Day confirm (delegation)
  const [deleteDayDialog, setDeleteDayDialog] = useState<MulaqatDay | null>(null);

  // Add Slot inside a day (delegation)
  const [addSlotDialog, setAddSlotDialog] = useState<{ dayId: string; dayDate: string } | null>(null);
  const [addSlotName, setAddSlotName] = useState('');

  // Delete slot confirm (delegation)
  const [deleteSlotDialog, setDeleteSlotDialog] = useState<MulaqatSlot | null>(null);

  // Assign delegation to slot (inline)
  const [assigningSlotId, setAssigningSlotId] = useState<string | null>(null);
  const [assignDelegationValue, setAssignDelegationValue] = useState('');

  // Assign slot from delegation table row
  const [rowAssignDialog, setRowAssignDialog] = useState<Delegation | null>(null);
  const [rowAssignSlotValue, setRowAssignSlotValue] = useState('');
  const [changeSlotDay, setChangeSlotDay] = useState('');

  // Inline expanded delegation (slot cards + all-delegations table)
  const [slotExpandedId, setSlotExpandedId] = useState<string | null>(null);
  const [tableExpandedId, setTableExpandedId] = useState<string | null>(null);
  const [addGuestDelegationId, setAddGuestDelegationId] = useState<string | null>(null);
  const [addGuestSelectedId, setAddGuestSelectedId] = useState('');

  // Move delegation from slot card
  const [moveDelegationDialog, setMoveDelegationDialog] = useState<{ delegation: Delegation; currentSlotId: string } | null>(null);
  const [moveDelegationDay, setMoveDelegationDay] = useState('');
  const [moveDelegationSlot, setMoveDelegationSlot] = useState('');

  // All Delegations bulk actions
  const [selectedDelegationIds, setSelectedDelegationIds] = useState<Set<string>>(new Set());
  const [bulkAssignDialog, setBulkAssignDialog] = useState<'assign' | 'join' | null>(null);
  const [bulkDay, setBulkDay] = useState('');
  const [bulkSlot, setBulkSlot] = useState('');
  const [separateDialog, setSeparateDialog] = useState(false);

  // Daftari Guests bulk actions
  const [selectedDaftariGuestIds, setSelectedDaftariGuestIds] = useState<Set<string>>(new Set());
  const [daftariBulkAssignDialog, setDaftariBulkAssignDialog] = useState<'assign' | 'join' | null>(null);
  const [daftariBulkDay, setDaftariBulkDay] = useState('');
  const [daftariBulkSlot, setDaftariBulkSlot] = useState('');
  const [daftariSeparateDialog, setDaftariSeparateDialog] = useState(false);

  // View delegation members
  const [viewDelegation, setViewDelegation] = useState<Delegation | null>(null);
  const [changeHeadValue, setChangeHeadValue] = useState('');

  // Delete delegation confirm
  const [deleteDelegationDialog, setDeleteDelegationDialog] = useState<Delegation | null>(null);

  // Daftari – Add Day dialog
  const [addDaftariDayOpen, setAddDaftariDayOpen] = useState(false);
  const [addDaftariDate, setAddDaftariDate] = useState('');
  const [addDaftariLabel, setAddDaftariLabel] = useState('');
  const [addDaftariSlotCount, setAddDaftariSlotCount] = useState(1);
  const [daftariDaySaving, setDaftariDaySaving] = useState(false);

  // Daftari – Edit Day dialog
  const [editDaftariDayDialog, setEditDaftariDayDialog] = useState<DaftariDay | null>(null);
  const [editDaftariDate, setEditDaftariDate] = useState('');
  const [editDaftariLabel, setEditDaftariLabel] = useState('');

  // Daftari – Delete Day confirm
  const [deleteDaftariDayDialog, setDeleteDaftariDayDialog] = useState<DaftariDay | null>(null);

  // Daftari – Add Slot to existing day
  const [addDaftariSlotDialog, setAddDaftariSlotDialog] = useState<{ dayId: string; dayDate: string } | null>(null);
  const [addDaftariSlotName, setAddDaftariSlotName] = useState('');

  // Daftari – Delete Slot confirm
  const [deleteDaftariSlotDialog, setDeleteDaftariSlotDialog] = useState<DaftariSlot | null>(null);

  // Daftari – Guest assignment (Section B)
  const [assigningDaftariGuestId, setAssigningDaftariGuestId] = useState<string | null>(null);
  const [assignDaftariSlotValue, setAssignDaftariSlotValue] = useState('');

  // Daftari – Day card expansion
  const [expandedDaftariDays, setExpandedDaftariDays] = useState<Set<string>>(new Set());

  // Daftari – Change slot dialog (from day cards) — carries specific guestId for per-guest moves
  const [changeDaftariSlotDialog, setChangeDaftariSlotDialog] = useState<{ slot: DaftariSlot; guestId: string } | null>(null);
  const [changeDaftariSlotDay, setChangeDaftariSlotDay] = useState('');
  const [changeDaftariSlotValue, setChangeDaftariSlotValue] = useState('');

  // Daftari – Search/filter
  const [daftariSearch, setDaftariSearch] = useState('');
  const [daftariCountryFilter, setDaftariCountryFilter] = useState('');

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [{ data: dayData }, { data: slotData }, { data: delData, error: delError }] = await Promise.all([
      supabase.from('mulaqat_days').select('*').order('date'),
      supabase.from('mulaqat_slots').select('*').order('name'),
      supabase
        .from('delegations')
        .select('id, country, managed_by, managed_by_name, head_of_delegation_id, head_of_delegation_name, slot_id, delegation_members(*)')
        .order('country'),
    ]);
    if (dayData) setDays(dayData as MulaqatDay[]);
    if (slotData) setSlots(slotData as MulaqatSlot[]);
    if (delData) setDelegations(delData as Delegation[]);
    console.log('[SA Mulaqat] Delegations:', delData);
    console.log('[SA Mulaqat] Delegation query error:', delError);
    console.log('[SA Mulaqat] Members per country:', delData?.map(d => ({ country: d.country, memberCount: d.delegation_members?.length ?? 0, members: d.delegation_members })));
    // Check RLS on delegation_members directly
    const { data: dmDirect, error: dmError } = await supabase.from('delegation_members').select('id, delegation_id, guest_id, guest_name, is_head');
    console.log('[SA Mulaqat] delegation_members direct query:', dmDirect?.length, 'rows, error:', dmError);
    setLoading(false);
  }, []);

  const fetchDaftari = useCallback(async () => {
    const [{ data: ddData }, { data: dsData }, { data: gsData }] = await Promise.all([
      supabase.from('daftari_days').select('*').order('date'),
      supabase.from('daftari_slots').select('*').order('name'),
      supabase.from('guests').select('id, daftari_slot_id').not('daftari_slot_id', 'is', null),
    ]);
    if (ddData) setDaftariDays(ddData as DaftariDay[]);
    if (dsData) setDaftariSlots(dsData as DaftariSlot[]);
    if (gsData) {
      const map: Record<string, string> = {};
      (gsData as Array<{ id: string; daftari_slot_id: string }>).forEach(g => {
        if (g.daftari_slot_id) map[g.id] = g.daftari_slot_id;
      });
      setDaftariGuestSlotIds(map);
    }
    setDaftariLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    fetchDaftari();
    const sub = supabase
      .channel('admin-mulaqat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mulaqat_days' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mulaqat_slots' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delegations' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delegation_members' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daftari_days' }, fetchDaftari)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daftari_slots' }, fetchDaftari)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [fetchAll, fetchDaftari]);

  // ── Derived (delegation) ──────────────────────────────────────────────────────

  const getSlotsForDay = (dayId: string) => slots.filter(s => s.day_id === dayId);
  const getDelegationsForSlot = (slotId: string) => delegations.filter(d => d.slot_id === slotId);
  const unassignedDelegations = useMemo(() => delegations.filter(d => !d.slot_id), [delegations]);

  const slotDisplayLabel = (slotId: string | null): string => {
    if (!slotId) return 'Unassigned';
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return 'Unknown';
    const day = days.find(d => d.id === slot.day_id);
    const dayStr = day ? fmt(day.date) : '';
    return day ? `${dayStr} — ${slot.name}` : slot.name;
  };

  const totalGuests = useMemo(
    () => delegations.reduce((s, d) => s + d.delegation_members.length, 0),
    [delegations],
  );

  const filteredDelegations = useMemo(() => {
    return delegations.filter(d => {
      if (delegationFilter === 'assigned' && !d.slot_id) return false;
      if (delegationFilter === 'unassigned' && d.slot_id) return false;
      if (delegationSearch && !d.country.toLowerCase().includes(delegationSearch.toLowerCase())) return false;
      return true;
    });
  }, [delegations, delegationFilter, delegationSearch]);

  const selectedDelegationList = useMemo(
    () => filteredDelegations.filter(d => selectedDelegationIds.has(d.id)),
    [filteredDelegations, selectedDelegationIds],
  );
  const allDelegationsSelected = filteredDelegations.length > 0 && filteredDelegations.every(d => selectedDelegationIds.has(d.id));
  const someDelegationsSelected = filteredDelegations.some(d => selectedDelegationIds.has(d.id)) && !allDelegationsSelected;
  const selectedGuestTotal = selectedDelegationList.reduce((s, d) => s + d.delegation_members.length, 0);
  const canSeparate = selectedDelegationList.length >= 2 &&
    selectedDelegationList.every(d => d.slot_id !== null) &&
    new Set(selectedDelegationList.map(d => d.slot_id)).size === 1;

  const toggleDelegation = (id: string) => {
    setSelectedDelegationIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllDelegations = () => {
    if (allDelegationsSelected) setSelectedDelegationIds(new Set());
    else setSelectedDelegationIds(new Set(filteredDelegations.map(d => d.id)));
  };

  // ── Derived (daftari) ─────────────────────────────────────────────────────────

  const daftariGuests = useMemo(
    () => guests.filter(g => g.mulaqatType === 'Daftari' || g.mulaqatType === 'Both'),
    [guests],
  );

  const filteredDaftariGuests = useMemo(() => {
    return daftariGuests.filter(g => {
      if (daftariCountryFilter && g.country !== daftariCountryFilter) return false;
      if (daftariSearch) {
        const q = daftariSearch.toLowerCase();
        if (!g.fullName.toLowerCase().includes(q) && !g.country.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [daftariGuests, daftariSearch, daftariCountryFilter]);

  const getDaftariSlotsForDay = (dayId: string) => daftariSlots.filter(s => s.day_id === dayId);
  const assignedDaftariCount = useMemo(() => daftariSlots.filter(s => s.guest_id).length, [daftariSlots]);
  const availableDaftariCount = useMemo(() => daftariSlots.filter(s => !s.guest_id).length, [daftariSlots]);

  const getDaftariGuestSlot = (guestId: string): DaftariSlot | null => {
    const slotId = daftariGuestSlotIds[guestId];
    return slotId ? (daftariSlots.find(s => s.id === slotId) ?? null) : null;
  };
  const getDaftariGuestDay = (guestId: string): DaftariDay | null => {
    const slot = getDaftariGuestSlot(guestId);
    if (!slot?.day_id) return null;
    return daftariDays.find(d => d.id === slot.day_id) ?? null;
  };

  const getDIForCountry = (country: string) =>
    delegations.find(d => d.country === country)?.managed_by_name ?? '—';

  const daftariCountries = useMemo(() => {
    const set = new Set(daftariGuests.map(g => g.country));
    return Array.from(set).sort();
  }, [daftariGuests]);

  const selectedDaftariGuestList = useMemo(
    () => filteredDaftariGuests.filter(g => selectedDaftariGuestIds.has(g.id)),
    [filteredDaftariGuests, selectedDaftariGuestIds],
  );
  const allDaftariGuestsSelected = filteredDaftariGuests.length > 0 && filteredDaftariGuests.every(g => selectedDaftariGuestIds.has(g.id));
  const someDaftariGuestsSelected = filteredDaftariGuests.some(g => selectedDaftariGuestIds.has(g.id)) && !allDaftariGuestsSelected;
  const canSeparateDaftari = selectedDaftariGuestList.length >= 2 &&
    selectedDaftariGuestList.every(g => !!daftariGuestSlotIds[g.id]) &&
    new Set(selectedDaftariGuestList.map(g => daftariGuestSlotIds[g.id])).size === 1;

  const toggleDaftariGuest = (id: string) => {
    setSelectedDaftariGuestIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllDaftariGuests = () => {
    if (allDaftariGuestsSelected) setSelectedDaftariGuestIds(new Set());
    else setSelectedDaftariGuestIds(new Set(filteredDaftariGuests.map(g => g.id)));
  };

  // ── Delegation handlers ───────────────────────────────────────────────────────

  const handleCreateDay = async () => {
    if (!addDayDate) { toast.error('Date is required'); return; }
    if (!addDaySlotCount || addDaySlotCount < 1) { toast.error('At least 1 slot is required'); return; }
    if (!user) return;
    setDaySaving(true);
    try {
      const { data: day, error: dayErr } = await supabase
        .from('mulaqat_days')
        .insert({ date: addDayDate, label: addDayLabel.trim() || null, created_by: user.id })
        .select().single();
      if (dayErr || !day) throw dayErr;
      const slotNames = Array.from({ length: addDaySlotCount }, (_, i) => `Slot ${i + 1}`);
      await supabase.from('mulaqat_slots').insert(
        slotNames.map(name => ({ name, day_id: day.id, date: addDayDate, is_active: true })),
      );
      toast.success(`Day added with ${addDaySlotCount} slot${addDaySlotCount !== 1 ? 's' : ''}`);
      setAddDayOpen(false);
      setAddDayDate(''); setAddDayLabel(''); setAddDaySlotCount(1);
      fetchAll();
    } catch { toast.error('Failed to create day'); }
    finally { setDaySaving(false); }
  };

  const openEditDay = (day: MulaqatDay) => {
    setEditDayDate(day.date); setEditDayLabel(day.label ?? ''); setEditDayDialog(day);
  };

  const handleEditDay = async () => {
    if (!editDayDialog || !editDayDate) { toast.error('Date is required'); return; }
    const { error } = await supabase.from('mulaqat_days')
      .update({ date: editDayDate, label: editDayLabel.trim() || null }).eq('id', editDayDialog.id);
    if (error) { toast.error('Failed to update day'); return; }
    toast.success('Day updated'); setEditDayDialog(null); fetchAll();
  };

  const handleDeleteDay = async () => {
    if (!deleteDayDialog) return;
    const daySlotsIds = getSlotsForDay(deleteDayDialog.id).map(s => s.id);
    if (delegations.some(d => d.slot_id && daySlotsIds.includes(d.slot_id))) {
      toast.error("Remove all delegations from this day's slots first");
      setDeleteDayDialog(null); return;
    }
    if (daySlotsIds.length > 0) await supabase.from('mulaqat_slots').delete().eq('day_id', deleteDayDialog.id);
    const { error } = await supabase.from('mulaqat_days').delete().eq('id', deleteDayDialog.id);
    if (error) { toast.error('Failed to delete day'); return; }
    toast.success('Day and all its slots deleted'); setDeleteDayDialog(null); fetchAll();
  };

  const handleAddSlot = async () => {
    if (!addSlotDialog || !addSlotName.trim()) return;
    const { error } = await supabase.from('mulaqat_slots').insert({
      name: addSlotName.trim(), day_id: addSlotDialog.dayId, date: addSlotDialog.dayDate, is_active: true,
    });
    if (error) { toast.error('Failed to add slot'); return; }
    toast.success('Slot added'); setAddSlotDialog(null); setAddSlotName(''); fetchAll();
  };

  const handleDeleteSlot = async () => {
    if (!deleteSlotDialog) return;
    if (delegations.some(d => d.slot_id === deleteSlotDialog.id)) {
      toast.error('Remove all delegations from this slot first'); setDeleteSlotDialog(null); return;
    }
    const { error } = await supabase.from('mulaqat_slots').delete().eq('id', deleteSlotDialog.id);
    if (error) { toast.error('Failed to delete slot'); return; }
    toast.success('Slot deleted'); setDeleteSlotDialog(null); fetchAll();
  };

  const handleAssignToSlot = async (slotId: string, delegationId: string) => {
    if (!delegationId) return;
    const { error } = await supabase.from('delegations').update({ slot_id: slotId }).eq('id', delegationId);
    if (error) { toast.error('Failed to assign delegation'); return; }
    const del = delegations.find(d => d.id === delegationId);
    toast.success(`${del?.country ?? 'Delegation'} assigned`);
    setAssigningSlotId(null); setAssignDelegationValue(''); fetchAll();
  };

  const removeDelegationFromSlot = async (delegation: Delegation) => {
    const { error } = await supabase.from('delegations').update({ slot_id: null }).eq('id', delegation.id);
    if (error) { toast.error('Failed to remove delegation'); return; }
    toast.success(`${delegation.country} removed from slot`);
    fetchAll();
    if (viewDelegation?.id === delegation.id)
      setViewDelegation(prev => prev ? { ...prev, slot_id: null } : null);
  };

  const handleRowAssignSlot = async () => {
    if (!rowAssignDialog || !rowAssignSlotValue) return;
    const newSlot = slots.find(s => s.id === rowAssignSlotValue);
    const oldSlot = rowAssignDialog.slot_id ? slots.find(s => s.id === rowAssignDialog.slot_id) : null;
    const { error } = await supabase.from('delegations').update({ slot_id: rowAssignSlotValue }).eq('id', rowAssignDialog.id);
    if (error) { toast.error('Failed to update slot'); return; }
    const msg = oldSlot
      ? `${rowAssignDialog.country} moved from ${oldSlot.name} to ${newSlot?.name ?? 'slot'}`
      : `${rowAssignDialog.country} assigned to ${newSlot?.name ?? 'slot'}`;
    toast.success(msg);
    setRowAssignDialog(null); setRowAssignSlotValue(''); setChangeSlotDay(''); fetchAll();
  };

  const handleRemoveMemberFromDelegation = async (delegation: Delegation, guestId: string) => {
    await supabase.from('delegation_members').delete().eq('delegation_id', delegation.id).eq('guest_id', guestId);
    await supabase.from('guests').update({ delegation_id: null }).eq('id', guestId);
    fetchAll();
  };

  const handleAddGuestToDelegation = async (delegation: Delegation) => {
    if (!addGuestSelectedId) return;
    const guest = guests.find(g => g.id === addGuestSelectedId);
    if (!guest) return;
    await supabase.from('delegation_members').insert({
      delegation_id: delegation.id, guest_id: guest.id, guest_name: guest.fullName, is_head: false,
    });
    await supabase.from('guests').update({ delegation_id: delegation.id }).eq('id', guest.id);
    toast.success(`${guest.fullName} added to ${delegation.country} delegation`);
    setAddGuestDelegationId(null); setAddGuestSelectedId(''); fetchAll();
  };

  const handleMoveDelegation = async () => {
    if (!moveDelegationDialog || !moveDelegationSlot) return;
    const newSlot = slots.find(s => s.id === moveDelegationSlot);
    const newDay = newSlot?.day_id ? days.find(d => d.id === newSlot.day_id) : null;
    const { error } = await supabase.from('delegations').update({ slot_id: moveDelegationSlot }).eq('id', moveDelegationDialog.delegation.id);
    if (error) { toast.error('Failed to move delegation'); return; }
    const dayStr = newDay ? fmtShort(newDay.date) : '';
    toast.success(`${moveDelegationDialog.delegation.country} moved to ${dayStr ? dayStr + ' — ' : ''}${newSlot?.name ?? 'slot'}`);
    setMoveDelegationDialog(null); setMoveDelegationDay(''); setMoveDelegationSlot(''); fetchAll();
  };

  const handleBulkAssignDelegations = async () => {
    if (!bulkSlot || selectedDelegationList.length === 0) return;
    const slot = slots.find(s => s.id === bulkSlot);
    await Promise.all(selectedDelegationList.map(d =>
      supabase.from('delegations').update({ slot_id: bulkSlot }).eq('id', d.id)
    ));
    const n = selectedDelegationList.length;
    toast.success(`${n} delegation${n !== 1 ? 's' : ''} assigned to ${slot?.name ?? 'slot'}`);
    setBulkAssignDialog(null); setBulkDay(''); setBulkSlot(''); setSelectedDelegationIds(new Set()); fetchAll();
  };

  const handleSeparateDelegations = async () => {
    if (selectedDelegationList.length === 0) return;
    await supabase.from('delegations').update({ slot_id: null }).in('id', selectedDelegationList.map(d => d.id));
    const n = selectedDelegationList.length;
    toast.success(`${n} delegation${n !== 1 ? 's' : ''} separated and unassigned`);
    setSeparateDialog(false); setSelectedDelegationIds(new Set()); fetchAll();
  };

  const handleChangeHead = async (delegation: Delegation, guestId: string) => {
    const member = delegation.delegation_members.find(m => m.guest_id === guestId);
    if (!member) return;
    await supabase.from('delegation_members').update({ is_head: false }).eq('delegation_id', delegation.id);
    await supabase.from('delegation_members').update({ is_head: true }).eq('delegation_id', delegation.id).eq('guest_id', guestId);
    const { error } = await supabase.from('delegations').update({
      head_of_delegation_id: guestId, head_of_delegation_name: member.guest_name,
    }).eq('id', delegation.id);
    if (error) { toast.error('Failed to update head'); return; }
    toast.success(`${member.guest_name} is now head of delegation`);
    setChangeHeadValue(''); fetchAll();
    setViewDelegation(prev => prev?.id === delegation.id
      ? { ...prev, head_of_delegation_id: guestId, head_of_delegation_name: member.guest_name }
      : prev);
  };

  const handleDeleteDelegation = async () => {
    if (!deleteDelegationDialog) return;
    const del = deleteDelegationDialog;
    if (del.delegation_members.length > 0) {
      toast.error('Remove all members before deleting this delegation');
      setDeleteDelegationDialog(null); return;
    }
    await supabase.from('delegation_members').delete().eq('delegation_id', del.id);
    const { error } = await supabase.from('delegations').delete().eq('id', del.id);
    if (error) { toast.error('Failed to delete delegation'); return; }
    toast.success(`${del.country} delegation deleted`); setDeleteDelegationDialog(null); fetchAll();
  };

  // ── Daftari handlers ──────────────────────────────────────────────────────────

  const handleCreateDaftariDay = async () => {
    if (!addDaftariDate) { toast.error('Date is required'); return; }
    if (!addDaftariSlotCount || addDaftariSlotCount < 1) { toast.error('At least 1 slot is required'); return; }
    if (!user) return;
    setDaftariDaySaving(true);
    try {
      const { data: day, error: dayErr } = await supabase
        .from('daftari_days')
        .insert({ date: addDaftariDate, label: addDaftariLabel.trim() || null, is_active: true, created_by: user.id })
        .select().single();
      if (dayErr || !day) throw dayErr;
      const slotNames = Array.from({ length: addDaftariSlotCount }, (_, i) => `Slot ${i + 1}`);
      await supabase.from('daftari_slots').insert(
        slotNames.map(name => ({ name, day_id: day.id })),
      );
      toast.success(`Daftari day added with ${addDaftariSlotCount} slot${addDaftariSlotCount !== 1 ? 's' : ''}`);
      setAddDaftariDayOpen(false);
      setAddDaftariDate(''); setAddDaftariLabel(''); setAddDaftariSlotCount(1);
      fetchDaftari();
    } catch { toast.error('Failed to create daftari day'); }
    finally { setDaftariDaySaving(false); }
  };

  const openEditDaftariDay = (day: DaftariDay) => {
    setEditDaftariDate(day.date); setEditDaftariLabel(day.label ?? ''); setEditDaftariDayDialog(day);
  };

  const handleEditDaftariDay = async () => {
    if (!editDaftariDayDialog || !editDaftariDate) { toast.error('Date is required'); return; }
    const { error } = await supabase.from('daftari_days')
      .update({ date: editDaftariDate, label: editDaftariLabel.trim() || null }).eq('id', editDaftariDayDialog.id);
    if (error) { toast.error('Failed to update day'); return; }
    toast.success('Day updated'); setEditDaftariDayDialog(null); fetchDaftari();
  };

  const handleDeleteDaftariDay = async () => {
    if (!deleteDaftariDayDialog) return;
    const daySlots = getDaftariSlotsForDay(deleteDaftariDayDialog.id);
    if (daySlots.some(s => s.guest_id)) {
      toast.error("Remove all guests from this day's slots first");
      setDeleteDaftariDayDialog(null); return;
    }
    if (daySlots.length > 0)
      await supabase.from('daftari_slots').delete().eq('day_id', deleteDaftariDayDialog.id);
    const { error } = await supabase.from('daftari_days').delete().eq('id', deleteDaftariDayDialog.id);
    if (error) { toast.error('Failed to delete day'); return; }
    toast.success('Daftari day deleted'); setDeleteDaftariDayDialog(null); fetchDaftari();
  };

  const handleAddDaftariSlot = async () => {
    if (!addDaftariSlotDialog || !addDaftariSlotName.trim()) return;
    const { error } = await supabase.from('daftari_slots').insert({
      name: addDaftariSlotName.trim(), day_id: addDaftariSlotDialog.dayId,
    });
    if (error) { toast.error('Failed to add slot'); return; }
    toast.success('Slot added'); setAddDaftariSlotDialog(null); setAddDaftariSlotName(''); fetchDaftari();
  };

  const handleDeleteDaftariSlot = async () => {
    if (!deleteDaftariSlotDialog) return;
    if (deleteDaftariSlotDialog.guest_id) {
      toast.error('Remove the guest from this slot first'); setDeleteDaftariSlotDialog(null); return;
    }
    const { error } = await supabase.from('daftari_slots').delete().eq('id', deleteDaftariSlotDialog.id);
    if (error) { toast.error('Failed to delete slot'); return; }
    toast.success('Slot deleted'); setDeleteDaftariSlotDialog(null); fetchDaftari();
  };

  const handleRemoveGuestFromSlot = async (slot: DaftariSlot) => {
    console.log('[Daftari] RemoveGuestFromSlot triggered', { slotId: slot.id, guestId: slot.guest_id });
    // Find all guests assigned to this slot (joined group)
    const guestIdsInSlot = Object.entries(daftariGuestSlotIds)
      .filter(([, sId]) => sId === slot.id)
      .map(([gId]) => gId);
    const { data: slotRes, error: slotErr } = await supabase.from('daftari_slots').update({
      guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null,
    }).eq('id', slot.id).select().single();
    console.log('[Daftari] Slot clear:', { slotRes, slotErr });
    if (slotErr) { toast.error('Failed to remove guest'); return; }
    if (guestIdsInSlot.length > 0) {
      const { error: gErr } = await supabase.from('guests')
        .update({ daftari_slot_id: null } as Record<string, unknown>)
        .in('id', guestIdsInSlot);
      console.log('[Daftari] Guest daftari_slot_id clear:', { gErr });
    }
    toast.success(`${slot.guest_name} removed from slot`);
    fetchDaftari();
  };

  const handleAssignDaftariSlot = async (guestId: string, slotId: string) => {
    if (!slotId || !user) return;
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;
    console.log('[Daftari] AssignSlot triggered', { guestId, slotId, guestName: guest.fullName });
    // Clear old slot if any
    const oldSlotId = daftariGuestSlotIds[guestId];
    if (oldSlotId) {
      const otherGuestsInOldSlot = Object.entries(daftariGuestSlotIds)
        .filter(([gId, sId]) => gId !== guestId && sId === oldSlotId)
        .map(([gId]) => gId);
      const { error: clearErr } = await supabase.from('daftari_slots').update({
        guest_id: otherGuestsInOldSlot.length > 0 ? otherGuestsInOldSlot[otherGuestsInOldSlot.length - 1] : null,
        guest_name: null, assigned_by: null, assigned_by_name: null,
      }).eq('id', oldSlotId);
      console.log('[Daftari] Clear old slot:', { oldSlotId, clearErr });
    }
    const { data: slotRes, error: slotErr } = await supabase.from('daftari_slots').update({
      guest_id: guestId, guest_name: guest.fullName, assigned_by: user.id, assigned_by_name: user.name,
    }).eq('id', slotId).select().single();
    console.log('[Daftari] Slot update:', { slotRes, slotErr });
    const { data: guestRes, error: guestErr } = await supabase.from('guests')
      .update({ daftari_slot_id: slotId } as Record<string, unknown>)
      .eq('id', guestId).select().single();
    console.log('[Daftari] Guest update:', { guestRes, guestErr });
    if (slotErr || guestErr) { toast.error('Failed to assign: ' + (slotErr?.message ?? guestErr?.message)); return; }
    toast.success(`${guest.fullName} assigned to slot`);
    setAssigningDaftariGuestId(null); setAssignDaftariSlotValue(''); fetchDaftari();
  };

  const handleRemoveFromDaftari = async (guest: Guest) => {
    console.log('[Daftari] RemoveFromDaftari triggered', { guestId: guest.id, guestName: guest.fullName });
    const oldSlotId = daftariGuestSlotIds[guest.id];
    if (oldSlotId) {
      const otherGuestsInSlot = Object.entries(daftariGuestSlotIds)
        .filter(([gId, sId]) => gId !== guest.id && sId === oldSlotId)
        .map(([gId]) => gId);
      await supabase.from('daftari_slots').update({
        guest_id: otherGuestsInSlot.length > 0 ? otherGuestsInSlot[otherGuestsInSlot.length - 1] : null,
        guest_name: null, assigned_by: null, assigned_by_name: null,
      }).eq('id', oldSlotId);
    }
    const newType = guest.mulaqatType === 'Both' ? 'Delegation' : 'No';
    const { error } = await supabase.from('guests').update({
      mulaqat_type: newType, mulaqat: newType !== 'No', daftari_slot_id: null,
    } as Record<string, unknown>).eq('id', guest.id);
    console.log('[Daftari] Guest mulaqatType update:', { error });
    if (error) { toast.error('Failed to remove from Daftari'); return; }
    toast.success(`${guest.fullName} removed from Daftari`);
    fetchDaftari();
  };

  const handleBulkAssignDaftari = async () => {
    if (!daftariBulkSlot || selectedDaftariGuestList.length === 0 || !user) return;
    const slot = daftariSlots.find(s => s.id === daftariBulkSlot);
    const guestList = selectedDaftariGuestList;
    console.log('[Daftari] BulkAssign triggered', { slotId: daftariBulkSlot, guests: guestList.map(g => g.id) });
    // Clear old slots for any guests that already have one
    const oldSlotIds = new Set(
      guestList.map(g => daftariGuestSlotIds[g.id]).filter((id): id is string => !!id)
    );
    if (oldSlotIds.size > 0) {
      await Promise.all([...oldSlotIds].map(slotId =>
        supabase.from('daftari_slots').update({
          guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null,
        }).eq('id', slotId)
      ));
    }
    // For join: all names shown in slot_name; slot.guest_id = first guest
    const allNames = guestList.map(g => g.fullName).join(', ');
    const { data: slotRes, error: slotErr } = await supabase.from('daftari_slots').update({
      guest_id: guestList[0].id,
      guest_name: allNames,
      assigned_by: user.id,
      assigned_by_name: user.name,
    }).eq('id', daftariBulkSlot).select().single();
    console.log('[Daftari] Slot update:', { slotRes, slotErr });
    const results = await Promise.all(guestList.map(g =>
      supabase.from('guests')
        .update({ daftari_slot_id: daftariBulkSlot } as Record<string, unknown>)
        .eq('id', g.id).select().single()
    ));
    console.log('[Daftari] Guest updates:', results.map(r => ({ data: r.data, error: r.error })));
    if (slotErr) { toast.error('Failed to assign: ' + slotErr.message); return; }
    const n = guestList.length;
    toast.success(`${n} guest${n !== 1 ? 's' : ''} assigned to ${slot?.name ?? 'slot'}`);
    setDaftariBulkAssignDialog(null); setDaftariBulkDay(''); setDaftariBulkSlot('');
    setSelectedDaftariGuestIds(new Set());
    fetchDaftari();
  };

  const handleSeparateDaftari = async () => {
    if (selectedDaftariGuestList.length === 0) return;
    // All selected guests should share the same slot (canSeparateDaftari ensures this)
    const sharedSlotId = daftariGuestSlotIds[selectedDaftariGuestList[0].id];
    console.log('[Daftari] Separate triggered', { sharedSlotId, guests: selectedDaftariGuestList.map(g => g.id) });
    if (sharedSlotId) {
      // Find ALL guests in this slot (not just selected ones) to clear properly
      const allGuestIdsInSlot = Object.entries(daftariGuestSlotIds)
        .filter(([, sId]) => sId === sharedSlotId)
        .map(([gId]) => gId);
      const { error: slotErr } = await supabase.from('daftari_slots').update({
        guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null,
      }).eq('id', sharedSlotId);
      console.log('[Daftari] Slot clear:', { slotErr });
      if (allGuestIdsInSlot.length > 0) {
        const { error: gErr } = await supabase.from('guests')
          .update({ daftari_slot_id: null } as Record<string, unknown>)
          .in('id', allGuestIdsInSlot);
        console.log('[Daftari] Guest clear:', { gErr });
      }
    }
    const n = selectedDaftariGuestList.length;
    toast.success(`${n} guest${n !== 1 ? 's' : ''} separated and unassigned`);
    setDaftariSeparateDialog(false); setSelectedDaftariGuestIds(new Set());
    fetchDaftari();
  };

  // ── Drag-and-drop (delegation slots) ─────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDelegationSlotDragEnd = async (event: DragEndEvent, dayId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const daySlots = getSlotsForDay(dayId);
    const oldIndex = daySlots.findIndex(s => s.id === active.id);
    const newIndex = daySlots.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(daySlots, oldIndex, newIndex);
    // Optimistic local update
    setSlots(prev => {
      const others = prev.filter(s => s.day_id !== dayId);
      return [...others, ...reordered];
    });
    // Persist new names to DB
    await Promise.all(reordered.map((slot, i) =>
      supabase.from('mulaqat_slots').update({ name: `Slot ${i + 1}` }).eq('id', slot.id)
    ));
    toast.success('Slots reordered');
  };

  const handleDaftariSlotDragEnd = async (event: DragEndEvent, dayId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const dayDaftariSlots = getDaftariSlotsForDay(dayId);
    const oldIndex = dayDaftariSlots.findIndex(s => s.id === active.id);
    const newIndex = dayDaftariSlots.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(dayDaftariSlots, oldIndex, newIndex);
    setDaftariSlots(prev => {
      const others = prev.filter(s => s.day_id !== dayId);
      return [...others, ...reordered];
    });
    await Promise.all(reordered.map((slot, i) =>
      supabase.from('daftari_slots').update({ name: `Slot ${i + 1}` }).eq('id', slot.id)
    ));
    toast.success('Slots reordered');
  };

  // Remove a single guest from a slot (keeping other joined guests in the slot)
  const handleRemoveOneGuestFromSlot = async (guest: Guest, slot: DaftariSlot) => {
    console.log('[Daftari] RemoveOneGuestFromSlot', { guestId: guest.id, slotId: slot.id });
    // Clear this guest's slot reference
    await supabase.from('guests')
      .update({ daftari_slot_id: null } as Record<string, unknown>)
      .eq('id', guest.id);
    // Find remaining guests in this slot
    const remainingIds = Object.entries(daftariGuestSlotIds)
      .filter(([gId, sId]) => gId !== guest.id && sId === slot.id)
      .map(([gId]) => gId);
    if (remainingIds.length > 0) {
      const remainingGuests = remainingIds.map(gId => guests.find(g => g.id === gId)).filter((g): g is Guest => !!g);
      await supabase.from('daftari_slots').update({
        guest_id: remainingGuests[0].id,
        guest_name: remainingGuests.map(g => g.fullName).join(', '),
        assigned_by: user?.id ?? null,
        assigned_by_name: user?.name ?? null,
      }).eq('id', slot.id);
    } else {
      await supabase.from('daftari_slots').update({
        guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null,
      }).eq('id', slot.id);
    }
    toast.success(`${guest.fullName} removed from slot`);
    fetchDaftari();
  };

  const handleChangeDaftariSlot = async () => {
    if (!changeDaftariSlotDialog || !changeDaftariSlotValue || !user) return;
    const { slot: oldSlot, guestId } = changeDaftariSlotDialog;
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;
    const newSlotObj = daftariSlots.find(s => s.id === changeDaftariSlotValue);
    console.log('[Daftari] ChangeSlot triggered', { guestId, oldSlotId: oldSlot.id, newSlotId: changeDaftariSlotValue });

    // Remove this guest from old slot, keeping any other guests there
    const remainingInOld = Object.entries(daftariGuestSlotIds)
      .filter(([gId, sId]) => gId !== guestId && sId === oldSlot.id)
      .map(([gId]) => gId);
    if (remainingInOld.length > 0) {
      const remainingGuests = remainingInOld.map(gId => guests.find(g => g.id === gId)).filter((g): g is Guest => !!g);
      await supabase.from('daftari_slots').update({
        guest_id: remainingGuests[0].id,
        guest_name: remainingGuests.map(g => g.fullName).join(', '),
      }).eq('id', oldSlot.id);
    } else {
      await supabase.from('daftari_slots').update({
        guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null,
      }).eq('id', oldSlot.id);
    }
    // Clear old slot on guest
    await supabase.from('guests')
      .update({ daftari_slot_id: null } as Record<string, unknown>)
      .eq('id', guestId);

    // Add to new slot — join with any existing guests there
    const existingInNewSlot = Object.entries(daftariGuestSlotIds)
      .filter(([, sId]) => sId === changeDaftariSlotValue)
      .map(([gId]) => guests.find(g => g.id === gId)?.fullName ?? '')
      .filter(Boolean);
    const { data: slotRes, error: slotErr } = await supabase.from('daftari_slots').update({
      guest_id: existingInNewSlot.length === 0 ? guestId : (newSlotObj?.guest_id ?? guestId),
      guest_name: [...existingInNewSlot, guest.fullName].join(', '),
      assigned_by: user.id,
      assigned_by_name: user.name,
    }).eq('id', changeDaftariSlotValue).select().single();
    const { data: guestRes, error: guestErr } = await supabase.from('guests')
      .update({ daftari_slot_id: changeDaftariSlotValue } as Record<string, unknown>)
      .eq('id', guestId).select().single();
    console.log('[Daftari] Assign new slot:', { slotRes, slotErr, guestRes, guestErr });
    if (slotErr || guestErr) { toast.error('Failed to move: ' + (slotErr?.message ?? guestErr?.message)); return; }
    toast.success(`${guest.fullName} moved to ${newSlotObj?.name ?? 'slot'}`);
    setChangeDaftariSlotDialog(null); setChangeDaftariSlotDay(''); setChangeDaftariSlotValue('');
    fetchDaftari();
  };

  // ── Chips ─────────────────────────────────────────────────────────────────────

  const chipCls = (active: boolean) =>
    active
      ? 'bg-[#2D5A45] text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer'
      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#F5F0E8]';

  if (!user) return null;

  // ── Slot select helpers ───────────────────────────────────────────────────────

  const SlotSelect = ({ value, onChange, includeNone = true }: {
    value: string; onChange: (v: string) => void; includeNone?: boolean;
  }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-2 py-1.5 border border-[#D4CFC7] rounded-md text-xs bg-white focus:border-[#2D5A45] focus:outline-none">
      {includeNone && <option value="__none__">— No slot —</option>}
      {days.map(day => {
        const daySlotsForDay = getSlotsForDay(day.id);
        if (daySlotsForDay.length === 0) return null;
        return (
          <optgroup key={day.id} label={dayHeader(day)}>
            {daySlotsForDay.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
        );
      })}
    </select>
  );

  const DaftariSlotSelect = ({ guestId, value, onChange }: {
    guestId: string; value: string; onChange: (v: string) => void;
  }) => {
    const currentSlot = daftariSlots.find(s => s.guest_id === guestId);
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 border border-[#D4CFC7] rounded-md text-xs bg-white focus:border-[#2D5A45] focus:outline-none min-w-[180px]">
        <option value="">Select slot...</option>
        {daftariDays.map(day => {
          const available = getDaftariSlotsForDay(day.id).filter(s => !s.guest_id || s.id === currentSlot?.id);
          if (available.length === 0) return null;
          const label = day.label ? `${fmtShort(day.date)} — ${day.label}` : fmtShort(day.date);
          return (
            <optgroup key={day.id} label={label}>
              {available.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          );
        })}
      </select>
    );
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        {/* ── Sidebar ── */}
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0">
          <div className="p-4 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
              <div>
                <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
                <p className="text-xs text-[#4A4A4A]">Jalsa Salana UK</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {SUPER_ADMIN_NAV.map((item, i) => (
              <button key={i} onClick={() => navigate(item.href)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/admin/mulaqat' ? 'bg-[#2D5A45] text-white' : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}>
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 ml-64">
          {/* ── Header ── */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-[#2D5A45]" />
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Mulaqat Management</h1>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('delegation')}
                    className={activeTab === 'delegation'
                      ? 'bg-[#2D5A45] text-white rounded-full px-4 py-1.5 text-sm font-medium'
                      : 'bg-white text-gray-600 border border-gray-200 rounded-full px-4 py-1.5 text-sm font-medium hover:border-[#2D5A45]'}
                  >Delegation</button>
                  <button
                    onClick={() => setActiveTab('daftari')}
                    className={activeTab === 'daftari'
                      ? 'bg-[#2D5A45] text-white rounded-full px-4 py-1.5 text-sm font-medium'
                      : 'bg-white text-gray-600 border border-gray-200 rounded-full px-4 py-1.5 text-sm font-medium hover:border-[#2D5A45]'}
                  >Daftari</button>
                </div>
              </div>
              <div className="relative">
                <button onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-3 hover:bg-[#F5F0E8] rounded-lg px-3 py-2 transition-colors">
                  <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-medium">
                    {user.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                    <p className="text-xs text-[#4A4A4A]">{ROLE_LABELS[user.role]}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#4A4A4A]" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-[#E8E3DB] py-1 z-50">
                    <button onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8]">
                      <User className="w-4 h-4 text-[#4A4A4A]" /> Profile
                    </button>
                    <button onClick={() => { logout(); navigate('/login'); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* ── Stats bar ── */}
          {activeTab === 'delegation' ? (
            <div className="bg-white border-b border-[#E8E3DB] px-6 py-3 flex items-center gap-6 text-sm text-[#4A4A4A]">
              <span><span className="font-semibold text-[#1A1A1A]">{days.length}</span> day{days.length !== 1 ? 's' : ''}</span>
              <span className="text-[#D4CFC7]">|</span>
              <span><span className="font-semibold text-[#1A1A1A]">{slots.length}</span> slot{slots.length !== 1 ? 's' : ''}</span>
              <span className="text-[#D4CFC7]">|</span>
              <span><span className="font-semibold text-[#1A1A1A]">{delegations.length}</span> delegation{delegations.length !== 1 ? 's' : ''}</span>
              <span className="text-[#D4CFC7]">|</span>
              <span><span className="font-semibold text-[#1A1A1A]">{totalGuests}</span> total guests</span>
              <span className="text-[#D4CFC7]">|</span>
              <span className={unassignedDelegations.length > 0 ? 'text-amber-600 font-medium' : ''}>
                <span className="font-semibold">{unassignedDelegations.length}</span> unassigned
              </span>
            </div>
          ) : (
            <div className="bg-white border-b border-[#E8E3DB] px-6 py-3 flex items-center gap-6 text-sm text-[#4A4A4A]">
              <span><span className="font-semibold text-[#1A1A1A]">{daftariDays.length}</span> day{daftariDays.length !== 1 ? 's' : ''}</span>
              <span className="text-[#D4CFC7]">|</span>
              <span><span className="font-semibold text-[#1A1A1A]">{daftariSlots.length}</span> total slot{daftariSlots.length !== 1 ? 's' : ''}</span>
              <span className="text-[#D4CFC7]">|</span>
              <span className="text-green-700"><span className="font-semibold">{assignedDaftariCount}</span> assigned</span>
              <span className="text-[#D4CFC7]">|</span>
              <span><span className="font-semibold">{availableDaftariCount}</span> available</span>
              <span className="text-[#D4CFC7]">|</span>
              <span><span className="font-semibold text-[#1A1A1A]">{daftariGuests.length}</span> daftari guest{daftariGuests.length !== 1 ? 's' : ''}</span>
            </div>
          )}

          <div className="p-6 max-w-7xl mx-auto space-y-8">

            {/* ══ DELEGATION TAB ══ */}
            {activeTab === 'delegation' && (
              <>
                {/* Section A: Mulaqat Days */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[#2D5A45]" />
                      <h2 className="text-lg font-semibold text-[#1A1A1A]">Mulaqat Days</h2>
                      <span className="text-sm text-[#4A4A4A]">({days.length})</span>
                    </div>
                    <Button onClick={() => setAddDayOpen(true)} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8 px-3 text-sm">
                      <Plus className="w-3.5 h-3.5 mr-1.5" />Add Day
                    </Button>
                  </div>

                  {loading ? (
                    <Card className="shadow-sm"><CardContent className="flex items-center justify-center py-10">
                      <div className="w-6 h-6 border-2 border-[#2D5A45] border-t-transparent rounded-full animate-spin" />
                    </CardContent></Card>
                  ) : days.length === 0 ? (
                    <Card className="shadow-sm"><CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                      <Calendar className="w-10 h-10 text-gray-300" />
                      <p className="text-sm text-[#4A4A4A]">No days created yet.</p>
                      <Button onClick={() => setAddDayOpen(true)} variant="outline" className="mt-2 text-[#2D5A45] border-[#2D5A45]">
                        <Plus className="w-4 h-4 mr-1.5" />Create First Day
                      </Button>
                    </CardContent></Card>
                  ) : (
                    <div className="space-y-3">
                      {days.map(day => {
                        const daySlotsForDay = getSlotsForDay(day.id);
                        const totalDels = daySlotsForDay.reduce((s, sl) => s + getDelegationsForSlot(sl.id).length, 0);
                        const isExpanded = expandedDays.has(day.id);
                        return (
                          <Card key={day.id} className="shadow-sm bg-white">
                            <CardHeader className="py-3 px-4">
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  onClick={() => setExpandedDays(prev => {
                                    const next = new Set(prev);
                                    next.has(day.id) ? next.delete(day.id) : next.add(day.id);
                                    return next;
                                  })}
                                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                                >
                                  {isExpanded
                                    ? <ChevronDown className="w-4 h-4 text-[#4A4A4A] flex-shrink-0" />
                                    : <ChevronRight className="w-4 h-4 text-[#4A4A4A] flex-shrink-0" />}
                                  <span className="font-semibold text-[#1A1A1A]">{dayHeader(day)}</span>
                                </button>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <div className="text-xs text-[#4A4A4A] text-right">
                                    <span className="font-medium text-[#1A1A1A]">{daySlotsForDay.length}</span> slot{daySlotsForDay.length !== 1 ? 's' : ''}
                                    {totalDels > 0 && <><span className="mx-1 text-[#D4CFC7]">·</span><span className="font-medium text-[#1A1A1A]">{totalDels}</span> delegation{totalDels !== 1 ? 's' : ''}</>}
                                  </div>
                                  <div className="flex items-center gap-0.5">
                                    <button onClick={() => openEditDay(day)} title="Edit day" className="p-1.5 rounded text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => setDeleteDayDialog(day)} title="Delete day" className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => { setAddSlotDialog({ dayId: day.id, dayDate: day.date }); setAddSlotName(''); }}
                                      className="ml-1 flex items-center gap-1 px-2 py-1 rounded text-xs text-[#2D5A45] border border-[#2D5A45] hover:bg-[#F0F7F4] transition-colors"
                                    >
                                      <Plus className="w-3 h-3" />Add Slot
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                            {isExpanded && (
                              <CardContent className="pt-0 px-4 pb-4">
                                <div className="border-t border-[#E8E3DB] pt-3 space-y-3">
                                  {daySlotsForDay.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">No slots. Click "+ Add Slot" to add one.</p>
                                  ) : (
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDelegationSlotDragEnd(e, day.id)}>
                                    <SortableContext items={daySlotsForDay.map(s => s.id)} strategy={verticalListSortingStrategy}>
                                    {daySlotsForDay.map(slot => {
                                      const slotDels = getDelegationsForSlot(slot.id);
                                      const isAssigning = assigningSlotId === slot.id;
                                      return (
                                        <SortableSlotItem key={slot.id} id={slot.id}>
                                        <div className="border border-[#E8E3DB] rounded-lg overflow-hidden">
                                          <div className="flex items-center justify-between px-3 py-2 bg-[#F9F8F6]">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <SlotDragHandle />
                                              <span className="text-sm font-medium text-[#1A1A1A]">{slot.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                                {slotDels.length} delegation{slotDels.length !== 1 ? 's' : ''}
                                              </Badge>
                                              <button onClick={() => setDeleteSlotDialog(slot)} title="Delete slot" className="p-1 rounded text-red-400 hover:bg-red-50 transition-colors">
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                          <div className="px-3 py-2 space-y-1.5">
                                            {slotDels.length === 0 ? (
                                              <p className="text-xs text-green-600 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                                                Available — no delegations assigned
                                              </p>
                                            ) : (
                                              slotDels.map(del => {
                                                const isDelExpanded = slotExpandedId === del.id;
                                                const isAddingGuest = addGuestDelegationId === del.id;
                                                const eligibleGuests = guests.filter(g =>
                                                  g.country === del.country && g.mulaqat === true &&
                                                  (g.mulaqatType === 'Delegation' || g.mulaqatType === 'Both') &&
                                                  !del.delegation_members.some(m => m.guest_id === g.id)
                                                );
                                                return (
                                                  <div key={del.id}>
                                                    <div className="flex items-center justify-between gap-2 text-xs">
                                                      <button
                                                        onClick={() => setSlotExpandedId(isDelExpanded ? null : del.id)}
                                                        className="flex items-center gap-1.5 min-w-0 text-left hover:bg-[#F5F0E8] rounded px-1 py-0.5 transition-colors"
                                                      >
                                                        {isDelExpanded
                                                          ? <ChevronDown className="w-3.5 h-3.5 text-[#2D5A45] flex-shrink-0" />
                                                          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                                                        <span className="font-medium text-[#1A1A1A]">{del.country}</span>
                                                        <span className="text-[#4A4A4A]">({del.delegation_members.length})</span>
                                                        {del.head_of_delegation_name && (
                                                          <span className="flex items-center gap-0.5 text-[#4A4A4A]">
                                                            <Star className="w-3 h-3 text-amber-500" />
                                                            {del.head_of_delegation_name}
                                                          </span>
                                                        )}
                                                      </button>
                                                      <div className="flex items-center gap-1 flex-shrink-0">
                                                        <button
                                                          onClick={() => {
                                                            const dayId = del.slot_id ? (slots.find(s => s.id === del.slot_id)?.day_id ?? '') : '';
                                                            setMoveDelegationDay(dayId);
                                                            setMoveDelegationSlot(del.slot_id ?? '');
                                                            setMoveDelegationDialog({ delegation: del, currentSlotId: del.slot_id! });
                                                          }}
                                                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#2D5A45] hover:bg-[#D6E4D9] transition-colors"
                                                        >
                                                          <CalendarDays className="w-3.5 h-3.5" />
                                                          Change
                                                        </button>
                                                        <button onClick={() => removeDelegationFromSlot(del)}
                                                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-50 transition-colors">
                                                          <X className="w-3.5 h-3.5" />
                                                          Remove
                                                        </button>
                                                      </div>
                                                    </div>
                                                    {isDelExpanded && (
                                                      <div className="mt-1.5 border-l-4 border-[#2D5A45] pl-3 py-2 bg-gray-50/50 rounded-r space-y-2">
                                                        {del.delegation_members.length === 0 ? (
                                                          <p className="text-xs text-gray-400 italic">No members yet.</p>
                                                        ) : (
                                                          <div className="border border-[#E8E3DB] rounded-lg overflow-hidden">
                                                            <table className="w-full text-xs border-collapse">
                                                              <thead>
                                                                <tr className="bg-[#F9F8F6]">
                                                                  {['#', 'Name', 'Designation', 'Departure', 'Actions'].map(h => (
                                                                    <th key={h} className="px-2 py-1.5 text-left font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                                                  ))}
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {del.delegation_members.map((m, idx) => {
                                                                  const isHead = del.head_of_delegation_id === m.guest_id;
                                                                  const gInfo = guests.find(g => g.id === m.guest_id);
                                                                  return (
                                                                    <tr key={m.id} className="border-t border-[#E8E3DB] bg-white hover:bg-[#FAFAFA]">
                                                                      <td className="px-2 py-1.5 text-gray-400 tabular-nums w-6">{idx + 1}</td>
                                                                      <td className="px-2 py-1.5 font-medium text-[#1A1A1A] whitespace-nowrap">
                                                                        <div className="flex items-center gap-1">
                                                                          {isHead && <Star className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                                                                          {m.guest_name}
                                                                        </div>
                                                                      </td>
                                                                      <td className="px-2 py-1.5 text-[#4A4A4A]">{formatDesignation(gInfo?.designation)}</td>
                                                                      <td className="px-2 py-1.5 whitespace-nowrap">
                                                                        <div className="text-[#4A4A4A]">{fmtDep(gInfo?.departureTime)}</div>
                                                                        {fmtFlight(gInfo?.departureFlightNumber, gInfo?.departureAirport) && (
                                                                          <div className="text-xs text-gray-400 mt-0.5">{fmtFlight(gInfo?.departureFlightNumber, gInfo?.departureAirport)}</div>
                                                                        )}
                                                                      </td>
                                                                      <td className="px-2 py-1.5">
                                                                        <div className="flex items-center gap-1">
                                                                          {!isHead && (
                                                                            <button onClick={() => handleChangeHead(del, m.guest_id)}
                                                                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">
                                                                              <Star className="w-2.5 h-2.5" />Make Head
                                                                            </button>
                                                                          )}
                                                                          <button onClick={() => handleRemoveMemberFromDelegation(del, m.guest_id)}
                                                                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
                                                                            <UserMinus className="w-2.5 h-2.5" />Remove
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
                                                        <div>
                                                          {!isAddingGuest ? (
                                                            <button
                                                              onClick={() => { setAddGuestDelegationId(del.id); setAddGuestSelectedId(''); }}
                                                              disabled={eligibleGuests.length === 0}
                                                              className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-[#2D5A45] text-[#2D5A45] rounded text-xs font-medium hover:bg-[#F0F7F4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                            >
                                                              <UserPlus className="w-3 h-3" />
                                                              {eligibleGuests.length === 0 ? 'No eligible guests' : `+ Add Guest (${eligibleGuests.length})`}
                                                            </button>
                                                          ) : (
                                                            <div className="flex items-center gap-2">
                                                              <select value={addGuestSelectedId} onChange={e => setAddGuestSelectedId(e.target.value)}
                                                                className="flex-1 max-w-[220px] px-2 py-1 border border-[#D4CFC7] rounded text-xs bg-white focus:border-[#2D5A45] focus:outline-none">
                                                                <option value="">Select a guest...</option>
                                                                {eligibleGuests.map(g => (
                                                                  <option key={g.id} value={g.id}>{g.fullName} ({g.referenceNumber})</option>
                                                                ))}
                                                              </select>
                                                              <button onClick={() => handleAddGuestToDelegation(del)} disabled={!addGuestSelectedId}
                                                                className="px-2 py-1 bg-[#2D5A45] hover:bg-[#234839] text-white rounded text-xs font-medium disabled:opacity-40 transition-colors">
                                                                Add
                                                              </button>
                                                              <button onClick={() => { setAddGuestDelegationId(null); setAddGuestSelectedId(''); }}
                                                                className="px-2 py-1 border border-[#D4CFC7] text-[#4A4A4A] rounded text-xs hover:bg-[#F5F0E8] transition-colors">
                                                                Cancel
                                                              </button>
                                                            </div>
                                                          )}
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })
                                            )}
                                            {unassignedDelegations.length > 0 && (
                                              isAssigning ? (
                                                <div className="flex items-center gap-2 pt-1">
                                                  <select value={assignDelegationValue} onChange={e => setAssignDelegationValue(e.target.value)}
                                                    className="flex-1 px-2 py-1 border border-[#D4CFC7] rounded text-xs bg-white focus:border-[#2D5A45] focus:outline-none">
                                                    <option value="">Select delegation...</option>
                                                    {unassignedDelegations.map(d => (
                                                      <option key={d.id} value={d.id}>{d.country} ({d.delegation_members.length})</option>
                                                    ))}
                                                  </select>
                                                  <Button onClick={() => handleAssignToSlot(slot.id, assignDelegationValue)} disabled={!assignDelegationValue} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-6 px-2 text-xs">Assign</Button>
                                                  <Button variant="outline" onClick={() => { setAssigningSlotId(null); setAssignDelegationValue(''); }} className="h-6 px-2 text-xs">Cancel</Button>
                                                </div>
                                              ) : (
                                                <button onClick={() => { setAssigningSlotId(slot.id); setAssignDelegationValue(''); }}
                                                  className="flex items-center gap-1 text-xs text-[#2D5A45] hover:text-[#234839] font-medium pt-0.5 transition-colors">
                                                  <Plus className="w-3 h-3" />Assign Delegation to this Slot
                                                </button>
                                              )
                                            )}
                                          </div>
                                        </div>
                                        </SortableSlotItem>
                                      );
                                    })}
                                    </SortableContext>
                                    </DndContext>
                                  )}
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Section B: All Delegations */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-5 h-5 text-[#2D5A45]" />
                    <h2 className="text-lg font-semibold text-[#1A1A1A]">All Delegations</h2>
                    <span className="text-sm text-[#4A4A4A]">({filteredDelegations.length})</span>
                  </div>
                  <Card className="shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      {/* Bulk action toolbar */}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => { setBulkDay(''); setBulkSlot(''); setBulkAssignDialog('assign'); }}
                          disabled={selectedDelegationList.length === 0}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#2D5A45] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#234839] transition-colors"
                        >
                          Assign Mulaqat
                        </button>
                        <button
                          onClick={() => { setBulkDay(''); setBulkSlot(''); setBulkAssignDialog('join'); }}
                          disabled={selectedDelegationList.length < 2}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#2D5A45] border border-[#2D5A45] rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F0F7F4] transition-colors"
                        >
                          Join &amp; Assign Mulaqat
                        </button>
                        <button
                          onClick={() => setSeparateDialog(true)}
                          disabled={!canSeparate}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-red-500 border border-red-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-50 transition-colors"
                        >
                          Separate Delegations
                        </button>
                        {selectedDelegationList.length > 0 && (
                          <span className="text-sm text-gray-500">
                            Selected: {selectedDelegationList.length} delegation{selectedDelegationList.length !== 1 ? 's' : ''} ({selectedGuestTotal} guest{selectedGuestTotal !== 1 ? 's' : ''} total)
                          </span>
                        )}
                        <div className="ml-auto flex flex-wrap items-center gap-3">
                          <div className="relative min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                            <Input value={delegationSearch} onChange={e => setDelegationSearch(e.target.value)}
                              placeholder="Search by country..." className="pl-9 border-[#D4CFC7] focus:border-[#2D5A45] h-9" />
                          </div>
                          <div className="flex gap-1.5">
                            {(['all', 'assigned', 'unassigned'] as const).map(f => (
                              <button key={f} onClick={() => setDelegationFilter(f)} className={chipCls(delegationFilter === f)}>
                                {f === 'all' ? 'All' : f === 'assigned' ? 'Assigned' : 'Unassigned'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {filteredDelegations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2">
                          <Users className="w-8 h-8 text-gray-300" />
                          <p className="text-sm text-[#4A4A4A]">No delegations found.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-[#F9F8F6]">
                              <tr>
                                <th className="px-3 py-2.5 w-10">
                                  <Checkbox
                                    checked={allDelegationsSelected}
                                    data-state={someDelegationsSelected ? 'indeterminate' : allDelegationsSelected ? 'checked' : 'unchecked'}
                                    onCheckedChange={toggleSelectAllDelegations}
                                    className="border-gray-300 data-[state=checked]:bg-[#2D5A45] data-[state=checked]:border-[#2D5A45] data-[state=indeterminate]:bg-[#2D5A45] data-[state=indeterminate]:border-[#2D5A45]"
                                  />
                                </th>
                                {['Country', 'Guests', 'Head of Delegation', 'Managed By', 'Slot', 'Actions'].map(h => (
                                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredDelegations.map(del => {
                                const isExpanded = tableExpandedId === del.id;
                                const isAddingGuest = addGuestDelegationId === del.id;
                                const eligibleGuests = guests.filter(g =>
                                  g.country === del.country && g.mulaqat === true &&
                                  (g.mulaqatType === 'Delegation' || g.mulaqatType === 'Both') &&
                                  !del.delegation_members.some(m => m.guest_id === g.id)
                                );
                                return (
                                <Fragment key={del.id}>
                                <tr className={`border-b border-[#E8E3DB] ${isExpanded ? 'bg-[#F5FBF8]' : 'hover:bg-[#FAFAFA]'}`}>
                                  <td className="px-3 py-3 w-10" onClick={e => e.stopPropagation()}>
                                    <Checkbox
                                      checked={selectedDelegationIds.has(del.id)}
                                      onCheckedChange={() => toggleDelegation(del.id)}
                                      className="border-gray-300 data-[state=checked]:bg-[#2D5A45] data-[state=checked]:border-[#2D5A45]"
                                    />
                                  </td>
                                  <td className="px-3 py-3 font-medium text-[#1A1A1A]">{del.country}</td>
                                  <td className="px-3 py-3">
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{del.delegation_members.length}</Badge>
                                  </td>
                                  <td className="px-3 py-3 text-[#4A4A4A]">
                                    {del.head_of_delegation_name
                                      ? <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />{del.head_of_delegation_name}</span>
                                      : <span className="text-xs text-gray-400 italic">None</span>}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-[#4A4A4A]">{del.managed_by_name ?? '—'}</td>
                                  <td className="px-3 py-3">
                                    {del.slot_id
                                      ? <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">{slotDisplayLabel(del.slot_id)}</span>
                                      : <span className="text-xs text-amber-600 font-medium">Unassigned</span>}
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setTableExpandedId(isExpanded ? null : del.id)}
                                        title={isExpanded ? 'Collapse' : 'View members'}
                                        className={`p-1.5 rounded transition-colors ${isExpanded ? 'bg-[#E8F5EE] text-[#2D5A45]' : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'}`}
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => {
                                        const currentDayId = del.slot_id ? (slots.find(s => s.id === del.slot_id)?.day_id ?? '') : '';
                                        setRowAssignDialog(del);
                                        setChangeSlotDay(currentDayId);
                                        setRowAssignSlotValue(del.slot_id ?? '');
                                      }} title="Assign / change slot" className="p-1.5 rounded text-blue-500 hover:bg-blue-50 transition-colors">
                                        <Calendar className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => setDeleteDelegationDialog(del)} title="Delete" className="p-1.5 rounded text-red-400 hover:bg-red-50 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="border-b border-[#E8E3DB]">
                                    <td colSpan={7} className="p-0">
                                      <div className="border-l-4 border-[#2D5A45] bg-gray-50/50 pl-6 pr-4 py-3 space-y-2">
                                        {del.delegation_members.length === 0 ? (
                                          <p className="text-xs text-gray-400 italic">No members in this delegation yet.</p>
                                        ) : (
                                          <div className="border border-[#E8E3DB] rounded-lg overflow-hidden">
                                            <table className="w-full text-sm border-collapse">
                                              <thead>
                                                <tr className="bg-[#F9F8F6]">
                                                  {['#', 'Name', 'Designation', 'Departure', 'Actions'].map(h => (
                                                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {del.delegation_members.map((m, idx) => {
                                                  const isHead = del.head_of_delegation_id === m.guest_id;
                                                  const gInfo = guests.find(g => g.id === m.guest_id);
                                                  return (
                                                    <tr key={m.id} className="border-t border-[#E8E3DB] bg-white hover:bg-[#FAFAFA]">
                                                      <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums w-8">{idx + 1}</td>
                                                      <td className="px-3 py-2.5 font-medium text-[#1A1A1A]">
                                                        <div className="flex items-center gap-1.5">
                                                          {isHead && <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                                                          {m.guest_name}
                                                        </div>
                                                      </td>
                                                      <td className="px-3 py-2.5 text-xs text-[#4A4A4A]">{formatDesignation(gInfo?.designation)}</td>
                                                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                                                        <div className="text-[#4A4A4A]">{fmtDep(gInfo?.departureTime)}</div>
                                                        {fmtFlight(gInfo?.departureFlightNumber, gInfo?.departureAirport) && (
                                                          <div className="text-xs text-gray-400 mt-0.5">{fmtFlight(gInfo?.departureFlightNumber, gInfo?.departureAirport)}</div>
                                                        )}
                                                      </td>
                                                      <td className="px-3 py-2.5">
                                                        <div className="flex items-center gap-1.5">
                                                          {!isHead && (
                                                            <button onClick={() => handleChangeHead(del, m.guest_id)}
                                                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">
                                                              <Star className="w-3 h-3" />Make Head
                                                            </button>
                                                          )}
                                                          <button onClick={() => handleRemoveMemberFromDelegation(del, m.guest_id)}
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
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
                                        <div>
                                          {!isAddingGuest ? (
                                            <button
                                              onClick={() => { setAddGuestDelegationId(del.id); setAddGuestSelectedId(''); }}
                                              disabled={eligibleGuests.length === 0}
                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-[#2D5A45] text-[#2D5A45] rounded-md text-xs font-medium hover:bg-[#F0F7F4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                              <UserPlus className="w-3.5 h-3.5" />
                                              {eligibleGuests.length === 0 ? 'No eligible guests to add' : `+ Add Guest (${eligibleGuests.length} eligible)`}
                                            </button>
                                          ) : (
                                            <div className="flex items-center gap-2">
                                              <select value={addGuestSelectedId} onChange={e => setAddGuestSelectedId(e.target.value)}
                                                className="flex-1 max-w-xs px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none">
                                                <option value="">Select a guest...</option>
                                                {eligibleGuests.map(g => (
                                                  <option key={g.id} value={g.id}>{g.fullName} ({g.referenceNumber})</option>
                                                ))}
                                              </select>
                                              <button onClick={() => handleAddGuestToDelegation(del)} disabled={!addGuestSelectedId}
                                                className="px-3 py-2 bg-[#2D5A45] hover:bg-[#234839] text-white rounded-md text-sm font-medium disabled:opacity-40 transition-colors">
                                                Add
                                              </button>
                                              <button onClick={() => { setAddGuestDelegationId(null); setAddGuestSelectedId(''); }}
                                                className="px-3 py-2 border border-[#D4CFC7] text-[#4A4A4A] rounded-md text-sm hover:bg-[#F5F0E8] transition-colors">
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
              </>
            )}

            {/* ══ DAFTARI TAB ══ */}
            {activeTab === 'daftari' && (
              <>
                {/* Section A: Daftari Days */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[#2D5A45]" />
                      <h2 className="text-lg font-semibold text-[#1A1A1A]">Daftari Days</h2>
                      <span className="text-sm text-[#4A4A4A]">({daftariDays.length})</span>
                    </div>
                    <Button onClick={() => setAddDaftariDayOpen(true)} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8 px-3 text-sm">
                      <Plus className="w-3.5 h-3.5 mr-1.5" />Add Day
                    </Button>
                  </div>

                  {daftariLoading ? (
                    <Card className="shadow-sm"><CardContent className="flex items-center justify-center py-10">
                      <div className="w-6 h-6 border-2 border-[#2D5A45] border-t-transparent rounded-full animate-spin" />
                    </CardContent></Card>
                  ) : daftariDays.length === 0 ? (
                    <Card className="shadow-sm"><CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                      <Calendar className="w-10 h-10 text-gray-300" />
                      <p className="text-sm text-[#4A4A4A]">No daftari days created yet.</p>
                      <Button onClick={() => setAddDaftariDayOpen(true)} variant="outline" className="mt-2 text-[#2D5A45] border-[#2D5A45]">
                        <Plus className="w-4 h-4 mr-1.5" />Create First Day
                      </Button>
                    </CardContent></Card>
                  ) : (
                    <div className="space-y-3">
                      {daftariDays.map(day => {
                        const daySlotsForDay = getDaftariSlotsForDay(day.id);
                        const assignedCount = daySlotsForDay.filter(s => s.guest_id).length;
                        const isDayExpanded = expandedDaftariDays.has(day.id);
                        return (
                          <Card key={day.id} className="shadow-sm bg-white">
                            <CardHeader className="py-3 px-4">
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  onClick={() => setExpandedDaftariDays(prev => {
                                    const next = new Set(prev);
                                    next.has(day.id) ? next.delete(day.id) : next.add(day.id);
                                    return next;
                                  })}
                                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                                >
                                  {isDayExpanded
                                    ? <ChevronDown className="w-4 h-4 text-[#4A4A4A] flex-shrink-0" />
                                    : <ChevronRight className="w-4 h-4 text-[#4A4A4A] flex-shrink-0" />}
                                  <span className="font-semibold text-[#1A1A1A]">{dayHeader(day)}</span>
                                </button>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <div className="text-xs text-[#4A4A4A] text-right">
                                    <span className="font-medium text-[#1A1A1A]">{daySlotsForDay.length}</span> slot{daySlotsForDay.length !== 1 ? 's' : ''}
                                    {assignedCount > 0 && <><span className="mx-1 text-[#D4CFC7]">·</span><span className="font-medium text-[#1A1A1A]">{assignedCount}</span> assigned</>}
                                  </div>
                                  <div className="flex items-center gap-0.5">
                                    <button onClick={() => openEditDaftariDay(day)} title="Edit day" className="p-1.5 rounded text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => setDeleteDaftariDayDialog(day)} title="Delete day" className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => { setAddDaftariSlotDialog({ dayId: day.id, dayDate: day.date }); setAddDaftariSlotName(''); }}
                                      className="ml-1 flex items-center gap-1 px-2 py-1 rounded text-xs text-[#2D5A45] border border-[#2D5A45] hover:bg-[#F0F7F4] transition-colors"
                                    >
                                      <Plus className="w-3 h-3" />Add Slot
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                            {isDayExpanded && (
                              <CardContent className="pt-0 px-4 pb-4">
                                <div className="border-t border-[#E8E3DB] pt-3 space-y-3">
                                  {daySlotsForDay.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">No slots. Click "+ Add Slot" to add one.</p>
                                  ) : (
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDaftariSlotDragEnd(e, day.id)}>
                                    <SortableContext items={daySlotsForDay.map(s => s.id)} strategy={verticalListSortingStrategy}>
                                    {daySlotsForDay.map(slot => {
                                      // All guests whose daftari_slot_id = this slot (handles joined groups)
                                      const guestsInSlot = guests.filter(g => daftariGuestSlotIds[g.id] === slot.id);
                                      return (
                                        <SortableSlotItem key={slot.id} id={slot.id}>
                                        <div className="border border-[#E8E3DB] rounded-lg overflow-hidden">
                                          {/* Slot header */}
                                          <div className="flex items-center justify-between px-3 py-2 bg-[#F9F8F6]">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <SlotDragHandle />
                                              <span className="text-sm font-medium text-[#1A1A1A]">{slot.name}</span>
                                              {slot.guest_id && guestsInSlot.length > 1 && (
                                                <span className="text-xs text-[#4A4A4A] font-normal">· {guestsInSlot.length} guests</span>
                                              )}
                                            </div>
                                            {!slot.guest_id && (
                                              <button onClick={() => setDeleteDaftariSlotDialog(slot)} title="Delete slot" className="p-1 rounded text-red-400 hover:bg-red-50 transition-colors">
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                          {/* Slot body — always visible */}
                                          {!slot.guest_id ? (
                                            <div className="px-3 py-2">
                                              <p className="text-xs text-green-600 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                                                Available — no guest assigned
                                              </p>
                                            </div>
                                          ) : guestsInSlot.length > 0 ? (
                                            <div className="overflow-x-auto">
                                              <table className="w-full text-xs">
                                                <thead>
                                                  <tr className="bg-[#F5F0E8]/60 border-t border-[#E8E3DB]">
                                                    {['Name', 'Designation', 'Departure', 'Actions'].map(h => (
                                                      <th key={h} className="px-3 py-1.5 text-left text-[10px] font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                                    ))}
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#F0EDE8]">
                                                  {guestsInSlot.map(g => (
                                                    <tr key={g.id} className="bg-white hover:bg-[#FAFAFA]">
                                                      <td className="px-3 py-2 font-medium text-[#1A1A1A] whitespace-nowrap">
                                                        {g.fullName}
                                                        <span className="ml-1 text-[10px] text-[#4A4A4A] font-normal">({g.country})</span>
                                                      </td>
                                                      <td className="px-3 py-2 text-[#4A4A4A]">{formatDesignation(g.designation)}</td>
                                                      <td className="px-3 py-2 whitespace-nowrap">
                                                        <div className="text-[#4A4A4A]">{fmtDep(g.departureTime)}</div>
                                                        {fmtFlight(g.departureFlightNumber, g.departureAirport) && (
                                                          <div className="text-xs text-gray-400 mt-0.5">{fmtFlight(g.departureFlightNumber, g.departureAirport)}</div>
                                                        )}
                                                      </td>
                                                      <td className="px-3 py-2">
                                                        <div className="flex items-center gap-1">
                                                          <button
                                                            onClick={() => {
                                                              setChangeDaftariSlotDay(slot.day_id ?? '');
                                                              setChangeDaftariSlotValue(slot.id);
                                                              setChangeDaftariSlotDialog({ slot, guestId: g.id });
                                                            }}
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[#2D5A45] hover:bg-[#D6E4D9] transition-colors whitespace-nowrap"
                                                          >
                                                            <CalendarDays className="w-3 h-3" />Change
                                                          </button>
                                                          <button
                                                            onClick={() => handleRemoveOneGuestFromSlot(g, slot)}
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-red-500 hover:bg-red-50 transition-colors whitespace-nowrap"
                                                          >
                                                            <X className="w-3 h-3" />Remove
                                                          </button>
                                                        </div>
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          ) : (
                                            /* Fallback: slot has guest_id but daftariGuestSlotIds not yet loaded */
                                            <div className="px-3 py-2 flex items-center justify-between">
                                              <span className="text-xs text-[#4A4A4A]">{slot.guest_name ?? '—'}</span>
                                              <div className="flex items-center gap-1">
                                                <button
                                                  onClick={() => { setChangeDaftariSlotDay(slot.day_id ?? ''); setChangeDaftariSlotValue(slot.id); setChangeDaftariSlotDialog({ slot, guestId: slot.guest_id! }); }}
                                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#2D5A45] hover:bg-[#D6E4D9] transition-colors"
                                                >
                                                  <CalendarDays className="w-3.5 h-3.5" />Change
                                                </button>
                                                <button
                                                  onClick={() => handleRemoveGuestFromSlot(slot)}
                                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-50 transition-colors"
                                                >
                                                  <X className="w-3.5 h-3.5" />Remove
                                                </button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        </SortableSlotItem>
                                      );
                                    })}
                                    </SortableContext>
                                    </DndContext>
                                  )}
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Section B: All Daftari Guests */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-5 h-5 text-[#2D5A45]" />
                    <h2 className="text-lg font-semibold text-[#1A1A1A]">Daftari Guests</h2>
                    <span className="text-sm text-[#4A4A4A]">({filteredDaftariGuests.length})</span>
                  </div>
                  <Card className="shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      {/* Bulk action toolbar */}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => { setDaftariBulkDay(''); setDaftariBulkSlot(''); setDaftariBulkAssignDialog('assign'); }}
                          disabled={selectedDaftariGuestList.length === 0}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#2D5A45] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#234839] transition-colors"
                        >
                          Assign Mulaqat
                        </button>
                        <button
                          onClick={() => { setDaftariBulkDay(''); setDaftariBulkSlot(''); setDaftariBulkAssignDialog('join'); }}
                          disabled={selectedDaftariGuestList.length < 2}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#2D5A45] border border-[#2D5A45] rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F0F7F4] transition-colors"
                        >
                          Join &amp; Assign Mulaqat
                        </button>
                        <button
                          onClick={() => setDaftariSeparateDialog(true)}
                          disabled={!canSeparateDaftari}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-red-500 border border-red-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-50 transition-colors"
                        >
                          Separate Daftari
                        </button>
                        {selectedDaftariGuestList.length > 0 && (
                          <span className="text-sm text-gray-500">
                            Selected: {selectedDaftariGuestList.length} guest{selectedDaftariGuestList.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        <div className="ml-auto flex flex-wrap items-center gap-3">
                          <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            <Input value={daftariSearch} onChange={e => setDaftariSearch(e.target.value)}
                              placeholder="Search by name or country..." className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 pl-8" />
                          </div>
                          <select value={daftariCountryFilter} onChange={e => setDaftariCountryFilter(e.target.value)}
                            className="px-3 py-1.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none h-9">
                            <option value="">All Countries</option>
                            {daftariCountries.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      {filteredDaftariGuests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2">
                          <Users className="w-8 h-8 text-gray-300" />
                          <p className="text-sm text-[#4A4A4A]">No daftari guests found.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-[#F9F8F6]">
                              <tr>
                                <th className="px-3 py-2.5 w-10">
                                  <Checkbox
                                    checked={allDaftariGuestsSelected}
                                    data-state={someDaftariGuestsSelected ? 'indeterminate' : allDaftariGuestsSelected ? 'checked' : 'unchecked'}
                                    onCheckedChange={toggleSelectAllDaftariGuests}
                                    className="border-gray-300 data-[state=checked]:bg-[#2D5A45] data-[state=checked]:border-[#2D5A45] data-[state=indeterminate]:bg-[#2D5A45] data-[state=indeterminate]:border-[#2D5A45]"
                                  />
                                </th>
                                {['Country', 'Name', 'Designation', 'Departure', 'Assigned Day', 'Assigned Slot', 'Actions'].map(h => (
                                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E3DB]">
                              {filteredDaftariGuests.map(guest => {
                                const slot = getDaftariGuestSlot(guest.id);
                                const day = getDaftariGuestDay(guest.id);
                                const isAssigning = assigningDaftariGuestId === guest.id;
                                return (
                                  <tr key={guest.id} className={`hover:bg-[#FAFAFA] ${selectedDaftariGuestIds.has(guest.id) ? 'bg-[#F0F7F4]' : ''}`}>
                                    <td className="px-3 py-3 w-10">
                                      <Checkbox
                                        checked={selectedDaftariGuestIds.has(guest.id)}
                                        onCheckedChange={() => toggleDaftariGuest(guest.id)}
                                        className="border-gray-300 data-[state=checked]:bg-[#2D5A45] data-[state=checked]:border-[#2D5A45]"
                                      />
                                    </td>
                                    <td className="px-3 py-3 text-sm text-[#4A4A4A] whitespace-nowrap">{guest.country}</td>
                                    <td className="px-3 py-3 font-medium text-[#1A1A1A] whitespace-nowrap">{guest.fullName}</td>
                                    <td className="px-3 py-3 text-sm text-[#4A4A4A]">{formatDesignation(guest.designation)}</td>
                                    <td className="px-3 py-3 whitespace-nowrap">
                                      <div className="text-sm text-[#4A4A4A]">{fmtDep(guest.departureTime)}</div>
                                      {fmtFlight(guest.departureFlightNumber, guest.departureAirport) && (
                                        <div className="text-xs text-gray-400 mt-0.5">{fmtFlight(guest.departureFlightNumber, guest.departureAirport)}</div>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 whitespace-nowrap">
                                      {day
                                        ? <span className="text-[#4A4A4A]">{fmtShort(day.date)}{day.label ? ` — ${day.label}` : ''}</span>
                                        : <span className="text-amber-600 text-xs font-medium">Unassigned</span>}
                                    </td>
                                    <td className="px-3 py-3 text-[#4A4A4A] whitespace-nowrap">
                                      {slot ? slot.name : <span className="text-amber-600 text-xs font-medium">—</span>}
                                    </td>
                                    <td className="px-3 py-3">
                                      {isAssigning ? (
                                        <div className="flex items-center gap-2">
                                          <DaftariSlotSelect guestId={guest.id} value={assignDaftariSlotValue} onChange={setAssignDaftariSlotValue} />
                                          <Button onClick={() => handleAssignDaftariSlot(guest.id, assignDaftariSlotValue)} disabled={!assignDaftariSlotValue}
                                            className="bg-[#2D5A45] hover:bg-[#234839] text-white h-7 px-2 text-xs whitespace-nowrap">Assign</Button>
                                          <Button variant="outline" onClick={() => { setAssigningDaftariGuestId(null); setAssignDaftariSlotValue(''); }} className="h-7 px-2 text-xs">Cancel</Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1">
                                          <button onClick={() => { setAssigningDaftariGuestId(guest.id); setAssignDaftariSlotValue(slot?.id ?? ''); }}
                                            title={slot ? 'Change slot' : 'Assign slot'} className="p-1.5 rounded text-blue-500 hover:bg-blue-50 transition-colors">
                                            <Calendar className="w-3.5 h-3.5" />
                                          </button>
                                          {slot && (
                                            <button onClick={() => handleRemoveGuestFromSlot(slot)} title="Remove from slot"
                                              className="p-1.5 rounded text-orange-400 hover:bg-orange-50 transition-colors">
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                          <button onClick={() => handleRemoveFromDaftari(guest)} title="Remove from Daftari"
                                            className="p-1.5 rounded text-red-400 hover:bg-red-50 transition-colors">
                                            <UserMinus className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
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
              </>
            )}
          </div>
        </main>
      </div>

      {/* ══ DELEGATION DIALOGS ══ */}

      {/* Add Day */}
      <Dialog open={addDayOpen} onOpenChange={open => { if (!open) setAddDayOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-[#2D5A45]" />Add Mulaqat Day</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Date<span className="text-red-500 ml-0.5">*</span></label>
              <Input type="date" value={addDayDate} onChange={e => setAddDayDate(e.target.value)} className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Label <span className="text-xs text-[#4A4A4A] font-normal">(optional)</span></label>
              <Input value={addDayLabel} onChange={e => setAddDayLabel(e.target.value)} placeholder="e.g. Day 1, Saturday Session" className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Number of Slots <span className="text-red-500 ml-0.5">*</span></label>
              <Input
                type="number" min={1} max={50} value={addDaySlotCount}
                onChange={e => setAddDaySlotCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                className="border-[#D4CFC7] focus:border-[#2D5A45] w-20"
              />
              <p className="text-xs text-[#4A4A4A]">Slots will be named Slot 1, Slot 2, Slot 3…</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDayOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateDay} disabled={daySaving || !addDayDate} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              <Plus className="w-4 h-4 mr-1.5" />Create Day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Day */}
      <Dialog open={!!editDayDialog} onOpenChange={open => { if (!open) setEditDayDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-[#2D5A45]" />Edit Day</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Date<span className="text-red-500 ml-0.5">*</span></label>
              <Input type="date" value={editDayDate} onChange={e => setEditDayDate(e.target.value)} className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Label <span className="text-xs text-[#4A4A4A] font-normal">(optional)</span></label>
              <Input value={editDayLabel} onChange={e => setEditDayLabel(e.target.value)} placeholder="e.g. Day 1" className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDayDialog(null)}>Cancel</Button>
            <Button onClick={handleEditDay} disabled={!editDayDate} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              <Pencil className="w-4 h-4 mr-1.5" />Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Day */}
      <Dialog open={!!deleteDayDialog} onOpenChange={open => { if (!open) setDeleteDayDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Delete Day</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Delete <span className="font-semibold">{deleteDayDialog ? dayHeader(deleteDayDialog) : ''}</span> and all its slots?
            {deleteDayDialog && (() => {
              const slotIds = getSlotsForDay(deleteDayDialog.id).map(s => s.id);
              return delegations.some(d => d.slot_id && slotIds.includes(d.slot_id))
                ? <span className="block mt-2 text-red-600 font-medium">Some slots still have delegations. Remove them first.</span>
                : null;
            })()}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDayDialog(null)}>Cancel</Button>
            <Button onClick={handleDeleteDay} variant="destructive"><Trash2 className="w-4 h-4 mr-1.5" />Delete Day</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Slot (delegation) */}
      <Dialog open={!!addSlotDialog} onOpenChange={open => { if (!open) { setAddSlotDialog(null); setAddSlotName(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-[#2D5A45]" />Add Slot</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium text-[#1A1A1A] block mb-1.5">Slot Name<span className="text-red-500 ml-0.5">*</span></label>
            <Input value={addSlotName} onChange={e => setAddSlotName(e.target.value)} placeholder="e.g. Late Afternoon Session" className="border-[#D4CFC7] focus:border-[#2D5A45]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddSlotDialog(null); setAddSlotName(''); }}>Cancel</Button>
            <Button onClick={handleAddSlot} disabled={!addSlotName.trim()} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              <Plus className="w-4 h-4 mr-1.5" />Add Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Slot (delegation) */}
      <Dialog open={!!deleteSlotDialog} onOpenChange={open => { if (!open) setDeleteSlotDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Delete Slot</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Delete slot <span className="font-semibold">{deleteSlotDialog?.name}</span>?
            {deleteSlotDialog && delegations.some(d => d.slot_id === deleteSlotDialog.id) && (
              <span className="block mt-2 text-red-600 font-medium">This slot has delegations. Remove them first.</span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSlotDialog(null)}>Cancel</Button>
            <Button onClick={handleDeleteSlot} variant="destructive"><Trash2 className="w-4 h-4 mr-1.5" />Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change / Assign Slot from delegation table row */}
      {rowAssignDialog && (() => {
        const isChange = !!rowAssignDialog.slot_id;
        const currentSlot = rowAssignDialog.slot_id ? slots.find(s => s.id === rowAssignDialog.slot_id) : null;
        const currentDay = currentSlot?.day_id ? days.find(d => d.id === currentSlot.day_id) : null;
        const slotsForDay = changeSlotDay ? getSlotsForDay(changeSlotDay) : [];
        return (
          <Dialog open onOpenChange={open => { if (!open) { setRowAssignDialog(null); setRowAssignSlotValue(''); setChangeSlotDay(''); } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#2D5A45]" />
                  {isChange ? 'Change Mulaqat Slot' : 'Assign Mulaqat Slot'}
                </DialogTitle>
                <div className="text-sm text-[#4A4A4A] space-y-0.5 pt-1">
                  <p className="font-medium text-[#1A1A1A]">{rowAssignDialog.country} Delegation</p>
                  {isChange && currentSlot && (
                    <p>Currently in <span className="font-medium text-[#1A1A1A]">{currentSlot.name}</span>
                      {currentDay && <span className="text-[#4A4A4A]"> — {fmt(currentDay.date)}</span>}
                    </p>
                  )}
                  {!isChange && <p className="text-amber-600">Currently unassigned</p>}
                </div>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Mulaqat Day</label>
                  <select
                    value={changeSlotDay}
                    onChange={e => { setChangeSlotDay(e.target.value); setRowAssignSlotValue(''); }}
                    className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
                  >
                    <option value="">Select a day…</option>
                    {[...days].sort((a, b) => a.date.localeCompare(b.date)).map(d => (
                      <option key={d.id} value={d.id}>{dayHeader(d)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Slot</label>
                  <select
                    value={rowAssignSlotValue}
                    onChange={e => setRowAssignSlotValue(e.target.value)}
                    disabled={!changeSlotDay}
                    className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Select a slot…</option>
                    {slotsForDay.map(s => {
                      const isCurrent = s.id === rowAssignDialog.slot_id;
                      const assignedDels = delegations.filter(d => d.slot_id === s.id && d.id !== rowAssignDialog.id);
                      const countryList = assignedDels.map(d => d.country).join(', ');
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {isCurrent ? ' (current)' : assignedDels.length === 0 ? ' — Available' : ` — ${assignedDels.length} delegation${assignedDels.length !== 1 ? 's' : ''}: ${countryList}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRowAssignDialog(null); setRowAssignSlotValue(''); setChangeSlotDay(''); }}>Cancel</Button>
                <Button
                  onClick={handleRowAssignSlot}
                  disabled={!rowAssignSlotValue || rowAssignSlotValue === rowAssignDialog.slot_id}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white"
                >
                  {isChange ? 'Move to Slot' : 'Assign Slot'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* View Delegation Members */}
      <Dialog open={!!viewDelegation} onOpenChange={open => { if (!open) { setViewDelegation(null); setChangeHeadValue(''); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-[#2D5A45]" />{viewDelegation?.country} Delegation</DialogTitle>
          </DialogHeader>
          {viewDelegation && (
            <div className="space-y-4 py-1">
              <div className="text-sm text-[#4A4A4A] space-y-1">
                <p>Managed by: <span className="font-medium text-[#1A1A1A]">{viewDelegation.managed_by_name ?? '—'}</span></p>
                <p>Slot: <span className={viewDelegation.slot_id ? 'font-medium text-[#1A1A1A]' : 'text-amber-600 font-medium'}>
                  {viewDelegation.slot_id ? slotDisplayLabel(viewDelegation.slot_id) : 'Unassigned'}
                </span></p>
              </div>
              <div className="border border-[#E8E3DB] rounded-lg overflow-x-auto">
                {viewDelegation.delegation_members.length === 0 ? (
                  <p className="text-sm text-gray-400 italic p-4 text-center">No members</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-[#F9F8F6]">
                        {['Name', 'Departure'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {viewDelegation.delegation_members.map(m => {
                        const isHead = viewDelegation.head_of_delegation_id === m.guest_id;
                        const guestInfo = guests.find(g => g.id === m.guest_id);
                        return (
                          <tr key={m.id} className="hover:bg-[#FAFAFA]">
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                {isHead && <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                                <span className={`font-medium ${isHead ? 'text-[#1A1A1A]' : 'text-[#4A4A4A]'}`}>{m.guest_name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                              <div className="text-[#4A4A4A]">{fmtDep(guestInfo?.departureTime)}</div>
                              {fmtFlight(guestInfo?.departureFlightNumber, guestInfo?.departureAirport) && (
                                <div className="text-xs text-gray-400 mt-0.5">{fmtFlight(guestInfo?.departureFlightNumber, guestInfo?.departureAirport)}</div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {viewDelegation.delegation_members.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <select value={changeHeadValue} onChange={e => setChangeHeadValue(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-[#D4CFC7] rounded text-xs bg-white focus:border-[#2D5A45] focus:outline-none">
                      <option value="">Change Head...</option>
                      {viewDelegation.delegation_members
                        .filter(m => m.guest_id !== viewDelegation.head_of_delegation_id)
                        .map(m => <option key={m.id} value={m.guest_id}>{m.guest_name}</option>)}
                    </select>
                    <Button onClick={() => handleChangeHead(viewDelegation, changeHeadValue)} disabled={!changeHeadValue} size="sm" className="bg-amber-500 hover:bg-amber-600 text-white h-7 px-2.5 text-xs">
                      <Star className="w-3 h-3 mr-1" />Set Head
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <SlotSelect
                      value={viewDelegation.slot_id ?? '__none__'}
                      onChange={async v => {
                        const val = v === '__none__' ? null : v;
                        const { error } = await supabase.from('delegations').update({ slot_id: val }).eq('id', viewDelegation.id);
                        if (error) { toast.error('Failed to update slot'); return; }
                        toast.success(val ? 'Slot assigned' : 'Slot removed');
                        fetchAll();
                        setViewDelegation(prev => prev ? { ...prev, slot_id: val } : null);
                      }}
                      includeNone
                    />
                    <span className="text-xs text-[#4A4A4A] flex-shrink-0">slot</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setViewDelegation(null); setChangeHeadValue(''); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Delegation */}
      <Dialog open={!!deleteDelegationDialog} onOpenChange={open => { if (!open) setDeleteDelegationDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Delete Delegation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Delete the <span className="font-semibold">{deleteDelegationDialog?.country}</span> delegation?
            {(deleteDelegationDialog?.delegation_members.length ?? 0) > 0 && (
              <span className="block mt-2 text-red-600 font-medium">
                This delegation still has {deleteDelegationDialog?.delegation_members.length} member(s). Remove them first.
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDelegationDialog(null)}>Cancel</Button>
            <Button onClick={handleDeleteDelegation} variant="destructive" disabled={(deleteDelegationDialog?.delegation_members.length ?? 0) > 0}>
              <Trash2 className="w-4 h-4 mr-1.5" />Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ DAFTARI DIALOGS ══ */}

      {/* Add Daftari Day */}
      <Dialog open={addDaftariDayOpen} onOpenChange={open => { if (!open) setAddDaftariDayOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-[#2D5A45]" />Add Daftari Day</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Date<span className="text-red-500 ml-0.5">*</span></label>
              <Input type="date" value={addDaftariDate} onChange={e => setAddDaftariDate(e.target.value)} className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Label <span className="text-xs text-[#4A4A4A] font-normal">(optional, e.g. "Day 1")</span></label>
              <Input value={addDaftariLabel} onChange={e => setAddDaftariLabel(e.target.value)} placeholder="e.g. Day 1, Monday Session" className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Number of Slots <span className="text-red-500 ml-0.5">*</span></label>
              <Input
                type="number" min={1} max={50} value={addDaftariSlotCount}
                onChange={e => setAddDaftariSlotCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                className="border-[#D4CFC7] focus:border-[#2D5A45] w-20"
              />
              <p className="text-xs text-[#4A4A4A]">Slots will be named Slot 1, Slot 2, Slot 3…</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDaftariDayOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateDaftariDay} disabled={daftariDaySaving || !addDaftariDate} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              <Plus className="w-4 h-4 mr-1.5" />Create Day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Daftari Day */}
      <Dialog open={!!editDaftariDayDialog} onOpenChange={open => { if (!open) setEditDaftariDayDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-[#2D5A45]" />Edit Daftari Day</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Date<span className="text-red-500 ml-0.5">*</span></label>
              <Input type="date" value={editDaftariDate} onChange={e => setEditDaftariDate(e.target.value)} className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Label <span className="text-xs text-[#4A4A4A] font-normal">(optional)</span></label>
              <Input value={editDaftariLabel} onChange={e => setEditDaftariLabel(e.target.value)} placeholder="e.g. Day 1" className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDaftariDayDialog(null)}>Cancel</Button>
            <Button onClick={handleEditDaftariDay} disabled={!editDaftariDate} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              <Pencil className="w-4 h-4 mr-1.5" />Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Daftari Day */}
      <Dialog open={!!deleteDaftariDayDialog} onOpenChange={open => { if (!open) setDeleteDaftariDayDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Delete Daftari Day</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Delete <span className="font-semibold">{deleteDaftariDayDialog ? fmtShort(deleteDaftariDayDialog.date) : ''}</span> and all its slots?
            {deleteDaftariDayDialog && getDaftariSlotsForDay(deleteDaftariDayDialog.id).some(s => s.guest_id) && (
              <span className="block mt-2 text-red-600 font-medium">Some slots still have guests assigned. Remove them first.</span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDaftariDayDialog(null)}>Cancel</Button>
            <Button onClick={handleDeleteDaftariDay} variant="destructive"><Trash2 className="w-4 h-4 mr-1.5" />Delete Day</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Daftari Slot */}
      <Dialog open={!!addDaftariSlotDialog} onOpenChange={open => { if (!open) { setAddDaftariSlotDialog(null); setAddDaftariSlotName(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-[#2D5A45]" />Add Daftari Slot</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium text-[#1A1A1A] block mb-1.5">Slot Name<span className="text-red-500 ml-0.5">*</span></label>
            <Input value={addDaftariSlotName} onChange={e => setAddDaftariSlotName(e.target.value)} placeholder="e.g. Morning Session 1" className="border-[#D4CFC7] focus:border-[#2D5A45]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDaftariSlotDialog(null); setAddDaftariSlotName(''); }}>Cancel</Button>
            <Button onClick={handleAddDaftariSlot} disabled={!addDaftariSlotName.trim()} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              <Plus className="w-4 h-4 mr-1.5" />Add Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Daftari Slot */}
      <Dialog open={!!deleteDaftariSlotDialog} onOpenChange={open => { if (!open) setDeleteDaftariSlotDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Delete Daftari Slot</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Delete slot <span className="font-semibold">{deleteDaftariSlotDialog?.name}</span>?
            {deleteDaftariSlotDialog?.guest_id && (
              <span className="block mt-2 text-red-600 font-medium">This slot has a guest assigned. Remove them first.</span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDaftariSlotDialog(null)}>Cancel</Button>
            <Button onClick={handleDeleteDaftariSlot} variant="destructive" disabled={!!deleteDaftariSlotDialog?.guest_id}>
              <Trash2 className="w-4 h-4 mr-1.5" />Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Assign / Join Dialog ── */}
      <Dialog open={bulkAssignDialog === 'assign' || bulkAssignDialog === 'join'} onOpenChange={open => { if (!open) { setBulkAssignDialog(null); setBulkDay(''); setBulkSlot(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bulkAssignDialog === 'join' ? 'Join Delegations & Assign Slot' : 'Assign Mulaqat Slot'}
            </DialogTitle>
            <p className="text-sm text-[#4A4A4A] mt-1">
              {bulkAssignDialog === 'join'
                ? 'These delegations will share the same Mulaqat slot'
                : `Assign ${selectedDelegationList.length} delegation${selectedDelegationList.length !== 1 ? 's' : ''} to a slot`}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-1.5">
              {selectedDelegationList.map(d => (
                <span key={d.id} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-[#EBF4EE] text-[#2D5A45] border border-[#C8E0D0] font-medium">
                  {d.country} ({d.delegation_members.length})
                </span>
              ))}
            </div>
            {bulkAssignDialog === 'join' && (
              <p className="text-sm text-[#4A4A4A]">
                <span className="font-medium text-[#1A1A1A]">{selectedGuestTotal}</span> guests total will share this slot
              </p>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Mulaqat Day</label>
              <select value={bulkDay} onChange={e => { setBulkDay(e.target.value); setBulkSlot(''); }}
                className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none">
                <option value="">Select a day...</option>
                {[...days].sort((a, b) => a.date.localeCompare(b.date)).map(d => (
                  <option key={d.id} value={d.id}>{fmt(d.date)}{d.label ? ` — ${d.label}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Slot</label>
              <select value={bulkSlot} onChange={e => setBulkSlot(e.target.value)} disabled={!bulkDay}
                className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none disabled:opacity-50">
                <option value="">Select a slot...</option>
                {getSlotsForDay(bulkDay).map(s => {
                  const taken = getDelegationsForSlot(s.id).filter(d => !selectedDelegationIds.has(d.id)).length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} — {taken === 0 ? 'Available' : `${taken} other delegation${taken !== 1 ? 's' : ''}`}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkAssignDialog(null); setBulkDay(''); setBulkSlot(''); }}>Cancel</Button>
            <Button onClick={handleBulkAssignDelegations} disabled={!bulkSlot} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              {bulkAssignDialog === 'join' ? 'Join & Assign' : 'Assign to Slot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Separate Delegations Confirm ── */}
      {separateDialog && (() => {
        const sharedSlotId = selectedDelegationList[0]?.slot_id ?? null;
        const sharedSlotLabel = sharedSlotId ? slotDisplayLabel(sharedSlotId) : '';
        return (
          <Dialog open onOpenChange={open => { if (!open) setSeparateDialog(false); }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />Separate Delegations
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-[#4A4A4A] py-2">
                Remove <span className="font-semibold">{selectedDelegationList.length} delegations</span> from{' '}
                <span className="font-semibold">{sharedSlotLabel}</span>? They will become unassigned.
              </p>
              <div className="flex flex-wrap gap-1.5 pb-2">
                {selectedDelegationList.map(d => (
                  <span key={d.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200">
                    {d.country}
                  </span>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSeparateDialog(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleSeparateDelegations}>Separate &amp; Unassign</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Move Delegation Dialog (from slot card) ── */}
      {moveDelegationDialog && (() => {
        const del = moveDelegationDialog.delegation;
        const currentSlot = slots.find(s => s.id === moveDelegationDialog.currentSlotId);
        const currentDay = currentSlot?.day_id ? days.find(d => d.id === currentSlot.day_id) : null;
        return (
          <Dialog open onOpenChange={open => { if (!open) { setMoveDelegationDialog(null); setMoveDelegationDay(''); setMoveDelegationSlot(''); } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Move Delegation</DialogTitle>
                {currentSlot && (
                  <p className="text-sm text-[#4A4A4A] mt-1">
                    <span className="font-medium text-[#1A1A1A]">{del.country}</span> Delegation — currently in{' '}
                    <span className="font-medium text-[#1A1A1A]">{currentSlot.name}{currentDay ? `, ${fmtShort(currentDay.date)}` : ''}</span>
                  </p>
                )}
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Mulaqat Day</label>
                  <select
                    value={moveDelegationDay}
                    onChange={e => { setMoveDelegationDay(e.target.value); setMoveDelegationSlot(''); }}
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
                    value={moveDelegationSlot}
                    onChange={e => setMoveDelegationSlot(e.target.value)}
                    disabled={!moveDelegationDay}
                    className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Select a slot...</option>
                    {getSlotsForDay(moveDelegationDay).map(s => {
                      const isCurrent = s.id === moveDelegationDialog.currentSlotId;
                      const takenCount = getDelegationsForSlot(s.id).filter(d => d.id !== del.id).length;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name}{isCurrent ? ' (current)' : takenCount === 0 ? ' — Available' : ` — ${takenCount} delegation${takenCount !== 1 ? 's' : ''}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setMoveDelegationDialog(null); setMoveDelegationDay(''); setMoveDelegationSlot(''); }}>Cancel</Button>
                <Button
                  onClick={handleMoveDelegation}
                  disabled={!moveDelegationSlot || moveDelegationSlot === moveDelegationDialog.currentSlotId}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white"
                >
                  Move to Slot
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Daftari: Change Slot Dialog (from day cards) ── */}
      {changeDaftariSlotDialog && (() => {
        const { slot: oldSlot, guestId } = changeDaftariSlotDialog;
        const guestName = guests.find(g => g.id === guestId)?.fullName ?? oldSlot.guest_name ?? '—';
        const oldDay = oldSlot.day_id ? daftariDays.find(d => d.id === oldSlot.day_id) : null;
        return (
          <Dialog open onOpenChange={open => { if (!open) { setChangeDaftariSlotDialog(null); setChangeDaftariSlotDay(''); setChangeDaftariSlotValue(''); } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-[#2D5A45]" />Change Daftari Slot
                </DialogTitle>
                <p className="text-sm text-[#4A4A4A] mt-1">
                  <span className="font-medium text-[#1A1A1A]">{guestName}</span> — currently in{' '}
                  <span className="font-medium text-[#1A1A1A]">{oldSlot.name}{oldDay ? `, ${fmtShort(oldDay.date)}` : ''}</span>
                </p>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Daftari Day</label>
                  <select
                    value={changeDaftariSlotDay}
                    onChange={e => { setChangeDaftariSlotDay(e.target.value); setChangeDaftariSlotValue(''); }}
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
                    value={changeDaftariSlotValue}
                    onChange={e => setChangeDaftariSlotValue(e.target.value)}
                    disabled={!changeDaftariSlotDay}
                    className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Select a slot...</option>
                    {getDaftariSlotsForDay(changeDaftariSlotDay).map(s => {
                      const isCurrent = s.id === oldSlot.id;
                      const occupied = s.guest_id && s.id !== oldSlot.id;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name}{isCurrent ? ' (current)' : occupied ? ` — ${s.guest_name ?? 'Occupied'}` : ' — Available'}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setChangeDaftariSlotDialog(null); setChangeDaftariSlotDay(''); setChangeDaftariSlotValue(''); }}>Cancel</Button>
                <Button
                  onClick={handleChangeDaftariSlot}
                  disabled={!changeDaftariSlotValue || changeDaftariSlotValue === oldSlot.id}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white"
                >
                  Move to Slot
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Daftari: Bulk Assign / Join Dialog ── */}
      <Dialog
        open={daftariBulkAssignDialog === 'assign' || daftariBulkAssignDialog === 'join'}
        onOpenChange={open => { if (!open) { setDaftariBulkAssignDialog(null); setDaftariBulkDay(''); setDaftariBulkSlot(''); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {daftariBulkAssignDialog === 'join' ? 'Join & Assign Daftari Slot' : 'Assign Daftari Slot'}
            </DialogTitle>
            <p className="text-sm text-[#4A4A4A] mt-1">
              {daftariBulkAssignDialog === 'join'
                ? `${selectedDaftariGuestList.length} guests will share one daftari slot`
                : `Assign ${selectedDaftariGuestList.length} selected guest${selectedDaftariGuestList.length !== 1 ? 's' : ''} to a slot`}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-1.5">
              {selectedDaftariGuestList.map(g => (
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
                  const occupied = s.guest_id && !selectedDaftariGuestIds.has(s.guest_id);
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} — {occupied ? `${s.guest_name ?? 'Occupied'}` : 'Available'}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDaftariBulkAssignDialog(null); setDaftariBulkDay(''); setDaftariBulkSlot(''); }}>Cancel</Button>
            <Button onClick={handleBulkAssignDaftari} disabled={!daftariBulkSlot} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              {daftariBulkAssignDialog === 'join' ? 'Join & Assign' : 'Assign to Slot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Daftari: Separate Confirm ── */}
      {daftariSeparateDialog && (() => {
        const sharedSlotId = getDaftariGuestSlot(selectedDaftariGuestList[0]?.id ?? '')?.id ?? null;
        const sharedSlot = sharedSlotId ? daftariSlots.find(s => s.id === sharedSlotId) : null;
        const sharedDay = sharedSlot?.day_id ? daftariDays.find(d => d.id === sharedSlot.day_id) : null;
        const sharedLabel = sharedSlot
          ? `${sharedDay ? fmtShort(sharedDay.date) + ' — ' : ''}${sharedSlot.name}`
          : '';
        return (
          <Dialog open onOpenChange={open => { if (!open) setDaftariSeparateDialog(false); }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />Separate Daftari Guests
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-[#4A4A4A] py-2">
                Remove <span className="font-semibold">{selectedDaftariGuestList.length} guests</span>
                {sharedLabel && <> from <span className="font-semibold">{sharedLabel}</span></>}? They will become unassigned.
              </p>
              <div className="flex flex-wrap gap-1.5 pb-2">
                {selectedDaftariGuestList.map(g => (
                  <span key={g.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200">
                    {g.fullName}
                  </span>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDaftariSeparateDialog(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleSeparateDaftari}>Separate &amp; Unassign</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
