/**
 * Canonical sidebar navigation items — single source of truth.
 * Import these in every page instead of defining inline arrays.
 */
import {
  LayoutDashboard, Users, UserCog, List, Globe, BedDouble, ScrollText,
  ClipboardList, CheckSquare, XCircle, MessageSquare, Clock,
} from 'lucide-react';

export type NavItem = { icon: React.ElementType; label: string; href: string };

/** Super-admin: 7 items */
export const SUPER_ADMIN_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
  { icon: Users,           label: 'Guests',             href: '/guests' },
  { icon: UserCog,         label: 'Users',              href: '/users' },
  { icon: List,            label: 'Designation List',   href: '/designations' },
  { icon: Globe,           label: 'Countries & Depts',  href: '/countries-departments' },
  { icon: BedDouble,       label: 'Rooms & Capacity',   href: '/admin/rooms' },
  { icon: ScrollText,      label: 'Audit Trail',        href: '/admin/audit-trail' },
];

/** Desk-in-charge: 5 items */
export const DESK_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
  { icon: ClipboardList,   label: 'Guests to Review',   href: '/desk/review' },
  { icon: CheckSquare,     label: 'Processed Guests',   href: '/desk/processed' },
  { icon: XCircle,         label: 'Rejected Guests',    href: '/desk/rejected' },
  { icon: MessageSquare,   label: 'Messages & Updates', href: '/desk/messages' },
];

/** Coordinator: 5 items */
export const COORD_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
  { icon: Clock,           label: 'Pending Guests',     href: '/coordinator/pending' },
  { icon: Users,           label: 'Submitted Guests',   href: '/coordinator/submitted' },
  { icon: XCircle,         label: 'Rejected Guests',    href: '/coordinator/rejected' },
  { icon: MessageSquare,   label: 'Messages & Updates', href: '/coordinator/messages' },
];
