import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ProfileDialog, getRoleDisplayLabel } from '@/components/ProfileDialog';

export function SidebarUserFooter() {
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <div className="border-t border-[#E8E3DB] p-3 mt-auto">
        <button
          onClick={() => setProfileOpen(true)}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-[#F5F0E8] transition-colors group text-left"
        >
          <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#1A1A1A] truncate">{user.name}</p>
            <p className="text-[10px] text-[#4A4A4A]">{getRoleDisplayLabel(user)}</p>
          </div>
          <Settings className="w-4 h-4 text-[#4A4A4A] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
