/**
 * Shared Add / Edit Driver dialog.
 * Used by: LocationDriversPage, DeptDriversPage, AdminDriversPage.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface DriverRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  department?: string;
  vehicle_type?: string;
  vehicle_model?: string;
  vehicle_registration?: string;
  vehicle_capacity?: number;
  is_head_driver?: boolean;
  is_available?: boolean;
}

interface DriverFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** If provided, edit mode; otherwise add mode */
  driver?: DriverRecord | null;
  /** Pre-fill location for new drivers */
  defaultLocation?: string;
  /** Pre-fill department for new drivers */
  defaultDepartment?: string;
  onSaved: (driver: DriverRecord) => void;
}

export function DriverFormDialog({
  open, onClose, driver, defaultLocation = '', defaultDepartment = '', onSaved,
}: DriverFormDialogProps) {
  const isEdit = !!driver;

  const [name, setName]     = useState('');
  const [email, setEmail]   = useState('');
  const [phone, setPhone]   = useState('');
  const [password, setPassword] = useState('');
  const [location, setLocation] = useState('');
  const [vType, setVType]   = useState('');
  const [vModel, setVModel] = useState('');
  const [vReg, setVReg]     = useState('');
  const [vCap, setVCap]     = useState('');
  const [isHead, setIsHead] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (driver) {
      setName(driver.name);
      setEmail(driver.email);
      setPhone(driver.phone ?? '');
      setPassword('');
      setLocation(driver.location ?? defaultLocation);
      setVType(driver.vehicle_type ?? '');
      setVModel(driver.vehicle_model ?? '');
      setVReg(driver.vehicle_registration ?? '');
      setVCap(driver.vehicle_capacity != null ? String(driver.vehicle_capacity) : '');
      setIsHead(driver.is_head_driver ?? false);
    } else {
      setName(''); setEmail(''); setPhone(''); setPassword('');
      setLocation(defaultLocation);
      setVType(''); setVModel(''); setVReg(''); setVCap('');
      setIsHead(false);
    }
  }, [open, driver, defaultLocation]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!email.trim()) { toast.error('Email is required'); return; }
    if (!isEdit && !password.trim()) { toast.error('Password is required for new drivers'); return; }

    setSaving(true);
    try {
      if (isEdit && driver) {
        const updates: Record<string, unknown> = {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          location: location.trim() || null,
          vehicle_type: vType || null,
          vehicle_model: vModel.trim() || null,
          vehicle_registration: vReg.trim() || null,
          vehicle_capacity: vCap ? Number(vCap) : null,
          is_head_driver: isHead,
        };
        if (password.trim()) updates.password = password.trim();

        const { data, error } = await supabase
          .from('users')
          .update(updates)
          .eq('id', driver.id)
          .select()
          .single();
        if (error) throw error;
        toast.success('Driver updated');
        onSaved(data as DriverRecord);
      } else {
        const { data, error } = await supabase
          .from('users')
          .insert({
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || null,
            password: password.trim(),
            role: 'driver',
            location: location.trim() || defaultLocation,
            department: defaultDepartment || null,
            vehicle_type: vType || null,
            vehicle_model: vModel.trim() || null,
            vehicle_registration: vReg.trim() || null,
            vehicle_capacity: vCap ? Number(vCap) : null,
            is_head_driver: isHead,
            is_available: true,
          })
          .select()
          .single();
        if (error) throw error;
        toast.success('Driver created');
        onSaved(data as DriverRecord);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save driver';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Driver' : 'Add Driver'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Driver name"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label>Email <span className="text-red-500">*</span></Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="driver@example.com"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7000 000000"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label>
              Password
              {!isEdit && <span className="text-red-500"> *</span>}
              {isEdit && <span className="text-[#4A4A4A] text-xs font-normal ml-1">(leave blank to keep current)</span>}
            </Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isEdit ? '••••••••' : 'Set password'}
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Jamia"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>

          <div className="border-t border-[#E8E3DB] pt-3">
            <p className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-3">Vehicle Info</p>

            {/* Vehicle Type */}
            <div className="space-y-1.5 mb-3">
              <Label>Vehicle Type</Label>
              <select value={vType} onChange={e => setVType(e.target.value)}
                className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
                <option value="">None</option>
                <option value="Car">Car</option>
                <option value="Van">Van</option>
                <option value="Minibus">Minibus</option>
                <option value="Bus">Bus</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={vModel} onChange={e => setVModel(e.target.value)} placeholder="e.g. Toyota Hiace"
                  className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
              </div>
              <div className="space-y-1.5">
                <Label>Registration</Label>
                <Input value={vReg} onChange={e => setVReg(e.target.value)} placeholder="e.g. AB12 CDE"
                  className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Passenger Capacity</Label>
              <Input type="number" min={1} max={99} value={vCap} onChange={e => setVCap(e.target.value)}
                placeholder="e.g. 8" className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45] w-24" />
            </div>
          </div>

          {/* Head Driver */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isHead} onChange={e => setIsHead(e.target.checked)}
              className="w-4 h-4 accent-[#2D5A45]" />
            <span className="text-sm text-[#1A1A1A]">Head Driver</span>
            <span className="text-xs text-[#4A4A4A]">(can manage all drivers & tasks)</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />{isEdit ? 'Saving…' : 'Creating…'}</> : isEdit ? 'Save Changes' : 'Add Driver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
