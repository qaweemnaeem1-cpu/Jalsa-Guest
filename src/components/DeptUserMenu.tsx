import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ProfileDialog, getRoleDisplayLabel } from '@/components/ProfileDialog';

export function DeptUserMenu() {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!user) return null;

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(prev => !prev)}
          className="flex items-center gap-3 hover:bg-[#F5F0E8] rounded-lg px-3 py-2 transition-colors"
        >
          <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0">
            {user.name.charAt(0)}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
            <p className="text-xs text-[#4A4A4A]">{getRoleDisplayLabel(user)}</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-[#4A4A4A] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-[#E8E3DB] py-1 z-50">
            <div className="px-4 py-2.5 border-b border-[#E8E3DB]">
              <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
              <p className="text-xs text-[#4A4A4A] truncate">{user.email}</p>
            </div>
            <button
              onClick={() => { setOpen(false); setProfileOpen(true); }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
            >
              <User className="w-4 h-4 text-[#4A4A4A]" />
              Profile
            </button>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
