import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Inbox, CheckCircle, Users, MapPin, Clock, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { getStatusBadgeClass } from '@/lib/constants';
import { useDepartments } from '@/hooks/useDepartments';

export default function DeptDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { guests } = useGuests();
  const { departments } = useDepartments();

  const dept = user?.department ?? '';
  const locations = departments[dept] ?? [];

  const deptGuests = useMemo(
    () => guests.filter(g => g.assignedDepartment === dept),
    [guests, dept],
  );

  const incomingGuests = useMemo(
    () => deptGuests.filter(g => !g.placedLocation),
    [deptGuests],
  );

  const placedGuests = useMemo(
    () => deptGuests.filter(g => !!g.placedLocation),
    [deptGuests],
  );

  const recentActivity = useMemo(
    () =>
      [...deptGuests]
        .sort((a, b) => (b.assignedDepartmentAt ?? '').localeCompare(a.assignedDepartmentAt ?? ''))
        .slice(0, 5),
    [deptGuests],
  );

  const quickActions = [
    { label: 'View Incoming Guests', href: '/dept/incoming', icon: Inbox },
    { label: 'Manage Locations',     href: '/dept/locations', icon: MapPin },
    { label: 'Manage Sub Users',     href: '/dept/sub-users', icon: Users },
  ];

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <DeptSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">{dept} Dashboard</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">{locations.length} location{locations.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <DeptUserMenu />
            </div>
          </header>

          <div className="p-6 space-y-6">
            {/* Action Cards */}
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => navigate('/dept/incoming')}
                className="bg-white rounded-xl border border-[#E8E3DB] p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                    <Inbox className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-2xl font-bold text-amber-600">{incomingGuests.length}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Incoming</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">Awaiting placement</p>
              </button>

              <button
                onClick={() => navigate('/dept/placed')}
                className="bg-white rounded-xl border border-[#E8E3DB] p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-2xl font-bold text-green-600">{placedGuests.length}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Placed</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">Location assigned</p>
              </button>

              <div className="bg-white rounded-xl border border-[#E8E3DB] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-gray-500" />
                  </div>
                  <span className="text-2xl font-bold text-gray-600">{deptGuests.length}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Total</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">All assigned guests</p>
              </div>
            </div>

            {/* Location Cards */}
            {locations.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-[#2D5A45]" />
                  <h2 className="text-sm font-semibold text-[#1A1A1A]">Locations</h2>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {locations.map(loc => {
                    const locGuests = deptGuests.filter(g => g.placedLocation === loc);
                    const borderColor = locGuests.length > 0 ? 'border-l-green-500' : 'border-l-amber-400';
                    return (
                      <div
                        key={loc}
                        className={`bg-white rounded-xl border border-[#E8E3DB] border-l-4 ${borderColor} p-4 hover:shadow-sm transition-shadow`}
                      >
                        <p className="text-sm font-semibold text-[#1A1A1A] mb-2">{loc}</p>
                        <div className="text-xs text-[#4A4A4A]">
                          <span><span className="font-semibold text-[#1A1A1A]">{locGuests.length}</span> placed</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom row: Recent Activity + Quick Actions */}
            <div className="grid lg:grid-cols-5 gap-6">
              {/* Recent Activity (wider) */}
              <div className="lg:col-span-3">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-[#2D5A45]" />
                  <h2 className="text-sm font-semibold text-[#1A1A1A]">Recent Activity</h2>
                </div>
                <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                  {recentActivity.length === 0 ? (
                    <div className="p-8 text-center">
                      <Clock className="w-10 h-10 mx-auto mb-3 text-[#D4CFC7]" />
                      <p className="text-sm font-medium text-[#1A1A1A] mb-1">No activity yet</p>
                      <p className="text-xs text-[#4A4A4A]">Guests assigned to your department will appear here.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Location</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Assigned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E3DB]">
                        {recentActivity.map(g => (
                          <tr key={g.id} className="hover:bg-[#F9F8F6]">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0">
                                  {g.fullName.charAt(0)}
                                </div>
                                <span className="font-medium text-[#1A1A1A] text-sm">{g.fullName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#4A4A4A] text-sm">{g.country}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(g.status)}`}>
                                {g.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {g.placedLocation
                                ? <span className="text-[#4A4A4A]">{g.placedLocation}</span>
                                : <span className="text-amber-600 font-medium">Unplaced</span>}
                            </td>
                            <td className="px-4 py-3 text-[#4A4A4A] text-sm">
                              {g.assignedDepartmentAt
                                ? new Date(g.assignedDepartmentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="lg:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowRight className="w-4 h-4 text-[#2D5A45]" />
                  <h2 className="text-sm font-semibold text-[#1A1A1A]">Quick Actions</h2>
                </div>
                <div className="bg-white border border-[#E8E3DB] rounded-xl overflow-hidden">
                  {quickActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => navigate(action.href)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#F5F0E8] transition-colors border-b border-[#E8E3DB] last:border-b-0 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <action.icon className="w-5 h-5 text-[#4A4A4A]" />
                        <span className="text-sm text-[#1A1A1A]">{action.label}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#4A4A4A]" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
