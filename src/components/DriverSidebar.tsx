import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, CheckCircle, Car, Users, CalendarDays, ArrowDown, ArrowUp, MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { useDriverUnreadCount } from '@/components/DriverMessagesDialog';

export function DriverSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();

  const isHead = user?.isHeadDriver ?? false;
  // Transport heads (isHead + transportDepartmentId) use the /transport/* routes
  const isTransportHead = isHead && !!user?.transportDepartmentId;
  const unreadCount = useDriverUnreadCount(user?.id);

  const REGULAR_NAV = [
    { icon: LayoutDashboard, label: 'Dashboard',       href: '/driver/dashboard' },
    { icon: ClipboardList,   label: 'My Tasks',        href: '/driver/tasks' },
    { icon: CheckCircle,     label: 'Completed Tasks', href: '/driver/completed' },
    { icon: Car,             label: 'My Vehicle',      href: '/driver/vehicle' },
    { icon: MessageCircle,   label: 'Messages',        href: '/driver/messages' },
  ];

  const HEAD_NAV = [
    { icon: LayoutDashboard, label: 'Dashboard',       href: '/driver/dashboard' },
    { icon: ClipboardList,   label: 'My Tasks',        href: '/driver/tasks' },
    { icon: Users,           label: 'All Drivers',     href: '/driver/all-drivers' },
    { icon: ClipboardList,   label: 'All Tasks',       href: '/driver/all-tasks' },
    { icon: CalendarDays,    label: 'Schedule',        href: '/driver/schedule' },
    { icon: CheckCircle,     label: 'Completed Tasks', href: '/driver/completed' },
    { icon: Car,             label: 'Vehicles',        href: '/driver/vehicles' },
    { icon: MessageCircle,   label: 'Messages',        href: '/driver/messages' },
  ];

  const TRANSPORT_NAV = [
    { icon: LayoutDashboard, label: 'Dashboard',       href: '/transport/dashboard' },
    { icon: ArrowDown,       label: 'Pick Up',         href: '/transport/pickup' },
    { icon: ArrowUp,         label: 'Drop Off',        href: '/transport/dropoff' },
    { icon: Users,           label: 'My Drivers',      href: '/transport/drivers' },
    { icon: CheckCircle,     label: 'Completed Tasks', href: '/transport/completed' },
    { icon: MessageCircle,   label: 'Messages',        href: '/transport/messages' },
  ];

  const NAV = isTransportHead ? TRANSPORT_NAV : isHead ? HEAD_NAV : REGULAR_NAV;

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
            <p className="text-xs text-[#4A4A4A]">{isTransportHead ? 'Transport Department' : isHead ? 'Nazim Transport View' : 'Driver View'}</p>
          </div>
        </div>
      </div>

      {/* User badge */}
      {user && (
        <div className="px-4 py-2 border-b border-[#E8E3DB] bg-[#F5F0E8]">
          <p className="text-xs text-[#4A4A4A] truncate">
            <span className="font-medium text-[#1A1A1A]">{user.name}</span>
            {isTransportHead && user.transportDepartmentName
              ? <> · <span className="text-[#2D5A45] font-medium">{user.transportDepartmentName}</span></>
              : user.location ? ` · ${user.location}` : ''}
          </p>
        </div>
      )}

      {/* Nav */}
      <nav className="p-4 space-y-1 flex-1">
        <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
        {NAV.map((item, i) => {
          const active = pathname === item.href;
          const isDashboard = item.href === '/driver/dashboard';
          return (
            <button
              key={i}
              onClick={() => navigate(item.href)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                active ? 'bg-[#2D5A45] text-white' : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {(isDashboard || item.href === '/driver/messages') && unreadCount > 0 && (
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
