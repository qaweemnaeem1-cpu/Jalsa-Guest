import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { User } from '@/types';

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

export function getRoleDisplayLabel(user: User): string {
  if (user.role === 'coordinator' && user.country) {
    return `${user.country} Coordinator`;
  }
  if (user.role === 'department-head' && user.department) {
    return user.department;
  }
  if (user.role === 'location-manager' && user.location) {
    return `${user.location} · ${user.department ?? 'Location Manager'}`;
  }
  const labels: Record<string, string> = {
    'super-admin': 'Super Admin',
    'desk-in-charge': 'Desk In-Charge',
    'coordinator': 'Coordinator',
    'transport': 'Transport',
    'accommodation': 'Accommodation',
    'viewer': 'Viewer',
    'department-head': 'Department Head',
    'location-manager': 'Location Manager',
  };
  return labels[user.role] ?? user.role;
}

export function ProfileDialog({ open, onClose }: ProfileDialogProps) {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // Eye toggle state for each field
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!user) return null;

  const handleSaveProfile = async () => {
    if (name.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase
      .from('users')
      .update({ name: name.trim(), phone: phone.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    setSavingProfile(false);
    if (error) {
      toast.error('Failed to update profile');
    } else {
      updateUser({ name: name.trim() });
      toast.success('Profile updated successfully');
    }
  };

  const handleUpdatePassword = async () => {
    setPwError('');
    if (!currentPassword) { setPwError('Current password is required'); return; }
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return; }

    setSavingPw(true);

    // Verify current password via RPC
    const { data: verifyData, error: verifyErr } = await supabase.rpc('verify_login', {
      user_email: user.email,
      user_password: currentPassword,
    });

    if (verifyErr || !verifyData?.success) {
      setSavingPw(false);
      setPwError('Current password is incorrect');
      return;
    }

    // Save new password
    const { error } = await supabase
      .from('users')
      .update({ password_hash: newPassword, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    setSavingPw(false);

    if (error) {
      setPwError('Failed to update password');
    } else {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully');
      onClose();
    }
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
                  disabled={savingProfile}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-5 text-sm"
                >
                  {savingProfile ? 'Saving…' : 'Save Profile'}
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
                <div className="relative">
                  <Input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm pr-9"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">New Password</Label>
                <div className="relative">
                  <Input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm pr-9"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm pr-9"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {pwError && (
                <p className="text-xs text-red-600">{pwError}</p>
              )}
              <div className="pt-1">
                <Button
                  onClick={handleUpdatePassword}
                  disabled={savingPw}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-5 text-sm"
                >
                  {savingPw ? 'Verifying…' : 'Update Password'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
