import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_LABELS } from '@/lib/constants';
import { ProfileDialog } from '@/components/ProfileDialog';

interface TopBarProps {
  title?: string;
}

export function TopBar({ title }: TopBarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
        <div className="flex items-center justify-between">
          {title ? (
            <h1 className="text-xl font-semibold text-[#1A1A1A]">{title}</h1>
          ) : (
            <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
          )}

          <div className="relative">
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-3 hover:bg-[#F5F0E8] rounded-lg px-3 py-2 transition-colors"
            >
              <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-medium">
                {user.name.charAt(0)}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                <p className="text-xs text-[#4A4A4A]">{ROLE_LABELS[user.role]}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-[#4A4A4A]" />
            </button>

            {open && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-[#E8E3DB] py-1 z-50">
                <div className="px-4 py-2 border-b border-[#E8E3DB]">
                  <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                  <p className="text-xs text-[#4A4A4A]">{user.email}</p>
                </div>
                <button
                  onClick={() => { setOpen(false); setProfileOpen(true); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
                >
                  <User className="w-4 h-4 text-[#4A4A4A]" />
                  Profile
                </button>
                <button
                  onClick={() => { setOpen(false); logout(); navigate('/login'); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
