import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList, CalendarDays,
  Car, CheckCircle, MessageCircle, UserCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { useDriverUnreadCount } from '@/components/DriverMessagesDialog';

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',        href: '/transport/dashboard' },
  { icon: UserCheck,       label: 'Guest Assignments', href: '/transport/guests' },
  { icon: Users,           label: 'My Drivers',        href: '/transport/drivers' },
  { icon: ClipboardList,   label: 'Tasks',             href: '/transport/tasks' },
  { icon: CalendarDays,    label: 'Schedule',          href: '/transport/schedule' },
  { icon: Car,             label: 'Vehicles',          href: '/transport/vehicles' },
  { icon: CheckCircle,     label: 'Completed Tasks',   href: '/transport/completed' },
  { icon: MessageCircle,   label: 'Messages',          href: '/transport/messages' },
];

export function TransportSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const unreadCount = useDriverUnreadCount(user?.id);

  return (
    <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0 flex flex-col">
      {/* Branding */}
      <div className="p-4 border-b border-[#E8E3DB]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">J</span>
          </div>
          <div>
            <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
            <p className="text-xs text-[#4A4A4A]">Transport Department</p>
          </div>
        </div>
      </div>

      {/* User + dept badge */}
      {user && (
        <div className="px-4 py-2 border-b border-[#E8E3DB] bg-[#F5F0E8]">
          <p className="text-xs text-[#4A4A4A] truncate">
            <span className="font-medium text-[#1A1A1A]">{user.name}</span>
            {user.transportDepartmentName
              ? <> · <span className="text-[#2D5A45] font-medium">{user.transportDepartmentName}</span></>
              : ''}
          </p>
        </div>
      )}

      {/* Nav */}
      <nav className="p-4 space-y-1 flex-1">
        <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
        {NAV.map((item) => {
          const active = pathname === item.href;
          const isMessages = item.href === '/transport/messages';
          return (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                active ? 'bg-[#2D5A45] text-white' : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isMessages && unreadCount > 0 && (
                <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <SidebarUserFooter />
    </aside>
  );
}
