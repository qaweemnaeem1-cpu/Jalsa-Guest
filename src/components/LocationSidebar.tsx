import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Inbox, BedDouble, CheckCircle, MessageSquare } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useRooms } from '@/hooks/useRooms';
import { useAuditTrail2 } from '@/hooks/useAuditTrail2';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';

export function LocationSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { guests } = useGuests();
  const { rooms, bedAssignments } = useRooms();
  const { entries: entries2 } = useAuditTrail2();

  const loc = user?.location ?? '';
  const userId = user?.id ?? '';

  // Total people placed at this location (guests + family members)
  const placedCount = useMemo(() => {
    let n = 0;
    for (const g of guests) {
      if (g.placedLocation === loc) n++;
      for (const m of g.familyMembers ?? []) {
        if (m.placedLocation === loc) n++;
      }
    }
    return n;
  }, [guests, loc]);

  // People with a bed at this location
  const accommodatedCount = useMemo(() => {
    const locationRooms = rooms.filter(r => r.locationId === loc);
    let n = 0;
    for (const room of locationRooms) {
      n += (bedAssignments[room.id] ?? []).filter(b => !!b.guestName).length;
    }
    return n;
  }, [rooms, bedAssignments, loc]);

  const incomingCount = Math.max(0, placedCount - accommodatedCount);

  const unreadMessages = useMemo(
    () => entries2.filter(e => e.locationId === loc && !e.readBy.includes(userId) && e.createdBy.id !== userId).length,
    [entries2, loc, userId],
  );

  const NAV = [
    { icon: LayoutDashboard, label: 'Dashboard',        href: '/location/dashboard',     badge: 0 },
    { icon: Inbox,           label: 'Incoming',          href: '/location/incoming',      badge: incomingCount,    badgeColor: 'bg-amber-500' },
    { icon: BedDouble,       label: 'Rooms & Blocks',    href: '/location/rooms',         badge: 0 },
    { icon: CheckCircle,     label: 'Accommodated',      href: '/location/accommodated',  badge: accommodatedCount, badgeColor: 'bg-green-500' },
    { icon: MessageSquare,   label: 'Messages',          href: '/location/messages',      badge: unreadMessages, badgeColor: 'bg-red-500' },
  ];

  return (
    <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0 flex flex-col">
      <div className="p-4 border-b border-[#E8E3DB]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">J</span>
          </div>
          <div>
            <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
            <p className="text-xs text-[#4A4A4A]">Location Manager</p>
          </div>
        </div>
      </div>
      <nav className="p-4 space-y-1 flex-1">
        <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
        {NAV.map((item, i) => {
          const active = pathname === item.href;
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
              {item.badge > 0 && (
                <span className={`text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${active ? 'bg-white/30' : item.badgeColor}`}>
                  {item.badge}
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
