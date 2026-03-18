import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Pencil, Trash2, Send } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { GUEST_STATUS_LABELS, ROLE_LABELS, VISA_STATUS_LABELS } from '@/lib/constants';
import type { Guest, GuestStatus, UserRole } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    case 'Awaiting Review':  return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Needs Correction': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'Approved':         return 'bg-green-100 text-green-700 border-green-200';
    case 'Accommodated':     return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Rejected':         return 'bg-red-100 text-red-700 border-red-200';
    default:                 return 'bg-gray-100 text-gray-600 border-gray-200';
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
    case 'desk-in-charge': return 'bg-[#FEE2E2] border-l-[3px] border-l-[#EF4444]';
    case 'coordinator': return 'bg-[#E8F5EE] border-l-[3px] border-l-[#2D5A45]';
    case 'super-admin': return 'bg-[#EFF6FF] border-l-[3px] border-l-[#3B82F6]';
    default: return 'bg-[#F5F0E8] border-l-[3px] border-l-gray-400';
  }
};

// ─── InfoRow ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex border-b border-[#E8E3DB] py-2.5 gap-4">
      <span className="w-44 shrink-0 text-sm text-[#4A4A4A]">{label}</span>
      <span className="text-sm text-[#1A1A1A] font-medium flex-1">
        {value !== undefined && value !== null && value !== ''
          ? value
          : <span className="text-[#4A4A4A] font-normal">—</span>}
      </span>
    </div>
  );
}

// ─── Zod schema ──────────────────────────────────────────────────────────────

const editSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  passportNumber: z.string().min(1, 'Passport number is required'),
  country: z.string().min(1, 'Country is required'),
  gender: z.enum(['male', 'female']),
  age: z.coerce.number().min(0).max(150),
  dateOfBirth: z.string().optional(),
  contactNumber: z.string().min(1, 'Contact number is required'),
  email: z.string().optional(),
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

// ─── Component ───────────────────────────────────────────────────────────────

export interface GuestProfilePanelProps {
  guest: Guest | null;
  open: boolean;
  onClose: () => void;
}

