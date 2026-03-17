import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Send, Pencil, Trash2, X, Plane, Building2 } from 'lucide-react';
import { AuditTimeline } from '@/components/AuditTimeline';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useAuditTrail } from '@/hooks/useAuditTrail';
import {
  GUEST_STATUS_LABELS, ROLE_LABELS, VISA_STATUS_LABELS,
  DEFAULT_DESIGNATIONS, COUNTRIES,
} from '@/lib/constants';
import { useDepartments } from '@/hooks/useDepartments';
import { DepartmentSelect } from '@/components/DepartmentSelect';
import type { Guest, GuestStatus, UserRole } from '@/types';

// ─── Security helper ──────────────────────────────────────────────────────────

/** Strip any HTML/script tags and trim whitespace before persisting. */
const stripHtml = (s?: string) => (s ?? '').replace(/<[^>]*>/g, '').trim();

// ─── Zod schema (validation + sanitisation in onSave) ─────────────────────────

/** Compute age in years from a YYYY-MM-DD string. Returns `null` if unparseable. */
const calcAge = (dob?: string): number | null => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
};

const editSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name is too long')
    .regex(/^[\p{L}\s\-']+$/u, "Only letters, spaces, hyphens, and apostrophes allowed"),
  passportNumber: z
    .string()
    .min(1, 'Passport number required')
    .max(20, 'Passport number too long')
    .regex(/^[A-Za-z0-9]+$/, 'Alphanumeric characters only'),
  country: z.string().min(1, 'Country required'),
  gender: z.enum(['male', 'female']),
  // age is derived from dateOfBirth — not included in the form
  dateOfBirth: z.string().optional(),
  contactNumber: z
    .string()
    .min(1, 'Contact number required')
    .regex(/^[0-9\s+()\-]+$/, 'Only digits, spaces, +, () and - allowed'),
  email: z
    .string()
    .refine(
      v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
      'Invalid email format',
    )
    .optional(),
  designation: z.string().optional(),
  guestType: z.enum(['individual', 'family']),
  wheelchairRequired: z.boolean(),
  specialNeeds: z.string().optional(),
  visaStatus: z.enum(['not-required', 'pending', 'approved', 'rejected', 'expired']),
  arrivalFlightNumber: z.string().optional(),
  arrivalAirport: z.string().optional(),
  arrivalTerminal: z.string().optional(),
  arrivalTime: z.string().optional(),
  departureFlightNumber: z.string().optional(),
  departureAirport: z.string().optional(),
  departureTerminal: z.string().optional(),
  departureTime: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getStatusBadgeStyle = (status: string): string => {
  switch (status) {
    case 'Awaiting Review':  return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Needs Correction': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'Approved':         return 'bg-green-50 text-green-700 border-green-200';
    case 'Accommodated':     return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Rejected':         return 'bg-red-50 text-red-700 border-red-200';
    default:                 return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};

const getStatusDotColor = (status: GuestStatus): string => {
  switch (status) {
    case 'Awaiting Review':  return 'bg-amber-500';
    case 'Needs Correction': return 'bg-orange-500';
    case 'Approved':         return 'bg-green-500';
    case 'Accommodated':     return 'bg-emerald-600';
    case 'Rejected':         return 'bg-red-600';
    default:                 return 'bg-gray-400';
  }
};

const getRemarkBubbleStyle = (role: UserRole): string => {
  switch (role) {
    case 'desk-in-charge': return 'bg-[#FEE2E2] border-l-4 border-l-[#EF4444]';
    case 'coordinator':    return 'bg-[#E8F5EE] border-l-4 border-l-[#2D5A45]';
    case 'super-admin':    return 'bg-[#EFF6FF] border-l-4 border-l-[#3B82F6]';
    default:               return 'bg-[#F5F0E8] border-l-4 border-l-gray-400';
  }
};


// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldCard({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-[#E8E3DB]">
      <p className="text-xs text-[#4A4A4A] mb-1">{label}</p>
      <p className="text-sm font-medium text-[#1A1A1A]">
        {value !== undefined && value !== null && value !== ''
          ? value
          : <span className="text-[#4A4A4A]">—</span>}
      </p>
    </div>
  );
}

function PlainField({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[#4A4A4A] mb-1">{label}</p>
      <p className="text-sm font-medium text-[#1A1A1A]">
        {value !== undefined && value !== null && value !== ''
          ? value
          : <span className="text-[#4A4A4A]">—</span>}
      </p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-2 mb-4 border-b border-[#E8E3DB]">
      <h4 className="text-xs font-semibold uppercase tracking-widest text-[#4A4A4A]">{children}</h4>
    </div>
  );
}

/** Wraps a form field with a label and optional validation error. */
function EditField({
  label, required, error, children,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-[#4A4A4A] mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </p>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface GuestViewModalProps {
  guest: Guest | null;
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** When true the modal opens in edit mode with form fields instead of read-only cards. */
  isEditMode?: boolean;
}

export function GuestViewModal({
  guest, open, onClose, onEdit, onDelete, isEditMode = false,
}: GuestViewModalProps) {
  const { user } = useAuth();
  const { updateGuest, addRemark } = useGuests();
  const { getEntriesForGuest, addEntry } = useAuditTrail();
  const { departments, getDeptBadgeCls, getLocPillCls } = useDepartments();

  const [commentText, setCommentText] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [deptEditValue, setDeptEditValue] = useState('');
  const [locEditValue, setLocEditValue] = useState('');

  const canComment    = user ? ['desk-in-charge', 'super-admin', 'coordinator'].includes(user.role) : false;
  const canAssignRoom = user ? ['super-admin', 'accommodation'].includes(user.role) : false;
  const isSuperAdmin  = user?.role === 'super-admin';
  const isCoordinator = user?.role === 'coordinator';
  const canEditDept   = isEditMode && user ? ['super-admin', 'desk-in-charge'].includes(user.role) : false;
  const isCoordinatorNeedsCorrection =
    isCoordinator && guest?.status === 'Needs Correction' && guest?.submittedBy === user?.id;

  // ─── Form ──────────────────────────────────────────────────────────────────

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    reset,
    watch,
    formState: { errors },
  } = useForm<EditFormData>({ resolver: zodResolver(editSchema) });

  /** Age shown in edit mode — auto-calculated from the DOB field, falls back to stored value. */
  const displayAge = calcAge(watch('dateOfBirth')) ?? guest?.age ?? '—';

  // Sync form values whenever the guest or open state changes.
  useEffect(() => {
    if (guest && open) {
      setRoomInput(guest.roomAssignment ?? '');
      setCommentText('');
      setDeptEditValue(guest.assignedDepartment ?? '');
      setLocEditValue(guest.placedLocation ?? '');
      reset({
        fullName:             guest.fullName,
        passportNumber:       guest.passportNumber,
        country:              guest.country,
        gender:               guest.gender,
        dateOfBirth:          guest.dateOfBirth ?? '',
        contactNumber:        guest.contactNumber,
        email:                guest.email ?? '',
        designation:          guest.designation ?? '',
        guestType:            guest.guestType,
        wheelchairRequired:   guest.wheelchairRequired,
        specialNeeds:         guest.specialNeeds ?? '',
        visaStatus:           guest.visaStatus,
        arrivalFlightNumber:  guest.arrivalFlightNumber ?? '',
        arrivalAirport:       guest.arrivalAirport ?? '',
        arrivalTerminal:      guest.arrivalTerminal ?? '',
        arrivalTime:          guest.arrivalTime ?? '',
        departureFlightNumber: guest.departureFlightNumber ?? '',
        departureAirport:     guest.departureAirport ?? '',
        departureTerminal:    guest.departureTerminal ?? '',
        departureTime:        guest.departureTime ?? '',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest?.id, open]);

  useEffect(() => {
    if (guest) setRoomInput(guest.roomAssignment ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest?.roomAssignment]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  /** Extract sanitised field values from form data into an update patch. */
  const buildPatch = (data: EditFormData, existingGuest: typeof guest) => {
    const dob = stripHtml(data.dateOfBirth) || undefined;
    return {
      fullName:              stripHtml(data.fullName),
      passportNumber:        stripHtml(data.passportNumber),
      country:               stripHtml(data.country),
      gender:                data.gender,
      age:                   calcAge(dob) ?? existingGuest?.age,
      dateOfBirth:           dob,
      contactNumber:         stripHtml(data.contactNumber),
      email:                 stripHtml(data.email) || undefined,
      designation:           stripHtml(data.designation) || undefined,
      guestType:             data.guestType,
      wheelchairRequired:    data.wheelchairRequired,
      specialNeeds:          stripHtml(data.specialNeeds) || undefined,
      visaStatus:            data.visaStatus,
      arrivalFlightNumber:   stripHtml(data.arrivalFlightNumber) || undefined,
      arrivalAirport:        stripHtml(data.arrivalAirport) || undefined,
      arrivalTerminal:       stripHtml(data.arrivalTerminal) || undefined,
      arrivalTime:           stripHtml(data.arrivalTime) || undefined,
      departureFlightNumber: stripHtml(data.departureFlightNumber) || undefined,
      departureAirport:      stripHtml(data.departureAirport) || undefined,
      departureTerminal:     stripHtml(data.departureTerminal) || undefined,
      departureTime:         stripHtml(data.departureTime) || undefined,
    };
  };

  const onSave = (data: EditFormData) => {
    if (!guest || !user) return;
    const allowed =
      user.role === 'super-admin' ||
      user.role === 'desk-in-charge' ||
      (user.role === 'coordinator' && guest.status === 'Needs Correction' && guest.submittedBy === user.id);
    if (!allowed) {
      toast.error('You do not have permission to edit guests');
      return;
    }
    updateGuest(guest.id, buildPatch(data, guest));
    toast.success('Guest details updated successfully');
    onClose();
  };

  const onSaveAndResubmit = async () => {
    if (!guest || !user) return;
    const valid = await trigger();
    if (!valid) return;
    const data = getValues();
    updateGuest(guest.id, {
      ...buildPatch(data, guest),
      status:        'Awaiting Review',
      resubmitCount: (guest.resubmitCount ?? 0) + 1,
      resubmittedAt: new Date().toISOString(),
    });
    toast.success(`${guest.fullName} re-submitted for review`);
    onClose();
  };

  const handleAddComment = () => {
    if (!guest || !user || !commentText.trim() || !canComment) return;
    addRemark(guest.id, {
      authorId:   user.id,
      authorName: user.name,
      authorRole: user.role,
      message:    commentText.trim(),
    });
    setCommentText('');
  };

  const handleSaveDept = () => {
    if (!guest || !user) return;
    const oldDept = guest.assignedDepartment ?? '';
    const oldLoc  = guest.placedLocation ?? '';
    if (deptEditValue === oldDept && locEditValue === oldLoc) {
      toast.info('No changes made');
      return;
    }
    const now = new Date().toISOString();
    updateGuest(guest.id, {
      assignedDepartment:       deptEditValue || undefined,
      assignedDepartmentAt:     deptEditValue ? now : undefined,
      assignedDepartmentBy:     deptEditValue ? user.id : undefined,
      assignedDepartmentByName: deptEditValue ? user.name : undefined,
      placedLocation:           locEditValue || undefined,
      placedAt:                 locEditValue ? now : undefined,
      placedByName:             locEditValue ? user.name : undefined,
    });
    const details: string[] = [];
    if (deptEditValue !== oldDept) details.push(`Department: ${oldDept || 'None'} → ${deptEditValue || 'None'}`);
    if (locEditValue  !== oldLoc)  details.push(`Location: ${oldLoc || 'None'} → ${locEditValue || 'None'}`);
    addEntry({
      guestId:        guest.id,
      guestName:      guest.fullName,
      guestReference: guest.referenceNumber,
      type:           'assignment',
      action:         'Department assignment updated',
      details:        details.join('; '),
      createdBy:      { id: user.id, name: user.name, role: user.role },
      createdAt:      now,
    });
    toast.success('Department assignment saved');
  };

  const handleAssignRoom = () => {
    if (!guest || !user || !canAssignRoom) return;
    updateGuest(guest.id, { roomAssignment: roomInput || undefined });
    toast.success('Room assignment updated');
  };

  if (!user || !guest) return null;

  const tabTriggerCls =
    'rounded-none border-b-2 border-transparent data-[state=active]:border-[#2D5A45] data-[state=active]:text-[#2D5A45] data-[state=active]:shadow-none data-[state=active]:bg-transparent px-3 py-3 text-xs sm:text-sm font-medium text-[#4A4A4A] hover:text-[#1A1A1A] whitespace-nowrap';

  const selectCls =
    'w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none focus:ring-1 focus:ring-[#2D5A45]';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="w-[90vw] max-w-[90vw] h-[75vh] p-0 flex flex-col overflow-hidden gap-0"
        showCloseButton={false}
      >
        {/* ── Header ── */}
        <DialogHeader className="flex-shrink-0 bg-[#D6E4D9] p-8">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-[#2D5A45] text-3xl font-bold flex-shrink-0 border-2 border-[#B5CCB9]">
              {guest.fullName.charAt(0)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <DialogTitle className="text-2xl font-bold text-slate-800 leading-tight">
                  {guest.fullName}
                </DialogTitle>
                <Badge variant="outline" className={getStatusBadgeStyle(guest.status)}>
                  {GUEST_STATUS_LABELS[guest.status]}
                </Badge>
                {isEditMode && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                    <Pencil className="w-3 h-3" />
                    Editing
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 font-mono">{guest.referenceNumber}</p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Edit button — only shown in view mode */}
              {!isEditMode && isSuperAdmin && onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-[#2D5A45] hover:text-[#234839] hover:bg-[#2D5A45]/10"
                  title="Edit guest"
                  onClick={onEdit}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
              {isSuperAdmin && onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50"
                  title="Delete guest"
                  onClick={onDelete}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-slate-500 hover:text-slate-700 hover:bg-slate-200/60"
                title="Close"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* ── Tabs ── */}
        <Tabs defaultValue="personal" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-shrink-0 border-b border-[#E8E3DB] px-6 bg-white">
            <TabsList className="h-auto p-0 bg-transparent gap-0 w-full justify-start rounded-none flex-wrap">
              <TabsTrigger value="personal" className={tabTriggerCls}>Personal Details</TabsTrigger>
              <TabsTrigger value="flight"   className={tabTriggerCls}>Flight &amp; Travel</TabsTrigger>
              <TabsTrigger value="room"     className={tabTriggerCls}>Department</TabsTrigger>
              <TabsTrigger value="remarks"  className={tabTriggerCls}>
                Remarks
                {(guest.remarks?.length ?? 0) > 0 && (
                  <span className="ml-1.5 bg-[#2D5A45] text-white text-[10px] rounded-full w-4 h-4 inline-flex items-center justify-center leading-none">
                    {guest.remarks!.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className={tabTriggerCls}>
                {isCoordinator || user?.role === 'desk-in-charge' ? 'Messages' : 'Audit Trail'}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto bg-[#F5F0E8]">

            {/* ── Tab 1: Personal Details ── */}
            <TabsContent value="personal" className="mt-0 px-8 py-6 space-y-6">
              {isEditMode ? (
                <>
                  {/* Personal Information — edit */}
                  <div>
                    <SectionHeading>Personal Information</SectionHeading>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="lg:col-span-2">
                        <EditField label="Full Name" required error={errors.fullName?.message}>
                          <Input
                            {...register('fullName')}
                            className={errors.fullName ? 'border-red-500' : ''}
                          />
                        </EditField>
                      </div>

                      <EditField label="Gender" error={errors.gender?.message}>
                        <select {...register('gender')} className={selectCls}>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </EditField>

                      <EditField label="Date of Birth" error={errors.dateOfBirth?.message}>
                        <Input type="date" {...register('dateOfBirth')} />
                      </EditField>

                      <div>
                        <p className="text-xs font-medium text-[#4A4A4A] mb-1">Age (auto-calculated)</p>
                        <div className="px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-[#F5F0E8] text-[#4A4A4A]">
                          {displayAge}
                        </div>
                      </div>

                      <EditField label="Guest Type" error={errors.guestType?.message}>
                        <select {...register('guestType')} className={selectCls}>
                          <option value="individual">Individual</option>
                          <option value="family">Family</option>
                        </select>
                      </EditField>

                      <EditField label="Visa Status" error={errors.visaStatus?.message}>
                        <select {...register('visaStatus')} className={selectCls}>
                          <option value="not-required">Not Required</option>
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                          <option value="expired">Expired</option>
                        </select>
                      </EditField>

                      <div className="flex items-center gap-2 pt-5">
                        <input
                          type="checkbox"
                          id="vm-wheelchair"
                          {...register('wheelchairRequired')}
                          className="w-4 h-4 accent-[#2D5A45]"
                        />
                        <Label htmlFor="vm-wheelchair" className="text-sm text-[#4A4A4A]">
                          Wheelchair Required
                        </Label>
                      </div>

                      <div className="lg:col-span-2">
                        <EditField label="Special Needs" error={errors.specialNeeds?.message}>
                          <textarea
                            {...register('specialNeeds')}
                            rows={2}
                            className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] outline-none resize-none"
                          />
                        </EditField>
                      </div>
                    </div>
                  </div>

                  {/* Contact Details — edit */}
                  <div>
                    <SectionHeading>Contact Details</SectionHeading>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <EditField label="Passport Number" required error={errors.passportNumber?.message}>
                        <Input
                          {...register('passportNumber')}
                          className={`font-mono ${errors.passportNumber ? 'border-red-500' : ''}`}
                        />
                      </EditField>

                      <EditField label="Contact Number" required error={errors.contactNumber?.message}>
                        <Input
                          {...register('contactNumber')}
                          className={errors.contactNumber ? 'border-red-500' : ''}
                        />
                      </EditField>

                      <EditField label="Email Address" error={errors.email?.message}>
                        <Input
                          type="email"
                          {...register('email')}
                          className={errors.email ? 'border-red-500' : ''}
                        />
                      </EditField>

                      <EditField label="Country" required error={errors.country?.message}>
                        <select
                          {...register('country')}
                          className={`${selectCls} ${errors.country ? 'border-red-500' : ''}`}
                        >
                          <option value="">Select country…</option>
                          {COUNTRIES.map(c => (
                            <option key={c.code} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </EditField>

                      <EditField label="Designation" error={errors.designation?.message}>
                        <select {...register('designation')} className={selectCls}>
                          <option value="">Select designation…</option>
                          {DEFAULT_DESIGNATIONS.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </EditField>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Personal Information — view */}
                  <div>
                    <SectionHeading>Personal Information</SectionHeading>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <FieldCard label="Full Name" value={guest.fullName} />
                      <FieldCard label="Gender" value={<span className="capitalize">{guest.gender}</span>} />
                      <FieldCard label="Date of Birth" value={guest.dateOfBirth} />
                      <FieldCard label="Age" value={guest.age} />
                      <FieldCard label="Guest Type" value={<span className="capitalize">{guest.guestType}</span>} />
                      <FieldCard label="Visa Status" value={VISA_STATUS_LABELS[guest.visaStatus]} />
                      <FieldCard
                        label="Wheelchair Required"
                        value={guest.wheelchairRequired
                          ? <span className="text-amber-700 font-medium">Yes</span>
                          : 'No'}
                      />
                      <FieldCard label="Special Needs" value={guest.specialNeeds} />
                    </div>
                  </div>

                  {/* Contact Details — view */}
                  <div>
                    <SectionHeading>Contact Details</SectionHeading>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <FieldCard label="Passport Number" value={<span className="font-mono">{guest.passportNumber}</span>} />
                      <FieldCard label="Contact Number" value={guest.contactNumber} />
                      <FieldCard label="Email Address" value={guest.email} />
                      <FieldCard label="Country" value={guest.country} />
                      <FieldCard label="Designation" value={guest.designation} />
                    </div>
                  </div>

                  {/* Family Members — view only */}
                  {guest.guestType === 'family' && guest.familyMembers.length > 0 && (
                    <div>
                      <SectionHeading>
                        Family Members ({guest.familyMembers.length + 1} total incl. primary guest)
                      </SectionHeading>
                      <div className="border border-[#E8E3DB] rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-white">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#4A4A4A]">Name</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#4A4A4A]">Age</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#4A4A4A]">Relationship</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#4A4A4A]">Gender</th>
                            </tr>
                          </thead>
                          <tbody>
                            {guest.familyMembers.map(member => (
                              <tr key={member.id} className="border-t border-[#E8E3DB] hover:bg-[#F5F0E8] transition-colors">
                                <td className="px-4 py-2.5 font-medium text-[#1A1A1A]">{member.name}</td>
                                <td className="px-4 py-2.5 text-[#4A4A4A]">{member.age}</td>
                                <td className="px-4 py-2.5 text-[#4A4A4A] capitalize">{member.relationship}</td>
                                <td className="px-4 py-2.5 text-[#4A4A4A] capitalize">{member.gender}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── Tab 2: Flight & Travel ── */}
            <TabsContent value="flight" className="mt-0 px-8 py-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Arrival */}
                <div className="bg-white rounded-xl border border-[#E8E3DB] p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#E8E3DB]">
                    <Plane className="w-4 h-4 text-[#2D5A45]" />
                    <span className="text-sm font-semibold text-[#2D5A45]">Arrival</span>
                  </div>
                  {isEditMode ? (
                    <div className="space-y-3">
                      <EditField label="Flight Number" error={errors.arrivalFlightNumber?.message}>
                        <Input {...register('arrivalFlightNumber')} placeholder="e.g. LH900" />
                      </EditField>
                      <EditField label="Airport" error={errors.arrivalAirport?.message}>
                        <Input {...register('arrivalAirport')} placeholder="e.g. LHR" />
                      </EditField>
                      <EditField label="Terminal" error={errors.arrivalTerminal?.message}>
                        <Input {...register('arrivalTerminal')} placeholder="e.g. T2" />
                      </EditField>
                      <EditField label="Date & Time" error={errors.arrivalTime?.message}>
                        <Input type="datetime-local" {...register('arrivalTime')} />
                      </EditField>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                      <PlainField label="Flight Number" value={guest.arrivalFlightNumber} />
                      <PlainField label="Airport" value={guest.arrivalAirport} />
                      <PlainField label="Terminal" value={guest.arrivalTerminal} />
                      <PlainField
                        label="Date & Time"
                        value={guest.arrivalTime
                          ? new Date(guest.arrivalTime).toLocaleString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : undefined}
                      />
                    </div>
                  )}
                </div>

                {/* Departure */}
                <div className="bg-white rounded-xl border border-[#E8E3DB] p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#E8E3DB]">
                    <Plane className="w-4 h-4 text-[#2D5A45] rotate-180" />
                    <span className="text-sm font-semibold text-[#2D5A45]">Departure</span>
                  </div>
                  {isEditMode ? (
                    <div className="space-y-3">
                      <EditField label="Flight Number" error={errors.departureFlightNumber?.message}>
                        <Input {...register('departureFlightNumber')} placeholder="e.g. LH901" />
                      </EditField>
                      <EditField label="Airport" error={errors.departureAirport?.message}>
                        <Input {...register('departureAirport')} placeholder="e.g. LHR" />
                      </EditField>
                      <EditField label="Terminal" error={errors.departureTerminal?.message}>
                        <Input {...register('departureTerminal')} placeholder="e.g. T2" />
                      </EditField>
                      <EditField label="Date & Time" error={errors.departureTime?.message}>
                        <Input type="datetime-local" {...register('departureTime')} />
                      </EditField>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                      <PlainField label="Flight Number" value={guest.departureFlightNumber} />
                      <PlainField label="Airport" value={guest.departureAirport} />
                      <PlainField label="Terminal" value={guest.departureTerminal} />
                      <PlainField
                        label="Date & Time"
                        value={guest.departureTime
                          ? new Date(guest.departureTime).toLocaleString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : undefined}
                      />
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ── Tab 3: Department ── */}
            <TabsContent value="room" className="mt-0 px-8 py-6 space-y-5">
              <div className="grid grid-cols-2 gap-6">
                {/* Department card */}
                <div className="bg-white rounded-xl border border-[#E8E3DB] p-5 space-y-3">
                  <SectionHeading>Department Assignment</SectionHeading>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-[#4A4A4A] mb-1.5">Assigned Department</p>
                      {guest.assignedDepartment ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium border ${getDeptBadgeCls(guest.assignedDepartment)}`}>
                          <Building2 className="w-3.5 h-3.5 mr-1.5" />
                          {guest.assignedDepartment}
                        </span>
                      ) : (
                        <span className="text-sm text-[#4A4A4A] italic">Not assigned</span>
                      )}
                    </div>
                    {guest.assignedDepartmentByName && (
                      <PlainField label="Assigned by" value={guest.assignedDepartmentByName} />
                    )}
                    {guest.assignedDepartmentAt && (
                      <PlainField
                        label="Assigned on"
                        value={new Date(guest.assignedDepartmentAt).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      />
                    )}
                  </div>
                </div>

                {/* Location card */}
                <div className="bg-white rounded-xl border border-[#E8E3DB] p-5 space-y-3">
                  <SectionHeading>Location Placement</SectionHeading>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-[#4A4A4A] mb-1.5">Placed Location</p>
                      {guest.placedLocation ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium border ${getLocPillCls(guest.assignedDepartment ?? '', guest.placedLocation)}`}>
                          {guest.placedLocation}
                        </span>
                      ) : (
                        <span className="text-sm text-[#4A4A4A] italic">Not placed</span>
                      )}
                    </div>
                    {guest.placedByName && (
                      <PlainField label="Placed by" value={guest.placedByName} />
                    )}
                    {guest.placedAt && (
                      <PlainField
                        label="Placed on"
                        value={new Date(guest.placedAt).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Edit controls — super-admin + desk-in-charge in edit mode only */}
              {canEditDept && (
                <div className="bg-white rounded-xl border border-[#E8E3DB] p-5 space-y-4">
                  <SectionHeading>Update Assignment</SectionHeading>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-[#4A4A4A] mb-1">Department</p>
                      <DepartmentSelect
                        value={deptEditValue}
                        onValueChange={v => {
                          setDeptEditValue(v === '__none__' ? '' : v);
                          setLocEditValue('');
                        }}
                        includeNone
                        className="w-full"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-[#4A4A4A] mb-1">Location</p>
                      <select
                        value={locEditValue}
                        onChange={e => setLocEditValue(e.target.value)}
                        disabled={!deptEditValue}
                        className={`${selectCls} ${!deptEditValue ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <option value="">None</option>
                        {(departments[deptEditValue] ?? []).map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveDept}
                    className="bg-[#2D5A45] hover:bg-[#234839] text-white"
                  >
                    <Building2 className="w-4 h-4 mr-1.5" />
                    Save Assignment
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── Tab 4: Remarks & Comments ── */}
            <TabsContent value="remarks" className="mt-0 px-8 py-6">
              <div className="space-y-3">
                {(!guest.remarks || guest.remarks.length === 0) ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-[#4A4A4A]">No remarks yet.</p>
                  </div>
                ) : (
                  guest.remarks.map(remark => (
                    <div
                      key={remark.id}
                      className={`rounded-xl p-4 ${getRemarkBubbleStyle(remark.authorRole)}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                            {remark.authorName.charAt(0)}
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-[#1A1A1A]">{remark.authorName}</span>
                            <span className="text-xs text-[#4A4A4A] ml-1.5">· {ROLE_LABELS[remark.authorRole]}</span>
                          </div>
                        </div>
                        <span className="text-xs text-[#4A4A4A]">{formatTimeAgo(remark.createdAt)}</span>
                      </div>
                      <p className="text-sm text-[#1A1A1A] pl-9">{remark.message}</p>
                    </div>
                  ))
                )}

                {canComment && (
                  <div className="mt-4 pt-4 border-t border-[#E8E3DB]">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write a comment…"
                      rows={3}
                      className="w-full border border-[#E8E3DB] rounded-xl p-3 text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] outline-none resize-none"
                    />
                    <div className="flex justify-end mt-2">
                      <Button
                        onClick={handleAddComment}
                        disabled={!commentText.trim()}
                        className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Post Comment
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Tab 5: Audit Trail / Messages ── */}
            <TabsContent value="history" className="mt-0 px-8 py-6">
              {(() => {
                const allEntries = getEntriesForGuest(guest.id);
                const filteredEntries = isCoordinator
                  ? allEntries.filter(e => e.type === 'comment' || e.type === 'status_change')
                  : undefined;
                return (
                  <AuditTimeline
                    guestId={guest.id}
                    guestName={guest.fullName}
                    guestReference={guest.referenceNumber}
                    allowComment={true}
                    overrideEntries={filteredEntries}
                  />
                );
              })()}
            </TabsContent>

          </div>{/* end scrollable body */}
        </Tabs>

        {/* ── Edit mode footer ── */}
        {isEditMode && (
          <div className="flex-shrink-0 flex justify-end gap-3 px-8 py-4 border-t border-[#E8E3DB] bg-white">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit(onSave)}
              className="bg-[#2D5A45] hover:bg-[#234a38] text-white"
            >
              Save Changes
            </Button>
            {isCoordinatorNeedsCorrection && (
              <Button
                onClick={onSaveAndResubmit}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Save &amp; Re-Submit
              </Button>
            )}
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
