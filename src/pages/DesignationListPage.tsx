import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDesignations } from '@/hooks/useDesignations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  ChevronDown,
  ChevronRight,
  LogOut,
  Plus,
  Trash2,
  Edit2,
  Search,
  User,
} from 'lucide-react';
import {
  ROLE_LABELS,
  TIER_ORDER,
  TIER_SECTION_LABEL,
  getTierBadgeLabel,
  getTierBadgeClass,
  getCategoryBadgeClass,
  DESIGNATION_CATEGORIES,
} from '@/lib/constants';
import { ProfileDialog } from '@/components/ProfileDialog';
import type { UserRole, DesignationTier, Designation } from '@/types';
import { SUPER_ADMIN_NAV, DESK_NAV, COORD_NAV } from '@/lib/navItems';

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

// ── Blank form ─────────────────────────────────────────────────────────────────
const BLANK_FORM = { name: '', tier: '' as DesignationTier | '', code: '', category: '', notes: '' };

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DesignationListPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { designations, activeDesignations, addDesignation, updateDesignation, deleteDesignation, toggleDesignationStatus } = useDesignations();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // ── Collapsed tiers ───────────────────────────────────────────────────────
  const [collapsedTiers, setCollapsedTiers] = useState<Set<string>>(new Set());
  const toggleTier = (tier: string) =>
    setCollapsedTiers(prev => {
      const next = new Set(prev);
      next.has(tier) ? next.delete(tier) : next.add(tier);
      return next;
    });

  // ── Add/Edit dialog ───────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);

  const openAdd = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setDialogOpen(true);
  };

  const openEdit = (d: Designation) => {
    setEditingId(d.id);
    setForm({ name: d.name, tier: d.tier ?? '', code: d.code ?? '', category: d.category ?? '', notes: d.notes ?? '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Designation name is required'); return; }
    const isDup = designations.some(
      d => d.name.toLowerCase() === form.name.trim().toLowerCase() && d.id !== editingId
    );
    if (isDup) { toast.error('This designation already exists'); return; }

    if (editingId) {
      await updateDesignation(editingId, {
        name:     form.name.trim(),
        tier:     (form.tier as DesignationTier) || null,
        code:     form.code.trim() || null,
        category: form.category.trim() || null,
        notes:    form.notes.trim() || null,
      });
      toast.success('Designation updated');
    } else {
      await addDesignation({
        name:     form.name.trim(),
        tier:     (form.tier as DesignationTier) || null,
        code:     form.code.trim() || null,
        category: form.category.trim() || null,
        notes:    form.notes.trim() || null,
      });
      toast.success('Designation added');
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    deleteDesignation(id);
    toast.success('Designation deleted');
  };

  if (!user) return null;
  const navItems = NAV_ITEMS[user.role] || [];

  // ── Filter + group ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return designations.filter(d => {
      if (filterTier !== 'all' && (d.tier ?? 'none') !== filterTier) return false;
      if (filterCategory !== 'all' && (d.category ?? 'none') !== filterCategory) return false;
      if (q && !d.name.toLowerCase().includes(q) && !(d.code?.toLowerCase().includes(q)) && !(d.category?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [designations, search, filterTier, filterCategory]);

  // Group by tier
  const grouped = useMemo(() => {
    const map = new Map<string, Designation[]>();
    // Seed in order
    TIER_ORDER.forEach(t => map.set(t, []));
    map.set('none', []);
    for (const d of filtered) {
      const key = d.tier ?? 'none';
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    // Sort each bucket by code then name
    map.forEach(arr => arr.sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name)));
    return map;
  }, [filtered]);

  const activeCount = designations.filter(d => d.isActive).length;

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
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Designation List</h1>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {designations.length} Total
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={openAdd}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Designation
                </Button>
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
            </div>
          </header>

          {/* Content */}
          <div className="p-6 max-w-6xl mx-auto space-y-4">

            {/* Stats */}
            <div className="flex gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{activeCount}</Badge>
                <span className="text-[#4A4A4A]">Active</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">{designations.length - activeCount}</Badge>
                <span className="text-[#4A4A4A]">Inactive</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{designations.length}</Badge>
                <span className="text-[#4A4A4A]">Total</span>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={filterTier} onValueChange={setFilterTier}>
                <SelectTrigger className="w-48 h-9 border-[#D4CFC7] bg-white text-sm">
                  <SelectValue placeholder="All Tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  {TIER_ORDER.map(t => (
                    <SelectItem key={t} value={t}>{TIER_SECTION_LABEL[t] ?? `Tier ${t}`}</SelectItem>
                  ))}
                  <SelectItem value="none">No Tier</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-40 h-9 border-[#D4CFC7] bg-white text-sm">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {DESIGNATION_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  <SelectItem value="none">No Category</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search designations..."
                  className="pl-9 h-9 border-[#D4CFC7] bg-white text-sm"
                />
              </div>
            </div>

            {/* Tier groups */}
            {filtered.length === 0 ? (
              <div className="bg-white border border-[#E8E3DB] rounded-xl p-10 text-center text-[#4A4A4A]">
                No designations match the current filters.
              </div>
            ) : (
              <>
                {([...TIER_ORDER, 'none'] as string[]).map(tier => {
                  const rows = grouped.get(tier) ?? [];
                  if (rows.length === 0) return null;
                  const isCollapsed = collapsedTiers.has(tier);
                  const sectionLabel = tier === 'none' ? 'NO TIER' : (TIER_SECTION_LABEL[tier] ?? `TIER ${tier}`);

                  return (
                    <div key={tier} className="bg-white border border-[#E8E3DB] rounded-xl overflow-hidden shadow-sm">
                      {/* Section header */}
                      <button
                        type="button"
                        onClick={() => toggleTier(tier)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-[#E8E3DB]"
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed
                            ? <ChevronRight className="w-4 h-4 text-gray-500" />
                            : <ChevronDown className="w-4 h-4 text-gray-500" />
                          }
                          <span className="text-sm font-bold uppercase tracking-wide text-gray-600">
                            {sectionLabel}
                          </span>
                          <span className="text-xs text-gray-400">({rows.length})</span>
                        </div>
                        {tier !== 'none' && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getTierBadgeClass(tier)}`}>
                            {getTierBadgeLabel(tier)}
                          </span>
                        )}
                      </button>

                      {/* Table */}
                      {!isCollapsed && (
                        <table className="w-full text-sm">
                          <thead className="bg-[#FAFAF9]">
                            <tr>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Code</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Designation</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Category</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Status</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider max-w-xs">Notes</th>
                              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((d, i) => (
                              <tr
                                key={d.id}
                                className={`border-t border-[#F0EDE8] hover:bg-[#FAFAF9] transition-colors ${i === 0 ? 'border-t-0' : ''}`}
                              >
                                <td className="px-4 py-3">
                                  {d.code
                                    ? <span className="font-mono text-xs text-[#4A4A4A] bg-gray-100 px-1.5 py-0.5 rounded">{d.code}</span>
                                    : <span className="text-gray-300">—</span>
                                  }
                                </td>
                                <td className="px-4 py-3">
                                  <span className="font-medium text-[#1A1A1A]">{d.name}</span>
                                  {!d.isActive && (
                                    <span className="ml-2 text-xs text-gray-400">(inactive)</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {d.category
                                    ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getCategoryBadgeClass(d.category)}`}>{d.category}</span>
                                    : <span className="text-gray-300">—</span>
                                  }
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      toggleDesignationStatus(d.id);
                                      toast.success(`"${d.name}" is now ${!d.isActive ? 'active' : 'inactive'}`);
                                    }}
                                    title={d.isActive ? 'Click to deactivate' : 'Click to activate'}
                                  >
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${d.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                      {d.isActive ? 'Active' : 'Off'}
                                    </span>
                                  </button>
                                </td>
                                <td className="px-4 py-3 max-w-xs">
                                  {d.notes
                                    ? <span className="text-xs text-[#4A4A4A] line-clamp-1" title={d.notes}>{d.notes}</span>
                                    : <span className="text-gray-300">—</span>
                                  }
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => openEdit(d)}
                                      className="p-1.5 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded transition-colors"
                                      title="Edit"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(d.id, d.name)}
                                      className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-[#2D5A45]" />
              {editingId ? 'Edit Designation' : 'Add Designation'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-[#1A1A1A]">Name <span className="text-red-500">*</span></label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Head of State"
                className="border-[#D4CFC7] focus:border-[#2D5A45] h-10"
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              />
            </div>

            {/* Code */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-[#1A1A1A]">Code</label>
              <Input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="GOV-01"
                className="border-[#D4CFC7] focus:border-[#2D5A45] h-10 font-mono"
              />
            </div>

            {/* Tier */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-[#1A1A1A]">Tier</label>
              <Select value={form.tier || '__none'} onValueChange={v => setForm(f => ({ ...f, tier: v === '__none' ? '' : v as DesignationTier }))}>
                <SelectTrigger className="h-10 border-[#D4CFC7]">
                  <SelectValue placeholder="Select tier…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— No tier —</SelectItem>
                  {TIER_ORDER.map(t => (
                    <SelectItem key={t} value={t}>
                      <span className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${getTierBadgeClass(t)}`}>{getTierBadgeLabel(t)}</span>
                        {TIER_SECTION_LABEL[t]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-[#1A1A1A]">Category</label>
              <Select value={form.category || '__none'} onValueChange={v => setForm(f => ({ ...f, category: v === '__none' ? '' : v }))}>
                <SelectTrigger className="h-10 border-[#D4CFC7]">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— No category —</SelectItem>
                  {DESIGNATION_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getCategoryBadgeClass(c)}`}>{c}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-[#1A1A1A]">Notes</label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="President, Prime Minister, King…"
                className="border-[#D4CFC7] focus:border-[#2D5A45] h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-[#D4CFC7]">Cancel</Button>
            <Button onClick={handleSave} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              {editingId ? 'Save Changes' : 'Add Designation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
