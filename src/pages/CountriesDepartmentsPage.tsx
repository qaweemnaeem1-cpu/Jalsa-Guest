import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAssignableItems, type AssignableItem } from '@/hooks/useAssignableItems';
import { useUsers } from '@/hooks/useUsers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  ArrowLeft,
  ChevronDown,
  LogOut,
  Plus,
  Trash2,
  Edit2,
  Globe,
  Building2,
  Search,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Clock,
  ScrollText,
  ClipboardList,
  CheckSquare,
  MessageSquare,
  User,
} from 'lucide-react';
import { ProfileDialog } from '@/components/ProfileDialog';
import type { UserRole } from '@/types';
import { SUPER_ADMIN_NAV, DESK_NAV, COORD_NAV } from '@/lib/navItems';

// ── Nav items (mirrors other pages) ───────────────────────────────────────────

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

const PAGE_SIZE = 25;

// ── Helper: get initials ───────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500',
  'bg-teal-500', 'bg-indigo-500', 'bg-rose-500', 'bg-amber-500',
];
function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ── Strip HTML ────────────────────────────────────────────────────────────────

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim();
}

// ── Delete confirmation dialog ────────────────────────────────────────────────

function DeleteDialog({
  item,
  assignedCount,
  onConfirm,
  onCancel,
}: {
  item: AssignableItem;
  assignedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const match = inputValue === item.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1A1A1A]">Delete {item.type === 'country' ? 'Country' : 'Department'}</h2>
            <p className="text-sm text-[#4A4A4A]">This action cannot be undone.</p>
          </div>
        </div>

        {assignedCount > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">{assignedCount}</span> desk in-charge{assignedCount !== 1 ? 's have' : ' has'} this {item.type} assigned. It will be removed from their assignments.
            </p>
          </div>
        )}

        <p className="text-sm text-[#4A4A4A] mb-3">
          Type <span className="font-semibold text-[#1A1A1A]">{item.name}</span> to confirm deletion:
        </p>
        <Input
          value={inputValue}
          onChange={e => setInputValue(stripHtml(e.target.value))}
          placeholder={item.name}
          className="mb-4 border-[#D4CFC7]"
          autoFocus
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} className="border-[#D4CFC7]">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!match}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Add / Edit dialog ─────────────────────────────────────────────────────────

