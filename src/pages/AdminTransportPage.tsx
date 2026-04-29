/**
 * /admin/drivers — Super Admin Transportation.
 * Tabs: [Pick Up] [Drop Off] [Drivers]
 *   - Pick Up  → TransportGuestsPage in admin variant with mode="pickup"
 *   - Drop Off → TransportGuestsPage in admin variant with mode="dropoff"
 *   - Drivers  → AdminDriversPage (existing driver management) embedded
 */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowDown, ArrowUp, Car } from 'lucide-react';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { TopBar } from '@/components/TopBar';
import { SUPER_ADMIN_NAV } from '@/lib/navItems';
import TransportGuestsPage from '@/pages/TransportGuestsPage';
import AdminDriversPage from '@/pages/AdminDriversPage';

type AdminTransportTab = 'pickup' | 'dropoff' | 'drivers';

export default function AdminTransportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<AdminTransportTab>('pickup');

  const tabs: { key: AdminTransportTab; label: string; icon: typeof ArrowDown }[] = [
    { key: 'pickup',  label: 'Pick Up',  icon: ArrowDown },
    { key: 'dropoff', label: 'Drop Off', icon: ArrowUp },
    { key: 'drivers', label: 'Drivers',  icon: Car },
  ];

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      {/* Admin sidebar */}
      <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0 flex flex-col">
        <div className="p-4 border-b border-[#E8E3DB]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">J</span>
            </div>
            <div>
              <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
              <p className="text-xs text-[#4A4A4A]">Admin View</p>
            </div>
          </div>
        </div>
        <nav className="p-4 space-y-1 flex-1">
          <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
          {SUPER_ADMIN_NAV.map((item, i) => (
            <button
              key={i}
              onClick={() => navigate(item.href)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                location.pathname === item.href
                  ? 'bg-[#2D5A45] text-white'
                  : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
        <SidebarUserFooter />
      </aside>

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8">
          <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2 mb-4">
            🚗 Transportation
          </h1>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 border-b border-[#E8E3DB] mb-6">
            {tabs.map(t => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    active
                      ? 'border-[#2D5A45] text-[#2D5A45]'
                      : 'border-transparent text-[#4A4A4A] hover:text-[#1A1A1A]'
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {tab === 'pickup'  && <TransportGuestsPage mode="pickup"  variant="admin" hideSidebar />}
          {tab === 'dropoff' && <TransportGuestsPage mode="dropoff" variant="admin" hideSidebar />}
          {tab === 'drivers' && <AdminDriversPage hideSidebar />}
        </div>
      </main>
    </div>
  );
}
