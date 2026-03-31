import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users, Search, ChevronDown, LogOut, ChevronRight, User, Plus,
} from 'lucide-react';
import { GUEST_STATUS_LABELS } from '@/lib/constants';
import { useDelegations } from '@/hooks/useDelegations';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { getRoleDisplayLabel, ProfileDialog } from '@/components/ProfileDialog';
import { buildDisplayGroups, statusBadgeCls } from '@/lib/familyGroups';
import type { GuestStatus } from '@/types';
import { COORD_NAV } from '@/lib/navItems';

const STATUS_CHIPS: { label: string; value: GuestStatus | 'all' }[] = [
  { label: 'All',          value: 'all' },
  { label: 'Approved',     value: 'Approved' },
  { label: 'Accommodated', value: 'Accommodated' },
];

export default function CoordinatorSubmittedPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();
  const { getDelegationCountry } = useDelegations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<GuestStatus | 'all'>('all');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (!user) return null;

  const myGuests = guests.filter(g => g.submittedBy === user.id);
  const pendingCount = new Set(
    myGuests.filter(g => g.status === 'Awaiting Review' || g.status === 'Needs Correction')
      .map(g => g.familyGroupId ?? g.id)
  ).size;
  const rejectedCount = new Set(
    myGuests.filter(g => g.status === 'Rejected').map(g => g.familyGroupId ?? g.id)
  ).size;

  const filteredGuests = myGuests
    .filter(g => g.status === 'Approved' || g.status === 'Accommodated')
    .filter(g => statusFilter === 'all' || g.status === statusFilter)
    .filter(g =>
      search === '' ||
      g.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (g.familyName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      g.referenceNumber.toLowerCase().includes(search.toLowerCase()) ||
      g.country.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));

  const displayItems = buildDisplayGroups(filteredGuests);
  const allSubmitted = filteredGuests; // kept for count badge

  const chipCls = (active: boolean) =>
    active
      ? 'bg-[#2D5A45] text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all'
      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#F5F0E8] transition-all';

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0 flex flex-col">
          <div className="p-4 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
              <div>
                <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
                <p className="text-xs text-[#4A4A4A]">Coordinator View</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1 flex-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {COORD_NAV.map((item, i) => (
              <button
                key={i}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/coordinator/submitted'
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </span>
                {item.href === '/coordinator/pending' && pendingCount > 0 && (
                  <span className="bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
                {item.href === '/coordinator/rejected' && rejectedCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {rejectedCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="px-4 mb-2">
            <button
              type="button"
              onClick={() => navigate('/guests/new')}
              className="w-full bg-[#2D5A45] hover:bg-[#234a38] text-white rounded-lg py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              New Registration
            </button>
          </div>

          <SidebarUserFooter />
        </aside>

        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-[#2D5A45]" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Submitted Guests</h1>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {allSubmitted.length} shown
                </Badge>
              </div>
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-3 hover:bg-[#F5F0E8] rounded-lg px-3 py-2 transition-colors"
                >
                  <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-medium">
                    {user.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                    <p className="text-xs text-[#4A4A4A]">{getRoleDisplayLabel(user)}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#4A4A4A]" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-[#E8E3DB] py-1 z-50">
                    <button
                      onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
                    >
                      <User className="w-4 h-4 text-[#4A4A4A]" />
                      Profile
                    </button>
                    <button
                      onClick={() => { logout(); navigate('/login'); }}
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

          <div className="p-6 max-w-6xl mx-auto space-y-5">
            <Card className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name, reference, country..."
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-10"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_CHIPS.map(chip => (
                    <button
                      key={chip.value}
                      onClick={() => setStatusFilter(chip.value)}
                      className={chipCls(statusFilter === chip.value)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="bg-[#F9F8F6]">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="w-5 h-5 text-[#2D5A45]" />
                  My Submissions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {displayItems.length === 0 ? (
                  <div className="py-12 text-center text-[#4A4A4A]/60 text-sm">
                    {search || statusFilter !== 'all'
                      ? 'No guests match the current filters.'
                      : 'You have not submitted any approved guests yet.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#F9F8F6]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Submitted</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Mulaqat</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Delegation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E3DB]">
                        {displayItems.map((item, idx) => {
                          if (item.type === 'individual') {
                            const g = item.guest;
                            return (
                              <tr key={g.id} className="hover:bg-[#FAFAFA]">
                                <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                                <td className="px-4 py-3 font-medium text-[#1A1A1A]">{g.fullName}</td>
                                <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.country}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200">Individual</Badge>
                                </td>
                                <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.submittedAt ?? '—'}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={`text-xs ${statusBadgeCls(g.status)}`}>{g.status}</Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={`text-xs ${g.mulaqat ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                    {g.mulaqat ? 'Yes' : 'No'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-sm text-[#4A4A4A]">
                                  {g.mulaqat && g.delegationId
                                    ? <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                                        {getDelegationCountry(g.delegationId) ?? g.country} Delegation
                                      </span>
                                    : <span className="text-gray-300">—</span>}
                                </td>
                              </tr>
                            );
                          }
                          // Family group
                          const { group } = item;
                          const isExpanded = expandedRows.has(group.groupId);
                          return (
                            <>
                              <tr key={group.groupId} className="hover:bg-[#FAFAFA] cursor-pointer"
                                onClick={() => toggleRow(group.groupId)}>
                                <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{group.head.referenceNumber}</td>
                                <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                                  <div className="flex items-center gap-1.5">
                                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                                    {group.familyName}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-[#4A4A4A]">{group.head.country}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                                    Family ({group.members.length})
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-sm text-[#4A4A4A]">{group.head.submittedAt ?? '—'}</td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-1">
                                    {group.members.map(m => (
                                      <span key={m.id} title={m.status}
                                        className={`w-2.5 h-2.5 rounded-full inline-block ${
                                          m.status === 'Approved' || m.status === 'Accommodated' ? 'bg-green-500'
                                          : m.status === 'Awaiting Review' ? 'bg-amber-400'
                                          : m.status === 'Rejected' ? 'bg-red-500'
                                          : 'bg-orange-400'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={`text-xs ${group.head.mulaqat ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                    {group.head.mulaqat ? 'Yes' : 'No'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-sm text-[#4A4A4A]">
                                  {group.head.mulaqat && group.head.delegationId
                                    ? <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                                        {getDelegationCountry(group.head.delegationId) ?? group.head.country} Delegation
                                      </span>
                                    : <span className="text-gray-300">—</span>}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${group.groupId}-members`} className="bg-gray-50/50">
                                  <td colSpan={8} className="px-6 py-3 border-l-4 border-[#2D5A45]">
                                    <div className="space-y-1.5">
                                      {group.members.map((m, i) => (
                                        <div key={m.id} className="flex items-center gap-3">
                                          <div className="w-6 h-6 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0">
                                            {m.fullName.charAt(0)}
                                          </div>
                                          {m.isHeadOfFamily && <span className="text-amber-500 text-xs">⭐</span>}
                                          <span className="text-sm text-[#1A1A1A] w-36 shrink-0">{m.fullName}</span>
                                          <span className="text-xs text-[#4A4A4A] capitalize w-20 shrink-0">{m.relationship ?? '—'}</span>
                                          <span className="text-xs font-mono text-[#4A4A4A] w-28 shrink-0">{m.referenceNumber}</span>
                                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusBadgeCls(m.status)}`}>
                                            {GUEST_STATUS_LABELS[m.status as GuestStatus] ?? m.status}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