function ItemFormDialog({
  editing,
  defaultType,
  onSave,
  onCancel,
}: {
  editing: AssignableItem | null;
  defaultType: 'country' | 'department' | 'all';
  onSave: (name: string, type: 'country' | 'department', description?: string, continent?: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<'country' | 'department'>(
    editing ? editing.type : defaultType === 'all' ? 'country' : defaultType
  );
  const [description, setDescription] = useState(editing?.description ?? '');
  const [continent, setContinent] = useState(editing?.continent ?? '');

  const CONTINENTS = [
    'Africa', 'Asia', 'Europe', 'North America',
    'South America', 'Oceania', 'Middle East',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const safeName = stripHtml(name).trim();
    if (!safeName) {
      toast.error('Name is required');
      return;
    }
    onSave(safeName, type, description || undefined, continent || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-5">
          {editing ? 'Edit Item' : 'Add New Item'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type selector — only when adding */}
          {!editing && (
            <div>
              <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">Type</Label>
              <div className="flex gap-2">
                {(['country', 'department'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      type === t
                        ? t === 'country'
                          ? 'border-[#2D5A45] bg-[#E8F5EE] text-[#2D5A45]'
                          : 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-[#D4CFC7] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                    }`}
                  >
                    {t === 'country' ? <Globe className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                    {t === 'country' ? 'Country' : 'Department'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <Label htmlFor="item-name" className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="item-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={type === 'country' ? 'e.g. South Korea' : 'e.g. Al-Sharia'}
              className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
              autoFocus
              maxLength={100}
            />
          </div>

          {/* Continent (country only) */}
          {type === 'country' && (
            <div>
              <Label htmlFor="item-continent" className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">
                Continent
              </Label>
              <select
                id="item-continent"
                value={continent}
                onChange={e => setContinent(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-[#D4CFC7] bg-white text-sm text-[#1A1A1A] focus:outline-none focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
              >
                <option value="">— Select continent —</option>
                {CONTINENTS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* Description (department only) */}
          {type === 'department' && (
            <div>
              <Label htmlFor="item-desc" className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">
                Description
              </Label>
              <Input
                id="item-desc"
                value={description}
                onChange={e => setDescription(stripHtml(e.target.value))}
                placeholder="Brief description…"
                className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
                maxLength={500}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="border-[#D4CFC7]">
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              {editing ? 'Save Changes' : 'Add Item'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CountriesDepartmentsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { items, countries, departments, addItem, updateItem, deleteItem, toggleItemStatus } = useAssignableItems();
  const { users, removeAssignedItemFromAll } = useUsers();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Filter / search
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'country' | 'department'>('all');

  // Pagination
  const [page, setPage] = useState(1);

  // Dialogs
  const [addEditItem, setAddEditItem] = useState<AssignableItem | null | 'new'>( null); // null=closed, 'new'=add, item=edit
  const [deletingItem, setDeletingItem] = useState<AssignableItem | null>(null);

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  // Map: item name → DIs who have it assigned
  const itemToDIs = useMemo(() => {
    const map: Record<string, typeof users> = {};
    for (const di of users.filter(u => u.userType === 'desk-in-charge')) {
      for (const c of di.assignedCountries ?? []) {
        if (!map[c]) map[c] = [];
        map[c].push(di);
      }
      for (const d of di.assignedDepartments ?? []) {
        if (!map[d]) map[d] = [];
        map[d].push(di);
      }
    }
    return map;
  }, [users]);

  // Filtered + searched items
  const filteredItems = useMemo(() => {
    const q = stripHtml(search).toLowerCase();
    return items.filter(item => {
      if (filterType !== 'all' && item.type !== filterType) return false;
      if (q && !item.name.toLowerCase().includes(q) && !(item.continent ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, filterType]);

  // Stats
  const totalCountries = countries.length;
  const activeCountries = countries.filter(c => c.isActive).length;
  const totalDepts = departments.length;
  const activeDepts = departments.filter(d => d.isActive).length;
  const totalAssigned = useMemo(() => Object.keys(itemToDIs).length, [itemToDIs]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetPage = () => setPage(1);

  // Handlers
  const handleFilterChange = (f: typeof filterType) => {
    setFilterType(f);
    resetPage();
  };

  const handleSearch = (q: string) => {
    setSearch(q);
    resetPage();
  };

  const handleToggleStatus = (item: AssignableItem) => {
    toggleItemStatus(item.id);
    toast.success(`"${item.name}" is now ${item.isActive ? 'inactive' : 'active'}`);
  };

  const handleSaveItem = (name: string, type: 'country' | 'department', description?: string, continent?: string) => {
    if (addEditItem === 'new') {
      addItem(name, type, description);
      toast.success(`${type === 'country' ? 'Country' : 'Department'} "${name}" added`);
    } else if (addEditItem && addEditItem !== 'new') {
      updateItem(addEditItem.id, { name, description, continent });
      toast.success(`"${name}" updated`);
    }
    setAddEditItem(null);
  };

  const handleDelete = () => {
    if (!deletingItem) return;
    removeAssignedItemFromAll(deletingItem.name);
    deleteItem(deletingItem.id);
    toast.success(`"${deletingItem.name}" deleted`);
    setDeletingItem(null);
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">

        {/* ── Sidebar ── */}
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
                  item.href === '/countries-departments'
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 ml-64">

          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => navigate('/dashboard')}
                  className="border-[#D4CFC7]"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Countries &amp; Departments</h1>
              </div>

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(prev => !prev)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#F5F0E8] transition-colors"
                >
                  <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {getInitials(user.name)}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-[#1A1A1A]">{user.name}</span>
                  <ChevronDown className="w-4 h-4 text-[#4A4A4A]" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#E8E3DB] rounded-lg shadow-lg z-50">
                    <button
                      onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
                    >
                      <User className="w-4 h-4 text-[#4A4A4A]" />
                      Profile
                    </button>
                    <button
                      onClick={() => { logout(); navigate('/login'); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Page body */}
          <div className="p-6">

            {/* ── Stats bar ── */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Countries', value: totalCountries, sub: `${activeCountries} active`, color: 'text-[#2D5A45]', bg: 'bg-[#E8F5EE]' },
                { label: 'Departments', value: totalDepts, sub: `${activeDepts} active`, color: 'text-purple-700', bg: 'bg-purple-50' },
                { label: 'Total Items', value: items.length, sub: `${items.filter(i => i.isActive).length} active`, color: 'text-[#1A1A1A]', bg: 'bg-white' },
                { label: 'Assigned Items', value: totalAssigned, sub: 'across all desk in-charges', color: 'text-blue-700', bg: 'bg-blue-50' },
              ].map(stat => (
                <div key={stat.label} className={`${stat.bg} rounded-xl p-4 border border-[#E8E3DB]`}>
                  <p className="text-xs font-medium text-[#4A4A4A] mb-1">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">{stat.sub}</p>
                </div>
              ))}
            </div>

            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    value={search}
                    onChange={e => handleSearch(e.target.value)}
                    placeholder="Search by name or continent…"
                    className="pl-9 w-64 border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
                  />
                </div>

                {/* Filter chips */}
                <div className="flex gap-1">
                  {(['all', 'country', 'department'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => handleFilterChange(f)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filterType === f
                          ? 'bg-[#2D5A45] text-white'
                          : 'bg-white border border-[#D4CFC7] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'country' ? 'Countries' : 'Departments'}
                      <span className="ml-1.5 text-xs opacity-70">
                        {f === 'all' ? items.length : f === 'country' ? totalCountries : totalDepts}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => setAddEditItem('new')}
                className="bg-[#2D5A45] hover:bg-[#234839] text-white gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
            </div>

            {/* ── Table ── */}
            <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                    <th className="text-left px-4 py-3 font-medium text-[#4A4A4A]">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-[#4A4A4A]">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-[#4A4A4A]">Continent / Category</th>
                    <th className="text-left px-4 py-3 font-medium text-[#4A4A4A]">Assigned To</th>
                    <th className="text-left px-4 py-3 font-medium text-[#4A4A4A]">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-[#4A4A4A]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-[#4A4A4A]">
                        {search ? `No items match "${search}"` : 'No items found.'}
                      </td>
                    </tr>
                  ) : (
                    pagedItems.map(item => {
                      const assignedDIs = itemToDIs[item.name] ?? [];
                      return (
                        <tr key={item.id} className="border-b border-[#E8E3DB]/60 hover:bg-[#F9F8F6] transition-colors">
                          {/* Name */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {item.type === 'country'
                                ? <Globe className="w-4 h-4 text-[#2D5A45] flex-shrink-0" />
                                : <Building2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
                              }
                              <span className="font-medium text-[#1A1A1A]">{item.name}</span>
                            </div>
                            {item.description && (
                              <p className="text-xs text-[#4A4A4A] ml-6 mt-0.5">{item.description}</p>
                            )}
                          </td>

                          {/* Type badge */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              item.type === 'country'
                                ? 'bg-[#E8F5EE] text-[#2D5A45]'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}>
                              {item.type === 'country' ? 'Country' : 'Department'}
                            </span>
                          </td>

                          {/* Continent / Category */}
                          <td className="px-4 py-3 text-[#4A4A4A]">
                            {item.type === 'country'
                              ? (item.continent ?? <span className="text-[#4A4A4A]/40 italic">—</span>)
                              : <span className="text-[#4A4A4A]/60 italic text-xs">Department</span>
                            }
                          </td>

                          {/* Assigned To */}
                          <td className="px-4 py-3">
                            {assignedDIs.length === 0 ? (
                              <span className="text-xs text-[#4A4A4A]/50 italic">Unassigned</span>
                            ) : (
                              <div className="flex items-center gap-0.5">
                                {assignedDIs.slice(0, 4).map(di => (
                                  <div
                                    key={di.id}
                                    title={di.name}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${avatarColor(di.id)}`}
                                  >
                                    {getInitials(di.name)}
                                  </div>
                                ))}
                                {assignedDIs.length > 4 && (
                                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-[9px] font-bold">
                                    +{assignedDIs.length - 4}
                                  </div>
                                )}
                                <span className="ml-1.5 text-xs text-[#4A4A4A]">{assignedDIs.length}</span>
                              </div>
                            )}
                          </td>

                          {/* Status switch */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={item.isActive}
                                onCheckedChange={() => handleToggleStatus(item)}
                                className="data-[state=checked]:bg-[#2D5A45]"
                              />
                              <span className={`text-xs font-medium ${item.isActive ? 'text-[#2D5A45]' : 'text-[#4A4A4A]'}`}>
                                {item.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setAddEditItem(item)}
                                title="Edit"
                                className="p-1.5 rounded-lg hover:bg-[#F5F0E8] text-[#4A4A4A] transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeletingItem(item)}
                                title="Delete"
                                className="p-1.5 rounded-lg hover:bg-red-50 text-[#4A4A4A] hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-[#4A4A4A]">
                  Showing {Math.min((page - 1) * PAGE_SIZE + 1, filteredItems.length)}–{Math.min(page * PAGE_SIZE, filteredItems.length)} of {filteredItems.length} items
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-[#D4CFC7] hover:bg-[#F5F0E8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`ellipsis-${i}`} className="px-2 text-[#4A4A4A]">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p as number)}
                          className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                            page === p
                              ? 'bg-[#2D5A45] text-white'
                              : 'border border-[#D4CFC7] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg border border-[#D4CFC7] hover:bg-[#F5F0E8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Dialogs ── */}
      {(addEditItem === 'new' || (addEditItem && addEditItem !== 'new')) && (
        <ItemFormDialog
          editing={addEditItem === 'new' ? null : addEditItem}
          defaultType={filterType}
          onSave={handleSaveItem}
          onCancel={() => setAddEditItem(null)}
        />
      )}

      {deletingItem && (
        <DeleteDialog
          item={deletingItem}
          assignedCount={(itemToDIs[deletingItem.name] ?? []).length}
          onConfirm={handleDelete}
          onCancel={() => setDeletingItem(null)}
        />
      )}

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
