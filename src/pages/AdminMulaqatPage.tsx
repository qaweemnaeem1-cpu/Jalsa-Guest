import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Calendar, ChevronDown, ChevronRight, LogOut, User,
  Plus, Pencil, Trash2, Eye, X, Star, Users, AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ROLE_LABELS } from '@/lib/constants';
import { ProfileDialog } from '@/components/ProfileDialog';
import { SUPER_ADMIN_NAV } from '@/lib/navItems';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MulaqatSlot {
  id: string;
  name: string;
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
  mulaqat_slots: { name: string; date: string | null } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminMulaqatPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [slots, setSlots] = useState<MulaqatSlot[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const [delegationFilter, setDelegationFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [delegationSearch, setDelegationSearch] = useState('');

  // Add/edit slot dialog
  const [slotDialog, setSlotDialog] = useState<{ mode: 'add' | 'edit'; slot?: MulaqatSlot } | null>(null);
  const [slotName, setSlotName] = useState('');
  const [slotDate, setSlotDate] = useState('');
  const [slotNotes, setSlotNotes] = useState('');
  const [slotSaving, setSlotSaving] = useState(false);

  // Delete slot confirm
  const [deleteSlotDialog, setDeleteSlotDialog] = useState<MulaqatSlot | null>(null);

  // View delegation members dialog
  const [viewDelegation, setViewDelegation] = useState<Delegation | null>(null);

  // Assign delegation to slot (in slot card)
  const [assignSlotId, setAssignSlotId] = useState<string | null>(null);
  const [assignDelegationValue, setAssignDelegationValue] = useState('');

  // Assign slot from delegation table row
  const [rowAssignDialog, setRowAssignDialog] = useState<Delegation | null>(null);
  const [rowAssignSlotValue, setRowAssignSlotValue] = useState('');

  // Change head in view dialog
  const [changeHeadValue, setChangeHeadValue] = useState('');

  // Delete delegation confirm
  const [deleteDelegationDialog, setDeleteDelegationDialog] = useState<Delegation | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [{ data: slotData }, { data: delData }] = await Promise.all([
      supabase.from('mulaqat_slots').select('*').order('date'),
      supabase
        .from('delegations')
        .select('id, country, managed_by, managed_by_name, head_of_delegation_id, head_of_delegation_name, slot_id, delegation_members(*), mulaqat_slots(name, date)')
        .order('country'),
    ]);
    if (slotData) setSlots(slotData as MulaqatSlot[]);
    if (delData) setDelegations(delData as Delegation[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();

    // Real-time subscriptions
    const slotSub = supabase
      .channel('admin-mulaqat-slots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mulaqat_slots' }, fetchAll)
      .subscribe();

    const delSub = supabase
      .channel('admin-mulaqat-delegations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delegations' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delegation_members' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(slotSub);
      supabase.removeChannel(delSub);
    };
  }, [fetchAll]);

  // ── Derived stats ────────────────────────────────────────────────────────────

  const totalGuests = useMemo(
    () => delegations.reduce((sum, d) => sum + d.delegation_members.length, 0),
    [delegations],
  );
  const unassignedCount = useMemo(
    () => delegations.filter(d => !d.slot_id).length,
    [delegations],
  );

  // ── Slot CRUD ────────────────────────────────────────────────────────────────

  const openAddSlot = () => {
    setSlotName('');
    setSlotDate('');
    setSlotNotes('');
    setSlotDialog({ mode: 'add' });
  };

  const openEditSlot = (slot: MulaqatSlot) => {
    setSlotName(slot.name);
    setSlotDate(slot.date ?? '');
    setSlotNotes(slot.notes ?? '');
    setSlotDialog({ mode: 'edit', slot });
  };

  const handleSaveSlot = async () => {
    if (!slotName.trim() || !slotDate) { toast.error('Name and date are required'); return; }
    if (!user) return;
    setSlotSaving(true);
    try {
      if (slotDialog?.mode === 'add') {
        const { error } = await supabase.from('mulaqat_slots').insert({
          name: slotName.trim(),
          date: slotDate,
          notes: slotNotes.trim() || null,
          is_active: true,
          created_by: user.id,
        });
        if (error) throw error;
        toast.success('Slot created successfully');
      } else if (slotDialog?.slot) {
        const { error } = await supabase
          .from('mulaqat_slots')
          .update({ name: slotName.trim(), date: slotDate, notes: slotNotes.trim() || null })
          .eq('id', slotDialog.slot.id);
        if (error) throw error;
        toast.success('Slot updated');
      }
      setSlotDialog(null);
      fetchAll();
    } catch {
      toast.error('Failed to save slot');
    } finally {
      setSlotSaving(false);
    }
  };

  const handleDeleteSlot = async () => {
    if (!deleteSlotDialog) return;
    const hasDelegations = delegations.some(d => d.slot_id === deleteSlotDialog.id);
    if (hasDelegations) {
      toast.error('Remove all delegations from this slot first');
      setDeleteSlotDialog(null);
      return;
    }
    const { error } = await supabase.from('mulaqat_slots').delete().eq('id', deleteSlotDialog.id);
    if (error) { toast.error('Failed to delete slot'); return; }
    toast.success('Slot deleted');
    setDeleteSlotDialog(null);
    fetchAll();
  };

  // ── Delegation-slot assignment ────────────────────────────────────────────────

  const removeDelegationFromSlot = async (delegation: Delegation) => {
    const { error } = await supabase
      .from('delegations')
      .update({ slot_id: null })
      .eq('id', delegation.id);
    if (error) { toast.error('Failed to remove delegation'); return; }
    toast.success(`${delegation.country} removed from slot`);
    fetchAll();
    if (viewDelegation?.id === delegation.id)
      setViewDelegation(prev => prev ? { ...prev, slot_id: null, mulaqat_slots: null } : null);
  };

  const handleAssignToSlot = async (slotId: string, delegationId: string) => {
    if (!delegationId) return;
    const { error } = await supabase
      .from('delegations')
      .update({ slot_id: slotId })
      .eq('id', delegationId);
    if (error) { toast.error('Failed to assign delegation'); return; }
    const del = delegations.find(d => d.id === delegationId);
    toast.success(`${del?.country ?? 'Delegation'} assigned to slot`);
    setAssignSlotId(null);
    setAssignDelegationValue('');
    fetchAll();
  };

  const handleRowAssignSlot = async () => {
    if (!rowAssignDialog || !rowAssignSlotValue) return;
    const slotVal = rowAssignSlotValue === '__none__' ? null : rowAssignSlotValue;
    const { error } = await supabase
      .from('delegations')
      .update({ slot_id: slotVal })
      .eq('id', rowAssignDialog.id);
    if (error) { toast.error('Failed to update slot'); return; }
    toast.success(slotVal ? 'Slot assigned' : 'Slot removed');
    setRowAssignDialog(null);
    setRowAssignSlotValue('');
    fetchAll();
  };

  // ── Change head ───────────────────────────────────────────────────────────────

  const handleChangeHead = async (delegation: Delegation, guestId: string) => {
    if (!guestId) return;
    const member = delegation.delegation_members.find(m => m.guest_id === guestId);
    if (!member) return;

    await supabase
      .from('delegation_members')
      .update({ is_head: false })
      .eq('delegation_id', delegation.id);
    await supabase
      .from('delegation_members')
      .update({ is_head: true })
      .eq('delegation_id', delegation.id)
      .eq('guest_id', guestId);
    const { error } = await supabase
      .from('delegations')
      .update({ head_of_delegation_id: guestId, head_of_delegation_name: member.guest_name })
      .eq('id', delegation.id);
    if (error) { toast.error('Failed to update head'); return; }
    toast.success(`${member.guest_name} is now head of delegation`);
    setChangeHeadValue('');
    fetchAll();
    setViewDelegation(prev =>
      prev?.id === delegation.id
        ? { ...prev, head_of_delegation_id: guestId, head_of_delegation_name: member.guest_name }
        : prev,
    );
  };

  // ── Delete delegation ─────────────────────────────────────────────────────────

  const handleDeleteDelegation = async () => {
    if (!deleteDelegationDialog) return;
    const del = deleteDelegationDialog;
    if (del.delegation_members.length > 0) {
      toast.error('Remove all members before deleting this delegation');
      setDeleteDelegationDialog(null);
      return;
    }
    await supabase.from('delegation_members').delete().eq('delegation_id', del.id);
    const { error } = await supabase.from('delegations').delete().eq('id', del.id);
    if (error) { toast.error('Failed to delete delegation'); return; }
    toast.success(`${del.country} delegation deleted`);
    setDeleteDelegationDialog(null);
    fetchAll();
  };

  // ── Filtered delegations ──────────────────────────────────────────────────────

  const filteredDelegations = useMemo(() => {
    return delegations.filter(d => {
      if (delegationFilter === 'assigned' && !d.slot_id) return false;
      if (delegationFilter === 'unassigned' && d.slot_id) return false;
      if (delegationSearch && !d.country.toLowerCase().includes(delegationSearch.toLowerCase())) return false;
      return true;
    });
  }, [delegations, delegationFilter, delegationSearch]);

  const unassignedDelegations = useMemo(
    () => delegations.filter(d => !d.slot_id),
    [delegations],
  );

  const toggleSlotExpanded = (slotId: string) =>
    setExpandedSlots(prev => {
      const next = new Set(prev);
      next.has(slotId) ? next.delete(slotId) : next.add(slotId);
      return next;
    });

  const getDelegationsForSlot = (slotId: string) =>
    delegations.filter(d => d.slot_id === slotId);

  const chipCls = (active: boolean) =>
    active
      ? 'bg-[#2D5A45] text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all'
      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#F5F0E8] transition-all';

  if (!user) return null;

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
              <button
                key={i}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/admin/mulaqat'
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
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
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-[#2D5A45]" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Mulaqat Management</h1>
              </div>
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-3 hover:bg-[#F5F0E8] rounded-lg px-3 py-2 transition-colors"
                >
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
                    <button
                      onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
                    >
                      <User className="w-4 h-4 text-[#4A4A4A]" />
                      Profile
                    </button>
                    <button
                      onClick={() => { logout(); navigate('/login'); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* ── Stats bar ── */}
          <div className="bg-white border-b border-[#E8E3DB] px-6 py-3">
            <div className="flex items-center gap-6 text-sm text-[#4A4A4A]">
              <span>
                <span className="font-semibold text-[#1A1A1A]">{slots.length}</span> slot{slots.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[#D4CFC7]">|</span>
              <span>
                <span className="font-semibold text-[#1A1A1A]">{delegations.length}</span> delegation{delegations.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[#D4CFC7]">|</span>
              <span>
                <span className="font-semibold text-[#1A1A1A]">{totalGuests}</span> total guests
              </span>
              <span className="text-[#D4CFC7]">|</span>
              <span className={unassignedCount > 0 ? 'text-amber-600 font-medium' : ''}>
                <span className="font-semibold">{unassignedCount}</span> unassigned delegation{unassignedCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="p-6 max-w-7xl mx-auto space-y-8">

            {/* ══ SECTION A: Slot Management ══ */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#2D5A45]" />
                  <h2 className="text-lg font-semibold text-[#1A1A1A]">Mulaqat Slots</h2>
                  <span className="text-sm text-[#4A4A4A]">({slots.length})</span>
                </div>
                <Button
                  onClick={openAddSlot}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8 px-3 text-sm"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Slot
                </Button>
              </div>

              {loading ? (
                <Card className="shadow-sm">
                  <CardContent className="flex items-center justify-center py-10">
                    <div className="w-6 h-6 border-2 border-[#2D5A45] border-t-transparent rounded-full animate-spin" />
                  </CardContent>
                </Card>
              ) : slots.length === 0 ? (
                <Card className="shadow-sm">
                  <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                    <Calendar className="w-10 h-10 text-gray-300" />
                    <p className="text-sm text-[#4A4A4A]">No slots created yet.</p>
                    <Button onClick={openAddSlot} variant="outline" className="mt-2 text-[#2D5A45] border-[#2D5A45]">
                      <Plus className="w-4 h-4 mr-1.5" />
                      Create First Slot
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {slots.map(slot => {
                    const slotDels = getDelegationsForSlot(slot.id);
                    const slotGuests = slotDels.reduce((s, d) => s + d.delegation_members.length, 0);
                    const isExpanded = expandedSlots.has(slot.id);
                    const isAssigning = assignSlotId === slot.id;

                    return (
                      <Card key={slot.id} className="shadow-sm bg-white">
                        {/* Slot header row */}
                        <CardHeader className="py-3 px-4">
                          <div className="flex items-center justify-between gap-3">
                            <button
                              onClick={() => toggleSlotExpanded(slot.id)}
                              className="flex items-center gap-2 text-left flex-1 min-w-0"
                            >
                              {isExpanded
                                ? <ChevronDown className="w-4 h-4 text-[#4A4A4A] flex-shrink-0" />
                                : <ChevronRight className="w-4 h-4 text-[#4A4A4A] flex-shrink-0" />}
                              <div className="min-w-0">
                                <span className="font-semibold text-[#1A1A1A]">{slot.name}</span>
                                {slot.date && (
                                  <span className="text-sm text-[#4A4A4A] ml-2">— {formatDate(slot.date)}</span>
                                )}
                              </div>
                            </button>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <div className="text-right text-xs text-[#4A4A4A]">
                                <span className="font-medium text-[#1A1A1A]">{slotDels.length}</span> delegation{slotDels.length !== 1 ? 's' : ''}
                                <span className="mx-1.5 text-[#D4CFC7]">·</span>
                                <span className="font-medium text-[#1A1A1A]">{slotGuests}</span> guests
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openEditSlot(slot)}
                                  title="Edit slot"
                                  className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteSlotDialog(slot)}
                                  title="Delete slot"
                                  className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                          {slot.notes && (
                            <p className="text-xs text-[#4A4A4A] mt-1 ml-6 italic">{slot.notes}</p>
                          )}
                        </CardHeader>

                        {isExpanded && (
                          <CardContent className="pt-0 px-4 pb-4">
                            <div className="border-t border-[#E8E3DB] pt-3 space-y-2">
                              {slotDels.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">No delegations assigned to this slot.</p>
                              ) : (
                                <table className="w-full text-sm">
                                  <tbody className="divide-y divide-[#F0EDE8]">
                                    {slotDels.map(del => (
                                      <tr key={del.id} className="hover:bg-[#FAFAF9]">
                                        <td className="py-2 pr-3 font-medium text-[#1A1A1A] w-40">
                                          {del.country}
                                        </td>
                                        <td className="py-2 pr-3 text-xs text-[#4A4A4A]">
                                          {del.delegation_members.length} guest{del.delegation_members.length !== 1 ? 's' : ''}
                                        </td>
                                        <td className="py-2 pr-3 text-xs text-[#4A4A4A]">
                                          {del.head_of_delegation_name
                                            ? <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" />{del.head_of_delegation_name}</span>
                                            : <span className="text-gray-400 italic">No head</span>}
                                        </td>
                                        <td className="py-2 text-xs text-[#4A4A4A]">{del.managed_by_name ?? '—'}</td>
                                        <td className="py-2 pl-3 text-right">
                                          <button
                                            onClick={() => removeDelegationFromSlot(del)}
                                            title="Remove from slot"
                                            className="p-1 rounded text-red-400 hover:bg-red-50 transition-colors"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}

                              {/* Assign delegation to slot */}
                              {unassignedDelegations.length > 0 && (
                                isAssigning ? (
                                  <div className="flex items-center gap-2 pt-1">
                                    <select
                                      value={assignDelegationValue}
                                      onChange={e => setAssignDelegationValue(e.target.value)}
                                      className="flex-1 px-2 py-1.5 border border-[#D4CFC7] rounded-md text-xs bg-white focus:border-[#2D5A45] focus:outline-none"
                                    >
                                      <option value="">Select delegation...</option>
                                      {unassignedDelegations.map(d => (
                                        <option key={d.id} value={d.id}>
                                          {d.country} ({d.delegation_members.length} guests)
                                        </option>
                                      ))}
                                    </select>
                                    <Button
                                      onClick={() => handleAssignToSlot(slot.id, assignDelegationValue)}
                                      disabled={!assignDelegationValue}
                                      className="bg-[#2D5A45] hover:bg-[#234839] text-white h-7 px-2.5 text-xs"
                                    >
                                      Assign
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() => { setAssignSlotId(null); setAssignDelegationValue(''); }}
                                      className="h-7 px-2.5 text-xs"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setAssignSlotId(slot.id); setAssignDelegationValue(''); }}
                                    className="flex items-center gap-1.5 text-xs text-[#2D5A45] hover:text-[#234839] font-medium pt-1 transition-colors"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    Assign Delegation to this Slot
                                  </button>
                                )
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

            {/* ══ SECTION B: All Delegations ══ */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-[#2D5A45]" />
                <h2 className="text-lg font-semibold text-[#1A1A1A]">All Delegations</h2>
                <span className="text-sm text-[#4A4A4A]">({filteredDelegations.length})</span>
              </div>

              <Card className="shadow-sm">
                <CardContent className="p-4 space-y-3">
                  {/* Filter bar */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Input
                        value={delegationSearch}
                        onChange={e => setDelegationSearch(e.target.value)}
                        placeholder="Search by country..."
                        className="border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      {(['all', 'assigned', 'unassigned'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setDelegationFilter(f)}
                          className={chipCls(delegationFilter === f)}
                        >
                          {f === 'all' ? 'All' : f === 'assigned' ? 'Assigned' : 'Unassigned'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Table */}
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
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Guests</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Head of Delegation</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Managed By</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Slot</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E3DB]">
                          {filteredDelegations.map(del => (
                            <tr key={del.id} className="hover:bg-[#FAFAFA]">
                              <td className="px-3 py-3 font-medium text-[#1A1A1A]">{del.country}</td>
                              <td className="px-3 py-3 text-[#4A4A4A]">
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                  {del.delegation_members.length}
                                </Badge>
                              </td>
                              <td className="px-3 py-3 text-[#4A4A4A]">
                                {del.head_of_delegation_name
                                  ? <span className="flex items-center gap-1 text-sm"><Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />{del.head_of_delegation_name}</span>
                                  : <span className="text-xs text-gray-400 italic">None assigned</span>}
                              </td>
                              <td className="px-3 py-3 text-sm text-[#4A4A4A]">{del.managed_by_name ?? '—'}</td>
                              <td className="px-3 py-3">
                                {del.mulaqat_slots
                                  ? (
                                    <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                                      <Calendar className="w-3 h-3" />
                                      {del.mulaqat_slots.name}
                                      {del.mulaqat_slots.date && <span className="text-green-500">· {formatDate(del.mulaqat_slots.date)}</span>}
                                    </span>
                                  )
                                  : <span className="text-xs text-amber-600 font-medium">Unassigned</span>}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => { setViewDelegation(del); setChangeHeadValue(''); }}
                                    title="View members"
                                    className="p-1.5 rounded-md text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => { setRowAssignDialog(del); setRowAssignSlotValue(del.slot_id ?? '__none__'); }}
                                    title="Assign slot"
                                    className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 transition-colors"
                                  >
                                    <Calendar className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteDelegationDialog(del)}
                                    title="Delete delegation"
                                    className="p-1.5 rounded-md text-red-400 hover:bg-red-50 transition-colors"
                                  >
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
          </div>
        </main>
      </div>

      {/* ── Add/Edit Slot Dialog ── */}
      <Dialog open={!!slotDialog} onOpenChange={open => { if (!open) setSlotDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#2D5A45]" />
              {slotDialog?.mode === 'add' ? 'Add Mulaqat Slot' : 'Edit Slot'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Slot Name <span className="text-red-500">*</span></label>
              <Input
                value={slotName}
                onChange={e => setSlotName(e.target.value)}
                placeholder="e.g. Slot 1, Morning Session"
                className="border-[#D4CFC7] focus:border-[#2D5A45]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Date <span className="text-red-500">*</span></label>
              <Input
                type="date"
                value={slotDate}
                onChange={e => setSlotDate(e.target.value)}
                className="border-[#D4CFC7] focus:border-[#2D5A45]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Notes <span className="text-xs text-[#4A4A4A] font-normal">(optional)</span></label>
              <textarea
                value={slotNotes}
                onChange={e => setSlotNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={3}
                className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlotDialog(null)}>Cancel</Button>
            <Button
              onClick={handleSaveSlot}
              disabled={slotSaving || !slotName.trim() || !slotDate}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              {slotDialog?.mode === 'add' ? (
                <><Plus className="w-4 h-4 mr-1.5" />Create Slot</>
              ) : (
                <><Pencil className="w-4 h-4 mr-1.5" />Save Changes</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Slot Confirm ── */}
      <Dialog open={!!deleteSlotDialog} onOpenChange={open => { if (!open) setDeleteSlotDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Slot
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Delete <span className="font-semibold">{deleteSlotDialog?.name}</span>? This cannot be undone.
            {delegations.some(d => d.slot_id === deleteSlotDialog?.id) && (
              <span className="block mt-2 text-red-600 font-medium">
                This slot has delegations assigned. Remove them first.
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSlotDialog(null)}>Cancel</Button>
            <Button onClick={handleDeleteSlot} variant="destructive">
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Slot from table row ── */}
      <Dialog open={!!rowAssignDialog} onOpenChange={open => { if (!open) { setRowAssignDialog(null); setRowAssignSlotValue(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#2D5A45]" />
              Assign Slot — {rowAssignDialog?.country}
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <label className="text-sm font-medium text-[#1A1A1A] block mb-1.5">Mulaqat Slot</label>
            <select
              value={rowAssignSlotValue}
              onChange={e => setRowAssignSlotValue(e.target.value)}
              className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
            >
              <option value="__none__">— No slot (unassign) —</option>
              {slots.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.date ? ` — ${formatDate(s.date)}` : ''}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRowAssignDialog(null); setRowAssignSlotValue(''); }}>Cancel</Button>
            <Button onClick={handleRowAssignSlot} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Delegation Members ── */}
      <Dialog open={!!viewDelegation} onOpenChange={open => { if (!open) { setViewDelegation(null); setChangeHeadValue(''); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#2D5A45]" />
              {viewDelegation?.country} Delegation
            </DialogTitle>
          </DialogHeader>
          {viewDelegation && (
            <div className="space-y-4 py-1">
              <div className="text-sm text-[#4A4A4A] space-y-1">
                <p>Managed by: <span className="font-medium text-[#1A1A1A]">{viewDelegation.managed_by_name ?? '—'}</span></p>
                {viewDelegation.mulaqat_slots
                  ? <p>Slot: <span className="font-medium text-[#1A1A1A]">{viewDelegation.mulaqat_slots.name}{viewDelegation.mulaqat_slots.date ? ` — ${formatDate(viewDelegation.mulaqat_slots.date)}` : ''}</span></p>
                  : <p>Slot: <span className="text-amber-600 font-medium">Unassigned</span></p>}
              </div>

              {/* Member list */}
              <div className="border border-[#E8E3DB] rounded-lg overflow-hidden">
                {viewDelegation.delegation_members.length === 0 ? (
                  <p className="text-sm text-gray-400 italic p-4 text-center">No members</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {viewDelegation.delegation_members.map(m => {
                        const isHead = viewDelegation.head_of_delegation_id === m.guest_id;
                        return (
                          <tr key={m.id} className="hover:bg-[#FAFAFA]">
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                {isHead && <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                                <span className={`font-medium ${isHead ? 'text-[#1A1A1A]' : 'text-[#4A4A4A]'}`}>
                                  {m.guest_name}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-[#4A4A4A]">
                              {isHead ? 'Head of Delegation' : 'Member'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Actions */}
              {viewDelegation.delegation_members.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {/* Change head */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <select
                      value={changeHeadValue}
                      onChange={e => setChangeHeadValue(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-[#D4CFC7] rounded-md text-xs bg-white focus:border-[#2D5A45] focus:outline-none"
                    >
                      <option value="">Change Head...</option>
                      {viewDelegation.delegation_members
                        .filter(m => m.guest_id !== viewDelegation.head_of_delegation_id)
                        .map(m => (
                          <option key={m.id} value={m.guest_id}>{m.guest_name}</option>
                        ))}
                    </select>
                    <Button
                      onClick={() => handleChangeHead(viewDelegation, changeHeadValue)}
                      disabled={!changeHeadValue}
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-white h-7 px-2.5 text-xs"
                    >
                      <Star className="w-3 h-3 mr-1" />
                      Set Head
                    </Button>
                  </div>

                  {/* Assign/change slot */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <select
                      defaultValue={viewDelegation.slot_id ?? '__none__'}
                      onChange={async e => {
                        const v = e.target.value === '__none__' ? null : e.target.value;
                        const { error } = await supabase
                          .from('delegations')
                          .update({ slot_id: v })
                          .eq('id', viewDelegation.id);
                        if (error) { toast.error('Failed to update slot'); return; }
                        const slotObj = slots.find(s => s.id === v);
                        toast.success(v ? `Assigned to ${slotObj?.name}` : 'Slot removed');
                        fetchAll();
                        setViewDelegation(prev => prev ? {
                          ...prev,
                          slot_id: v,
                          mulaqat_slots: slotObj ? { name: slotObj.name, date: slotObj.date } : null,
                        } : null);
                      }}
                      className="flex-1 px-2 py-1.5 border border-[#D4CFC7] rounded-md text-xs bg-white focus:border-[#2D5A45] focus:outline-none"
                    >
                      <option value="__none__">— No slot —</option>
                      {slots.map(s => (
                        <option key={s.id} value={s.id}>{s.name}{s.date ? ` (${formatDate(s.date)})` : ''}</option>
                      ))}
                    </select>
                    <span className="text-xs text-[#4A4A4A] flex-shrink-0">slot</span>
                  </div>
                </div>
              )}

              {viewDelegation.delegation_members.length === 0 && (
                <div className="text-center">
                  <Button
                    onClick={() => { setViewDelegation(null); setDeleteDelegationDialog(viewDelegation); }}
                    variant="destructive"
                    size="sm"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete Empty Delegation
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setViewDelegation(null); setChangeHeadValue(''); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Delegation Confirm ── */}
      <Dialog open={!!deleteDelegationDialog} onOpenChange={open => { if (!open) setDeleteDelegationDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Delegation
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Delete the <span className="font-semibold">{deleteDelegationDialog?.country}</span> delegation?
            {(deleteDelegationDialog?.delegation_members.length ?? 0) > 0 && (
              <span className="block mt-2 text-red-600 font-medium">
                This delegation still has {deleteDelegationDialog?.delegation_members.length} member(s). Remove them from Mulaqat first.
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDelegationDialog(null)}>Cancel</Button>
            <Button
              onClick={handleDeleteDelegation}
              variant="destructive"
              disabled={(deleteDelegationDialog?.delegation_members.length ?? 0) > 0}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
