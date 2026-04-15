import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, ClipboardList, MessageSquare, Car, User, Moon, Sun, LogOut } from 'lucide-react';
import { useDarkMode } from '@/contexts/DarkModeContext';
import { useAuth } from '@/hooks/useAuth';

interface MobileDriverLayoutProps {
  children: ReactNode;
  /** Unread message count — shows badge on Messages tab */
  unreadMessages?: number;
}

const TOP_BAR_H = 56;
const BOTTOM_NAV_H = 64;

export default function MobileDriverLayout({ children, unreadMessages = 0 }: MobileDriverLayoutProps) {
  const { darkMode, toggleDarkMode } = useDarkMode();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/driver/home',     icon: Home,          label: 'Home'     },
    { to: '/driver/tasks',    icon: ClipboardList,  label: 'Tasks'    },
    { to: '/driver/messages', icon: MessageSquare,  label: 'Messages', badge: unreadMessages },
    { to: '/driver/vehicle',  icon: Car,            label: 'Vehicle'  },
    { to: '/driver/profile',  icon: User,           label: 'Profile'  },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F0E8] dark:bg-gray-950 text-[#1A1A1A] dark:text-gray-100">

      {/* ── Fixed top status bar ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 bg-[#2D5A45] dark:bg-gray-900 flex items-center justify-between px-4 shadow-md"
        style={{ height: TOP_BAR_H, paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Left: driver info */}
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-white font-semibold text-sm truncate max-w-[160px]">
            {user?.name ?? 'Driver'}
          </span>
          <span className="text-white/60 text-xs truncate max-w-[160px]">
            {(user as { transportDepartmentName?: string })?.transportDepartmentName ?? 'Transport'}
          </span>
        </div>

        {/* Right: availability dot + dark mode toggle + logout */}
        <div className="flex items-center gap-3">
          {/* Availability dot */}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]" />
            <span className="text-white/70 text-xs">On duty</span>
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20 transition-colors"
            aria-label="Toggle dark mode"
          >
            {darkMode
              ? <Sun className="w-4 h-4 text-yellow-300" />
              : <Moon className="w-4 h-4 text-white/80" />
            }
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20 transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4 text-white/80" />
          </button>
        </div>
      </header>

      {/* ── Scrollable content ── */}
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: TOP_BAR_H + 0,
          paddingBottom: BOTTOM_NAV_H,
          // account for safe areas
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {children}
      </main>

      {/* ── Fixed bottom nav ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-[#E8E3DB] dark:border-gray-800 flex items-stretch"
        style={{ height: BOTTOM_NAV_H, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {navItems.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
                isActive
                  ? 'text-[#2D5A45] dark:text-emerald-400'
                  : 'text-[#4A4A4A] dark:text-gray-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  {badge != null && badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium">{label}</span>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full bg-[#2D5A45] dark:bg-emerald-400" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
