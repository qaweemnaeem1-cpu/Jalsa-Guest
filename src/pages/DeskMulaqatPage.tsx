import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useDelegations } from '@/hooks/useDelegations';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Calendar, ChevronDown, ChevronRight, LogOut, User,
  UserCheck, UserMinus, UserPlus, Star, Users, Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { ProfileDialog, getRoleDisplayLabel } from '@/components/ProfileDialog';
import { DESK_NAV } from '@/lib/navItems';
import type { Guest } from '@/types';

interface MulaqatSlot {
  id: string;
  name: string;
  date?: string;
  time?: string;
  capacity?: number;
}

interface DelegationDetail {
  id: string;
  country: string;
  head_of_delegation_id: string | null;
  head_of_delegation_name: string | null;
  slot_id: string | null;
}

export default function DeskMulaqatPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests, updateGuest } = useGuests();
  const { enableMulaqat, disableMulaqat } = useDelegations();

  const [delegationDetails, setDelegationDetails] = useState<DelegationDetail[]>([]);
  const [slots, setSlots] = useState<MulaqatSlot[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Dialogs
  const [addGuestDialog, setAddGuestDialog] = useState<{ country: string; delegationId: string } | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [removeDialog, setRemoveDialog] = useState<Guest | null>(null);
  const [makeHeadDialog, setMakeHeadDialog] = useState<{ guest: Guest; delegationId: string } | null>(null);

  const assignedCountries = useMemo(() => user?.assignedCountries ?? [], [user?.assignedCountries]);

  // Fetch rich delegation details and slots
  const fetchData = useCallback(async () => {
    const [{ data: delData }, { data: slotData }] = await Promise.all([
      supabase
        .from('delegations')
        .select('id, country, head_of_delegation_id, head_of_delegation_name, slot_id')
        .in('country', assignedCountries.length > 0 ? assignedCountries : ['']),
      supabase
        .from('mulaqat_slots')
        .select('id, name, date, time, capacity')
        .order('date'),
    ]);
    if (delData) setDelegationDetails(delData as DelegationDetail[]);
    if (slotData) setSlots(slotData as MulaqatSlot[]);
  }, [assignedCountries]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const reviewCount = useMemo(() =>
    guests.filter(g => assignedCountries.includes(g.country) && g.status === 'Awaiting Review').length,
    [guests, assignedCountries]);

  const rejectedCount = useMemo(() =>
    guests.filter(g => assignedCountries.includes(g.country) && g.status === 'Rejected').length,
    [guests, assignedCountries]);

  if (!user) return null;

  const getDelegationForCountry = (country: string) =>
    delegationDetails.find(d => d.country === country) ?? null;

  const getMulaqatGuests = (country: string) =>
    guests.filter(g => g.country === country && g.mulaqat === true);

  const getEligibleGuests = (country: string) =>
    guests.filter(g => g.country === country && !g.mulaqat &&
      (g.status === 'Approved' || g.status === 'Accommodated'));

  const toggleExpanded = (country: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(country) ? next.delete(country) : next.add(country);
      return next;
    });

  const getSlotName = (slotId: string | null) => {
    if (!slotId) return null;
    return slots.find(s => s.id === slotId)?.name ?? null;
  };

  const cardBorderCls = (country: string) => {
    const del = getDelegationForCountry(country);
    const members = getMulaqatGuests(country);
    if (members.length === 0) return 'border-l-4 border-l-gray-300';
    if (del?.slot_id) return 'border-l-4 border-l-[#2D5A45]';
    return 'border-l-4 border-l-amber-400';
  };

  // Slot assignment
  const handleSlotChange = async (country: string, slotId: string) => {
    const del = getDelegationForCountry(country);
    if (!del) return;
    const val = slotId === '__none__' ? null : slotId;
    const { error } = await supabase
      .from('delegations')
      .update({ slot_id: val })
      .eq('id', del.id);
    if (error) { toast.error('Failed to update slot'); return; }
    setDelegationDetails(prev =>
      prev.map(d => d.id === del.id ? { ...d, slot_id: val } : d));
    toast.success(val ? 'Slot assigned' : 'Slot removed');
  };

  // Make head
  const handleMakeHead = async () => {
    if (!makeHeadDialog) return;
    const { guest, delegationId } = makeHeadDialog;
    // Reset all members
    await supabase
      .from('delegation_members')
      .update({ is_head: false })
      .eq('delegation_id', delegationId);
    // Set new head
    await supabase
      .from('delegation_members')
      .update({ is_head: true })
      .eq('delegation_id', delegationId)
      .eq('guest_id', guest.id);
    // Update delegation row
    const { error } = await supabase
      .from('delegations')
      .update({ head_of_delegation_id: guest.id, head_of_delegation_name: guest.fullName })
      .eq('id', delegationId);
    if (error) { toast.error('Failed to update head'); setMakeHeadDialog(null); return; }
    setDelegationDetails(prev =>
      prev.map(d => d.id === delegationId
        ? { ...d, head_of_delegation_id: guest.id, head_of_delegation_name: guest.fullName }
        : d));
    toast.success(`${guest.fullName} is now head of delegation`);
    setMakeHeadDialog(null);
  };

  // Remove from delegation
  const handleRemove = async () => {
    if (!removeDialog) return;
    await disableMulaqat(removeDialog);
    setRemoveDialog(null);
  };

  // Add guest to delegation
  const handleAddGuest = async () => {
    if (!addGuestDialog || !selectedGuestId) return;
    const guest = guests.find(g => g.id === selectedGuestId);
    if (!guest) return;
    await enableMulaqat(guest);
    setAddGuestDialog(null);
    setSelectedGuestId('');
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        {/* Sidebar */}
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
                  item.href === '/desk/mulaqat'
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </span>
                {item.href === '/desk/review' && reviewCount > 0 && (
                  <span className="bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {reviewCount}
                  </span>
                )}
                {item.href === '/desk/rejected' && rejectedCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {rejectedCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <SidebarUserFooter />
        </aside>

        <main className="flex-1 ml-64">
          {/* Header */}
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
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-3 hover:bg-[#F5F0E8] rounded-lg px-3 py-2 transition-colors"
                >
                  <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-medium">
                    {user.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                    <p className="text-xs text-[#4A4A4A]">{getRoleDisplayLabel(user)}</p>
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

          <div className="p-6 max-w-7xl mx-auto space-y-8">

            {/* ── SECTION A: My Delegations ── */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-[#2D5A45]" />
                <h2 className="text-lg font-semibold text-[#1A1A1A]">My Delegations</h2>
                <span className="text-sm text-[#4A4A4A]">({assignedCountries.length})</span>
              </div>

              {assignedCountries.length === 0 ? (
                <Card className="shadow-sm">
                  <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                    <Users className="w-10 h-10 text-gray-300" />
                    <p className="text-sm text-[#4A4A4A]">No countries assigned to you.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {assignedCountries.map(country => {
                    const del = getDelegationForCountry(country);
                    const members = getMulaqatGuests(country);
                    const eligible = getEligibleGuests(country);
                    const isExpanded = expanded.has(country);
                    const slotName = getSlotName(del?.slot_id ?? null);

                    return (
                      <Card key={country} className={`shadow-sm bg-white ${cardBorderCls(country)}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base font-semibold text-[#1A1A1A]">
                                {country}
                              </CardTitle>
                              {del?.head_of_delegation_name && (
                                <p className="text-xs text-[#4A4A4A] mt-0.5 flex items-center gap-1">
                                  <Star className="w-3 h-3 text-amber-500" />
                                  Head: {del.head_of_delegation_name}
                                </p>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={members.length > 0
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-gray-50 text-gray-500 border-gray-200'}
                            >
                              {members.length} member{members.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>

                          {/* Slot assignment */}
                          <div className="mt-2">
                            <label className="text-xs text-[#4A4A4A] block mb-1">Mulaqat Slot</label>
                            {slots.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">No slots available</p>
                            ) : (
                              <select
                                value={del?.slot_id ?? '__none__'}
                                onChange={e => handleSlotChange(country, e.target.value)}
                                className="w-full px-2 py-1.5 border border-[#D4CFC7] rounded-md text-xs bg-white focus:border-[#2D5A45] focus:outline-none"
                              >
                                <option value="__none__">— No slot —</option>
                                {slots.map(s => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}{s.date ? ` (${s.date})` : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                            {slotName && (
                              <p className="text-xs text-[#2D5A45] mt-1 font-medium">Assigned: {slotName}</p>
                            )}
                          </div>
                        </CardHeader>

                        <CardContent className="pt-0">
                          {/* Member list toggle */}
                          <button
                            onClick={() => toggleExpanded(country)}
                            className="w-full flex items-center justify-between text-xs text-[#4A4A4A] hover:text-[#1A1A1A] py-1 transition-colors"
                          >
                            <span className="font-medium">Members</span>
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-1.5">
                              {members.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-2 text-center">No members yet</p>
                              ) : (
                                members.map(g => {
                                  const isHead = del?.head_of_delegation_id === g.id;
                                  return (
                                    <div
                                      key={g.id}
                                      className="flex items-center justify-between bg-[#F9F8F6] rounded-md px-2.5 py-2"
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        {isHead && (
                                          <Star className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                        )}
                                        <span className="text-xs font-medium text-[#1A1A1A] truncate">
                                          {g.fullName}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        {!isHead && del && (
                                          <button
                                            onClick={() => setMakeHeadDialog({ guest: g, delegationId: del.id })}
                                            title="Make head of delegation"
                                            className="p-1 rounded text-amber-600 hover:bg-amber-50 transition-colors"
                                          >
                                            <UserCheck className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => setRemoveDialog(g)}
                                          title="Remove from delegation"
                                          className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                          <UserMinus className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}

                              {/* Add guest button */}
                              {eligible.length > 0 && del && (
                                <button
                                  onClick={() => {
                                    setAddGuestDialog({ country, delegationId: del.id });
                                    setSelectedGuestId('');
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 mt-1 py-1.5 rounded-md border border-dashed border-[#2D5A45] text-xs text-[#2D5A45] hover:bg-[#F0F7F4] transition-colors"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  Add Guest
                                </button>
                              )}
                            </div>
                          )}

                          {!isExpanded && members.length > 0 && del && (
                            <button
                              onClick={() => {
                                setExpanded(prev => new Set([...prev, country]));
                                if (eligible.length > 0)
                                  setAddGuestDialog({ country, delegationId: del.id });
                              }}
                              style={{ display: 'none' }}
                            />
                          )}

                          {/* Quick add when collapsed and no members */}
                          {!isExpanded && members.length === 0 && del && eligible.length > 0 && (
                            <button
                              onClick={() => {
                                setAddGuestDialog({ country, delegationId: del.id });
                                setSelectedGuestId('');
                              }}
                              className="w-full flex items-center justify-center gap-1.5 mt-2 py-1.5 rounded-md border border-dashed border-[#2D5A45] text-xs text-[#2D5A45] hover:bg-[#F0F7F4] transition-colors"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              Add First Member
                            </button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── SECTION B: All Mulaqat Slots ── */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-[#2D5A45]" />
                <h2 className="text-lg font-semibold text-[#1A1A1A]">All Mulaqat Slots</h2>
                <span className="text-sm text-[#4A4A4A]">({slots.length})</span>
              </div>

              {slots.length === 0 ? (
                <Card className="shadow-sm">
                  <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                    <Calendar className="w-10 h-10 text-gray-300" />
                    <p className="text-sm text-[#4A4A4A]">No mulaqat slots configured yet.</p>
                    <p className="text-xs text-gray-400">Slots are managed by the super admin.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {slots.map(slot => {
                    const delegationsInSlot = delegationDetails.filter(d => d.slot_id === slot.id);
                    const myDelegationsInSlot = delegationsInSlot.filter(d =>
                      assignedCountries.includes(d.country));
                    const otherDelegations = delegationsInSlot.filter(d =>
                      !assignedCountries.includes(d.country));
                    const totalMembers = delegationsInSlot.reduce((sum, d) => {
                      return sum + getMulaqatGuests(d.country).length;
                    }, 0);

                    return (
                      <Card key={slot.id} className="shadow-sm bg-white">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base font-semibold text-[#1A1A1A]">
                                {slot.name}
                              </CardTitle>
                              {slot.date && (
                                <p className="text-xs text-[#4A4A4A] mt-0.5">
                                  {slot.date}{slot.time ? ` · ${slot.time}` : ''}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                                {delegationsInSlot.length} delegation{delegationsInSlot.length !== 1 ? 's' : ''}
                              </Badge>
                              {slot.capacity != null && (
                                <span className="text-[10px] text-[#4A4A4A]">
                                  {totalMembers}/{slot.capacity} members
                                </span>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-1.5">
                          {delegationsInSlot.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No delegations assigned</p>
                          ) : (
                            <>
                              {myDelegationsInSlot.map(d => (
                                <div key={d.id} className="flex items-center gap-1.5 bg-green-50 rounded-md px-2.5 py-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#2D5A45] flex-shrink-0" />
                                  <span className="text-xs font-medium text-[#1A1A1A]">{d.country}</span>
                                  {d.head_of_delegation_name && (
                                    <span className="text-[10px] text-[#4A4A4A] ml-auto truncate">
                                      Head: {d.head_of_delegation_name}
                                    </span>
                                  )}
                                </div>
                              ))}
                              {otherDelegations.map(d => (
                                <div key={d.id} className="flex items-center gap-1.5 bg-[#F9F8F6] rounded-md px-2.5 py-1.5 opacity-60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                                  <span className="text-xs text-[#4A4A4A]">{d.country}</span>
                                </div>
                              ))}
                            </>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      {/* Make Head Dialog */}
      <Dialog open={!!makeHeadDialog} onOpenChange={open => { if (!open) setMakeHeadDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Make Head of Delegation
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Set <span className="font-semibold">{makeHeadDialog?.guest.fullName}</span> as the head of the{' '}
            <span className="font-semibold">{makeHeadDialog?.guest.country}</span> delegation?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMakeHeadDialog(null)}>Cancel</Button>
            <Button onClick={handleMakeHead} className="bg-amber-500 hover:bg-amber-600 text-white">
              <Star className="w-4 h-4 mr-1.5" />
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Dialog */}
      <Dialog open={!!removeDialog} onOpenChange={open => { if (!open) setRemoveDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="w-5 h-5 text-red-500" />
              Remove from Delegation
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#4A4A4A] py-2">
            Remove <span className="font-semibold">{removeDialog?.fullName}</span> from the delegation?
            Their Mulaqat flag will be cleared.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialog(null)}>Cancel</Button>
            <Button onClick={handleRemove} variant="destructive">
              <UserMinus className="w-4 h-4 mr-1.5" />
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Guest Dialog */}
      <Dialog
        open={!!addGuestDialog}
        onOpenChange={open => { if (!open) { setAddGuestDialog(null); setSelectedGuestId(''); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#2D5A45]" />
              Add Guest to Delegation
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-[#4A4A4A]">
              Select an approved guest from <span className="font-semibold">{addGuestDialog?.country}</span>:
            </p>
            <select
              value={selectedGuestId}
              onChange={e => setSelectedGuestId(e.target.value)}
              className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
            >
              <option value="">Select a guest...</option>
              {addGuestDialog && getEligibleGuests(addGuestDialog.country).map(g => (
                <option key={g.id} value={g.id}>
                  {g.fullName} ({g.referenceNumber})
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddGuestDialog(null); setSelectedGuestId(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleAddGuest}
              disabled={!selectedGuestId}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              Add to Delegation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
