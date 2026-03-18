import { useState } from 'react';
import { Users, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { useDepartments } from '@/hooks/useDepartments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SubUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  isActive: boolean;
}

const SEED_USERS: Record<string, SubUser[]> = {
  'Reserve 1 (R1)': [
    { id: 'su-r1-1', name: 'Jamia Manager',      email: 'jamia.r1@tabshir.org',      phone: '+44 7000 100001', location: 'Jamia',      isActive: true },
    { id: 'su-r1-2', name: 'University Manager', email: 'university.r1@tabshir.org', phone: '+44 7000 100002', location: 'University', isActive: true },
    { id: 'su-r1-3', name: 'Hotels Manager',     email: 'hotels.r1@tabshir.org',     phone: '+44 7000 100003', location: 'Hotels',     isActive: true },
  ],
  'UK Jamaat': [
    { id: 'su-ukj-1', name: 'Bait Ul Futuh Manager', email: 'baitulfutuh.ukj@tabshir.org', phone: '+44 7000 200001', location: 'Bait Ul Futuh', isActive: true },
    { id: 'su-ukj-2', name: 'Bait Ul Ehsan Manager', email: 'baitulehsan.ukj@tabshir.org', phone: '+44 7000 200002', location: 'Bait Ul Ehsan', isActive: true },
  ],
  'Central Guests': [
    { id: 'su-cg-1', name: 'VIP Manager',               email: 'vip.central@tabshir.org',     phone: '+44 7000 300001', location: 'Bait Ul Futuh VIP',    isActive: true },
    { id: 'su-cg-2', name: 'Islamabad Inside Manager',  email: 'inside.central@tabshir.org',  phone: '+44 7000 300002', location: 'Islamabad Inside',     isActive: true },
    { id: 'su-cg-3', name: 'Islamabad Suburbs Manager', email: 'suburbs.central@tabshir.org', phone: '+44 7000 300003', location: 'Islamabad Suburbs',    isActive: true },
  ],
};

