import { useState, useEffect, useRef } from 'react';
import { formatDateTime, formatTimestamp } from '@/utils/dateHelpers';
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
import { Send, Pencil, Trash2, X, Plane, Building2, BedDouble, ChevronDown, Star, MessageSquare, AlertTriangle } from 'lucide-react';
import { AuditTimeline } from '@/components/AuditTimeline';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useAuditTrail } from '@/hooks/useAuditTrail';
import { useDesignations } from '@/hooks/useDesignations';
import { useAssignableItems } from '@/hooks/useAssignableItems';
import {
  GUEST_STATUS_LABELS, ROLE_LABELS, VISA_STATUS_LABELS,
  TIER_ORDER, TIER_SECTION_LABEL, getTierBadgeLabel, getTierBadgeClass,
} from '@/lib/constants';
import { getVisibility } from '@/utils/guestFieldVisibility';
import { useDepartments } from '@/hooks/useDepartments';
import { useRooms } from '@/hooks/useRooms';
import { DepartmentSelect } from '@/components/DepartmentSelect';
import { supabase } from '@/lib/supabase';
import { insertCommentMessage, type GuestMessage } from '@/lib/guestMessages';
import type { Guest, GuestStatus, UserRole, Designation } from '@/types';

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


// ─── Designation multi-select (edit mode) ─────────────────────────────────────

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
    <div ref={ref} className="relative">
      <div
        tabIndex={0} role="combobox" aria-expanded={open}
        className="min-h-9 flex items-start flex-wrap gap-1.5 w-full px-3 py-1.5 border border-[#D4CFC7] rounded-md text-sm bg-white cursor-pointer hover:border-[#2D5A45] transition-colors focus:outline-none focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
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
                    <X className="w-3 h-3" />
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
            {tierGroups.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No results</p>}
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
  /** Which tab to open on. Defaults to 'personal'. Use 'messages' to jump to the thread. */
  initialTab?: string;
}

