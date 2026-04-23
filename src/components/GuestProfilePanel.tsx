import { useState, useEffect, useRef } from 'react';
import { formatDateTime } from '@/utils/dateHelpers';
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
import { Pencil, Trash2, Send, ChevronDown, X as XIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { insertCommentMessage } from '@/lib/guestMessages';
import { useDesignations } from '@/hooks/useDesignations';
import { GUEST_STATUS_LABELS, ROLE_LABELS, VISA_STATUS_LABELS, formatDesignation, TIER_ORDER, TIER_SECTION_LABEL, getTierBadgeLabel, getTierBadgeClass } from '@/lib/constants';
import { CountryCombobox } from '@/components/CountryCombobox';
import type { Guest, GuestStatus, UserRole, Designation } from '@/types';

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

// ─── Designation multi-select ─────────────────────────────────────────────────

function DesignationMultiSelect({ value, onChange, options }: { value: string[]; onChange: (v: string[]) => void; options: Designation[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter(v => v !== name) : [...value, name]);

  const q = search.toLowerCase();
  const filtered = options.filter(o => o.name.toLowerCase().includes(q));
  const tierMap = new Map(options.map(o => [o.name, o.tier]));
  const tierGroups: Array<{ tier: string; label: string; items: Designation[] }> = [];
  for (const tier of [...TIER_ORDER, '__none__'] as string[]) {
    const items = filtered.filter(o => (o.tier ?? '__none__') === tier);
    if (items.length) tierGroups.push({ tier, label: TIER_SECTION_LABEL[tier] ?? 'No Tier', items });
  }

  return (
    <div ref={ref} className="relative mt-1">
      <div
        tabIndex={0} role="combobox" aria-expanded={open}
        className="min-h-9 flex items-start flex-wrap gap-1.5 w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white cursor-pointer hover:border-[#2D5A45] transition-colors focus:outline-none focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); }
          if (e.key === 'Escape') { setOpen(false); setSearch(''); }
        }}
      >
        {value.length === 0
          ? <span className="text-gray-400 self-center text-xs">Select designations…</span>
          : value.map(v => {
              const tier = tierMap.get(v);
              const lbl = getTierBadgeLabel(tier);
              return (
                <span key={v} className="inline-flex items-center gap-1 bg-[#D6E4D9] text-[#2D5A45] text-xs font-medium px-2 py-0.5 rounded-full">
                  {v}
                  {lbl && <span className={`text-[10px] font-bold px-1 py-px rounded ${getTierBadgeClass(tier)}`}>{lbl}</span>}
                  <button type="button" onClick={e => { e.stopPropagation(); toggle(v); }} className="hover:text-[#1A1A1A]">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              );
            })
        }
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 ml-auto self-center shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-1.5 border-b border-gray-100">
            <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…" className="w-full px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-[#2D5A45]" />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {tierGroups.length === 0 && <p className="px-2.5 py-2 text-xs text-gray-400">No results</p>}
            {tierGroups.map(({ tier, label, items }) => (
              <div key={tier}>
                <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 select-none">{label}</div>
                {items.map(opt => (
                  <button key={opt.name} type="button" onClick={() => toggle(opt.name)}
                    className={`w-[calc(100%-8px)] mx-1 my-0.5 flex items-center gap-2 text-left px-2.5 py-1.5 text-xs rounded transition-colors ${value.includes(opt.name) ? 'bg-[#D6E4D9] text-[#2D5A45] font-medium' : 'text-gray-700 hover:bg-[#D6E4D9] hover:text-[#2D5A45]'}`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${value.includes(opt.name) ? 'bg-[#2D5A45] border-[#2D5A45]' : 'border-gray-300'}`}>
                      {value.includes(opt.name) && <span className="text-white text-[8px] font-bold">✓</span>}
                    </span>
                    <span className="flex-1">{opt.name}</span>
                    {opt.tier && <span className={`text-[10px] font-bold px-1 py-px rounded shrink-0 ${getTierBadgeClass(opt.tier)}`}>{getTierBadgeLabel(opt.tier)}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const { updateGuest, deleteGuest } = useGuests();
  const { activeDesignations } = useDesignations();

  const [isEditMode, setIsEditMode] = useState(false);
  const [editPassportCountry, setEditPassportCountry] = useState('');
  const [editDesignations, setEditDesignations] = useState<string[]>([]);
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
        designation: '',
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
      setEditPassportCountry(guest.passportCountry ?? '');
      setEditDesignations(Array.isArray(guest.designation) ? guest.designation : (guest.designation ? [guest.designation] : []));
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
      passportCountry: editPassportCountry || undefined,
      country: data.country,
      gender: data.gender,
      age: data.age,
      dateOfBirth: data.dateOfBirth || undefined,
      contactNumber: data.contactNumber,
      email: data.email || undefined,
      designation: editDesignations.length > 0 ? editDesignations : undefined,
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
      designation: '',
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
    setEditPassportCountry(guest.passportCountry ?? '');
    setEditDesignations(Array.isArray(guest.designation) ? guest.designation : (guest.designation ? [guest.designation] : []));
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
    insertCommentMessage(guest.id, user, commentText.trim());
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
                          Full Name<span className="text-red-500 ml-0.5">*</span>
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
                          Passport Number<span className="text-red-500 ml-0.5">*</span>
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
                        <Label className="text-sm">Passport Issuing Country</Label>
                        <CountryCombobox
                          value={editPassportCountry}
                          onChange={setEditPassportCountry}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="ep-country" className="text-sm">
                          Country<span className="text-red-500 ml-0.5">*</span>
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
                        <Label className="text-sm">Designation</Label>
                        <DesignationMultiSelect
                          value={editDesignations}
                          onChange={setEditDesignations}
                          options={activeDesignations}
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
                    {guest.passportCountry && (
                      <InfoRow label="Passport Issuing Country" value={guest.passportCountry} />
                    )}
                    <InfoRow label="Contact Number" value={guest.contactNumber} />
                    <InfoRow label="Email Address" value={guest.email} />
                    <InfoRow label="Country" value={guest.country} />
                    <InfoRow label="Designation" value={formatDesignation(guest.designation)} />
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
                          formatDateTime(guest.arrivalTime) === '—' ? undefined : formatDateTime(guest.arrivalTime)
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
                          formatDateTime(guest.departureTime) === '—' ? undefined : formatDateTime(guest.departureTime)
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
