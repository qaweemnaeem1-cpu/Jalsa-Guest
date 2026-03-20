import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDesignations } from '@/hooks/useDesignations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  ArrowLeft,
  ChevronDown,
  LogOut,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  Globe,
  Clock,
  ScrollText,
  ClipboardList,
  CheckSquare,
  MessageSquare,
  User,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import { ProfileDialog } from '@/components/ProfileDialog';
import type { UserRole } from '@/types';
import { SUPER_ADMIN_NAV, DESK_NAV, COORD_NAV } from '@/lib/navItems';

// ── Strip HTML for security ────────────────────────────────────────────────────
function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim();
}

// ── Nav config ────────────────────────────────────────────────────────────────
const NAV_ITEMS: Record<UserRole, { icon: any; label: string; href: string }[]> = {
  'super-admin': SUPER_ADMIN_NAV,
  'desk-in-charge': DESK_NAV,
  'coordinator': COORD_NAV,
  'transport': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'accommodation': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'viewer': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DesignationListPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { designations, activeDesignations, addDesignation, updateDesignation, deleteDesignation, toggleDesignationStatus } = useDesignations();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // ── Designation tab state ────────────────────────────────────────────────────
  const [newDesignationName, setNewDesignationName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  // ── Designation handlers ──────────────────────────────────────────────────────
  const handleAddDesignation = () => {
    if (!newDesignationName.trim()) { toast.error('Please enter a designation name'); return; }
    if (designations.some(d => d.name.toLowerCase() === newDesignationName.trim().toLowerCase())) {
      toast.error('This designation already exists'); return;
    }
    addDesignation(newDesignationName.trim());
    setNewDesignationName('');
    toast.success('Designation added successfully');
  };

  const handleStartEdit = (id: string, name: string) => { setEditingId(id); setEditValue(name); };

  const handleSaveEdit = (id: string) => {
    if (!editValue.trim()) { toast.error('Designation name cannot be empty'); return; }
    if (designations.some(d => d.id !== id && d.name.toLowerCase() === editValue.trim().toLowerCase())) {
      toast.error('This designation already exists'); return;
    }
    updateDesignation(id, { name: editValue.trim() });
    setEditingId(null); setEditValue('');
    toast.success('Designation updated successfully');
  };

  const handleCancelEdit = () => { setEditingId(null); setEditValue(''); };

  const handleDeleteDesignation = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteDesignation(id);
      toast.success('Designation deleted successfully');
    }
  };

  const handleToggleDesignation = (id: string, name: string, isActive: boolean) => {
    toggleDesignationStatus(id);
    toast.success(`"${name}" is now ${!isActive ? 'active' : 'inactive'}`);
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">

        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0">
          <div className="p-4 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
              <div>
                <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
                <p className="text-xs text-[#4A4A4A]">Jalsa Salana UK</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {navItems.map((item, index) => (
              <button
                key={index}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  item.href === '/designations' ? 'bg-[#2D5A45] text-white' : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 ml-64">

          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="outline" onClick={() => navigate('/dashboard')} className="border-[#D4CFC7]">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Designation List</h1>
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
                    <div className="px-4 py-2 border-b border-[#E8E3DB]">
                      <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                      <p className="text-xs text-[#4A4A4A]">{user.email}</p>
                    </div>
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

          {/* Content */}
          <div className="p-6 max-w-5xl mx-auto">

            <Card className="shadow-sm">
              <CardHeader className="bg-[#F9F8F6]">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Briefcase className="w-5 h-5 text-[#2D5A45]" />
                  Designation Management
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <p className="text-sm text-[#4A4A4A]">
                  Manage the list of designations available when registering guests.
                  Active designations will appear in the dropdown menu.
                </p>

                <div className="flex gap-3">
                  <Input
                    value={newDesignationName}
                    onChange={e => setNewDesignationName(e.target.value)}
                    placeholder="Enter new designation name"
                    className="flex-1 border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddDesignation(); } }}
                  />
                  <Button
                    type="button"
                    onClick={handleAddDesignation}
                    className="bg-[#2D5A45] hover:bg-[#234839] text-white h-11 px-6"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </div>

                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{activeDesignations.length}</Badge>
                    <span className="text-[#4A4A4A]">Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">{designations.filter(d => !d.isActive).length}</Badge>
                    <span className="text-[#4A4A4A]">Inactive</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{designations.length}</Badge>
                    <span className="text-[#4A4A4A]">Total</span>
                  </div>
                </div>

                <div className="border border-[#E8E3DB] rounded-lg overflow-hidden">
                  <div className="bg-[#F9F8F6] px-4 py-3 border-b border-[#E8E3DB] flex items-center justify-between">
                    <span className="font-medium text-[#1A1A1A]">Designation Name</span>
                    <span className="font-medium text-[#1A1A1A]">Status</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {designations.length === 0 ? (
                      <div className="p-8 text-center text-[#4A4A4A]">No designations found. Add your first designation above.</div>
                    ) : (
                      designations
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(designation => (
                          <div
                            key={designation.id}
                            className="px-4 py-3 border-b border-[#E8E3DB] last:border-b-0 flex items-center justify-between hover:bg-[#FAFAFA]"
                          >
                            {editingId === designation.id ? (
                              <div className="flex-1 flex items-center gap-3">
                                <Input
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  className="flex-1 border-[#D4CFC7] focus:border-[#2D5A45] h-9"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveEdit(designation.id);
                                    else if (e.key === 'Escape') handleCancelEdit();
                                  }}
                                />
                                <Button type="button" variant="ghost" size="sm" onClick={() => handleSaveEdit(designation.id)} className="text-green-600 hover:text-green-700 hover:bg-green-50 h-9 w-9 p-0">
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit} className="text-red-600 hover:text-red-700 hover:bg-red-50 h-9 w-9 p-0">
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-3">
                                  <span className="text-[#1A1A1A]">{designation.name}</span>
                                  {activeDesignations.includes(designation.name) && (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">Active</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => handleToggleDesignation(designation.id, designation.name, designation.isActive)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title={designation.isActive ? 'Deactivate' : 'Activate'}>
                                    {designation.isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                                  </button>
                                  <button type="button" onClick={() => handleStartEdit(designation.id, designation.name)} className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors" title="Edit">
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button type="button" onClick={() => handleDeleteDesignation(designation.id, designation.name)} className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors" title="Delete">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