export function GuestViewModal({
  guest, open, onClose, onEdit, onDelete, isEditMode = false, initialTab,
}: GuestViewModalProps) {
  const { user } = useAuth();
  const { updateGuest } = useGuests();
  const { getEntriesForGuest, addEntry } = useAuditTrail();
  const { departments, getDeptBadgeCls, getLocPillCls } = useDepartments();
  const { rooms, bedAssignments, assignGuestToRoom } = useRooms();
  const { activeDesignations } = useDesignations();
  const { countries: assignableCountries } = useAssignableItems();

  const [activeTab, setActiveTab] = useState(initialTab ?? 'personal');
  const [commentText, setCommentText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [roomInput, setRoomInput] = useState('');
  const [deptEditValue, setDeptEditValue] = useState('');
  const [locEditValue, setLocEditValue] = useState('');
  const [roomAssignId, setRoomAssignId] = useState('');
  const [bedAssignNum, setBedAssignNum] = useState<number | ''>('');
  const [editDesignations, setEditDesignations] = useState<string[]>([]);
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [correctionBanner, setCorrectionBanner] = useState<GuestMessage | null>(null);

  const visibility = getVisibility(user);

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

  // Reset active tab when modal opens or initialTab changes.
  useEffect(() => {
    if (open) setActiveTab(initialTab ?? 'personal');
  }, [open, initialTab]);

  // Fetch messages from guest_messages table + subscribe to real-time inserts.
  useEffect(() => {
    if (!open || !guest?.id) {
      setMessages([]);
      setCorrectionBanner(null);
      return;
    }
    const guestId = guest.id;

    supabase
      .from('guest_messages')
      .select('*')
      .eq('guest_id', guestId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMessages((data as GuestMessage[]) ?? []));

    if (guest.status === 'Needs Correction') {
      supabase
        .from('guest_messages')
        .select('*')
        .eq('guest_id', guestId)
        .eq('action_type', 'correction')
        .eq('is_system', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setCorrectionBanner(data as GuestMessage | null));
    } else {
      setCorrectionBanner(null);
    }

    const channel = supabase
      .channel(`guest-msgs-${guestId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guest_messages', filter: `guest_id=eq.${guestId}` },
        (payload) => setMessages(prev => [...prev, payload.new as GuestMessage]),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guest?.id, guest?.status]);

  // Scroll to bottom of messages thread when tab becomes active or new message arrives.
  useEffect(() => {
    if (activeTab === 'messages') {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [activeTab, messages.length]);

  // Sync form values whenever the guest or open state changes.
  useEffect(() => {
    if (guest && open) {
      setRoomInput(guest.roomAssignment ?? '');
      setCommentText('');
      setDeptEditValue(guest.assignedDepartment ?? '');
      setLocEditValue(guest.placedLocation ?? '');
      setEditDesignations(Array.isArray(guest.designation) ? guest.designation : (guest.designation ? [guest.designation] : []));
      reset({
        fullName:             guest.fullName,
        passportNumber:       guest.passportNumber,
        country:              guest.country,
        gender:               guest.gender,
        dateOfBirth:          guest.dateOfBirth ?? '',
        contactNumber:        guest.contactNumber,
        email:                guest.email ?? '',
        designation:          '',
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
      designation:           editDesignations.length > 0 ? editDesignations : undefined,
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
    addEntry({
      guestId: guest.id,
      guestName: guest.fullName,
      guestReference: guest.referenceNumber,
      type: 'resubmission',
      action: 'Guest re-submitted for review',
      createdBy: { id: user.id, name: user.name, role: user.role as 'coordinator' | 'super-admin' | 'desk-in-charge' },
      createdAt: new Date().toISOString(),
    });
    toast.success(`${guest.fullName} re-submitted for review`);
    onClose();
  };

  const handleAddComment = () => {
    if (!guest || !user || !commentText.trim() || !canComment) return;
    const msg = commentText.trim();
    setCommentText('');
    insertCommentMessage(guest.id, user, msg);
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

  const handleAssignRoomAccommodate = () => {
    if (!guest || !user || !isSuperAdmin || !roomAssignId || bedAssignNum === '') return;
    const bedNum = Number(bedAssignNum);
    assignGuestToRoom(roomAssignId, bedNum, guest.id, guest.fullName);
    updateGuest(guest.id, {
      status: 'Accommodated',
      accommodatedBy: user.id,
      accommodatedAt: new Date().toISOString(),
    });
    toast.success(`${guest.fullName} assigned and marked as Accommodated`);
    setRoomAssignId('');
    setBedAssignNum('');
  };

  // Rooms at the guest's placed location (for super-admin room assignment)
  const locationRooms = isSuperAdmin && guest?.placedLocation
    ? rooms.filter(r => r.locationId === guest.placedLocation && r.isActive)
    : [];

  // Available beds for the selected room
  const availableBedsInRoom = roomAssignId
    ? (() => {
        const beds = bedAssignments[roomAssignId] ?? [];
        const room = rooms.find(r => r.id === roomAssignId);
        const capacity = room?.capacity ?? 0;
        const available: number[] = [];
        for (let i = 1; i <= capacity; i++) {
          const bed = beds.find(b => b.bedNumber === i);
          if (!bed?.guestName) available.push(i);
        }
        return available;
      })()
    : [];

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
            {/* Avatar — photo if available, else initials */}
            <div className="w-20 h-20 rounded-full flex-shrink-0 border-2 border-[#B5CCB9] overflow-hidden bg-white">
              {guest.photoUrl ? (
                <img src={guest.photoUrl} alt={guest.fullName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#2D5A45] text-3xl font-bold">
                  {guest.fullName.charAt(0)}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                {/* Star for special guests — dept-head / transport-head / location-manager / driver */}
                {visibility.specialStar && (() => {
                  const names = Array.isArray(guest.designation) ? guest.designation : (guest.designation ? [guest.designation] : []);
                  const tierMap = new Map(activeDesignations.map(d => [d.name, d.tier]));
                  const isSpecial = names.some(n => { const t = tierMap.get(n); return t === '1(a)' || t === '1(b)' || t === '2'; });
                  return isSpecial ? <Star className="w-5 h-5 text-amber-500 shrink-0" fill="currentColor" /> : null;
                })()}
                <DialogTitle className="text-2xl font-bold text-slate-800 leading-tight">
                  {guest.fullName}
                </DialogTitle>
                {visibility.status && (
                  <Badge variant="outline" className={getStatusBadgeStyle(guest.status)}>
                    {GUEST_STATUS_LABELS[guest.status]}
                  </Badge>
                )}
                {isEditMode && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                    <Pencil className="w-3 h-3" />
                    Editing
                  </span>
                )}
              </div>
              {/* Designation subtitle — role-aware */}
              {visibility.designation && guest.designation && (
                <p className="text-sm text-slate-600 mb-0.5 flex items-center gap-1.5 flex-wrap">
                  {(() => {
                    const names = Array.isArray(guest.designation) ? guest.designation : [guest.designation];
                    const label = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
                    if (visibility.tierBadge) {
                      const tierMap = new Map(activeDesignations.map(d => [d.name, d.tier]));
                      const tier = (() => {
                        let best: string | null | undefined = null;
                        let bestIdx = Infinity;
                        for (const n of names) {
                          const t = tierMap.get(n);
                          if (t == null) continue;
                          const idx = TIER_ORDER.indexOf(t as typeof TIER_ORDER[number]);
                          if (idx !== -1 && idx < bestIdx) { bestIdx = idx; best = t; }
                        }
                        return best;
                      })();
                      const badge = getTierBadgeLabel(tier);
                      return (
                        <>
                          <span>{label}</span>
                          {badge && (
                            <span className={`text-[10px] font-bold px-1.5 py-px rounded-full ${getTierBadgeClass(tier)}`}>{badge}</span>
                          )}
                        </>
                      );
                    }
                    return <span>{label}</span>;
                  })()}
                </p>
              )}
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

        {/* ── Correction banner (shown whenever status = Needs Correction + there is a correction message) ── */}
        {correctionBanner && guest.status === 'Needs Correction' && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mx-6 mt-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800">⚠️ CORRECTION REQUESTED</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {correctionBanner.user_name} · {new Date(correctionBanner.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-sm text-amber-900 italic mt-1">{correctionBanner.message}</p>
              </div>
              {canComment && (
                <button
                  type="button"
                  onClick={() => setActiveTab('messages')}
                  className="text-xs text-amber-700 hover:text-amber-900 underline underline-offset-2 shrink-0 transition-colors"
                >
                  Reply
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        {/* Compute which tabs to show */}
        {(() => {
          const showFlight   = visibility.flightDetails;
          const showDept     = visibility.department || visibility.location || visibility.roomBed || visibility.transportTeam || visibility.driverAssigned || visibility.checkInOut;
          const showMessages = canComment; // SA, DI, coordinator
          const showHistory  = ['super-admin', 'department-head', 'location-manager'].includes(user.role);
          const remarkCount  = messages.length;
          return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-shrink-0 border-b border-[#E8E3DB] px-6 bg-white">
            <TabsList className="h-auto p-0 bg-transparent gap-0 w-full justify-start rounded-none flex-wrap">
              <TabsTrigger value="personal" className={tabTriggerCls}>Personal Details</TabsTrigger>
              {showFlight && (
                <TabsTrigger value="flight" className={tabTriggerCls}>Flight &amp; Travel</TabsTrigger>
              )}
              {showDept && (
                <TabsTrigger value="room" className={tabTriggerCls}>Department</TabsTrigger>
              )}
              {showMessages && (
                <TabsTrigger value="messages" className={tabTriggerCls}>
                  Messages
                  {remarkCount > 0 && (
                    <span className="ml-1.5 bg-[#2D5A45] text-white text-[10px] rounded-full w-4 h-4 inline-flex items-center justify-center leading-none">
                      {remarkCount}
                    </span>
                  )}
                </TabsTrigger>
              )}
              {showHistory && (
                <TabsTrigger value="history" className={tabTriggerCls}>Audit Trail</TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto bg-[#F5F0E8]">

            {/* ── Tab 1: Personal Details ── */}
            <TabsContent value="personal" className="mt-0 px-8 py-6 space-y-6">
              {isEditMode ? (
                <>
                  {/* Personal Information — edit (role-filtered) */}
                  <div>
                    <SectionHeading>Personal Information</SectionHeading>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      {visibility.name && (
                        <div className="lg:col-span-2">
                          <EditField label="Full Name" required error={errors.fullName?.message}>
                            <Input
                              {...register('fullName')}
                              className={errors.fullName ? 'border-red-500' : ''}
                            />
                          </EditField>
                        </div>
                      )}

                      {visibility.gender && (
                        <EditField label="Gender" error={errors.gender?.message}>
                          <select {...register('gender')} className={selectCls}>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                          </select>
                        </EditField>
                      )}

                      {visibility.dob && (
                        <EditField label="Date of Birth" error={errors.dateOfBirth?.message}>
                          <Input type="date" {...register('dateOfBirth')} />
                        </EditField>
                      )}

                      {visibility.age && (
                        <div>
                          <p className="text-xs font-medium text-[#4A4A4A] mb-1">Age (auto-calculated)</p>
                          <div className="px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-[#F5F0E8] text-[#4A4A4A]">
                            {displayAge}
                          </div>
                        </div>
                      )}

                      {/* Guest type always editable when in edit mode */}
                      <EditField label="Guest Type" error={errors.guestType?.message}>
                        <select {...register('guestType')} className={selectCls}>
                          <option value="individual">Individual</option>
                          <option value="family">Family</option>
                        </select>
                      </EditField>

                      {visibility.visaStatus && (
                        <EditField label="Visa Status" error={errors.visaStatus?.message}>
                          <select {...register('visaStatus')} className={selectCls}>
                            <option value="not-required">Not Required</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="expired">Expired</option>
                          </select>
                        </EditField>
                      )}

                      {visibility.wheelchair && (
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
                      )}

                      {visibility.specialNeeds && (
                        <div className="lg:col-span-2">
                          <EditField label="Special Needs" error={errors.specialNeeds?.message}>
                            <textarea
                              {...register('specialNeeds')}
                              rows={2}
                              className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] outline-none resize-none"
                            />
                          </EditField>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contact Details — edit (role-filtered) */}
                  {(visibility.passport || visibility.contactNumber || visibility.email || visibility.country || visibility.designation) && (
                    <div>
                      <SectionHeading>Contact Details</SectionHeading>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        {visibility.passport && (
                          <EditField label="Passport Number" required error={errors.passportNumber?.message}>
                            <Input
                              {...register('passportNumber')}
                              className={`font-mono ${errors.passportNumber ? 'border-red-500' : ''}`}
                            />
                          </EditField>
                        )}

                        {visibility.contactNumber && (
                          <EditField label="Contact Number" required error={errors.contactNumber?.message}>
                            <Input
                              {...register('contactNumber')}
                              className={errors.contactNumber ? 'border-red-500' : ''}
                            />
                          </EditField>
                        )}

                        {visibility.email && (
                          <EditField label="Email Address" error={errors.email?.message}>
                            <Input
                              type="email"
                              {...register('email')}
                              className={errors.email ? 'border-red-500' : ''}
                            />
                          </EditField>
                        )}

                        {visibility.country && (
                          <EditField label="Country" required error={errors.country?.message}>
                            <select
                              {...register('country')}
                              className={`${selectCls} ${errors.country ? 'border-red-500' : ''}`}
                            >
                              <option value="">Select country…</option>
                              {assignableCountries.filter(c => c.isActive).map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          </EditField>
                        )}

                        {visibility.designation && (
                          <EditField label="Designation">
                            <DesignationMultiSelect
                              value={editDesignations}
                              onChange={setEditDesignations}
                              options={activeDesignations}
                            />
                          </EditField>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Personal Information — view (role-filtered) */}
                  <div>
                    <SectionHeading>Personal Information</SectionHeading>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      {visibility.name && <FieldCard label="Full Name" value={guest.fullName} />}
                      {visibility.gender && <FieldCard label="Gender" value={<span className="capitalize">{guest.gender}</span>} />}
                      {visibility.dob && <FieldCard label="Date of Birth" value={guest.dateOfBirth} />}
                      {visibility.age && <FieldCard label="Age" value={guest.age} />}
                      {visibility.name && <FieldCard label="Guest Type" value={<span className="capitalize">{guest.guestType}</span>} />}
                      {visibility.religion && <FieldCard label="Religion" value={guest.religion} />}
                      {visibility.visaStatus && <FieldCard label="Visa Status" value={VISA_STATUS_LABELS[guest.visaStatus]} />}
                      {visibility.wheelchair && (
                        <FieldCard
                          label="Wheelchair Required"
                          value={guest.wheelchairRequired
                            ? <span className="text-amber-700 font-medium">Yes</span>
                            : 'No'}
                        />
                      )}
                      {visibility.specialNeeds && <FieldCard label="Special Needs" value={guest.specialNeeds} />}
                      {visibility.dietary && <FieldCard label="Dietary Requirements" value={guest.dietaryRequirements} />}
                    </div>
                    {visibility.introduction && guest.introduction && (
                      <div className="mt-4 p-3 bg-[#F5F0E8] rounded-lg">
                        <p className="text-xs font-medium text-[#4A4A4A] mb-1">Introduction</p>
                        <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap">{guest.introduction}</p>
                      </div>
                    )}
                  </div>

                  {/* Expenses — view (super-admin / desk-in-charge / coordinator only) */}
                  {(visibility.expenses || visibility.tabshirReference) && (guest.expenses || guest.tabshirReference) && (
                    <div>
                      <SectionHeading>Expenses</SectionHeading>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        {visibility.expenses && <FieldCard label="Expenses Covered By" value={guest.expenses ?? 'Self'} />}
                        {visibility.tabshirReference && guest.tabshirReference && (
                          <FieldCard label="Tabshir Reference Nr." value={<span className="font-mono">{guest.tabshirReference}</span>} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Contact Details — view (role-filtered) */}
                  {(visibility.passport || visibility.contactNumber || visibility.email || visibility.country || visibility.designation) && (
                    <div>
                      <SectionHeading>Contact Details</SectionHeading>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        {visibility.passport && (
                          <FieldCard label="Passport Number" value={<span className="font-mono">{guest.passportNumber}</span>} />
                        )}
                        {visibility.passportCountry && <FieldCard label="Passport Country" value={guest.passportCountry} />}
                        {visibility.contactNumber && <FieldCard label="Contact Number" value={guest.contactNumber} />}
                        {visibility.email && <FieldCard label="Email Address" value={guest.email} />}
                        {visibility.country && <FieldCard label="Country" value={guest.country} />}
                        {visibility.designation && guest.designation && (
                          <FieldCard
                            label="Designation"
                            value={(() => {
                              const names = Array.isArray(guest.designation) ? guest.designation : [guest.designation];
                              const label = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
                              if (visibility.tierBadge) {
                                const tierMap = new Map(activeDesignations.map(d => [d.name, d.tier]));
                                const tier = (() => {
                                  let best: string | null | undefined = null;
                                  let bestIdx = Infinity;
                                  for (const n of names) {
                                    const t = tierMap.get(n);
                                    if (t == null) continue;
                                    const idx = TIER_ORDER.indexOf(t as typeof TIER_ORDER[number]);
                                    if (idx !== -1 && idx < bestIdx) { bestIdx = idx; best = t; }
                                  }
                                  return best;
                                })();
                                const badge = getTierBadgeLabel(tier);
                                return (
                                  <span className="flex items-center gap-1 flex-wrap">
                                    <span>{label}</span>
                                    {badge && <span className={`text-[10px] font-bold px-1.5 py-px rounded-full ${getTierBadgeClass(tier)}`}>{badge}</span>}
                                  </span>
                                );
                              }
                              if (visibility.specialStar) {
                                const tierMap = new Map(activeDesignations.map(d => [d.name, d.tier]));
                                const isSpecial = names.some(n => { const t = tierMap.get(n); return t === '1(a)' || t === '1(b)' || t === '2'; });
                                return (
                                  <span className="flex items-center gap-1">
                                    {isSpecial && <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" />}
                                    <span>{label}</span>
                                  </span>
                                );
                              }
                              return <span>{label}</span>;
                            })()}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Family Members — view only */}
                  {visibility.familyMembers && guest.guestType === 'family' && guest.familyMembers.length > 0 && (
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
                        value={formatDateTime(guest.arrivalTime) === '—' ? undefined : formatDateTime(guest.arrivalTime)}
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
                        value={formatDateTime(guest.departureTime) === '—' ? undefined : formatDateTime(guest.departureTime)}
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
                {visibility.department && (
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
                          value={formatTimestamp(guest.assignedDepartmentAt)}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Location card */}
                {visibility.location && (
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
                          value={formatTimestamp(guest.placedAt)}
                        />
                      )}
                    </div>
                  </div>
                )}
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

              {/* Room Assignment — super-admin in edit mode, guest must be placed at a location */}
              {visibility.roomBed && isSuperAdmin && isEditMode && guest.placedLocation && guest.status !== 'Accommodated' && (
                <div className="bg-white rounded-xl border border-[#E8E3DB] p-5 space-y-4">
                  <SectionHeading>Room Assignment</SectionHeading>
                  {locationRooms.length === 0 ? (
                    <p className="text-sm text-[#4A4A4A] italic">No rooms configured at {guest.placedLocation}.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-[#4A4A4A] mb-1">Room</p>
                          <select
                            value={roomAssignId}
                            onChange={e => { setRoomAssignId(e.target.value); setBedAssignNum(''); }}
                            className={selectCls}
                          >
                            <option value="">Select room…</option>
                            {locationRooms.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-[#4A4A4A] mb-1">Bed</p>
                          <select
                            value={bedAssignNum}
                            onChange={e => setBedAssignNum(e.target.value === '' ? '' : Number(e.target.value))}
                            disabled={!roomAssignId}
                            className={`${selectCls} ${!roomAssignId ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <option value="">Select bed…</option>
                            {availableBedsInRoom.map(n => (
                              <option key={n} value={n}>Bed {n}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {availableBedsInRoom.length === 0 && roomAssignId && (
                        <p className="text-xs text-red-600">No available beds in this room.</p>
                      )}
                      <Button
                        onClick={handleAssignRoomAccommodate}
                        disabled={!roomAssignId || bedAssignNum === '' || availableBedsInRoom.length === 0}
                        className="bg-[#2D5A45] hover:bg-[#234839] text-white disabled:opacity-50"
                      >
                        <BedDouble className="w-4 h-4 mr-1.5" />
                        Assign Room &amp; Accommodate
                      </Button>
                    </>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── Messages thread ── */}
            <TabsContent value="messages" className="mt-0 px-0 py-0 flex flex-col">
              {/* Message list */}
              <div className="px-4 py-4 space-y-2">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                    <MessageSquare className="w-10 h-10 text-gray-300" />
                    <p className="text-sm text-[#4A4A4A]">No messages yet.</p>
                    <p className="text-xs text-[#4A4A4A]/60">Messages between coordinators, desk incharge and admins appear here.</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isOwn = msg.user_id === user?.id;
                    const time  = formatTimeAgo(msg.created_at);

                    if (msg.is_system) {
                      // ── System event block ─────────────────────────────
                      const cfg: Record<string, { icon: string; bg: string; border: string; text: string }> = {
                        'correction': { icon: '⚠️', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800' },
                        'approval':   { icon: '✅', bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800' },
                        'rejection':  { icon: '❌', bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-800' },
                        'resubmit':   { icon: '🔄', bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-800' },
                        'comment':    { icon: '💬', bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-700' },
                      };
                      const c = cfg[msg.action_type ?? 'comment'] ?? cfg['comment'];
                      return (
                        <div key={msg.id} className={`rounded-lg border p-3 ${c.bg} ${c.border}`}>
                          <div className={`flex items-center gap-1.5 text-xs font-semibold ${c.text}`}>
                            <span>{c.icon}</span>
                            <span className="flex-1">{msg.message}</span>
                            <span className="font-normal opacity-60 ml-auto whitespace-nowrap">{time}</span>
                          </div>
                        </div>
                      );
                    }

                    // ── User chat bubble ───────────────────────────────────
                    return isOwn ? (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[75%]">
                          <div className="bg-[#2D5A45] text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
                            <p className="text-sm leading-relaxed">{msg.message}</p>
                          </div>
                          <p className="text-[10px] text-right text-[#4A4A4A]/60 mt-1">{time}</p>
                        </div>
                      </div>
                    ) : (
                      <div key={msg.id} className="flex gap-2">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0 mt-0.5">
                          {msg.user_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="max-w-[75%]">
                          <p className="text-[11px] font-medium text-[#4A4A4A] mb-0.5">
                            {msg.user_name}
                            <span className="font-normal ml-1 text-[#4A4A4A]/60 capitalize">· {msg.user_role}</span>
                          </p>
                          <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm border border-[#E8E3DB]">
                            <p className="text-sm text-[#1A1A1A] leading-relaxed">{msg.message}</p>
                          </div>
                          <p className="text-[10px] text-[#4A4A4A]/60 mt-1">{time}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              {canComment && (
                <div className="sticky bottom-0 border-t border-[#E8E3DB] px-4 py-3 bg-white flex gap-2 items-center">
                  <input
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                    placeholder="Type a message..."
                    className="flex-1 border border-[#D4CFC7] rounded-full px-4 py-2 text-sm bg-[#F5F0E8] focus:bg-white focus:border-[#2D5A45] focus:outline-none transition-colors"
                  />
                  <Button
                    onClick={handleAddComment}
                    disabled={!commentText.trim()}
                    className="rounded-full w-9 h-9 p-0 bg-[#2D5A45] hover:bg-[#234839] disabled:opacity-40 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── Audit Trail ── */}
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
          ); // end IIFE return
        })()} {/* end tab visibility IIFE */}

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
