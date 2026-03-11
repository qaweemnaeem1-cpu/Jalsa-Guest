import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { User } from '@/types';

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

export function getRoleDisplayLabel(user: User): string {
  if (user.role === 'coordinator' && user.countryCode) {
    return `(${user.countryCode}) Coordinator`;
  }
  if (user.role === 'department-head' && user.department) {
    return user.department;
  }
  const labels: Record<string, string> = {
    'super-admin': 'Super Admin',
    'desk-in-charge': 'Desk In-Charge',
    'coordinator': 'Coordinator',
    'transport': 'Transport',
    'accommodation': 'Accommodation',
    'viewer': 'Viewer',
    'department-head': 'Department Head',
  };
  return labels[user.role] ?? user.role;
}

export function ProfileDialog({ open, onClose }: ProfileDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');

  if (!user) return null;

  const handleSaveProfile = () => {
    if (name.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    toast.success('Profile updated successfully');
  };

  const handleUpdatePassword = () => {
    setPwError('');
    if (!currentPassword) {
      setPwError('Current password is required');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    toast.success('Password updated successfully');
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#1A1A1A]">My Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Personal Info */}
          <div>
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">Personal Info</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">Full Name</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">Email</Label>
                <Input
                  value={user.email}
                  readOnly
                  className="border-[#D4CFC7] bg-[#F9F8F6] h-9 text-sm text-[#4A4A4A] cursor-not-allowed"
                />
              </div>
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">Phone</Label>
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Enter phone number"
                  className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                />
              </div>
              {user.role === 'coordinator' && user.country && (
                <div>
                  <Label className="text-xs text-[#4A4A4A] mb-1 block">Country</Label>
                  <Input
                    value={user.country}
                    readOnly
                    className="border-[#D4CFC7] bg-[#F9F8F6] h-9 text-sm text-[#4A4A4A] cursor-not-allowed"
                  />
                </div>
              )}
              <div className="pt-1">
                <Button
                  onClick={handleSaveProfile}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-5 text-sm"
                >
                  Save Profile
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Change Password */}
          <div>
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">Change Password</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">Current Password</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">Confirm New Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                  autoComplete="new-password"
                />
              </div>
              {pwError && (
                <p className="text-xs text-red-600">{pwError}</p>
              )}
              <div className="pt-1">
                <Button
                  onClick={handleUpdatePassword}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-5 text-sm"
                >
                  Update Password
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
