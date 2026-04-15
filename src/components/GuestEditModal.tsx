import { useEffect, useCallback, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { ChevronDown, X as XIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useDesignations } from '@/hooks/useDesignations';
import { TIER_ORDER, TIER_SECTION_LABEL, getTierBadgeLabel, getTierBadgeClass } from '@/lib/constants';
import type { Guest, Designation } from '@/types';

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

  // Group by tier
  const tierGroups: Array<{ tier: string; label: string; items: Designation[] }> = [];
  for (const tier of [...TIER_ORDER, '__none__'] as string[]) {
    const items = filtered.filter(o => (o.tier ?? '__none__') === tier);
    if (items.length) tierGroups.push({ tier, label: TIER_SECTION_LABEL[tier] ?? 'No Tier', items });
  }

  return (
    <div ref={ref} className="relative mt-1">
      <div tabIndex={0} role="combobox" aria-expanded={open}
        className="min-h-9 flex items-start flex-wrap gap-1.5 w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white cursor-pointer hover:border-[#2D5A45] transition-colors focus:outline-none focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } if (e.key === 'Escape') { setOpen(false); setSearch(''); } }}
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
                  <button type="button" onClick={e => { e.stopPropagation(); toggle(v); }} className="hover:text-[#1A1A1A]"><XIcon className="w-3 h-3" /></button>
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
                    className={`w-[calc(100%-8px)] mx-1 my-0.5 flex items-center gap-2 text-left px-2.5 py-1.5 text-xs rounded transition-colors ${value.includes(opt.name) ? 'bg-[#D6E4D9] text-[#2D5A45] font-medium' : 'text-gray-700 hover:bg-[#D6E4D9] hover:text-[#2D5A45]'}`}>
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

// ─── Component ───────────────────────────────────────────────────────────────

export interface GuestEditModalProps {
  guest: Guest | null;
  open: boolean;
  onClose: () => void;
  onSaveAndResubmit?: () => void;
}

export function GuestEditModal({ guest, open, onClose, onSaveAndResubmit }: GuestEditModalProps) {
  const { user } = useAuth();
  const { updateGuest } = useGuests();
  const { activeDesignations } = useDesignations();
  const [editDesignations, setEditDesignations] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    trigger,
    getValues,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  });

  const calculateAge = useCallback((dob: string): number | null => {
    if (!dob) return null;
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  }, []);

  const watchedDob = watch('dateOfBirth');

  useEffect(() => {
    if (watchedDob) {
      const computed = calculateAge(watchedDob);
      if (computed !== null) setValue('age', computed, { shouldValidate: false });
    }
  }, [watchedDob, calculateAge, setValue]);

  // Reset form whenever a different guest is opened
  useEffect(() => {
    if (guest && open) {
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
      setEditDesignations(Array.isArray(guest.designation) ? guest.designation : (guest.designation ? [guest.designation] : []));
    }
  // reset is stable — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest?.id, open]);

  const isCoordinatorNeedsCorrection =
    user?.role === 'coordinator' &&
    guest?.status === 'Needs Correction' &&
    guest?.submittedBy === user?.id;

  const canEdit =
    user?.role === 'super-admin' ||
    user?.role === 'desk-in-charge' ||
    isCoordinatorNeedsCorrection;

  const buildUpdates = (data: EditFormData): Partial<Guest> => ({
    fullName: data.fullName,
    passportNumber: data.passportNumber,
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

  const onSave = (data: EditFormData) => {
    if (!guest || !user) return;
    if (!canEdit) {
      toast.error('You do not have permission to edit guests');
      return;
    }
    updateGuest(guest.id, buildUpdates(data));
    toast.success('Guest updated successfully');
    onClose();
  };

  const onSaveAndResubmitHandler = (data: EditFormData) => {
    if (!guest || !user || !isCoordinatorNeedsCorrection) return;
    updateGuest(guest.id, {
      ...buildUpdates(data),
      status: 'Awaiting Review',
      resubmitCount: (guest.resubmitCount ?? 0) + 1,
      resubmittedAt: new Date().toISOString(),
    });
    toast.success(`${guest.fullName} re-submitted for review`);
    onSaveAndResubmit?.();
    onClose();
  };

  if (!user || !guest || !canEdit) return null;

  const selectCls =
    'w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none focus:ring-1 focus:ring-[#2D5A45]';
  const tabTriggerCls =
    'rounded-none border-b-2 border-transparent data-[state=active]:border-[#2D5A45] data-[state=active]:text-[#2D5A45] data-[state=active]:shadow-none data-[state=active]:bg-transparent px-3 py-2.5 text-sm font-medium text-[#4A4A4A] hover:text-[#1A1A1A]';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-full max-h-[85vh] p-0 flex flex-col overflow-hidden gap-0">

        {/* ── Header ── */}
        <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[#E8E3DB]">
          <div className="pr-6">
            <DialogTitle className="text-xl font-bold text-[#1A1A1A]">Edit Guest</DialogTitle>
            <p className="text-sm text-[#4A4A4A] font-mono mt-0.5">{guest.referenceNumber}</p>
          </div>
        </DialogHeader>

        {/* ── Tabs ── */}
        <Tabs defaultValue="personal" className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-shrink-0 border-b border-[#E8E3DB] px-2">
            <TabsList className="h-auto p-0 bg-transparent gap-0 rounded-none">
              <TabsTrigger value="personal" className={tabTriggerCls}>Personal Details</TabsTrigger>
              <TabsTrigger value="flight" className={tabTriggerCls}>Flight &amp; Travel</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">

            {/* ── Tab 1: Personal Details ── */}
            <TabsContent value="personal" className="mt-0 p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ge-fullName" className="text-sm">
                    Full Name<span className="text-red-500 ml-0.5">*</span>
                  </Label>
                  <Input
                    id="ge-fullName"
                    {...register('fullName')}
                    className={`mt-1 ${errors.fullName ? 'border-red-500' : ''}`}
                  />
                  {errors.fullName && (
                    <p className="text-xs text-red-500 mt-1">{errors.fullName.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="ge-passportNumber" className="text-sm">
                    Passport Number<span className="text-red-500 ml-0.5">*</span>
                  </Label>
                  <Input
                    id="ge-passportNumber"
                    {...register('passportNumber')}
                    className={`mt-1 font-mono ${errors.passportNumber ? 'border-red-500' : ''}`}
                  />
                  {errors.passportNumber && (
                    <p className="text-xs text-red-500 mt-1">{errors.passportNumber.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="ge-country" className="text-sm">
                    Country<span className="text-red-500 ml-0.5">*</span>
                  </Label>
                  <Input
                    id="ge-country"
                    {...register('country')}
                    className={`mt-1 ${errors.country ? 'border-red-500' : ''}`}
                  />
                  {errors.country && (
                    <p className="text-xs text-red-500 mt-1">{errors.country.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="ge-gender" className="text-sm">Gender</Label>
                  <select id="ge-gender" {...register('gender')} className={`mt-1 ${selectCls}`}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="ge-dateOfBirth" className="text-sm">Date of Birth</Label>
                  <Input id="ge-dateOfBirth" type="date" {...register('dateOfBirth')} className="mt-1" />
                </div>

                <div>
                  <Label htmlFor="ge-age" className="text-sm">Age</Label>
                  <Input
                    id="ge-age"
                    type="number"
                    {...register('age')}
                    readOnly
                    className="mt-1 bg-white cursor-not-allowed"
                  />
                </div>

                <div>
                  <Label htmlFor="ge-contactNumber" className="text-sm">Contact Number</Label>
                  <Input id="ge-contactNumber" {...register('contactNumber')} className="mt-1" />
                  {errors.contactNumber && (
                    <p className="text-xs text-red-500 mt-1">{errors.contactNumber.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="ge-email" className="text-sm">Email Address</Label>
                  <Input id="ge-email" type="email" {...register('email')} className="mt-1" />
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
                  <Label htmlFor="ge-guestType" className="text-sm">Guest Type</Label>
                  <select id="ge-guestType" {...register('guestType')} className={`mt-1 ${selectCls}`}>
                    <option value="individual">Individual</option>
                    <option value="family">Family</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="ge-visaStatus" className="text-sm">Visa Status</Label>
                  <select id="ge-visaStatus" {...register('visaStatus')} className={`mt-1 ${selectCls}`}>
                    <option value="not-required">Not Required</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <Label htmlFor="ge-specialNeeds" className="text-sm">Special Needs</Label>
                  <textarea
                    id="ge-specialNeeds"
                    {...register('specialNeeds')}
                    rows={2}
                    className="mt-1 w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] outline-none resize-none"
                  />
                </div>

                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ge-wheelchairRequired"
                    {...register('wheelchairRequired')}
                    className="w-4 h-4 accent-[#2D5A45]"
                  />
                  <Label htmlFor="ge-wheelchairRequired" className="text-sm">Wheelchair Required</Label>
                </div>
              </div>
            </TabsContent>

            {/* ── Tab 2: Flight & Travel ── */}
            <TabsContent value="flight" className="mt-0 p-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Arrival */}
                <div>
                  <h4 className="text-sm font-semibold text-[#2D5A45] mb-3">Arrival</h4>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm">Flight Number</Label>
                      <Input {...register('arrivalFlightNumber')} className="mt-1" placeholder="e.g. LH900" />
                    </div>
                    <div>
                      <Label className="text-sm">Airport</Label>
                      <Input {...register('arrivalAirport')} className="mt-1" placeholder="e.g. LHR" />
                    </div>
                    <div>
                      <Label className="text-sm">Terminal</Label>
                      <Input {...register('arrivalTerminal')} className="mt-1" placeholder="e.g. T2" />
                    </div>
                    <div>
                      <Label className="text-sm">Date &amp; Time</Label>
                      <Input type="datetime-local" {...register('arrivalTime')} className="mt-1" />
                    </div>
                  </div>
                </div>

                {/* Departure */}
                <div>
                  <h4 className="text-sm font-semibold text-[#2D5A45] mb-3">Departure</h4>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm">Flight Number</Label>
                      <Input {...register('departureFlightNumber')} className="mt-1" placeholder="e.g. LH901" />
                    </div>
                    <div>
                      <Label className="text-sm">Airport</Label>
                      <Input {...register('departureAirport')} className="mt-1" placeholder="e.g. LHR" />
                    </div>
                    <div>
                      <Label className="text-sm">Terminal</Label>
                      <Input {...register('departureTerminal')} className="mt-1" placeholder="e.g. T2" />
                    </div>
                    <div>
                      <Label className="text-sm">Date &amp; Time</Label>
                      <Input type="datetime-local" {...register('departureTime')} className="mt-1" />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

          </ScrollArea>
        </Tabs>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-[#E8E3DB]">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {isCoordinatorNeedsCorrection && (
            <Button
              onClick={async () => { const valid = await trigger(); if (valid) onSaveAndResubmitHandler(getValues()); }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Save &amp; Re-Submit
            </Button>
          )}
          <Button
            onClick={handleSubmit(onSave)}
            className="bg-[#2D5A45] hover:bg-[#234839] text-white"
          >
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
