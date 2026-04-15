import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home, Users, ClipboardList, MessageSquare, Truck, User,
  Moon, Sun, LogOut,
} from 'lucide-react';
import { useDarkMode } from '@/contexts/DarkModeContext';
import { useAuth } from '@/hooks/useAuth';
import OfflineBanner from '@/components/OfflineBanner';

interface MobileTransportHeadLayoutProps {
  children: ReactNode;
  unreadMessages?: number;
}

const TOP_BAR_H = 56;
const BOTTOM_NAV_H = 64;

export default function MobileTransportHeadLayout({
  children,
  unreadMessages = 0,
}: MobileTransportHeadLayoutProps) {
  const { darkMode, toggleDarkMode } = useDarkMode();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/transport-m/home',     icon: Home,          label: 'Home'     },
    { to: '/transport-m/team',     icon: Users,         label: 'Team'     },
    { to: '/transport-m/tasks',    icon: ClipboardList, label: 'Tasks'    },
    { to: '/transport-m/messages', icon: MessageSquare, label: 'Messages', badge: unreadMessages },
    { to: '/transport-m/fleet',    icon: Truck,         label: 'Fleet'    },
    { to: '/transport-m/profile',  icon: User,          label: 'Profile'  },
  ];

  const deptName =
    (user as { transportDepartmentName?: string })?.transportDepartmentName ?? 'Transport Dept';

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F0E8] dark:bg-gray-950 text-[#1A1A1A] dark:text-gray-100">

      {/* ── Fixed top status bar ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 bg-[#2D5A45] dark:bg-gray-900 flex items-center justify-between px-4 shadow-md"
        style={{ height: TOP_BAR_H, paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Left: head driver info */}
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-white font-semibold text-sm truncate max-w-[170px]">
            {user?.name ?? 'Head Driver'}
          </span>
          <span className="text-white/60 text-xs truncate max-w-[170px]">
            {deptName}
          </span>
        </div>

        {/* Right: role badge + dark mode + logout */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-500/40">
            HEAD
          </span>

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

          <button
            onClick={handleLogout}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20 transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4 text-white/80" />
          </button>
        </div>
      </header>

      <OfflineBanner />

      {/* ── Scrollable content ── */}
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: TOP_BAR_H,
          paddingBottom: BOTTOM_NAV_H,
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {children}
      </main>

      {/* ── Fixed bottom nav (6 items) ── */}
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
                  <Icon className={`w-[18px] h-[18px] ${isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  {badge != null && badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="text-[9px] font-medium leading-tight">{label}</span>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-b-full bg-[#2D5A45] dark:bg-emerald-400" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