let nextSubUserId = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DeptSubUsersPage() {
  const { user } = useAuth();
  const { departments, getLocPillCls } = useDepartments();

  const dept = user?.department ?? '';
  const locations = departments[dept] ?? [];

  const [subUsers, setSubUsers] = useState<SubUser[]>(() => SEED_USERS[dept] ?? []);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SubUser | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<SubUser | null>(null);

  const openAdd = () => {
    setEditTarget(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormLocation(locations[0] ?? '');
    setFormPassword('');
    setShowPassword(false);
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (su: SubUser) => {
    setEditTarget(su);
    setFormName(su.name);
    setFormEmail(su.email);
    setFormPhone(su.phone);
    setFormLocation(su.location);
    setFormPassword('');
    setShowPassword(false);
    setFormErrors({});
    setDialogOpen(true);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    const name = formName.trim().replace(/<[^>]*>/g, '');
    const email = formEmail.trim().replace(/<[^>]*>/g, '');
    const phone = formPhone.trim().replace(/<[^>]*>/g, '');

    if (name.length < 2) errors.name = 'Name must be at least 2 characters';
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
    if (!phone) errors.phone = 'Phone is required';
    if (!formLocation) errors.location = 'Select a location';
    if (!editTarget && formPassword.length < 8) errors.password = 'Password must be at least 8 characters';
    if (editTarget && formPassword && formPassword.length < 8) errors.password = 'Password must be at least 8 characters';

    // Duplicate email check
    const dupEmail = subUsers.find(
      su => su.email.toLowerCase() === email.toLowerCase() && su.id !== editTarget?.id,
    );
    if (dupEmail) errors.email = 'A sub user with this email already exists';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    const name = formName.trim().replace(/<[^>]*>/g, '');
    const email = formEmail.trim().replace(/<[^>]*>/g, '');
    const phone = formPhone.trim().replace(/<[^>]*>/g, '');

    if (editTarget) {
      setSubUsers(prev =>
        prev.map(su =>
          su.id === editTarget.id
            ? { ...su, name, email, phone, location: formLocation }
            : su,
        ),
      );
      toast.success('Sub user updated');
    } else {
      setSubUsers(prev => [
        ...prev,
        { id: `su-${nextSubUserId++}`, name, email, phone, location: formLocation, isActive: true },
      ]);
      toast.success('Sub user added successfully');
    }
    setDialogOpen(false);
  };

  const handleToggleActive = (id: string) => {
    setSubUsers(prev => prev.map(su => su.id === id ? { ...su, isActive: !su.isActive } : su));
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    setSubUsers(prev => prev.filter(su => su.id !== deleteTarget.id));
    toast.success('Sub user removed');
    setDeleteTarget(null);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <DeptSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Sub Users</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">Manage users for {dept} locations</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={openAdd}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Sub User
                </Button>
                <DeptUserMenu />
              </div>
            </div>
          </header>

          <div className="p-6">
            {subUsers.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <Users className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-medium text-[#1A1A1A] mb-1">No sub users yet</h2>
                <p className="text-sm text-[#4A4A4A] mb-4">Add location managers to give them access to their assigned locations.</p>
                <Button onClick={openAdd} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Sub User
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider w-10">#</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Phone</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {subUsers.map((su, idx) => (
                      <tr key={su.id} className="hover:bg-[#F9F8F6]">
                        <td className="px-4 py-3 text-[#4A4A4A]">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0">
                              {su.name.charAt(0)}
                            </div>
                            <span className="font-medium text-[#1A1A1A]">{su.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A]">{su.email}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLocPillCls(dept, su.location)}`}>
                            {su.location}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A]">{su.phone}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleActive(su.id)}
                            title="Toggle active status"
                          >
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                              su.isActive
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              {su.isActive
                                ? <ToggleRight className="w-3.5 h-3.5" />
                                : <ToggleLeft className="w-3.5 h-3.5" />}
                              {su.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(su)}
                              className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-blue-50 hover:text-blue-600 transition-colors"
                              title="Edit sub user"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(su)}
                              className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Remove sub user"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1A1A1A]">
              {editTarget ? 'Edit Sub User' : 'Add Sub User'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Name */}
            <div>
              <Label className="text-xs text-[#4A4A4A] mb-1 block">Name <span className="text-red-500">*</span></Label>
              <Input
                value={formName}
                onChange={e => { setFormName(e.target.value); setFormErrors(p => ({ ...p, name: '' })); }}
                placeholder="Full name"
                className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
              />
              {formErrors.name && <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <Label className="text-xs text-[#4A4A4A] mb-1 block">Email <span className="text-red-500">*</span></Label>
              <Input
                type="email"
                value={formEmail}
                onChange={e => { setFormEmail(e.target.value); setFormErrors(p => ({ ...p, email: '' })); }}
                placeholder="user@example.org"
                className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                autoComplete="off"
              />
              {formErrors.email && <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>}
            </div>

            {/* Phone */}
            <div>
              <Label className="text-xs text-[#4A4A4A] mb-1 block">Phone <span className="text-red-500">*</span></Label>
              <Input
                value={formPhone}
                onChange={e => { setFormPhone(e.target.value); setFormErrors(p => ({ ...p, phone: '' })); }}
                placeholder="+44 7000 000000"
                className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
              />
              {formErrors.phone && <p className="text-xs text-red-600 mt-1">{formErrors.phone}</p>}
            </div>

            {/* Location */}
            <div>
              <Label className="text-xs text-[#4A4A4A] mb-1 block">Location <span className="text-red-500">*</span></Label>
              <select
                value={formLocation}
                onChange={e => { setFormLocation(e.target.value); setFormErrors(p => ({ ...p, location: '' })); }}
                className="w-full border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] h-9"
              >
                <option value="">Select location…</option>
                {locations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
              {formErrors.location && <p className="text-xs text-red-600 mt-1">{formErrors.location}</p>}
            </div>

            {/* Password */}
            <div>
              <Label className="text-xs text-[#4A4A4A] mb-1 block">
                Password {editTarget ? <span className="text-[#4A4A4A] font-normal">(leave blank to keep current)</span> : <span className="text-red-500">*</span>}
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={formPassword}
                  onChange={e => { setFormPassword(e.target.value); setFormErrors(p => ({ ...p, password: '' })); }}
                  placeholder={editTarget ? '••••••••' : 'Min 8 characters'}
                  className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#4A4A4A] hover:text-[#1A1A1A]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {formErrors.password && <p className="text-xs text-red-600 mt-1">{formErrors.password}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-[#D4CFC7] text-[#4A4A4A] h-9 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm"
            >
              {editTarget ? 'Save Changes' : 'Add Sub User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Sub User</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteTarget?.name}</strong> from {dept}? They will lose access to their assigned location.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
