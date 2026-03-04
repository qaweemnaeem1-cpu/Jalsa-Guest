import { useEffect } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import type { Guest } from '@/types';

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

export interface GuestEditModalProps {
  guest: Guest | null;
  open: boolean;
  onClose: () => void;
}

export function GuestEditModal({ guest, open, onClose }: GuestEditModalProps) {
  const { user } = useAuth();
  const { updateGuest } = useGuests();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  });

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
    }
  // reset is stable — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest?.id, open]);

  const onSave = (data: EditFormData) => {
    if (!guest || !user) return;
    if (user.role !== 'super-admin' && user.role !== 'desk-in-charge') {
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
    onClose();
  };

  if (!user || !guest) return null;

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
                    Full Name <span className="text-red-500">*</span>
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
                    Passport Number <span className="text-red-500">*</span>
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
                    Country <span className="text-red-500">*</span>
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
                  <Input id="ge-age" type="number" {...register('age')} className="mt-1" />
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
                  <Label htmlFor="ge-designation" className="text-sm">Designation</Label>
                  <Input id="ge-designation" {...register('designation')} className="mt-1" />
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
