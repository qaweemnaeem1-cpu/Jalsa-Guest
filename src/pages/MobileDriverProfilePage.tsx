import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Car, Shield, LogOut, ChevronRight, Moon, Sun } from 'lucide-react';
import MobileDriverLayout from '@/components/MobileDriverLayout';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/contexts/DarkModeContext';

interface ProfileRowProps {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}

function ProfileRow({ icon, label, value }: ProfileRowProps) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#F5F0E8] dark:border-gray-800 last:border-0">
      <div className="w-8 h-8 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
        <span className="text-[#2D5A45] dark:text-emerald-400">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[#4A4A4A] dark:text-gray-400">{label}</p>
        <p className="text-sm font-medium text-[#1A1A1A] dark:text-white truncate">{value ?? '—'}</p>
      </div>
    </div>
  );
}

export default function MobileDriverProfilePage() {
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useDarkMode();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Initials avatar
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <MobileDriverLayout>
      <div className="px-4 py-6 space-y-4">

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 mb-2">
          <div className="w-20 h-20 rounded-full bg-[#2D5A45] flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl font-bold">{initials}</span>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold text-[#1A1A1A] dark:text-white">{user?.name ?? 'Driver'}</h1>
            <p className="text-sm text-[#4A4A4A] dark:text-gray-400">{user?.transportDepartmentName ?? 'Transport'}</p>
            {user?.isHeadDriver && (
              <span className="mt-1 inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                Head Driver
              </span>
            )}
          </div>
        </div>

        {/* Account details */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-[#E8E3DB] dark:border-gray-800 px-4 shadow-sm">
          <ProfileRow icon={<User className="w-4 h-4" />}   label="Full Name"   value={user?.name} />
          <ProfileRow icon={<Mail className="w-4 h-4" />}   label="Email"       value={user?.email} />
          <ProfileRow icon={<Shield className="w-4 h-4" />} label="Role"        value="Driver" />
          <ProfileRow icon={<Car className="w-4 h-4" />}    label="Vehicle"     value={user?.vehicleModel} />
          <ProfileRow icon={<Phone className="w-4 h-4" />}  label="Transport Dept" value={user?.transportDepartmentName} />
        </div>

        {/* Settings */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-[#E8E3DB] dark:border-gray-800 px-4 shadow-sm">
          {/* Dark mode toggle */}
          <div className="flex items-center gap-3 py-3 border-b border-[#F5F0E8] dark:border-gray-800">
            <div className="w-8 h-8 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              {darkMode
                ? <Moon className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />
                : <Sun className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />
              }
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#1A1A1A] dark:text-white">Dark Mode</p>
              <p className="text-xs text-[#4A4A4A] dark:text-gray-400">{darkMode ? 'On' : 'Off'}</p>
            </div>
            <button
              onClick={toggleDarkMode}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                darkMode ? 'bg-[#2D5A45]' : 'bg-gray-300 dark:bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  darkMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Placeholder settings rows */}
          <button className="w-full flex items-center gap-3 py-3 border-b border-[#F5F0E8] dark:border-gray-800">
            <div className="w-8 h-8 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />
            </div>
            <span className="flex-1 text-left text-sm font-medium text-[#1A1A1A] dark:text-white">Notifications</span>
            <ChevronRight className="w-4 h-4 text-[#4A4A4A] dark:text-gray-400" />
          </button>

          <button className="w-full flex items-center gap-3 py-3">
            <div className="w-8 h-8 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />
            </div>
            <span className="flex-1 text-left text-sm font-medium text-[#1A1A1A] dark:text-white">Change Password</span>
            <ChevronRight className="w-4 h-4 text-[#4A4A4A] dark:text-gray-400" />
          </button>
        </div>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className="w-full rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4 text-red-500" />
          <span className="text-sm font-semibold text-red-600 dark:text-red-400">Sign Out</span>
        </button>

      </div>
    </MobileDriverLayout>
  );
}
