import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Calendar, ChevronDown, ChevronRight, LogOut, User,
  Plus, Pencil, Trash2, Eye, X, Star, Users, AlertTriangle, Search, UserMinus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ROLE_LABELS } from '@/lib/constants';
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

function dayHeader(day: MulaqatDay | DaftariDay): string {
  const dateStr = fmt(day.date);
  return day.label ? `${dateStr} — ${day.label}` : dateStr;
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
  const [addDaySlots, setAddDaySlots] = useState<string[]>(['Slot 1']);
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

  // View delegation members
  const [viewDelegation, setViewDelegation] = useState<Delegation | null>(null);
  const [changeHeadValue, setChangeHeadValue] = useState('');

  // Delete delegation confirm
  const [deleteDelegationDialog, setDeleteDelegationDialog] = useState<Delegation | null>(null);

  // Daftari – Add Day dialog
  const [addDaftariDayOpen, setAddDaftariDayOpen] = useState(false);
  const [addDaftariDate, setAddDaftariDate] = useState('');
  const [addDaftariLabel, setAddDaftariLabel] = useState('');
  const [addDaftariSlotNames, setAddDaftariSlotNames] = useState<string[]>(['Slot 1']);
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

  // Daftari – Search/filter
  const [daftariSearch, setDaftariSearch] = useState('');
  const [daftariCountryFilter, setDaftariCountryFilter] = useState('');

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [{ data: dayData }, { data: slotData }, { data: delData }] = await Promise.all([
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
    setLoading(false);
  }, []);

  const fetchDaftari = useCallback(async () => {
    const [{ data: ddData }, { data: dsData }] = await Promise.all([
      supabase.from('daftari_days').select('*').order('date'),
      supabase.from('daftari_slots').select('*').order('name'),
    ]);
    if (ddData) setDaftariDays(ddData as DaftariDay[]);
    if (dsData) setDaftariSlots(dsData as DaftariSlot[]);
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
        if (!g.name.toLowerCase().includes(q) && !g.country.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [daftariGuests, daftariSearch, daftariCountryFilter]);

  const getDaftariSlotsForDay = (dayId: string) => daftariSlots.filter(s => s.day_id === dayId);
  const assignedDaftariCount = useMemo(() => daftariSlots.filter(s => s.guest_id).length, [daftariSlots]);
  const availableDaftariCount = useMemo(() => daftariSlots.filter(s => !s.guest_id).length, [daftariSlots]);

  const getDaftariGuestSlot = (guestId: string) => daftariSlots.find(s => s.guest_id === guestId);
  const getDaftariGuestDay = (guestId: string) => {
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

  // ── Delegation handlers ───────────────────────────────────────────────────────

  const handleCreateDay = async () => {
    if (!addDayDate) { toast.error('Date is required'); return; }
    if (addDaySlots.some(s => !s.trim())) { toast.error('All slot names must be filled in'); return; }
    if (!user) return;
    setDaySaving(true);
    try {
      const { data: day, error: dayErr } = await supabase
        .from('mulaqat_days')
        .insert({ date: addDayDate, label: addDayLabel.trim() || null, created_by: user.id })
        .select().single();
      if (dayErr || !day) throw dayErr;
      if (addDaySlots.length > 0) {
        await supabase.from('mulaqat_slots').insert(
          addDaySlots.map(name => ({ name: name.trim(), day_id: day.id, date: addDayDate, is_active: true })),
        );
      }
      toast.success(`Day added with ${addDaySlots.length} slot${addDaySlots.length !== 1 ? 's' : ''}`);
      setAddDayOpen(false);
      setAddDayDate(''); setAddDayLabel(''); setAddDaySlots(['Slot 1']);
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
    if (!rowAssignDialog) return;
    const val = rowAssignSlotValue === '__none__' ? null : rowAssignSlotValue;
    const { error } = await supabase.from('delegations').update({ slot_id: val }).eq('id', rowAssignDialog.id);
    if (error) { toast.error('Failed to update slot'); return; }
    toast.success(val ? 'Slot assigned' : 'Slot removed');
    setRowAssignDialog(null); setRowAssignSlotValue(''); fetchAll();
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
    if (addDaftariSlotNames.some(s => !s.trim())) { toast.error('All slot names must be filled in'); return; }
    if (!user) return;
    setDaftariDaySaving(true);
    try {
      const { data: day, error: dayErr } = await supabase
        .from('daftari_days')
        .insert({ date: addDaftariDate, label: addDaftariLabel.trim() || null, is_active: true, created_by: user.id })
        .select().single();
      if (dayErr || !day) throw dayErr;
      if (addDaftariSlotNames.length > 0) {
        await supabase.from('daftari_slots').insert(
          addDaftariSlotNames.map(name => ({ name: name.trim(), day_id: day.id })),
        );
      }
      toast.success(`Daftari day added with ${addDaftariSlotNames.length} slot${addDaftariSlotNames.length !== 1 ? 's' : ''}`);
      setAddDaftariDayOpen(false);
      setAddDaftariDate(''); setAddDaftariLabel(''); setAddDaftariSlotNames(['Slot 1']);
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
    const { error } = await supabase.from('daftari_slots').update({
      guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null,
    }).eq('id', slot.id);
    if (error) { toast.error('Failed to remove guest'); return; }
    toast.success(`${slot.guest_name} removed from slot`); fetchDaftari();
  };

  const handleAssignDaftariSlot = async (guestId: string, slotId: string) => {
    if (!slotId || !user) return;
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;
    const oldSlot = daftariSlots.find(s => s.guest_id === guestId);
    if (oldSlot) {
      await supabase.from('daftari_slots').update({
        guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null,
      }).eq('id', oldSlot.id);
    }
    const { error } = await supabase.from('daftari_slots').update({
      guest_id: guestId, guest_name: guest.name, assigned_by: user.id, assigned_by_name: user.name,
    }).eq('id', slotId);
    if (error) { toast.error('Failed to assign slot'); return; }
    toast.success(`${guest.name} assigned to slot`);
    setAssigningDaftariGuestId(null); setAssignDaftariSlotValue(''); fetchDaftari();
  };

  const handleRemoveFromDaftari = async (guest: Guest) => {
    const slot = daftariSlots.find(s => s.guest_id === guest.id);
    if (slot) {
      await supabase.from('daftari_slots').update({
        guest_id: null, guest_name: null, assigned_by: null, assigned_by_name: null,
      }).eq('id', slot.id);
    }
    const newType = guest.mulaqatType === 'Both' ? 'Delegation' : 'No';
    const { error } = await supabase.from('guests').update({
      mulaqat_type: newType, mulaqat: newType !== 'No',
    }).eq('id', guest.id);
    if (error) { toast.error('Failed to remove from Daftari'); return; }
    toast.success(`${guest.name} removed from Daftari`); fetchDaftari();
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
                                    daySlotsForDay.map(slot => {
                                      const slotDels = getDelegationsForSlot(slot.id);
                                      const isAssigning = assigningSlotId === slot.id;
                                      return (
                                        <div key={slot.id} className="border border-[#E8E3DB] rounded-lg overflow-hidden">
                                          <div className="flex items-center justify-between px-3 py-2 bg-[#F9F8F6]">
                                            <span className="text-sm font-medium text-[#1A1A1A]">{slot.name}</span>
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
                                              slotDels.map(del => (
                                                <div key={del.id} className="flex items-center justify-between gap-2 text-xs">
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <span className="font-medium text-[#1A1A1A] truncate">{del.country}</span>
                                                    <span className="text-[#4A4A4A]">({del.delegation_members.length})</span>
                                                    {del.head_of_delegation_name && (
                                                      <span className="flex items-center gap-0.5 text-[#4A4A4A]">
                                                        <Star className="w-3 h-3 text-amber-500" />
                                                        {del.head_of_delegation_name}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <button onClick={() => removeDelegationFromSlot(del)} title="Remove from slot"
                                                    className="p-1 rounded text-red-400 hover:bg-red-50 transition-colors flex-shrink-0">
                                                    <X className="w-3.5 h-3.5" />
                                                  </button>
                                                </div>
                                              ))
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
                                      );
                                    })
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
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[200px]">
                          <Input value={delegationSearch} onChange={e => setDelegationSearch(e.target.value)}
                            placeholder="Search by country..." className="border-[#D4CFC7] focus:border-[#2D5A45] h-9" />
                        </div>
                        <div className="flex gap-1.5">
                          {(['all', 'assigned', 'unassigned'] as const).map(f => (
                            <button key={f} onClick={() => setDelegationFilter(f)} className={chipCls(delegationFilter === f)}>
                              {f === 'all' ? 'All' : f === 'assigned' ? 'Assigned' : 'Unassigned'}
                            </button>
                          ))}
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
                                {['Country', 'Guests', 'Head of Delegation', 'Managed By', 'Slot', 'Actions'].map(h => (
                                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E3DB]">
                              {filteredDelegations.map(del => (
                                <tr key={del.id} className="hover:bg-[#FAFAFA]">
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
                                      <button onClick={() => { setViewDelegation(del); setChangeHeadValue(''); }} title="View members" className="p-1.5 rounded text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors">
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => { setRowAssignDialog(del); setRowAssignSlotValue(del.slot_id ?? '__none__'); }} title="Assign slot" className="p-1.5 rounded text-blue-500 hover:bg-blue-50 transition-colors">
                                        <Calendar className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => setDeleteDelegationDialog(del)} title="Delete" className="p-1.5 rounded text-red-400 hover:bg-red-50 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
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
                {/* Section A: Daftari Schedule Management */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[#2D5A45]" />
                      <h2 className="text-lg font-semibold text-[#1A1A1A]">Daftari Schedule</h2>
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
                    <Card className="shadow-sm bg-white overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F9F8F6]">
                            <tr>
                              {['Day', 'Slot', 'Guest', 'Country', 'Designation', 'Assigned By', 'Status', 'Actions'].map(h => (
                                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider first:pl-4">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E8E3DB]">
                            {daftariDays.map(day => {
                              const daySlots = getDaftariSlotsForDay(day.id);
                              if (daySlots.length === 0) {
                                return (
                                  <tr key={day.id} className="hover:bg-[#FAFAFA]">
                                    <td className="pl-4 pr-3 py-3 align-top">
                                      <div className="font-medium text-[#1A1A1A]">{fmtShort(day.date)}</div>
                                      {day.label && <div className="text-xs text-[#4A4A4A]">{day.label}</div>}
                                      <div className="flex items-center gap-0.5 mt-1.5">
                                        <button onClick={() => openEditDaftariDay(day)} title="Edit" className="p-1 rounded text-[#4A4A4A] hover:bg-[#F5F0E8]"><Pencil className="w-3 h-3" /></button>
                                        <button onClick={() => setDeleteDaftariDayDialog(day)} title="Delete" className="p-1 rounded text-red-400 hover:bg-red-50"><Trash2 className="w-3 h-3" /></button>
                                      </div>
                                    </td>
                                    <td colSpan={7} className="px-3 py-3 text-xs text-gray-400 italic">
                                      No slots yet.
                                      <button
                                        onClick={() => { setAddDaftariSlotDialog({ dayId: day.id, dayDate: day.date }); setAddDaftariSlotName(''); }}
                                        className="ml-2 text-[#2D5A45] font-medium hover:underline"
                                      >+ Add Slot</button>
                                    </td>
                                  </tr>
                                );
                              }
                              return daySlots.map((slot, idx) => {
                                const guest = slot.guest_id ? guests.find(g => g.id === slot.guest_id) : null;
                                return (
                                  <tr key={slot.id} className={`hover:bg-[#FAFAFA] ${slot.guest_id ? 'border-l-4 border-l-[#2D5A45]' : 'border-l-4 border-l-amber-400'}`}>
                                    {idx === 0 && (
                                      <td rowSpan={daySlots.length} className="pl-4 pr-3 py-3 align-top border-r border-[#E8E3DB]">
                                        <div className="font-medium text-[#1A1A1A]">{fmtShort(day.date)}</div>
                                        {day.label && <div className="text-xs text-[#4A4A4A]">{day.label}</div>}
                                        <div className="text-xs text-[#4A4A4A] mt-0.5">{daySlots.length} slot{daySlots.length !== 1 ? 's' : ''}</div>
                                        <div className="flex items-center gap-0.5 mt-1.5">
                                          <button onClick={() => openEditDaftariDay(day)} title="Edit" className="p-1 rounded text-[#4A4A4A] hover:bg-[#F5F0E8]"><Pencil className="w-3 h-3" /></button>
                                          <button onClick={() => setDeleteDaftariDayDialog(day)} title="Delete" className="p-1 rounded text-red-400 hover:bg-red-50"><Trash2 className="w-3 h-3" /></button>
                                          <button onClick={() => { setAddDaftariSlotDialog({ dayId: day.id, dayDate: day.date }); setAddDaftariSlotName(''); }} title="Add slot" className="p-1 rounded text-[#2D5A45] hover:bg-[#F0F7F4]"><Plus className="w-3 h-3" /></button>
                                        </div>
                                      </td>
                                    )}
                                    <td className="px-3 py-3 font-medium text-[#1A1A1A]">{slot.name}</td>
                                    <td className="px-3 py-3 text-[#4A4A4A]">{slot.guest_name ?? '—'}</td>
                                    <td className="px-3 py-3 text-[#4A4A4A]">{guest?.country ?? '—'}</td>
                                    <td className="px-3 py-3 text-[#4A4A4A]">{guest?.designation ?? '—'}</td>
                                    <td className="px-3 py-3 text-[#4A4A4A]">{slot.assigned_by_name ?? '—'}</td>
                                    <td className="px-3 py-3">
                                      {slot.guest_id
                                        ? <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">Assigned</span>
                                        : <span className="text-xs text-green-700 border border-green-300 rounded-full px-2 py-0.5">Available</span>}
                                    </td>
                                    <td className="px-3 py-3">
                                      <div className="flex items-center gap-1">
                                        {slot.guest_id ? (
                                          <button onClick={() => handleRemoveGuestFromSlot(slot)} title="Remove guest" className="p-1.5 rounded text-red-400 hover:bg-red-50 transition-colors">
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        ) : (
                                          <button onClick={() => setDeleteDaftariSlotDialog(slot)} title="Delete slot" className="p-1.5 rounded text-red-400 hover:bg-red-50 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              });
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>
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
                      <div className="flex flex-wrap items-center gap-3">
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
                                {['Guest Name', 'Country', 'Designation', 'Desk Incharge', 'Day', 'Slot', 'Actions'].map(h => (
                                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E3DB]">
                              {filteredDaftariGuests.map(guest => {
                                const slot = getDaftariGuestSlot(guest.id);
                                const day = getDaftariGuestDay(guest.id);
                                const isAssigning = assigningDaftariGuestId === guest.id;
                                return (
                                  <tr key={guest.id} className="hover:bg-[#FAFAFA]">
                                    <td className="px-3 py-3 font-medium text-[#1A1A1A]">{guest.name}</td>
                                    <td className="px-3 py-3 text-[#4A4A4A]">{guest.country}</td>
                                    <td className="px-3 py-3 text-[#4A4A4A]">{guest.designation ?? '—'}</td>
                                    <td className="px-3 py-3 text-[#4A4A4A]">{getDIForCountry(guest.country)}</td>
                                    <td className="px-3 py-3">
                                      {day
                                        ? <span className="text-[#4A4A4A]">{fmtShort(day.date)}{day.label ? ` — ${day.label}` : ''}</span>
                                        : <span className="text-amber-600 text-xs font-medium">Unassigned</span>}
                                    </td>
                                    <td className="px-3 py-3 text-[#4A4A4A]">
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
              <label className="text-sm font-medium text-[#1A1A1A]">Date <span className="text-red-500">*</span></label>
              <Input type="date" value={addDayDate} onChange={e => setAddDayDate(e.target.value)} className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Label <span className="text-xs text-[#4A4A4A] font-normal">(optional)</span></label>
              <Input value={addDayLabel} onChange={e => setAddDayLabel(e.target.value)} placeholder="e.g. Day 1, Saturday Session" className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#1A1A1A]">Slots</label>
                <button onClick={() => setAddDaySlots(prev => [...prev, `Slot ${prev.length + 1}`])} className="text-xs text-[#2D5A45] hover:text-[#234839] font-medium flex items-center gap-0.5">
                  <Plus className="w-3.5 h-3.5" />Add slot
                </button>
              </div>
              {addDaySlots.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={name} onChange={e => setAddDaySlots(prev => prev.map((s, idx) => idx === i ? e.target.value : s))}
                    placeholder={`Slot ${i + 1} name`} className="border-[#D4CFC7] focus:border-[#2D5A45] h-8 text-sm" />
                  {addDaySlots.length > 1 && (
                    <button onClick={() => setAddDaySlots(prev => prev.filter((_, idx) => idx !== i))} className="p-1 rounded text-red-400 hover:bg-red-50 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
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
              <label className="text-sm font-medium text-[#1A1A1A]">Date <span className="text-red-500">*</span></label>
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
            <label className="text-sm font-medium text-[#1A1A1A] block mb-1.5">Slot Name <span className="text-red-500">*</span></label>
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

      {/* Assign Slot from row */}
      <Dialog open={!!rowAssignDialog} onOpenChange={open => { if (!open) { setRowAssignDialog(null); setRowAssignSlotValue(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-[#2D5A45]" />Assign Slot — {rowAssignDialog?.country}</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <label className="text-sm font-medium text-[#1A1A1A] block mb-1.5">Mulaqat Slot</label>
            <SlotSelect value={rowAssignSlotValue} onChange={setRowAssignSlotValue} includeNone />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRowAssignDialog(null); setRowAssignSlotValue(''); }}>Cancel</Button>
            <Button onClick={handleRowAssignSlot} className="bg-[#2D5A45] hover:bg-[#234839] text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                        {['Name', 'Departure Date', 'Departure Flight', 'Role'].map(h => (
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
                            <td className="px-3 py-2.5 text-xs text-[#4A4A4A] whitespace-nowrap">
                              {guestInfo?.departureTime ? fmt(guestInfo.departureTime) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-[#4A4A4A] whitespace-nowrap">
                              {guestInfo?.departureFlightNumber
                                ? guestInfo.departureAirport
                                  ? `${guestInfo.departureFlightNumber} (${guestInfo.departureAirport})`
                                  : guestInfo.departureFlightNumber
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-[#4A4A4A]">{isHead ? 'Head of Delegation' : 'Member'}</td>
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
              <label className="text-sm font-medium text-[#1A1A1A]">Date <span className="text-red-500">*</span></label>
              <Input type="date" value={addDaftariDate} onChange={e => setAddDaftariDate(e.target.value)} className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Label <span className="text-xs text-[#4A4A4A] font-normal">(optional, e.g. "Day 1")</span></label>
              <Input value={addDaftariLabel} onChange={e => setAddDaftariLabel(e.target.value)} placeholder="e.g. Day 1, Monday Session" className="border-[#D4CFC7] focus:border-[#2D5A45]" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#1A1A1A]">Slots</label>
                <button onClick={() => setAddDaftariSlotNames(prev => [...prev, `Slot ${prev.length + 1}`])} className="text-xs text-[#2D5A45] hover:text-[#234839] font-medium flex items-center gap-0.5">
                  <Plus className="w-3.5 h-3.5" />Add slot
                </button>
              </div>
              {addDaftariSlotNames.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={name} onChange={e => setAddDaftariSlotNames(prev => prev.map((s, idx) => idx === i ? e.target.value : s))}
                    placeholder={`Slot ${i + 1} name`} className="border-[#D4CFC7] focus:border-[#2D5A45] h-8 text-sm" />
                  {addDaftariSlotNames.length > 1 && (
                    <button onClick={() => setAddDaftariSlotNames(prev => prev.filter((_, idx) => idx !== i))} className="p-1 rounded text-red-400 hover:bg-red-50 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
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
              <label className="text-sm font-medium text-[#1A1A1A]">Date <span className="text-red-500">*</span></label>
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
            <label className="text-sm font-medium text-[#1A1A1A] block mb-1.5">Slot Name <span className="text-red-500">*</span></label>
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

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
