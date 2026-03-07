import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDesignations } from '@/hooks/useDesignations';
import { useAssignableItems, type AssignableItem } from '@/hooks/useAssignableItems';
import { useUsers } from '@/hooks/useUsers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  Search,
  Clock,
  ScrollText,
  ClipboardList,
  CheckSquare,
  MessageSquare,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import type { UserRole } from '@/types';

// ── Strip HTML for security ────────────────────────────────────────────────────
function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim();
}

// ── Nav config ────────────────────────────────────────────────────────────────
const NAV_ITEMS: Record<UserRole, { icon: any; label: string; href: string }[]> = {
  'super-admin': [
    { icon: LayoutDashboard, label: 'Dashboard',         href: '/dashboard' },
    { icon: Users,           label: 'Guests',            href: '/guests' },
    { icon: Users,           label: 'Users',             href: '/users' },
    { icon: Briefcase,       label: 'Designation List',  href: '/designations' },
    { icon: Globe,           label: 'Countries & Depts', href: '/countries-departments' },
    { icon: ScrollText,      label: 'Audit Trail',       href: '/admin/audit-trail' },
  ],
  'desk-in-charge': [
    { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
    { icon: ClipboardList,   label: 'Guests to Review',   href: '/desk/review' },
    { icon: CheckSquare,     label: 'Processed Guests',   href: '/desk/processed' },
    { icon: MessageSquare,   label: 'Messages & Updates', href: '/desk/messages' },
  ],
  'coordinator': [
    { icon: LayoutDashboard, label: 'Dashboard',          href: '/dashboard' },
    { icon: Clock,           label: 'Pending Guests',     href: '/coordinator/pending' },
    { icon: Users,           label: 'Submitted Guests',   href: '/coordinator/submitted' },
    { icon: MessageSquare,   label: 'Messages & Updates', href: '/coordinator/messages' },
  ],
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

// ── Initials avatar helpers ───────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500',
  'bg-teal-500', 'bg-indigo-500', 'bg-rose-500', 'bg-amber-500',
];
function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ── Types ─────────────────────────────────────────────────────────────────────
type FilterType = 'all' | 'country' | 'department';
type ActiveTab = 'designations' | 'countries-departments';

// ── Item dialog component ─────────────────────────────────────────────────────
interface ItemDialogProps {
  open: boolean;
  editingItem: AssignableItem | null;
  allItems: AssignableItem[];
  onClose: () => void;
  onAdd: (name: string, type: 'country' | 'department', description?: string) => void;
  onUpdate: (id: string, updates: Partial<Omit<AssignableItem, 'id'>>) => void;
}

function ItemDialog({ open, editingItem, allItems, onClose, onAdd, onUpdate }: ItemDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'country' | 'department'>('country');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');

  // Sync form when dialog opens / editingItem changes
  const stateKey = open ? (editingItem?.id ?? 'new') : '';
  const [lastKey, setLastKey] = useState('');
  if (stateKey !== lastKey) {
    setLastKey(stateKey);
    if (open) {
      setName(editingItem?.name ?? '');
      setType(editingItem?.type ?? 'country');
      setDescription(editingItem?.description ?? '');
      setNameError('');
    }
  }

  const validate = (): boolean => {
    const safeName = stripHtml(name).trim();
    if (safeName.length < 2) {
      setNameError('Name must be at least 2 characters');
      return false;
    }
    if (safeName.length > 100) {
      setNameError('Name must be 100 characters or fewer');
      return false;
    }
    const duplicate = allItems.some(
      i => i.name.toLowerCase() === safeName.toLowerCase() && i.id !== editingItem?.id
    );
    if (duplicate) {
      setNameError('An item with this name already exists');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const safeName = stripHtml(name).trim();
    const safeDesc = type === 'department' ? stripHtml(description).slice(0, 500) : undefined;
    if (editingItem) {
      onUpdate(editingItem.id, { name: safeName, type, description: safeDesc });
      toast.success(`"${safeName}" updated successfully`);
    } else {
      onAdd(safeName, type, safeDesc);
      toast.success(`"${safeName}" added successfully`);
    }
    onClose();
  };

  const selectCls =
    'w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none focus:ring-1 focus:ring-[#2D5A45]';

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>{editingItem ? 'Edit Country or Department' : 'Add Country or Department'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-[#1A1A1A] block mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={e => { setName(e.target.value); setNameError(''); }}
              placeholder="e.g., Nigeria or MTA Africa"
              className={`border-[#D4CFC7] focus:border-[#2D5A45] h-10 ${nameError ? 'border-red-500' : ''}`}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
          </div>

          {/* Type */}
          <div>
            <label className="text-sm font-medium text-[#1A1A1A] block mb-1.5">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as 'country' | 'department')}
              className={selectCls}
            >
              <option value="country">Country</option>
              <option value="department">Department</option>
            </select>
          </div>

          {/* Description — only for departments */}
          {type === 'department' && (
            <div>
              <label className="text-sm font-medium text-[#1A1A1A] block mb-1.5">
                Description <span className="text-[#4A4A4A] font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of this department..."
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] outline-none resize-none"
              />
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="outline" onClick={onClose} className="border-[#D4CFC7] h-10 px-4">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white h-10 px-4"
            >
              {editingItem ? 'Save Changes' : 'Add Item'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DesignationListPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { designations, activeDesignations, addDesignation, updateDesignation, deleteDesignation, toggleDesignationStatus } = useDesignations();
  const { items, countries, departments, addItem, updateItem, deleteItem, toggleItemStatus } = useAssignableItems();
  const { getUsersByType, removeAssignedItemFromAll } = useUsers();

  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // ── Designation tab state ────────────────────────────────────────────────────
  const [newDesignationName, setNewDesignationName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // ── Main tab ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('designations');

  // ── Countries & Departments tab state ────────────────────────────────────────
  const [cdSearch, setCdSearch] = useState('');
  const [cdFilter, setCdFilter] = useState<FilterType>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AssignableItem | null>(null);
  const [deleteDialogItem, setDeleteDialogItem] = useState<AssignableItem | null>(null);

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  // ── Desk incharges for "Assigned To" column ───────────────────────────────────
  const deskIncharges = getUsersByType('desk-in-charge');

  // Returns list of DIs who have this item assigned
  const getAssignedDIs = (name: string) =>
    deskIncharges.filter(
      d =>
        (d.assignedCountries ?? []).includes(name) ||
        (d.assignedDepartments ?? []).includes(name)
    );

  // ── Filtered + sorted items ───────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = stripHtml(cdSearch).toLowerCase();
    return items
      .filter(item => {
        if (cdFilter === 'country') return item.type === 'country';
        if (cdFilter === 'department') return item.type === 'department';
        return true;
      })
      .filter(item => q === '' || item.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, cdSearch, cdFilter]);

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

  // ── Assignable item handlers ──────────────────────────────────────────────────
  const handleConfirmDelete = () => {
    if (!deleteDialogItem) return;
    deleteItem(deleteDialogItem.id);
    removeAssignedItemFromAll(deleteDialogItem.name);
    toast.success(`"${deleteDialogItem.name}" deleted successfully`);
    setDeleteDialogItem(null);
  };

  // ── Tab button classes ────────────────────────────────────────────────────────
  const tabCls = (tab: ActiveTab) =>
    activeTab === tab
      ? 'bg-[#2D5A45] text-white px-4 py-2 rounded-lg text-sm font-medium transition-all'
      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F0E8] transition-all';

  const filterCls = (f: FilterType) =>
    cdFilter === f
      ? 'bg-[#2D5A45] text-white px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all'
      : 'bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer hover:bg-gray-200 transition-all';

  return (
    <TooltipProvider delayDuration={200}>
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

              {/* ── Tabs ── */}
              <div className="flex gap-2 mb-6">
                <button onClick={() => setActiveTab('designations')} className={tabCls('designations')}>
                  <Briefcase className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Designations
                </button>
                <button onClick={() => setActiveTab('countries-departments')} className={tabCls('countries-departments')}>
                  <Globe className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Countries &amp; Departments
                </button>
              </div>

              {/* ══════════════════════════════════════════════════════════════════
                   TAB 1: DESIGNATIONS (existing content, unchanged)
                  ══════════════════════════════════════════════════════════════════ */}
              {activeTab === 'designations' && (
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
              )}

              {/* ══════════════════════════════════════════════════════════════════
                   TAB 2: COUNTRIES & DEPARTMENTS
                  ══════════════════════════════════════════════════════════════════ */}
              {activeTab === 'countries-departments' && (
                <div className="space-y-5">

                  {/* Header card */}
                  <Card className="shadow-sm">
                    <CardHeader className="bg-[#F9F8F6] pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Globe className="w-5 h-5 text-[#2D5A45]" />
                          Countries &amp; Departments
                        </CardTitle>
                        <Button
                          onClick={() => { setEditingItem(null); setDialogOpen(true); }}
                          className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4"
                        >
                          <Plus className="w-4 h-4 mr-1.5" />
                          Add Item
                        </Button>
                      </div>

                      {/* Stats bar */}
                      <div className="flex gap-4 mt-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{items.length}</Badge>
                          <span className="text-[#4A4A4A]">Total</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="bg-[#D6E4D9] text-[#2D5A45] border-[#2D5A45]/20">{countries.length}</Badge>
                          <span className="text-[#4A4A4A]">Countries</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">{departments.length}</Badge>
                          <span className="text-[#4A4A4A]">Departments</span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-3">
                      {/* Search + filter */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                          <Input
                            value={cdSearch}
                            onChange={e => setCdSearch(e.target.value)}
                            placeholder="Search countries or departments..."
                            className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-10"
                          />
                          {cdSearch && (
                            <button onClick={() => setCdSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A4A4A] hover:text-[#1A1A1A]">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Filter chips */}
                      <div className="flex gap-2">
                        <button onClick={() => setCdFilter('all')} className={filterCls('all')}>All</button>
                        <button onClick={() => setCdFilter('country')} className={filterCls('country')}>Countries</button>
                        <button onClick={() => setCdFilter('department')} className={filterCls('department')}>Departments</button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Table */}
                  <Card className="shadow-sm">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-[#F9F8F6]">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider w-10">#</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider w-32">Type</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Assigned To</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider w-24">Status</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider w-24">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E8E3DB]">
                            {filteredItems.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-[#4A4A4A]/60 text-sm">
                                  {cdSearch ? `No items match "${cdSearch}"` : 'No items found.'}
                                </td>
                              </tr>
                            ) : (
                              filteredItems.map((item, index) => {
                                const assignedDIs = getAssignedDIs(item.name);
                                return (
                                  <tr key={item.id} className="hover:bg-[#FAFAFA]">
                                    <td className="px-4 py-3 text-sm text-[#4A4A4A]">{index + 1}</td>
                                    <td className="px-4 py-3">
                                      <div>
                                        <span className="font-medium text-gray-800 text-sm">{item.name}</span>
                                        {item.description && (
                                          <p className="text-xs text-[#4A4A4A] mt-0.5">{item.description}</p>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      {item.type === 'country' ? (
                                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                                          Country
                                        </span>
                                      ) : (
                                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                                          Department
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      {assignedDIs.length === 0 ? (
                                        <span className="text-sm text-[#4A4A4A]/40">—</span>
                                      ) : (
                                        <div className="flex items-center">
                                          {assignedDIs.slice(0, 5).map((di, i) => (
                                            <Tooltip key={di.id}>
                                              <TooltipTrigger asChild>
                                                <span
                                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-white cursor-default ${avatarColor(di.id)} ${i > 0 ? '-ml-2' : ''}`}
                                                >
                                                  {getInitials(di.name)}
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent side="top" className="text-xs">{di.name}</TooltipContent>
                                            </Tooltip>
                                          ))}
                                          {assignedDIs.length > 5 && (
                                            <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-[10px] font-bold border-2 border-white -ml-2">
                                              +{assignedDIs.length - 5}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      <Switch
                                        checked={item.isActive}
                                        onCheckedChange={() => {
                                          toggleItemStatus(item.id);
                                          toast.success(`"${item.name}" is now ${!item.isActive ? 'active' : 'inactive'}`);
                                        }}
                                        className="data-[state=checked]:bg-[#2D5A45]"
                                      />
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          onClick={() => { setEditingItem(item); setDialogOpen(true); }}
                                          className="p-2 hover:bg-green-50 text-[#4A4A4A] hover:text-[#2D5A45] rounded-lg transition-colors"
                                          title="Edit"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => setDeleteDialogItem(item)}
                                          className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors"
                                          title="Delete"
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
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* ── Add / Edit Item Dialog ── */}
        <ItemDialog
          open={dialogOpen}
          editingItem={editingItem}
          allItems={items}
          onClose={() => { setDialogOpen(false); setEditingItem(null); }}
          onAdd={addItem}
          onUpdate={updateItem}
        />

        {/* ── Delete Confirmation ── */}
        <AlertDialog open={!!deleteDialogItem} onOpenChange={open => !open && setDeleteDialogItem(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleteDialogItem?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will also remove it from any Desk Incharge assignments. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