export function GuestProfilePanel({ guest, open, onClose }: GuestProfilePanelProps) {
  const { user } = useAuth();
  const { updateGuest, deleteGuest, addRemark } = useGuests();

  const [isEditMode, setIsEditMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [roomInput, setRoomInput] = useState('');

  const canEditDelete = user?.role === 'desk-in-charge' || user?.role === 'super-admin';
  const canComment = user
    ? ['desk-in-charge', 'super-admin', 'coordinator'].includes(user.role)
    : false;
  const canAssignRoom = user
    ? ['super-admin', 'accommodation'].includes(user.role)
    : false;

  const prevGuestIdRef = useRef<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  });

  // Reset everything when a different guest is opened or the panel re-opens
  useEffect(() => {
    const newId = guest?.id ?? null;
    if ((newId !== prevGuestIdRef.current || open) && guest && open) {
      prevGuestIdRef.current = newId;
      reset({
        fullName: guest.fullName,
        passportNumber: guest.passportNumber,
        country: guest.country,
        gender: guest.gender,
        age: guest.age,
        dateOfBirth: guest.dateOfBirth ?? '',
        contactNumber: guest.contactNumber,
        email: guest.email ?? '',
        designation: guest.designation ?? '',
        guestType: guest.guestType,
        wheelchairRequired: guest.wheelchairRequired,
        specialNeeds: guest.specialNeeds ?? '',
        visaStatus: guest.visaStatus,
        arrivalFlightNumber: guest.arrivalFlightNumber ?? '',
        arrivalAirport: guest.arrivalAirport ?? '',
        arrivalTerminal: guest.arrivalTerminal ?? '',
        arrivalTime: guest.arrivalTime ?? '',
        departureFlightNumber: guest.departureFlightNumber ?? '',
        departureAirport: guest.departureAirport ?? '',
        departureTerminal: guest.departureTerminal ?? '',
        departureTime: guest.departureTime ?? '',
      });
      setRoomInput(guest.roomAssignment ?? '');
      setIsEditMode(false);
      setDeleteDialogOpen(false);
      setDeleteConfirmText('');
      setCommentText('');
    }
    if (!open) {
      prevGuestIdRef.current = null;
      setIsEditMode(false);
    }
  // reset is stable; we intentionally key on guest?.id and open
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest?.id, open]);

  // Keep roomInput in sync when roomAssignment changes externally
  useEffect(() => {
    if (guest) setRoomInput(guest.roomAssignment ?? '');
  }, [guest?.roomAssignment]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setIsEditMode(false);
    onClose();
  };

  const onSave = (data: EditFormData) => {
    if (!guest || !user) return;
    if (!canEditDelete) {
      toast.error('You do not have permission to edit guests');
      return;
    }
    updateGuest(guest.id, {
      fullName: data.fullName,
      passportNumber: data.passportNumber,
      country: data.country,
      gender: data.gender,
      age: data.age,
      dateOfBirth: data.dateOfBirth || undefined,
      contactNumber: data.contactNumber,
      email: data.email || undefined,
      designation: data.designation || undefined,
      guestType: data.guestType,
      wheelchairRequired: data.wheelchairRequired,
      specialNeeds: data.specialNeeds || undefined,
      visaStatus: data.visaStatus,
      arrivalFlightNumber: data.arrivalFlightNumber || undefined,
      arrivalAirport: data.arrivalAirport || undefined,
      arrivalTerminal: data.arrivalTerminal || undefined,
      arrivalTime: data.arrivalTime || undefined,
      departureFlightNumber: data.departureFlightNumber || undefined,
      departureAirport: data.departureAirport || undefined,
      departureTerminal: data.departureTerminal || undefined,
      departureTime: data.departureTime || undefined,
    });
    toast.success('Guest updated successfully');
    setIsEditMode(false);
  };

  const handleCancelEdit = () => {
    if (!guest) return;
    reset({
      fullName: guest.fullName,
      passportNumber: guest.passportNumber,
      country: guest.country,
      gender: guest.gender,
      age: guest.age,
      dateOfBirth: guest.dateOfBirth ?? '',
      contactNumber: guest.contactNumber,
      email: guest.email ?? '',
      designation: guest.designation ?? '',
      guestType: guest.guestType,
      wheelchairRequired: guest.wheelchairRequired,
      specialNeeds: guest.specialNeeds ?? '',
      visaStatus: guest.visaStatus,
      arrivalFlightNumber: guest.arrivalFlightNumber ?? '',
      arrivalAirport: guest.arrivalAirport ?? '',
      arrivalTerminal: guest.arrivalTerminal ?? '',
      arrivalTime: guest.arrivalTime ?? '',
      departureFlightNumber: guest.departureFlightNumber ?? '',
      departureAirport: guest.departureAirport ?? '',
      departureTerminal: guest.departureTerminal ?? '',
      departureTime: guest.departureTime ?? '',
    });
    setIsEditMode(false);
  };

  const handleDelete = () => {
    if (!guest || !user) return;
    if (!canEditDelete) {
      toast.error('You do not have permission to delete guests');
      return;
    }
    if (deleteConfirmText !== guest.referenceNumber) return;
    deleteGuest(guest.id);
    setDeleteDialogOpen(false);
    onClose();
    toast.success('Guest deleted');
  };

  const handleAddComment = () => {
    if (!guest || !user || !commentText.trim()) return;
    if (!canComment) {
      toast.error('You do not have permission to add comments');
      return;
    }
    addRemark(guest.id, {
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      message: commentText.trim(),
    });
    setCommentText('');
  };

  const handleAssignRoom = () => {
    if (!guest || !user || !canAssignRoom) return;
    updateGuest(guest.id, { roomAssignment: roomInput || undefined });
    toast.success('Room assignment updated');
  };

  if (!user || !guest) return null;

  const selectCls =
    'w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none focus:ring-1 focus:ring-[#2D5A45]';
  const tabTriggerCls =
    'rounded-none border-b-2 border-transparent data-[state=active]:border-[#2D5A45] data-[state=active]:text-[#2D5A45] data-[state=active]:shadow-none data-[state=active]:bg-transparent px-3 py-2.5 text-sm font-medium text-[#4A4A4A] hover:text-[#1A1A1A]';

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
        <SheetContent
          className="w-full max-w-2xl p-0 flex flex-col overflow-hidden bg-white"
          side="right"
        >
          {/* Accessibility title (visually hidden) */}
          <SheetTitle className="sr-only">
            Guest Profile — {guest.fullName}
          </SheetTitle>

          {/* ── Panel Header ── */}
          <div className="flex-shrink-0 border-b border-[#E8E3DB] px-6 py-4 pr-14">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-[#1A1A1A] leading-snug truncate">
                  {guest.fullName}
                </h2>
                <p className="text-sm text-[#4A4A4A] font-mono mt-0.5">
                  {guest.referenceNumber}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                <Badge
                  variant="outline"
                  className={getStatusBadgeStyle(guest.status)}
                >
                  {GUEST_STATUS_LABELS[guest.status]}
                </Badge>

                {canEditDelete && !isEditMode && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-[#D4CFC7] text-[#1A1A1A] hover:bg-[#F5F0E8]"
                      onClick={() => setIsEditMode(true)}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => {
                        setDeleteConfirmText('');
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Delete
                    </Button>
                  </>
                )}

                {isEditMode && (
                  <>
                    <Button
                      size="sm"
                      className="h-8 text-xs bg-[#2D5A45] hover:bg-[#234839] text-white"
                      onClick={handleSubmit(onSave)}
                    >
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Tabs ── */}
          <Tabs
            defaultValue="personal"
            className="flex-1 overflow-hidden flex flex-col min-h-0"
          >
            <div className="flex-shrink-0 border-b border-[#E8E3DB] px-2">
              <TabsList className="h-auto p-0 bg-transparent gap-0 w-full justify-start rounded-none overflow-x-auto">
                <TabsTrigger value="personal" className={tabTriggerCls}>
                  Personal Details
                </TabsTrigger>
                <TabsTrigger value="flight" className={tabTriggerCls}>
                  Flight &amp; Travel
                </TabsTrigger>
                <TabsTrigger value="room" className={tabTriggerCls}>
                  Department
                </TabsTrigger>
                <TabsTrigger value="remarks" className={tabTriggerCls}>
                  Remarks
                  {(guest.remarks?.length ?? 0) > 0 && (
                    <span className="ml-1.5 bg-[#2D5A45] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center leading-none">
                      {guest.remarks!.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history" className={tabTriggerCls}>
                  Audit Trail
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">

              {/* ── Tab 1: Personal Details ── */}
              <TabsContent value="personal" className="mt-0 p-6">
                {isEditMode ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="ep-fullName" className="text-sm">
                          Full Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="ep-fullName"
                          {...register('fullName')}
                          className={`mt-1 ${errors.fullName ? 'border-red-500' : ''}`}
                        />
                        {errors.fullName && (
                          <p className="text-xs text-red-500 mt-1">{errors.fullName.message}</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="ep-passportNumber" className="text-sm">
                          Passport Number <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="ep-passportNumber"
                          {...register('passportNumber')}
                          className={`mt-1 font-mono ${errors.passportNumber ? 'border-red-500' : ''}`}
                        />
                        {errors.passportNumber && (
                          <p className="text-xs text-red-500 mt-1">{errors.passportNumber.message}</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="ep-country" className="text-sm">
                          Country <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="ep-country"
                          {...register('country')}
                          className={`mt-1 ${errors.country ? 'border-red-500' : ''}`}
                        />
                        {errors.country && (
                          <p className="text-xs text-red-500 mt-1">{errors.country.message}</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="ep-gender" className="text-sm">Gender</Label>
                        <select id="ep-gender" {...register('gender')} className={`mt-1 ${selectCls}`}>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </div>

                      <div>
                        <Label htmlFor="ep-dateOfBirth" className="text-sm">Date of Birth</Label>
                        <Input
                          id="ep-dateOfBirth"
                          type="date"
                          {...register('dateOfBirth')}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="ep-age" className="text-sm">Age</Label>
                        <Input
                          id="ep-age"
                          type="number"
                          {...register('age')}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="ep-contactNumber" className="text-sm">Contact Number</Label>
                        <Input
                          id="ep-contactNumber"
                          {...register('contactNumber')}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="ep-email" className="text-sm">Email Address</Label>
                        <Input
                          id="ep-email"
                          type="email"
                          {...register('email')}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="ep-designation" className="text-sm">Designation</Label>
                        <Input
                          id="ep-designation"
                          {...register('designation')}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="ep-guestType" className="text-sm">Guest Type</Label>
                        <select id="ep-guestType" {...register('guestType')} className={`mt-1 ${selectCls}`}>
                          <option value="individual">Individual</option>
                          <option value="family">Family</option>
                        </select>
                      </div>

                      <div>
                        <Label htmlFor="ep-visaStatus" className="text-sm">Visa Status</Label>
                        <select id="ep-visaStatus" {...register('visaStatus')} className={`mt-1 ${selectCls}`}>
                          <option value="not-required">Not Required</option>
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                          <option value="expired">Expired</option>
                        </select>
                      </div>

                      <div className="col-span-2">
                        <Label htmlFor="ep-specialNeeds" className="text-sm">Special Needs</Label>
                        <textarea
                          id="ep-specialNeeds"
                          {...register('specialNeeds')}
                          rows={2}
                          className="mt-1 w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] outline-none resize-none"
                        />
                      </div>

                      <div className="col-span-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="ep-wheelchairRequired"
                          {...register('wheelchairRequired')}
                          className="w-4 h-4 accent-[#2D5A45]"
                        />
                        <Label htmlFor="ep-wheelchairRequired" className="text-sm">
                          Wheelchair Required
                        </Label>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <InfoRow label="Full Name" value={guest.fullName} />
                    <InfoRow
                      label="Gender"
                      value={<span className="capitalize">{guest.gender}</span>}
                    />
                    <InfoRow label="Date of Birth" value={guest.dateOfBirth} />
                    <InfoRow label="Age" value={guest.age} />
                    <InfoRow
                      label="Passport Number"
                      value={<span className="font-mono">{guest.passportNumber}</span>}
                    />
                    <InfoRow label="Contact Number" value={guest.contactNumber} />
                    <InfoRow label="Email Address" value={guest.email} />
                    <InfoRow label="Country" value={guest.country} />
                    <InfoRow label="Designation" value={guest.designation} />
                    <InfoRow
                      label="Guest Type"
                      value={<span className="capitalize">{guest.guestType}</span>}
                    />
                    <InfoRow
                      label="Wheelchair Required"
                      value={
                        guest.wheelchairRequired
                          ? <span className="text-amber-700 font-medium">Yes</span>
                          : 'No'
                      }
                    />
                    <InfoRow label="Special Needs" value={guest.specialNeeds} />
                    <InfoRow label="Visa Status" value={VISA_STATUS_LABELS[guest.visaStatus]} />

                    {/* Family Members sub-table */}
                    {guest.guestType === 'family' && guest.familyMembers.length > 0 && (
                      <div className="mt-5">
                        <h4 className="text-sm font-semibold text-[#1A1A1A] mb-2">
                          Family Members ({guest.familyMembers.length + 1} total incl. primary guest)
                        </h4>
                        <div className="border border-[#E8E3DB] rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-[#F5F0E8]">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-[#4A4A4A]">Name</th>
                                <th className="text-left px-3 py-2 font-medium text-[#4A4A4A]">Age</th>
                                <th className="text-left px-3 py-2 font-medium text-[#4A4A4A]">Relationship</th>
                                <th className="text-left px-3 py-2 font-medium text-[#4A4A4A]">Gender</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E3DB]">
                              {guest.familyMembers.map(member => (
                                <tr key={member.id}>
                                  <td className="px-3 py-2 font-medium text-[#1A1A1A]">{member.name}</td>
                                  <td className="px-3 py-2 text-[#4A4A4A]">{member.age}</td>
                                  <td className="px-3 py-2 text-[#4A4A4A] capitalize">{member.relationship}</td>
                                  <td className="px-3 py-2 text-[#4A4A4A] capitalize">{member.gender}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ── Tab 2: Flight & Travel ── */}
              <TabsContent value="flight" className="mt-0 p-6">
                {isEditMode ? (
                  <div className="grid grid-cols-2 gap-6">
                    {/* Arrival */}
                    <div>
                      <h4 className="text-sm font-semibold text-[#2D5A45] mb-3">Arrival</h4>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-sm">Flight Number</Label>
                          <Input
                            {...register('arrivalFlightNumber')}
                            className="mt-1"
                            placeholder="e.g. LH900"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Airport</Label>
                          <Input
                            {...register('arrivalAirport')}
                            className="mt-1"
                            placeholder="e.g. LHR"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Terminal</Label>
                          <Input
                            {...register('arrivalTerminal')}
                            className="mt-1"
                            placeholder="e.g. T2"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Date &amp; Time</Label>
                          <Input
                            type="datetime-local"
                            {...register('arrivalTime')}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Departure */}
                    <div>
                      <h4 className="text-sm font-semibold text-[#2D5A45] mb-3">Departure</h4>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-sm">Flight Number</Label>
                          <Input
                            {...register('departureFlightNumber')}
                            className="mt-1"
                            placeholder="e.g. LH901"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Airport</Label>
                          <Input
                            {...register('departureAirport')}
                            className="mt-1"
                            placeholder="e.g. LHR"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Terminal</Label>
                          <Input
                            {...register('departureTerminal')}
                            className="mt-1"
                            placeholder="e.g. T2"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Date &amp; Time</Label>
                          <Input
                            type="datetime-local"
                            {...register('departureTime')}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    {/* Arrival view */}
                    <div>
                      <h4 className="text-sm font-semibold text-[#2D5A45] mb-2 pb-2 border-b border-[#E8E3DB]">
                        Arrival
                      </h4>
                      <InfoRow label="Flight Number" value={guest.arrivalFlightNumber} />
                      <InfoRow label="Airport" value={guest.arrivalAirport} />
                      <InfoRow label="Terminal" value={guest.arrivalTerminal} />
                      <InfoRow
                        label="Date & Time"
                        value={
                          guest.arrivalTime
                            ? new Date(guest.arrivalTime).toLocaleString('en-GB', {
                                day: 'numeric', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : undefined
                        }
                      />
                    </div>

                    {/* Departure view */}
                    <div>
                      <h4 className="text-sm font-semibold text-[#2D5A45] mb-2 pb-2 border-b border-[#E8E3DB]">
                        Departure
                      </h4>
                      <InfoRow label="Flight Number" value={guest.departureFlightNumber} />
                      <InfoRow label="Airport" value={guest.departureAirport} />
                      <InfoRow label="Terminal" value={guest.departureTerminal} />
                      <InfoRow
                        label="Date & Time"
                        value={
                          guest.departureTime
                            ? new Date(guest.departureTime).toLocaleString('en-GB', {
                                day: 'numeric', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : undefined
                        }
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── Tab 3: Room Assignment ── */}
              <TabsContent value="room" className="mt-0 p-6">
                <div className="space-y-1">
                  <InfoRow label="Room Assignment" value={guest.roomAssignment} />
                  <InfoRow label="Department" value={guest.department} />
                </div>

                {!guest.roomAssignment && (
                  <p className="mt-4 text-sm text-[#4A4A4A] italic">No room assigned yet.</p>
                )}

                {canAssignRoom && (
                  <div className="mt-5 pt-4 border-t border-[#E8E3DB]">
                    <Label className="text-sm font-medium text-[#1A1A1A]">
                      {guest.roomAssignment ? 'Update Room' : 'Assign Room'}
                    </Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={roomInput}
                        onChange={(e) => setRoomInput(e.target.value)}
                        placeholder="Enter room number…"
                        className="flex-1 border-[#D4CFC7]"
                      />
                      <Button
                        onClick={handleAssignRoom}
                        className="bg-[#2D5A45] hover:bg-[#234839] text-white"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── Tab 4: Remarks & Comments ── */}
              <TabsContent value="remarks" className="mt-0 p-6">
                <div className="space-y-3">
                  {(!guest.remarks || guest.remarks.length === 0) ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-[#4A4A4A]">No remarks yet.</p>
                    </div>
                  ) : (
                    guest.remarks.map(remark => (
                      <div
                        key={remark.id}
                        className={`rounded-r-lg p-3 ${getRemarkBubbleStyle(remark.authorRole)}`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-7 h-7 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                            {remark.authorName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-[#1A1A1A]">
                              {remark.authorName}
                            </span>
                            <span className="text-xs text-[#4A4A4A] ml-1">
                              · {ROLE_LABELS[remark.authorRole]}
                            </span>
                          </div>
                          <span className="text-xs text-[#4A4A4A] ml-auto flex-shrink-0">
                            {formatTimeAgo(remark.createdAt)}
                          </span>
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
                        className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] outline-none resize-none"
                      />
                      <Button
                        onClick={handleAddComment}
                        disabled={!commentText.trim()}
                        className="mt-2 bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Post Comment
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── Tab 5: Status History ── */}
              <TabsContent value="history" className="mt-0 p-6">
                {(!guest.statusHistory || guest.statusHistory.length === 0) ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-[#4A4A4A]">No status history available.</p>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Vertical timeline line */}
                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-[#E8E3DB]" />
                    <div className="space-y-6">
                      {[...guest.statusHistory].reverse().map((event) => (
                        <div key={event.id} className="relative flex gap-4 pl-9">
                          {/* Status dot */}
                          <div
                            className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-white shadow-sm z-10 ${getStatusDotColor(event.status)}`}
                          />
                          <div className="flex-1 min-w-0 pb-1">
                            <Badge
                              variant="outline"
                              className={`text-xs ${getStatusBadgeStyle(event.status)}`}
                            >
                              {GUEST_STATUS_LABELS[event.status]}
                            </Badge>
                            <p className="text-xs text-[#4A4A4A] mt-1">
                              Changed by <span className="font-medium text-[#1A1A1A]">{event.changedBy}</span>
                              {' '}· {ROLE_LABELS[event.changedByRole]}
                            </p>
                            <p className="text-xs text-[#4A4A4A]">
                              {new Date(event.changedAt).toLocaleString('en-GB', {
                                day: 'numeric', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </p>
                            {event.remark && (
                              <blockquote className="mt-1.5 pl-2.5 border-l-2 border-[#D4CFC7] text-xs text-[#4A4A4A] italic">
                                {event.remark}
                              </blockquote>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

            </ScrollArea>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* ── Delete Confirmation ── */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteDialogOpen(false);
            setDeleteConfirmText('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Guest?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <strong className="text-[#1A1A1A]">{guest.fullName}</strong> and all their
              records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-1">
            <Label className="text-sm text-[#4A4A4A]">
              Type the guest's reference number to confirm:{' '}
              <span className="font-mono font-semibold text-[#1A1A1A]">
                {guest.referenceNumber}
              </span>
            </Label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={guest.referenceNumber}
              className="mt-2 font-mono"
              onPaste={(e) => e.preventDefault()}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDeleteConfirmText('')}
            >
              Cancel
            </AlertDialogCancel>
            <button
              onClick={handleDelete}
              disabled={deleteConfirmText !== guest.referenceNumber}
              className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium h-9 px-4 py-2 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
