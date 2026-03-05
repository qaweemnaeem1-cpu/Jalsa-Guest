import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LayoutDashboard, Users, Clock, ScrollText,
  ArrowLeft, Search, ChevronDown, LogOut,
  CheckCircle,
} from 'lucide-react';
import { ROLE_LABELS, GUEST_STATUS_LABELS } from '@/lib/constants';

const COORD_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',       href: '/dashboard' },
  { icon: Clock,           label: 'Pending Guests',  href: '/coordinator/pending' },
  { icon: Users,           label: 'Submitted Guests',href: '/coordinator/submitted' },
  { icon: ScrollText,      label: 'Audit Trail',     href: '/coordinator/audit-trail' },
];

export default function CoordinatorPendingPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { guests } = useGuests();
  const [search, setSearch] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  if (!user) return null;

  const pending = guests.filter(
    g => g.status === 'pending-review'
  ).filter(g =>
    search === '' ||
    g.fullName.toLowerCase().includes(search.toLowerCase()) ||
    g.referenceNumber.toLowerCase().includes(search.toLowerCase()) ||
    g.country.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">

        {/* Coordinator Sidebar */}
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0">
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
          <nav className="p-4 space-y-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {COORD_NAV.map((item, i) => (
              <button
                key={i}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/coordinator/pending'
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </span>
                {item.href === '/coordinator/pending' && pending.length > 0 && (
                  <span className="bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pending.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="absolute bottom-4 left-4 right-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors border border-[#D4CFC7]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Admin View
            </button>
          </div>
        </aside>

        <main className="flex-1 ml-64">
          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-500" />
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Pending Guests</h1>
                {pending.length > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    {pending.length} awaiting review
                  </Badge>
                )}
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
                    <p className="text-xs text-[#4A4A4A]">{ROLE_LABELS[user.role]}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#4A4A4A]" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-[#E8E3DB] py-1 z-50">
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
            {/* Search */}
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name, reference, country..."
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="shadow-sm">
              <CardHeader className="bg-[#F9F8F6]">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="w-5 h-5 text-amber-500" />
                  Awaiting Review
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {pending.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <CheckCircle className="w-12 h-12 text-green-400" />
                    <p className="text-lg font-medium text-[#1A1A1A]">All caught up!</p>
                    <p className="text-sm text-[#4A4A4A]">No pending guests — all submissions have been reviewed.</p>
                    <Button onClick={() => navigate('/coordinator/submitted')} variant="outline" className="mt-2 border-[#D4CFC7]">
                      View Submitted Guests
                    </Button>
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
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E3DB]">
                        {pending.map(g => (
                          <tr key={g.id} className="hover:bg-[#FAFAFA]">
                            <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{g.referenceNumber}</td>
                            <td className="px-4 py-3 font-medium text-[#1A1A1A]">{g.fullName}</td>
                            <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.country}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200 capitalize">
                                {g.guestType}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-[#4A4A4A]">{g.submittedAt ?? '—'}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                {GUEST_STATUS_LABELS[g.status] ?? g.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
