import { Fragment, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useDesignations } from '@/hooks/useDesignations';
import { useDelegations } from '@/hooks/useDelegations';
import { getVisibility } from '@/utils/guestFieldVisibility';
import { supabase } from '@/lib/supabase';
import { insertCorrectionMessage, insertRejectionMessage } from '@/lib/guestMessages';
import type { GuestMessage } from '@/lib/guestMessages';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { DepartmentSelect } from '@/components/DepartmentSelect';
import { DelegationCombobox } from '@/components/DelegationCombobox';
import { getTierBadgeLabel, getTierBadgeClass } from '@/lib/constants';
import {
  Eye,
  Pencil,
  Check,
  AlertCircle,
  X,
  Star,
  Plane,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Guest } from '@/types';

// ── Status badge helper ────────────────────────────────────────────────────────

function statusCls(status: string) {
  if (status === 'Approved' || status === 'Accommodated') return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'Awaiting Review') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Needs Correction') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (status === 'Rejected') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

// ── Types ──────────────────────────────────────────────────────────────────────

type MulaqatType = 'Delegation' | 'Daftari' | 'Both';

interface MulaqatState {
  guest: Guest;
  type: MulaqatType;
  country: string;
  saving: boolean;
}

export interface FamilyMemberDrawerProps {
  /** The guest whose row was clicked — used to find all group members via familyGroupId. */
  headGuest: Guest;
  /** Full guests array from useGuests context, used to find siblings. */
  allGuests: Guest[];
  onViewMember: (guestId: string) => void;
  onEditMember: (guestId: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function FamilyMemberDrawer({
  headGuest,
  allGuests,
  onViewMember,
  onEditMember,
}: FamilyMemberDrawerProps) {
  const { user } = useAuth();
  const { updateGuest } = useGuests();
  const { activeDesignations } = useDesignations();
  const { setMulaqatType, changeDelegationCountry, getDelegationCountry } = useDelegations();

  // ── Inline-action state ────────────────────────────────────────────────────
  const [activeAction, setActiveAction] = useState<{
    memberId: string;
    type: 'correct' | 'reject';
  } | null>(null);
  const [actionText, setActionText] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // ── Mulaqat dialog state ───────────────────────────────────────────────────
  const [mulaqat, setMulaqat] = useState<MulaqatState | null>(null);

  // ── Latest correction messages per member ─────────────────────────────────
  const [latestCorrections, setLatestCorrections] = useState<Map<string, GuestMessage>>(new Map());

  // ── Derived data ───────────────────────────────────────────────────────────
  const visibility = getVisibility(user);

  const isAdmin = user?.role === 'super-admin' || user?.role === 'desk-in-charge';
  const isCoordinator = user?.role === 'coordinator';
  const isDeptHead = user?.role === 'department-head';
  const isTransportHead = user?.role === 'driver' && user?.isHeadDriver === true;
  const isLocManager = user?.role === 'location-manager';
  const canAssignMulaqat = user?.role === 'super-admin' || user?.role === 'desk-in-charge';

  // Designation tier lookup map
  const tierMap = new Map(activeDesignations.map(d => [d.name, d.tier]));

  // All members in this family group, head first then alphabetical
  const members = headGuest.familyGroupId
    ? allGuests
        .filter(g => g.familyGroupId === headGuest.familyGroupId)
        .sort((a, b) => {
          if (a.isHeadOfFamily && !b.isHeadOfFamily) return -1;
          if (!a.isHeadOfFamily && b.isHeadOfFamily) return 1;
          return a.fullName.localeCompare(b.fullName);
        })
    : [];

  const correctionIds = members.filter(m => m.status === 'Needs Correction').map(m => m.id);

  useEffect(() => {
    if (correctionIds.length === 0) { setLatestCorrections(new Map()); return; }
    supabase
      .from('guest_messages')
      .select('*')
      .in('guest_id', correctionIds)
      .eq('is_system', false)
      .eq('action_type', 'correction')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, GuestMessage>();
        data.forEach(row => {
          if (!map.has(row.guest_id)) map.set(row.guest_id, row as GuestMessage);
        });
        setLatestCorrections(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctionIds.join(',')]);

  // Guard: no family data or role can't see family members
  if (!user || !visibility.familyMembers || members.length === 0) return null;

  const approvedCount = members.filter(
    m => m.status === 'Approved' || m.status === 'Accommodated',
  ).length;
  const headFlight = headGuest.arrivalFlightNumber;
  const differentFlightCount = members.filter(
    m => m.arrivalFlightNumber && m.arrivalFlightNumber !== headFlight,
  ).length;

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleApprove = async (member: Guest) => {
    setSavingId(member.id);
    await updateGuest(member.id, {
      status: 'Approved',
      reviewedBy: user.id,
      reviewedAt: new Date().toISOString(),
    });
    setSavingId(null);
    toast.success(`${member.fullName} approved`);
  };

  const handleSubmitCorrection = async (member: Guest) => {
    if (!actionText.trim()) { toast.error('Please enter a correction message'); return; }
    setSavingId(member.id);
    await updateGuest(member.id, {
      status: 'Needs Correction',
      reviewedBy: user.id,
      reviewedAt: new Date().toISOString(),
    });
    insertCorrectionMessage(member.id, user, actionText.trim());
    setActiveAction(null);
    setActionText('');
    setSavingId(null);
    toast.success(`Correction sent for ${member.fullName}`);
  };

  const handleSubmitReject = async (member: Guest) => {
    if (!actionText.trim()) { toast.error('Rejection reason is required'); return; }
    setSavingId(member.id);
    await updateGuest(member.id, {
      status: 'Rejected',
      rejectionReason: actionText.trim(),
      reviewedBy: user.id,
      reviewedAt: new Date().toISOString(),
    });
    insertRejectionMessage(member.id, user, actionText.trim());
    setActiveAction(null);
    setActionText('');
    setSavingId(null);
    toast.success(`${member.fullName} rejected`);
  };

  const handleSaveMulaqat = async () => {
    if (!mulaqat) return;
    setMulaqat(prev => prev ? { ...prev, saving: true } : null);
    try {
      await setMulaqatType(mulaqat.guest, mulaqat.type);
      if (
        (mulaqat.type === 'Delegation' || mulaqat.type === 'Both') &&
        mulaqat.country !== mulaqat.guest.country
      ) {
        await changeDelegationCountry(mulaqat.guest, mulaqat.country);
      }
      const label =
        mulaqat.type === 'Delegation' || mulaqat.type === 'Both'
          ? `${mulaqat.country} Delegation Mulaqat`
          : 'Daftari Mulaqat';
      toast.success(`${mulaqat.guest.fullName} assigned to ${label}`);
      setMulaqat(null);
    } catch {
      toast.error('Failed to assign Mulaqat');
      setMulaqat(prev => prev ? { ...prev, saving: false } : null);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const photoCell = (member: Guest) =>
    member.photoUrl ? (
      <img src={member.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
    ) : (
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
          member.isHeadOfFamily ? 'bg-[#2D5A45]' : 'bg-[#6B8F7A]'
        }`}
      >
        {member.fullName.charAt(0)}
      </div>
    );

  const designationCell = (member: Guest, withTier: boolean) => {
    const desigs = Array.isArray(member.designation)
      ? member.designation
      : member.designation
      ? [member.designation]
      : [];
    if (desigs.length === 0) return <span className="text-gray-300 text-xs">—</span>;
    const first = desigs[0];
    const tier = tierMap.get(first);
    const badge = getTierBadgeLabel(tier);
    return (
      <span className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-[#1A1A1A]">
          {desigs.length > 1 ? `${first} +${desigs.length - 1}` : first}
        </span>
        {withTier && badge && (
          <span className={`text-[9px] font-bold px-1 py-px rounded-full shrink-0 ${getTierBadgeClass(tier)}`}>
            {badge}
          </span>
        )}
      </span>
    );
  };

  const flightCell = (member: Guest) => {
    const mFlight = member.arrivalFlightNumber;
    const isSame = !mFlight || mFlight === headFlight;
    if (isSame)
      return (
        <span className="text-gray-400 text-xs flex items-center gap-1">
          <Plane className="w-3 h-3" /> Same
        </span>
      );
    const date = member.arrival_date ?? '';
    const term = member.arrivalTerminal ?? '';
    return (
      <span className="text-orange-600 text-xs flex items-center gap-1 flex-wrap">
        <AlertCircle className="w-3 h-3 shrink-0" />
        <span className="font-medium">{mFlight}</span>
        {date && <span className="text-gray-400">{date}</span>}
        {term && <span className="text-gray-400">{term}</span>}
      </span>
    );
  };

  const isHighTier = (member: Guest) => {
    const desigs = Array.isArray(member.designation)
      ? member.designation
      : member.designation
      ? [member.designation]
      : [];
    return desigs.some(d => {
      const t = tierMap.get(d);
      return t === '1(a)' || t === '1(b)' || t === '2';
    });
  };

  const canEditMember = (member: Guest): boolean => {
    if (isAdmin) return true;
    if (isCoordinator) return member.status !== 'Approved' && member.status !== 'Rejected';
    return false;
  };

  /** Summary line shown for admin/DI below already-processed members. */
  const statusSummaryRow = (member: Guest) => {
    const { status } = member;
    if (status === 'Approved' || status === 'Accommodated') {
      return (
        <tr className="bg-white">
          <td colSpan={20} className="px-10 pb-2 pt-0">
            <span className="text-green-700 text-xs font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              {status}
              {member.assignedDepartment && ` · Dept: ${member.assignedDepartment}`}
            </span>
          </td>
        </tr>
      );
    }
    if (status === 'Needs Correction') {
      const latest = latestCorrections.get(member.id);
      return (
        <tr className="bg-white">
          <td colSpan={20} className="px-10 pb-2 pt-0">
            <div className="text-orange-700 text-xs">
              <span className="flex items-center gap-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5" /> Needs Correction
              </span>
              {latest && (
                <p className="italic text-orange-600/70 ml-5 mt-0.5">
                  {latest.message.slice(0, 80)}{latest.message.length > 80 ? '…' : ''}
                </p>
              )}
            </div>
          </td>
        </tr>
      );
    }
    if (status === 'Rejected') {
      return (
        <tr className="bg-white">
          <td colSpan={20} className="px-10 pb-2 pt-0">
            <div className="text-red-700 text-xs">
              <span className="flex items-center gap-1 font-medium">
                <X className="w-3.5 h-3.5" /> Rejected
              </span>
              {member.rejectionReason && (
                <p className="italic text-red-600/70 ml-5 mt-0.5">
                  {member.rejectionReason.slice(0, 80)}
                  {member.rejectionReason.length > 80 ? '…' : ''}
                </p>
              )}
            </div>
          </td>
        </tr>
      );
    }
    return null;
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#FAFAF8] border-t border-[#E8E3DB]">

      {/* ── Summary strip ── */}
      <div className="px-5 py-2 bg-[#F0F7F4] border-b border-[#E8E3DB] flex flex-wrap items-center gap-3 text-xs text-[#4A4A4A]">
        <span className="font-semibold text-[#2D5A45]">
          👨‍👩‍👧‍👦 {headGuest.familyName ?? `${headGuest.fullName.split(' ').slice(-1)[0]} Family`}
          {' '}· {members.length} members
        </span>
        {visibility.flightDetails && headFlight && (
          <span className="flex items-center gap-1">
            <Plane className="w-3 h-3 text-[#4A4A4A]" /> {headFlight}
          </span>
        )}
        {visibility.flightDetails && differentFlightCount > 0 && (
          <span className="text-orange-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {differentFlightCount} on different flight
          </span>
        )}
        {visibility.status && (
          <span>
            {approvedCount > 0 && <span className="text-green-700 font-medium">{approvedCount} Approved</span>}
            {approvedCount > 0 && members.length - approvedCount > 0 && ' · '}
            {members.length - approvedCount > 0 && <span>{members.length - approvedCount} Pending</span>}
          </span>
        )}
      </div>

      {/* ── Members table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F5F0E8]/60 border-b border-[#E8E3DB]">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-8">#</th>
              {visibility.photo && (
                <th className="px-3 py-2 w-10" />
              )}
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Name</th>
              {visibility.designation && (
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Designation</th>
              )}
              {/* Flight — admin, DI, dept head, transport head */}
              {visibility.flightDetails && (isAdmin || isDeptHead || isTransportHead) && (
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Flight</th>
              )}
              {/* Status — admin, DI, coordinator */}
              {visibility.status && (isAdmin || isCoordinator) && (
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Status</th>
              )}
              {/* Wheelchair — transport head */}
              {visibility.wheelchair && isTransportHead && (
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Wheelchair</th>
              )}
              {/* Room / Wheelchair / CheckIn — location manager */}
              {visibility.roomBed && isLocManager && (
                <>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Room</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Wheelchair</th>
                  {visibility.checkInOut && (
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Check-in</th>
                  )}
                </>
              )}
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F0EDE7]">
            {members.map((member, idx) => {
              const isAwaiting = member.status === 'Awaiting Review';
              const isApproved = member.status === 'Approved' || member.status === 'Accommodated';
              const needsCorrection = member.status === 'Needs Correction';
              const isRejected = member.status === 'Rejected';
              const isActive = activeAction?.memberId === member.id;
              const isSaving = savingId === member.id;
              const latestCorrection = latestCorrections.get(member.id);

              return (
                <Fragment key={member.id}>
                  {/* ── Main member row ── */}
                  <tr className={`transition-colors ${isActive ? 'bg-blue-50/40' : 'hover:bg-white'}`}>

                    {/* Index */}
                    <td className="px-3 py-2.5 text-[10px] text-gray-400 font-mono">{idx + 1}</td>

                    {/* Photo */}
                    {visibility.photo && (
                      <td className="px-3 py-2.5">{photoCell(member)}</td>
                    )}

                    {/* Name */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {visibility.specialStar && isHighTier(member) && (
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                        )}
                        <span className="font-medium text-[#1A1A1A] text-sm">{member.fullName}</span>
                        {member.isHeadOfFamily && (
                          <span className="text-[9px] bg-[#2D5A45]/10 text-[#2D5A45] px-1.5 py-0.5 rounded font-medium">
                            Head
                          </span>
                        )}
                        {member.relationship && !member.isHeadOfFamily && (
                          <span className="text-[10px] text-gray-400 capitalize">{member.relationship}</span>
                        )}
                      </div>
                    </td>

                    {/* Designation */}
                    {visibility.designation && (
                      <td className="px-3 py-2.5">
                        {designationCell(member, visibility.tierBadge)}
                      </td>
                    )}

                    {/* Flight */}
                    {visibility.flightDetails && (isAdmin || isDeptHead || isTransportHead) && (
                      <td className="px-3 py-2.5">{flightCell(member)}</td>
                    )}

                    {/* Status badge */}
                    {visibility.status && (isAdmin || isCoordinator) && (
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusCls(member.status)}`}>
                          {member.status}
                        </Badge>
                      </td>
                    )}

                    {/* Wheelchair (transport head) */}
                    {visibility.wheelchair && isTransportHead && (
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {member.wheelchairRequired ? '✅ Yes' : 'No'}
                      </td>
                    )}

                    {/* Room / Wheelchair / CheckIn (location manager) */}
                    {visibility.roomBed && isLocManager && (
                      <>
                        <td className="px-3 py-2.5 text-xs font-mono text-[#1A1A1A]">
                          {member.roomAssignment ?? member.placedLocation ?? (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">
                          {member.wheelchairRequired ? '✅ Yes' : 'No'}
                        </td>
                        {visibility.checkInOut && (
                          <td className="px-3 py-2.5 text-xs">
                            {member.status === 'Accommodated'
                              ? <span className="text-green-600">✅</span>
                              : <span className="text-gray-400">⏳</span>
                            }
                          </td>
                        )}
                      </>
                    )}

                    {/* Actions column */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1 flex-wrap">

                        {/* Admin / DI: approval actions for Awaiting Review */}
                        {isAdmin && isAwaiting && (
                          <>
                            <button
                              onClick={() => handleApprove(member)}
                              disabled={isSaving}
                              className="px-2 py-1 text-[10px] font-semibold rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-40 transition-colors"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => {
                                setActiveAction({ memberId: member.id, type: 'correct' });
                                setActionText('');
                              }}
                              className="px-2 py-1 text-[10px] font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                            >
                              ⚠ Correction
                            </button>
                            <button
                              onClick={() => {
                                setActiveAction({ memberId: member.id, type: 'reject' });
                                setActionText('');
                              }}
                              className="px-2 py-1 text-[10px] font-semibold rounded-md bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}

                        {/* Admin / DI: department dropdown for Awaiting Review */}
                        {isAdmin && isAwaiting && visibility.department && (
                          <div
                            onClick={e => e.stopPropagation()}
                            className="w-32"
                          >
                            <DepartmentSelect
                              value={member.assignedDepartment ?? ''}
                              onValueChange={v =>
                                updateGuest(member.id, {
                                  assignedDepartment: v || undefined,
                                  assignedDepartmentAt: v ? new Date().toISOString() : undefined,
                                  assignedDepartmentBy: user.id,
                                })
                              }
                              placeholder="Dept…"
                              className="h-6 text-[10px]"
                            />
                          </div>
                        )}

                        {/* Mulaqat button — super-admin + desk-in-charge, approved members only */}
                        {canAssignMulaqat && isApproved && (
                          <button
                            onClick={() =>
                              setMulaqat({
                                guest: member,
                                type:
                                  member.mulaqatType && member.mulaqatType !== 'No'
                                    ? (member.mulaqatType as MulaqatType)
                                    : 'Delegation',
                                country:
                                  getDelegationCountry(member.delegationId) ?? member.country,
                                saving: false,
                              })
                            }
                            className={`px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors ${
                              member.mulaqat
                                ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            }`}
                          >
                            {member.mulaqat ? '★ Mulaqat' : '+ Mulaqat'}
                          </button>
                        )}

                        {/* 👁 View — all roles */}
                        <button
                          onClick={() => onViewMember(member.id)}
                          className="p-1 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded transition-colors"
                          title="View details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* ✏️ Edit — admin, coordinator (not for Approved/Rejected members) */}
                        {canEditMember(member) && (
                          <button
                            onClick={() => onEditMember(member.id)}
                            className="p-1 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Coordinator: Fix button for Needs Correction */}
                        {isCoordinator && needsCorrection && (
                          <button
                            onClick={() => onEditMember(member.id)}
                            className="px-2 py-1 text-[10px] font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                          >
                            Fix
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* ── Status summary sub-row (admin/DI, non-awaiting members) ── */}
                  {isAdmin && !isAwaiting && !isActive && statusSummaryRow(member)}

                  {/* ── Coordinator: correction remark sub-row ── */}
                  {isCoordinator && needsCorrection && latestCorrection && (
                    <tr className="bg-amber-50/30">
                      <td colSpan={20} className="px-10 pb-2 pt-0">
                        <p className="text-xs text-orange-600 italic">
                          ⚠️ {latestCorrection.message}
                        </p>
                      </td>
                    </tr>
                  )}

                  {/* ── Coordinator: rejection reason sub-row ── */}
                  {isCoordinator && isRejected && member.rejectionReason && (
                    <tr className="bg-red-50/30">
                      <td colSpan={20} className="px-10 pb-2 pt-0">
                        <p className="text-xs text-red-600 italic">
                          ❌ {member.rejectionReason}
                        </p>
                      </td>
                    </tr>
                  )}

                  {/* ── Inline action form (correction / rejection textarea) ── */}
                  {isActive && (
                    <tr className="bg-blue-50/30">
                      <td colSpan={20} className="px-10 py-3">
                        <div className="flex flex-col gap-2 max-w-xl">
                          <p className="text-xs font-semibold text-[#1A1A1A]">
                            {activeAction.type === 'correct'
                              ? `Correction note for ${member.fullName}:`
                              : `Rejection reason for ${member.fullName} (required):`}
                          </p>
                          <textarea
                            value={actionText}
                            onChange={e => setActionText(e.target.value)}
                            placeholder={
                              activeAction.type === 'correct'
                                ? 'Describe what needs to be corrected…'
                                : 'State the reason for rejection…'
                            }
                            className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 resize-none h-16 focus:outline-none focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]/30"
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <button
                              disabled={isSaving}
                              onClick={() =>
                                activeAction.type === 'correct'
                                  ? handleSubmitCorrection(member)
                                  : handleSubmitReject(member)
                              }
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-40 transition-colors ${
                                activeAction.type === 'correct'
                                  ? 'bg-amber-600 hover:bg-amber-700'
                                  : 'bg-red-600 hover:bg-red-700'
                              }`}
                            >
                              {isSaving
                                ? 'Saving…'
                                : activeAction.type === 'correct'
                                ? 'Send Correction'
                                : 'Confirm Reject'}
                            </button>
                            <button
                              onClick={() => {
                                setActiveAction(null);
                                setActionText('');
                              }}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
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

      {/* ── Mulaqat assignment dialog ── */}
      <Dialog open={!!mulaqat} onOpenChange={open => { if (!open) setMulaqat(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Mulaqat — {mulaqat?.guest.fullName}</DialogTitle>
          </DialogHeader>

          {mulaqat && (
            <div className="space-y-4 py-1">

              {/* Type toggle */}
              <div>
                <p className="text-sm font-medium text-[#1A1A1A] mb-2">Type</p>
                <div className="flex gap-2">
                  {(['Delegation', 'Daftari', 'Both'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setMulaqat(prev => prev ? { ...prev, type: t } : null)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        mulaqat.type === t
                          ? t === 'Delegation'
                            ? 'bg-green-600 text-white border-green-600'
                            : t === 'Daftari'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delegation country picker */}
              {(mulaqat.type === 'Delegation' || mulaqat.type === 'Both') && (
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A] mb-1.5">
                    Country / Group
                  </p>
                  <DelegationCombobox
                    value={mulaqat.country}
                    onChange={v => setMulaqat(prev => prev ? { ...prev, country: v } : null)}
                    compact
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Pre-filled from guest's country. Change if needed.
                  </p>
                </div>
              )}

              {/* Daftari note */}
              {mulaqat.type === 'Daftari' && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  Day and slot assignment is configured in the Mulaqat management page.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setMulaqat(null)}
              disabled={mulaqat?.saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveMulaqat}
              disabled={mulaqat?.saving}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              {mulaqat?.saving ? 'Saving…' : 'Assign Mulaqat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
