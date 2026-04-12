import { useState, useMemo, useEffect, useCallback } from 'react';
import { SortableHeader, sortData } from '@/components/SortableHeader';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUsers, USER_TYPE_LABELS, type UserType, type SystemUser } from '@/hooks/useUsers';
import { useCoordinators, type Coordinator } from '@/hooks/useCoordinators';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  ChevronDown,
  LogOut,
  Plus,
  Trash2,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Search,
  Briefcase,
  User,
  Phone,
  Mail,
  Lock,
  Globe,
  MapPin,
  Clock,
  ScrollText,
  ClipboardList,
  CheckSquare,
  MessageSquare,
  Settings2,
  X,
  Building2,
  Pencil,
  BedDouble,
  Car,
  Loader2,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import { useDepartments } from '@/hooks/useDepartments';
import { useRooms } from '@/hooks/useRooms';
import { CountryAssignmentPanel } from '@/components/CountryAssignmentPanel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProfileDialog } from '@/components/ProfileDialog';
import type { UserRole } from '@/types';
import { SUPER_ADMIN_NAV, DESK_NAV, COORD_NAV } from '@/lib/navItems';
import { supabase } from '@/lib/supabase';

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
  'department-head': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  ],
};

const TABS: { value: UserType; label: string }[] = [
  { value: 'desk-in-charge', label: 'Desk In-Charge' },
  { value: 'coordinator', label: 'Coordinators' },
  { value: 'department-head', label: 'Departmental Users' },
  { value: 'driver', label: 'Drivers' },
];


interface UserFormData {
  name: string;
  email: string;
  password: string;
  phone: string;
  country: string;
  countryCode: string;
  isActive: boolean;
  assignedDeskInchargeId: string;
  department: string;
  location: string;
}

interface DriverRow {
  id: string;
  name: string;
  email: string;
  password_hash?: string | null;
  phone?: string | null;
  department?: string | null;
  location?: string | null;
  vehicle_type?: string | null;
  vehicle_model?: string | null;
  vehicle_registration?: string | null;
  vehicle_capacity?: number | null;
  is_head_driver: boolean;
  is_available?: boolean | null;
}

const COORD_PAGE_SIZE = 20;

export default function UsersPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { addUser, updateUser, deleteUser, toggleUserStatus, assignItems, getUsersByType } = useUsers();
  const { coordinators, addCoordinator, updateCoordinator, deleteCoordinator, toggleCoordinatorActive } = useCoordinators();
  const {
    departments, departmentList,
    addDepartment, renameDepartment, deleteDepartment,
    addLocation, deleteLocation,
    getDeptBadgeCls, getLocPillCls,
  } = useDepartments();
  const { getLocationOccupancy } = useRooms();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<UserType>('desk-in-charge');
  const [modalUserType, setModalUserType] = useState<UserType>('department-head');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  // Sub departmental users dept filter
  const [subDeptFilter, setSubDeptFilter] = useState('');

  // Department management
  const [showManageDepts, setShowManageDepts] = useState(false);
  const [addDeptDialogOpen, setAddDeptDialogOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [renamingDept, setRenamingDept] = useState<string | null>(null);
  const [renameDeptValue, setRenameDeptValue] = useState('');
  const [managingLocsDept, setManagingLocsDept] = useState<string | null>(null);
  const [newLocValue, setNewLocValue] = useState('');

  // Coordinator pagination
  const [coordPage, setCoordPage] = useState(1);

  // Assign countries panel state
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [editingCoordinator, setEditingCoordinator] = useState<Coordinator | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    name: '',
    email: '',
    password: '',
    phone: '',
    country: '',
    countryCode: '',
    isActive: true,
    assignedDeskInchargeId: '',
    department: '',
    location: '',
  });

  // ── Driver tab state ───────────────────────────────────────────────────────────
  const [headDrivers, setHeadDrivers] = useState<DriverRow[]>([]);
  const [regularDrivers, setRegularDrivers] = useState<DriverRow[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driverDeptFilter, setDriverDeptFilter] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  // Driver form
  const [driverFormOpen, setDriverFormOpen] = useState(false);
  const [driverFormIsHead, setDriverFormIsHead] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DriverRow | null>(null);
  const [dName, setDName] = useState('');
  const [dEmail, setDEmail] = useState('');
  const [dPhone, setDPhone] = useState('');
  const [dPassword, setDPassword] = useState('');
  const [dDept, setDDept] = useState('');
  const [dLoc, setDLoc] = useState('');
  const [dVType, setDVType] = useState('');
  const [dVModel, setDVModel] = useState('');
  const [dVReg, setDVReg] = useState('');
  const [dVCap, setDVCap] = useState('');
  const [dSaving, setDSaving] = useState(false);
  const [dShowPwd, setDShowPwd] = useState(false);
  // Delete confirmation
  const [deleteDriverTarget, setDeleteDriverTarget] = useState<DriverRow | null>(null);
  const [deleteDriverChecking, setDeleteDriverChecking] = useState(false);
  const [deleteDriverTaskCount, setDeleteDriverTaskCount] = useState(0);
  const [deleteDriverDeleting, setDeleteDriverDeleting] = useState(false);

  // ── Quick change-password dialog (super admin) ─────────────────────────────
  const [pwTarget, setPwTarget] = useState<{ id: string; name: string; email: string } | null>(null);
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwShowConfirm, setPwShowConfirm] = useState(false);
  // Eye toggle for edit modal password field
  const [editPwVisible, setEditPwVisible] = useState(false);

  // ── Sort states (one pair per table section) ───────────────────────────────
  const [diSortCol, setDiSortCol] = useState<string | null>(null);
  const [diSortDir, setDiSortDir] = useState<'asc' | 'desc'>('asc');
  const [coordSortCol, setCoordSortCol] = useState<string | null>(null);
  const [coordSortDir, setCoordSortDir] = useState<'asc' | 'desc'>('asc');
  const [deptHeadSortCol, setDeptHeadSortCol] = useState<string | null>(null);
  const [deptHeadSortDir, setDeptHeadSortDir] = useState<'asc' | 'desc'>('asc');
  const [locMgrSortCol, setLocMgrSortCol] = useState<string | null>(null);
  const [locMgrSortDir, setLocMgrSortDir] = useState<'asc' | 'desc'>('asc');
  const [headDriverSortCol, setHeadDriverSortCol] = useState<string | null>(null);
  const [headDriverSortDir, setHeadDriverSortDir] = useState<'asc' | 'desc'>('asc');
  const [regDriverSortCol, setRegDriverSortCol] = useState<string | null>(null);
  const [regDriverSortDir, setRegDriverSortDir] = useState<'asc' | 'desc'>('asc');

  // Fetch drivers when switching to driver tab
  useEffect(() => {
    if (activeTab !== 'driver') return;
    let mounted = true;
    setDriversLoading(true);
    const SELECT = 'id,name,email,password_hash,phone,department,location,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_head_driver,is_available';
    Promise.all([
      supabase.from('users').select(SELECT).eq('role', 'driver').eq('is_head_driver', true).order('name'),
      supabase.from('users').select(SELECT).eq('role', 'driver').eq('is_head_driver', false).order('name'),
    ]).then(([headRes, regRes]) => {
      if (!mounted) return;
      setHeadDrivers((headRes.data ?? []) as DriverRow[]);
      setRegularDrivers((regRes.data ?? []) as DriverRow[]);
      setDriversLoading(false);
    });
    return () => { mounted = false; };
  }, [activeTab]);

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  // Non-coordinator users (for desk-in-charge, driver tabs)
  const filteredUsers = getUsersByType(activeTab).filter(u => {
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  // Department Heads (for combined Departmental Users tab)
  const filteredDeptHeads = getUsersByType('department-head').filter(u => {
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  // Location Managers / nizamat-in-charge (for combined Departmental Users tab)
  const filteredLocManagers = getUsersByType('location-manager').filter(u => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.location ?? '').toLowerCase().includes(q);
    const matchesDept = !subDeptFilter || u.department === subDeptFilter;
    return matchesSearch && matchesDept;
  });

  // Coordinator-specific filtering + pagination
  const filteredCoordinators = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return coordinators.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q)
    );
  }, [coordinators, searchQuery]);

  const coordTotalPages = Math.max(1, Math.ceil(filteredCoordinators.length / COORD_PAGE_SIZE));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedCoordinators = sortData(filteredCoordinators as any[], coordSortCol, coordSortDir);
  const pagedCoordinators = sortedCoordinators.slice(
    (coordPage - 1) * COORD_PAGE_SIZE,
    coordPage * COORD_PAGE_SIZE
  );

  const togglePasswordVisibility = (userId: string) => {
    setShowPasswordMap(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const openAddModal = (userType?: UserType) => {
    setEditingUser(null);
    setEditingCoordinator(null);
    if (userType) setModalUserType(userType);
    else setModalUserType(activeTab);
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      country: '',
      countryCode: '',
      isActive: true,
      assignedDeskInchargeId: '',
      department: '',
      location: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (userToEdit: SystemUser) => {
    setEditingUser(userToEdit);
    setEditingCoordinator(null);
    setModalUserType(userToEdit.userType);
    setFormData({
      name: userToEdit.name,
      email: userToEdit.email,
      password: userToEdit.password,
      phone: userToEdit.phone || '',
      country: userToEdit.country || '',
      countryCode: userToEdit.countryCode || '',
      isActive: userToEdit.isActive,
      assignedDeskInchargeId: '',
      department: userToEdit.department || '',
      location: userToEdit.location || '',
    });
    setIsModalOpen(true);
  };

  const openEditCoordinator = (coord: Coordinator) => {
    setEditingUser(null);
    setEditingCoordinator(coord);
    setFormData({
      name: coord.name,
      email: coord.email,
      password: coord.password,
      phone: coord.phone,
      country: coord.country,
      countryCode: '',
      isActive: coord.isActive,
      assignedDeskInchargeId: coord.assignedDeskInchargeId,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setEditingCoordinator(null);
    setEditPwVisible(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const isEditing = !!(editingUser || editingCoordinator);
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (!isEditing && !formData.password.trim()) {
      toast.error('Password is required');
      return;
    }

    if (modalUserType === 'coordinator') {
      const diUser = getUsersByType('desk-in-charge').find(d => d.id === formData.assignedDeskInchargeId);
      if (editingCoordinator) {
        updateCoordinator(editingCoordinator.id, {
          name: formData.name,
          email: formData.email,
          ...(formData.password.trim() ? { password: formData.password } : {}),
          phone: formData.phone,
          country: formData.country,
          isActive: formData.isActive,
          assignedDeskInchargeId: formData.assignedDeskInchargeId,
          assignedDeskInchargeName: diUser?.name ?? '',
        });
        toast.success('Coordinator updated successfully');
      } else {
        addCoordinator({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone,
          country: formData.country,
          isActive: formData.isActive,
          assignedDeskInchargeId: formData.assignedDeskInchargeId,
          assignedDeskInchargeName: diUser?.name ?? '',
        });
        toast.success('Coordinator added successfully');
      }
    } else {
      if (modalUserType === 'location-manager' && (!formData.department || !formData.location)) {
        toast.error('Please select a department and location');
        return;
      }
      if (editingUser) {
        updateUser(editingUser.id, {
          name: formData.name,
          phone: formData.phone || undefined,
          country: formData.country || undefined,
          department: formData.department || undefined,
          location: formData.location || undefined,
          isActive: formData.isActive,
          ...(formData.password.trim() ? { password: formData.password.trim() } : {}),
        });
        toast.success('User updated successfully');
      } else {
        addUser({
          ...formData,
          userType: modalUserType,
          country: formData.country,
        });
        toast.success('User added successfully');
      }
    }
    closeModal();
  };

  const handleDeleteCoordinator = (coord: Coordinator) => {
    if (confirm(`Are you sure you want to delete "${coord.name}"?`)) {
      deleteCoordinator(coord.id);
      toast.success('Coordinator deleted successfully');
    }
  };

  const handleDelete = (userToDelete: SystemUser) => {
    if (confirm(`Are you sure you want to delete "${userToDelete.name}"?`)) {
      deleteUser(userToDelete.id);
      toast.success('User deleted successfully');
    }
  };

  const handleToggleCoordinator = (coord: Coordinator) => {
    toggleCoordinatorActive(coord.id);
    toast.success(`"${coord.name}" is now ${coord.isActive ? 'inactive' : 'active'}`);
  };

  const handleToggleStatus = (userToToggle: SystemUser) => {
    toggleUserStatus(userToToggle.id);
    toast.success(`"${userToToggle.name}" is now ${!userToToggle.isActive ? 'active' : 'inactive'}`);
  };

  // ── Driver tab handlers ────────────────────────────────────────────────────────

  const refreshDrivers = async () => {
    const SELECT = 'id,name,email,password_hash,phone,department,location,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_head_driver,is_available';
    const [headRes, regRes] = await Promise.all([
      supabase.from('users').select(SELECT).eq('role', 'driver').eq('is_head_driver', true).order('name'),
      supabase.from('users').select(SELECT).eq('role', 'driver').eq('is_head_driver', false).order('name'),
    ]);
    setHeadDrivers((headRes.data ?? []) as DriverRow[]);
    setRegularDrivers((regRes.data ?? []) as DriverRow[]);
  };

  const openDriverForm = (isHead: boolean, driver: DriverRow | null = null) => {
    setDriverFormIsHead(isHead);
    setEditingDriver(driver);
    if (driver) {
      setDName(driver.name); setDEmail(driver.email); setDPhone(driver.phone ?? '');
      setDPassword(''); setDDept(driver.department ?? ''); setDLoc(driver.location ?? '');
      setDVType(driver.vehicle_type ?? ''); setDVModel(driver.vehicle_model ?? '');
      setDVReg(driver.vehicle_registration ?? '');
      setDVCap(driver.vehicle_capacity != null ? String(driver.vehicle_capacity) : '');
      setDriverFormIsHead(driver.is_head_driver);
    } else {
      setDName(''); setDEmail(''); setDPhone(''); setDPassword('');
      setDDept(''); setDLoc(''); setDVType(''); setDVModel(''); setDVReg(''); setDVCap('');
    }
    setDShowPwd(false);
    setDriverFormOpen(true);
  };

  const handleSaveDriver = async () => {
    if (!dName.trim()) { toast.error('Name is required'); return; }
    if (!dEmail.trim()) { toast.error('Email is required'); return; }
    if (!editingDriver && !dPassword.trim()) { toast.error('Password is required'); return; }
    setDSaving(true);
    try {
      if (editingDriver) {
        const updates: Record<string, unknown> = {
          name: dName.trim(), email: dEmail.trim(), phone: dPhone.trim() || null,
          department: dDept || null, location: dLoc || null,
          vehicle_type: dVType || null, vehicle_model: dVModel.trim() || null,
          vehicle_registration: dVReg.trim() || null,
          vehicle_capacity: dVCap ? Number(dVCap) : null,
          is_head_driver: driverFormIsHead,
        };
        if (dPassword.trim()) updates.password = dPassword.trim();
        const { error } = await supabase.from('users').update(updates).eq('id', editingDriver.id);
        if (error) throw error;
        toast.success('Driver updated');
      } else {
        const { error } = await supabase.from('users').insert({
          name: dName.trim(), email: dEmail.trim(), phone: dPhone.trim() || null,
          password: dPassword.trim(), role: 'driver',
          department: dDept || null, location: dLoc || null,
          vehicle_type: dVType || null, vehicle_model: dVModel.trim() || null,
          vehicle_registration: dVReg.trim() || null,
          vehicle_capacity: dVCap ? Number(dVCap) : null,
          is_head_driver: driverFormIsHead, is_available: true,
        });
        if (error) throw error;
        toast.success(driverFormIsHead ? 'Nazim Transport created' : 'Driver created');
      }
      setDriverFormOpen(false);
      await refreshDrivers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setDSaving(false);
    }
  };

  const confirmDeleteDriver = async (driver: DriverRow) => {
    setDeleteDriverTarget(driver);
    setDeleteDriverTaskCount(0);
    setDeleteDriverChecking(true);
    const { count } = await supabase
      .from('driver_tasks').select('id', { count: 'exact', head: true })
      .eq('driver_id', driver.id).in('status', ['pending', 'in_progress']);
    setDeleteDriverTaskCount(count ?? 0);
    setDeleteDriverChecking(false);
  };

  const handleDeleteDriver = async () => {
    if (!deleteDriverTarget) return;
    setDeleteDriverDeleting(true);
    const { error } = await supabase.from('users').delete().eq('id', deleteDriverTarget.id);
    if (error) { toast.error('Failed to delete driver'); setDeleteDriverDeleting(false); return; }
    toast.success('Driver removed');
    setDeleteDriverTarget(null);
    setDeleteDriverDeleting(false);
    await refreshDrivers();
  };

  // ── Quick password change (super admin) ───────────────────────────────────
  const openPwChange = (id: string, name: string, email: string) => {
    setPwTarget({ id, name, email });
    setPwNew(''); setPwConfirm(''); setPwError('');
    setPwShowNew(false); setPwShowConfirm(false);
  };

  const handleSavePasswordChange = async () => {
    if (pwNew.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    if (pwNew !== pwConfirm) { setPwError('Passwords do not match'); return; }
    if (!pwTarget) return;
    setPwSaving(true);
    const { error } = await supabase.from('users').update({ password_hash: pwNew }).eq('id', pwTarget.id);
    setPwSaving(false);
    if (error) { setPwError('Failed to update password'); return; }
    // Update in-memory state for drivers
    setHeadDrivers(prev => prev.map(d => d.id === pwTarget.id ? { ...d, password_hash: pwNew } : d));
    setRegularDrivers(prev => prev.map(d => d.id === pwTarget.id ? { ...d, password_hash: pwNew } : d));
    toast.success(`Password changed for ${pwTarget.name}`);
    setPwTarget(null);
  };

  // Driver tab computed
  const filteredRegularDrivers = regularDrivers.filter(d => {
    const q = driverSearch.toLowerCase();
    const matchesDept = !driverDeptFilter || d.department === driverDeptFilter;
    const matchesSearch = !q ||
      d.name.toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q) ||
      (d.location ?? '').toLowerCase().includes(q);
    return matchesDept && matchesSearch;
  });

  const getNazimTransport = (driver: DriverRow) =>
    headDrivers.find(h => h.location === driver.location)?.name ?? '—';

  const getStats = () => {
    if (activeTab === 'coordinator') {
      return {
        total: coordinators.length,
        active: coordinators.filter(c => c.isActive).length,
        inactive: coordinators.filter(c => !c.isActive).length,
      };
    }
    const typeUsers = getUsersByType(activeTab);
    return {
      total: typeUsers.length,
      active: typeUsers.filter(u => u.isActive).length,
      inactive: typeUsers.filter(u => !u.isActive).length,
    };
  };

  const stats = getStats();

  // ── Sort handlers ──────────────────────────────────────────────────────────
  const makeSort = useCallback((
    setCol: React.Dispatch<React.SetStateAction<string | null>>,
    setDir: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>,
    currentCol: string | null,
  ) => (col: string) => {
    if (currentCol === col) {
      setDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setCol(col);
      setDir('asc');
    }
  }, []);

  const handleDiSort = makeSort(setDiSortCol, setDiSortDir, diSortCol);
  const handleCoordSort = makeSort(setCoordSortCol, setCoordSortDir, coordSortCol);
  const handleDeptHeadSort = makeSort(setDeptHeadSortCol, setDeptHeadSortDir, deptHeadSortCol);
  const handleLocMgrSort = makeSort(setLocMgrSortCol, setLocMgrSortDir, locMgrSortCol);
  const handleHeadDriverSort = makeSort(setHeadDriverSortCol, setHeadDriverSortDir, headDriverSortCol);
  const handleRegDriverSort = makeSort(setRegDriverSortCol, setRegDriverSortDir, regDriverSortCol);

  // ── Sorted data ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedDiUsers = sortData(filteredUsers as any[], diSortCol, diSortDir) as SystemUser[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedDeptHeads = sortData(filteredDeptHeads as any[], deptHeadSortCol, deptHeadSortDir) as SystemUser[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedLocManagers = sortData(filteredLocManagers as any[], locMgrSortCol, locMgrSortDir) as SystemUser[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedHeadDrivers = sortData(headDrivers as any[], headDriverSortCol, headDriverSortDir) as DriverRow[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedRegDrivers = sortData(filteredRegularDrivers as any[], regDriverSortCol, regDriverSortDir) as DriverRow[];

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
                  item.href === '/users'
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

        {/* Main Content */}
        <main className="flex-1 ml-64">
          {/* Header */}
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-[#1A1A1A]">User Management</h1>
              
              {/* User Menu */}
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
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
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
          <div className="p-6 w-full">
            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => {
                    setActiveTab(tab.value);
                    setSearchQuery('');
                    setCoordPage(1);
                    setSubDeptFilter('');
                  }}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.value
                      ? 'bg-[#2D5A45] text-white'
                      : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] hover:bg-[#F5F0E8]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Stats */}
            {activeTab === 'department-head' ? (
              <div className="flex flex-wrap gap-3 mb-6 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {getUsersByType('department-head').length}
                  </Badge>
                  <span className="text-[#4A4A4A]">Department Heads</span>
                </div>
                <span className="text-[#D4CFC7] self-center">|</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                    {getUsersByType('location-manager').length}
                  </Badge>
                  <span className="text-[#4A4A4A]">Location Managers</span>
                </div>
                <span className="text-[#D4CFC7] self-center">|</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
                    {departmentList.length}
                  </Badge>
                  <span className="text-[#4A4A4A]">Departments</span>
                </div>
                <span className="text-[#D4CFC7] self-center">|</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    {departmentList.reduce((sum, d) => sum + (departments[d]?.length ?? 0), 0)}
                  </Badge>
                  <span className="text-[#4A4A4A]">Locations</span>
                </div>
              </div>
            ) : activeTab === 'driver' ? (
              <div className="flex flex-wrap gap-3 mb-6 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{headDrivers.length}</Badge>
                  <span className="text-[#4A4A4A]">Nazim Transport</span>
                </div>
                <span className="text-[#D4CFC7] self-center">|</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{regularDrivers.length}</Badge>
                  <span className="text-[#4A4A4A]">Drivers</span>
                </div>
                <span className="text-[#D4CFC7] self-center">|</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">{departmentList.length}</Badge>
                  <span className="text-[#4A4A4A]">Departments</span>
                </div>
                <span className="text-[#D4CFC7] self-center">|</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    {departmentList.reduce((sum, d) => sum + (departments[d]?.length ?? 0), 0)}
                  </Badge>
                  <span className="text-[#4A4A4A]">Locations</span>
                </div>
              </div>
            ) : (
              <div className="flex gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {stats.total}
                  </Badge>
                  <span className="text-sm text-[#4A4A4A]">Total</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    {stats.active}
                  </Badge>
                  <span className="text-sm text-[#4A4A4A]">Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                    {stats.inactive}
                  </Badge>
                  <span className="text-sm text-[#4A4A4A]">Inactive</span>
                </div>
              </div>
            )}

            {/* Search and Add — non-department-head, non-driver tabs only */}
            {activeTab !== 'department-head' && activeTab !== 'driver' && (
              <Card className="shadow-sm mb-6">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                      <Input
                        placeholder={`Search ${USER_TYPE_LABELS[activeTab].toLowerCase()}...`}
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCoordPage(1); }}
                        className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                      />
                    </div>
                    <Button
                      onClick={() => openAddModal()}
                      className="bg-[#2D5A45] hover:bg-[#234839] text-white h-11 px-6"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add {USER_TYPE_LABELS[activeTab]}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Add Department Dialog */}
            {addDeptDialogOpen && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
                  <h2 className="text-lg font-semibold text-[#1A1A1A]">Add New Department</h2>
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A]">Department Name *</Label>
                    <Input
                      autoFocus
                      value={newDeptName}
                      onChange={e => setNewDeptName(e.target.value)}
                      placeholder="e.g. Finance"
                      className="border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (newDeptName.trim()) { addDepartment(newDeptName.trim()); setAddDeptDialogOpen(false); toast.success('Department added'); }
                        }
                      }}
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => setAddDeptDialogOpen(false)} className="border-[#D4CFC7] h-10">Cancel</Button>
                    <Button
                      onClick={() => {
                        if (!newDeptName.trim()) { toast.error('Name required'); return; }
                        addDepartment(newDeptName.trim());
                        setAddDeptDialogOpen(false);
                        toast.success(`Department "${newDeptName.trim()}" added`);
                      }}
                      className="bg-[#2D5A45] hover:bg-[#234839] text-white h-10"
                    >
                      Add Department
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Users List */}
            {activeTab === 'department-head' ? (
              <div className="space-y-0">
                {/* ── SECTION A: Department Heads ── */}
                <Card className="shadow-sm mb-0">
                  <CardHeader className="bg-[#F9F8F6] py-3 px-5">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="w-4 h-4 text-[#2D5A45]" />
                        Department Heads
                        <Badge variant="outline" className="ml-1 text-xs bg-blue-50 text-blue-700 border-blue-200">
                          {getUsersByType('department-head').length}
                        </Badge>
                      </CardTitle>
                      <Button
                        onClick={() => openAddModal('department-head')}
                        className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8 px-3 text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add Department Head
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Department Heads table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-[#F9F8F6]">
                          <tr>
                            <SortableHeader label="Name" column="name" sortCol={deptHeadSortCol} sortDir={deptHeadSortDir} onSort={handleDeptHeadSort} />
                            <SortableHeader label="Email" column="email" sortCol={deptHeadSortCol} sortDir={deptHeadSortDir} onSort={handleDeptHeadSort} />
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Password</th>
                            <SortableHeader label="Department" column="department" sortCol={deptHeadSortCol} sortDir={deptHeadSortDir} onSort={handleDeptHeadSort} />
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Locations</th>
                            <SortableHeader label="Phone" column="phone" sortCol={deptHeadSortCol} sortDir={deptHeadSortDir} onSort={handleDeptHeadSort} />
                            <SortableHeader label="Status" column="isActive" sortCol={deptHeadSortCol} sortDir={deptHeadSortDir} onSort={handleDeptHeadSort} />
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E3DB]">
                          {sortedDeptHeads.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-4 py-8 text-center text-[#4A4A4A]">
                                No department heads found.
                              </td>
                            </tr>
                          ) : (
                            sortedDeptHeads.map((u) => (
                              <tr key={u.id} className="hover:bg-[#FAFAFA]">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium">
                                      {u.name.charAt(0)}
                                    </div>
                                    <span className="font-medium text-[#1A1A1A]">{u.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-[#4A4A4A]">{u.email}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[#4A4A4A] font-mono text-sm">
                                      {showPasswordMap[u.id] ? (u.password || '—') : '••••••••'}
                                    </span>
                                    <button onClick={() => togglePasswordVisibility(u.id)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                                      {showPasswordMap[u.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                    <button onClick={() => openPwChange(u.id, u.name, u.email)} className="p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600" title="Change password">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {u.department ? (
                                    <Badge variant="outline" className={getDeptBadgeCls(u.department ?? '')}>
                                      {u.department}
                                    </Badge>
                                  ) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {(() => {
                                    const locs = departments[u.department ?? ''] ?? [];
                                    return locs.length > 0 ? (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#D6E4D9] text-[#2D5A45] hover:bg-[#C5D9C9] transition-colors">
                                            {locs.length} location{locs.length !== 1 ? 's' : ''}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-3" align="start">
                                          <p className="text-xs font-semibold text-[#2D5A45] uppercase tracking-wide mb-2">
                                            Locations ({locs.length})
                                          </p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {locs.map((loc, i) => (
                                              <span key={i} className="text-xs bg-[#E8F5EE] text-[#2D5A45] border border-[#D6E4D9] px-2 py-0.5 rounded-full">
                                                {loc}
                                              </span>
                                            ))}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    ) : '—';
                                  })()}
                                </td>
                                <td className="px-4 py-3 text-[#4A4A4A]">{u.phone || '—'}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={u.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}>
                                    {u.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => handleToggleStatus(u)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title={u.isActive ? 'Deactivate' : 'Activate'}>
                                      {u.isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                                    </button>
                                    <button onClick={() => openEditModal(u)} className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors" title="Edit">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(u)} className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors" title="Delete">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Manage Departments expandable panel — below table */}
                    <div className="border-t border-[#E8E3DB]">
                      <button
                        onClick={() => setShowManageDepts(v => !v)}
                        className="w-full flex items-center justify-between px-5 py-3 text-sm text-[#4A4A4A] hover:bg-[#F9F8F6] transition-colors"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <Settings2 className="w-4 h-4 text-[#2D5A45]" />
                          Manage Departments
                        </span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showManageDepts ? 'rotate-180' : ''}`} />
                      </button>
                      {showManageDepts && (
                        <div className="px-5 pb-4 space-y-3 bg-[#FAFAFA] border-t border-[#E8E3DB]">
                          <div className="flex items-center justify-between pt-3">
                            <p className="text-sm font-semibold text-[#1A1A1A]">Departments & Locations</p>
                            <Button
                              variant="outline"
                              onClick={() => { setNewDeptName(''); setAddDeptDialogOpen(true); }}
                              className="border-[#2D5A45] text-[#2D5A45] hover:bg-[#F5F0E8] h-7 px-3 text-xs"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add Department
                            </Button>
                          </div>
                          {departmentList.map(dept => (
                            <div key={dept} className="bg-[#F9F8F6] rounded-lg border border-[#E8E3DB] p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                {renamingDept === dept ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    <input
                                      autoFocus
                                      value={renameDeptValue}
                                      onChange={e => setRenameDeptValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          if (renameDeptValue.trim()) renameDepartment(dept, renameDeptValue.trim());
                                          setRenamingDept(null);
                                        }
                                        if (e.key === 'Escape') setRenamingDept(null);
                                      }}
                                      className="flex-1 px-2 py-1 border border-[#2D5A45] rounded text-sm focus:outline-none"
                                    />
                                    <button
                                      onClick={() => {
                                        if (renameDeptValue.trim()) renameDepartment(dept, renameDeptValue.trim());
                                        setRenamingDept(null);
                                      }}
                                      className="text-xs text-[#2D5A45] font-medium px-2 py-1 hover:bg-[#E8F5EE] rounded"
                                    >Save</button>
                                    <button onClick={() => setRenamingDept(null)} className="text-xs text-[#4A4A4A] px-2 py-1 hover:bg-gray-100 rounded">Cancel</button>
                                  </div>
                                ) : (
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getDeptBadgeCls(dept)}`}>
                                    <Building2 className="w-3 h-3 mr-1" />{dept}
                                  </span>
                                )}
                                <div className="flex items-center gap-1 ml-2">
                                  <button
                                    onClick={() => { setRenamingDept(dept); setRenameDeptValue(dept); }}
                                    className="p-1.5 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded transition-colors"
                                    title="Rename"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const usersInDept = getUsersByType('location-manager').filter(u => u.department === dept).length;
                                      if (usersInDept > 0) {
                                        toast.error(`Cannot delete "${dept}" — ${usersInDept} user${usersInDept > 1 ? 's' : ''} assigned`);
                                        return;
                                      }
                                      if (confirm(`Delete department "${dept}"?`)) deleteDepartment(dept);
                                    }}
                                    className="p-1.5 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              {/* Locations */}
                              <div className="pl-1 space-y-1.5">
                                <div className="flex flex-wrap gap-1.5">
                                  {(departments[dept] ?? []).map(loc => (
                                    <span key={loc} className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium border ${getLocPillCls(dept, loc)}`}>
                                      {loc}
                                      <button
                                        onClick={() => deleteLocation(dept, loc)}
                                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
                                        title="Remove location"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                                {managingLocsDept === dept ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      autoFocus
                                      value={newLocValue}
                                      onChange={e => setNewLocValue(e.target.value)}
                                      placeholder="Location name..."
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          if (newLocValue.trim()) { addLocation(dept, newLocValue.trim()); setNewLocValue(''); }
                                          setManagingLocsDept(null);
                                        }
                                        if (e.key === 'Escape') { setManagingLocsDept(null); setNewLocValue(''); }
                                      }}
                                      className="flex-1 px-2 py-1 border border-[#D4CFC7] rounded text-xs focus:outline-none focus:border-[#2D5A45]"
                                    />
                                    <button
                                      onClick={() => {
                                        if (newLocValue.trim()) { addLocation(dept, newLocValue.trim()); setNewLocValue(''); }
                                        setManagingLocsDept(null);
                                      }}
                                      className="text-xs text-[#2D5A45] font-medium px-2 py-1 hover:bg-[#E8F5EE] rounded"
                                    >Add</button>
                                    <button onClick={() => { setManagingLocsDept(null); setNewLocValue(''); }} className="text-xs text-[#4A4A4A] px-2 py-1 hover:bg-gray-100 rounded">Cancel</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setManagingLocsDept(dept); setNewLocValue(''); }}
                                    className="text-xs text-[#2D5A45] hover:underline flex items-center gap-0.5"
                                  >
                                    <Plus className="w-3 h-3" /> Add location
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* ── DIVIDER ── */}
                <div className="py-6 px-1">
                  <div className="border-t border-gray-200" />
                </div>

                {/* ── SECTION B: Location Managers ── */}
                <Card className="shadow-sm">
                  <CardHeader className="bg-[#F9F8F6] py-3 px-5">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <MapPin className="w-4 h-4 text-[#2D5A45]" />
                        Location Managers
                        <Badge variant="outline" className="ml-1 text-xs bg-purple-50 text-purple-700 border-purple-200">
                          {getUsersByType('location-manager').length}
                        </Badge>
                      </CardTitle>
                      <Button
                        onClick={() => openAddModal('location-manager')}
                        className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8 px-3 text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add Location Manager
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Search + Dept filter chips */}
                    <div className="px-4 py-3 border-b border-[#E8E3DB] flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                        <Input
                          placeholder="Search location managers..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {['', ...departmentList].map(dept => (
                          <button
                            key={dept}
                            onClick={() => setSubDeptFilter(dept)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                              subDeptFilter === dept
                                ? 'bg-[#2D5A45] text-white'
                                : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] hover:bg-[#F5F0E8]'
                            }`}
                          >
                            {dept || 'All'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Location Managers table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-[#F9F8F6]">
                          <tr>
                            <SortableHeader label="Name" column="name" sortCol={locMgrSortCol} sortDir={locMgrSortDir} onSort={handleLocMgrSort} />
                            <SortableHeader label="Email" column="email" sortCol={locMgrSortCol} sortDir={locMgrSortDir} onSort={handleLocMgrSort} />
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Password</th>
                            <SortableHeader label="Department" column="department" sortCol={locMgrSortCol} sortDir={locMgrSortDir} onSort={handleLocMgrSort} />
                            <SortableHeader label="Location" column="location" sortCol={locMgrSortCol} sortDir={locMgrSortDir} onSort={handleLocMgrSort} />
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rooms</th>
                            <SortableHeader label="Phone" column="phone" sortCol={locMgrSortCol} sortDir={locMgrSortDir} onSort={handleLocMgrSort} />
                            <SortableHeader label="Status" column="isActive" sortCol={locMgrSortCol} sortDir={locMgrSortDir} onSort={handleLocMgrSort} />
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E3DB]">
                          {sortedLocManagers.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="px-4 py-8 text-center text-[#4A4A4A]">
                                No location managers found.
                              </td>
                            </tr>
                          ) : (
                            sortedLocManagers.map((u) => (
                              <tr key={u.id} className="hover:bg-[#FAFAFA]">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium">
                                      {u.name.charAt(0)}
                                    </div>
                                    <span className="font-medium text-[#1A1A1A]">{u.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-[#4A4A4A] text-sm">{u.email}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[#4A4A4A] font-mono text-sm">
                                      {showPasswordMap[u.id] ? (u.password || '—') : '••••••••'}
                                    </span>
                                    <button onClick={() => togglePasswordVisibility(u.id)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                                      {showPasswordMap[u.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                    <button onClick={() => openPwChange(u.id, u.name, u.email)} className="p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600" title="Change password">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {u.department ? (
                                    <Badge variant="outline" className={getDeptBadgeCls(u.department ?? '')}>
                                      {u.department}
                                    </Badge>
                                  ) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {u.location ? (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getLocPillCls(u.department ?? '', u.location)}`}>
                                      {u.location}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {u.location ? (() => {
                                    const occ = getLocationOccupancy(u.location);
                                    return (
                                      <div className="flex items-center gap-1.5 text-xs">
                                        <BedDouble className="w-3.5 h-3.5 text-[#4A4A4A]" />
                                        <span className="text-[#1A1A1A] font-medium">{occ.totalRooms}</span>
                                        <span className="text-[#4A4A4A]/60">rooms</span>
                                        <span className="text-green-600 font-medium">{occ.availableBeds} avail</span>
                                      </div>
                                    );
                                  })() : <span className="text-[#4A4A4A]/40 text-xs">—</span>}
                                </td>
                                <td className="px-4 py-3 text-[#4A4A4A]">{u.phone || '—'}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={u.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}>
                                    {u.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => handleToggleStatus(u)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title={u.isActive ? 'Deactivate' : 'Activate'}>
                                      {u.isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                                    </button>
                                    <button onClick={() => openEditModal(u)} className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors" title="Edit">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(u)} className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors" title="Delete">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : activeTab === 'driver' ? (
              /* ── DRIVERS TAB ─────────────────────────────────────────────────── */
              <div className="space-y-0">
                {driversLoading ? (
                  <div className="p-12 text-center text-[#4A4A4A] flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading drivers…
                  </div>
                ) : (
                  <>
                    {/* ── SECTION A: Nazim Transport ── */}
                    <Card className="shadow-sm mb-0">
                      <CardHeader className="bg-[#F9F8F6] py-3 px-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2 text-base">
                              <Users className="w-4 h-4 text-[#2D5A45]" />
                              Nazim Transport
                              <Badge variant="outline" className="ml-1 text-xs bg-amber-50 text-amber-700 border-amber-200">
                                {headDrivers.length}
                              </Badge>
                            </CardTitle>
                            <p className="text-xs text-[#4A4A4A] mt-1">Transport managers — one per location</p>
                          </div>
                          <Button onClick={() => openDriverForm(true)} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8 px-3 text-xs">
                            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Nazim Transport
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-[#F9F8F6]">
                              <tr>
                                <SortableHeader label="Name" column="name" sortCol={headDriverSortCol} sortDir={headDriverSortDir} onSort={handleHeadDriverSort} />
                                <SortableHeader label="Email" column="email" sortCol={headDriverSortCol} sortDir={headDriverSortDir} onSort={handleHeadDriverSort} />
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Password</th>
                                <SortableHeader label="Department" column="department" sortCol={headDriverSortCol} sortDir={headDriverSortDir} onSort={handleHeadDriverSort} />
                                <SortableHeader label="Location" column="location" sortCol={headDriverSortCol} sortDir={headDriverSortDir} onSort={handleHeadDriverSort} />
                                <SortableHeader label="Vehicle" column="vehicle_type" sortCol={headDriverSortCol} sortDir={headDriverSortDir} onSort={handleHeadDriverSort} />
                                <SortableHeader label="Phone" column="phone" sortCol={headDriverSortCol} sortDir={headDriverSortDir} onSort={handleHeadDriverSort} />
                                <SortableHeader label="Status" column="is_available" sortCol={headDriverSortCol} sortDir={headDriverSortDir} onSort={handleHeadDriverSort} />
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E3DB]">
                              {sortedHeadDrivers.length === 0 ? (
                                <tr><td colSpan={9} className="px-4 py-8 text-center text-[#4A4A4A]">No Nazim Transport found. Click "Add" to create one.</td></tr>
                              ) : sortedHeadDrivers.map(d => (
                                <tr key={d.id} className="hover:bg-[#FAFAFA]">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-white text-sm font-medium">{d.name.charAt(0)}</div>
                                      <span className="font-medium text-[#1A1A1A]">{d.name}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-[#4A4A4A]">{d.email}</td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[#4A4A4A] font-mono text-sm">
                                        {showPasswordMap[d.id] ? (d.password_hash || '—') : '••••••••'}
                                      </span>
                                      <button onClick={() => togglePasswordVisibility(d.id)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                                        {showPasswordMap[d.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                      </button>
                                      <button onClick={() => openPwChange(d.id, d.name, d.email)} className="p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600" title="Change password">
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    {d.department ? <Badge variant="outline" className={getDeptBadgeCls(d.department)}>{d.department}</Badge> : '—'}
                                  </td>
                                  <td className="px-4 py-3">
                                    {d.location
                                      ? <span className="bg-[#D6E4D9] text-[#2D5A45] rounded-full px-2 py-0.5 text-xs font-medium">{d.location}</span>
                                      : <span className="text-[#4A4A4A] text-sm">—</span>}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-[#4A4A4A]">
                                    {d.vehicle_type && d.vehicle_model ? `${d.vehicle_type} · ${d.vehicle_model}` : d.vehicle_model ?? d.vehicle_type ?? '—'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-[#4A4A4A]">{d.phone ?? '—'}</td>
                                  <td className="px-4 py-3">
                                    <Badge variant="outline" className={d.is_available !== false ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}>
                                      {d.is_available !== false ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-2">
                                      <button onClick={() => openDriverForm(true, d)} className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                                      <button onClick={() => confirmDeleteDriver(d)} className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Divider */}
                    <div className="py-8"><div className="border-t border-gray-200" /></div>

                    {/* ── SECTION B: Drivers ── */}
                    <Card className="shadow-sm">
                      <CardHeader className="bg-[#F9F8F6] py-3 px-5">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <CardTitle className="flex items-center gap-2 text-base">
                              <Car className="w-4 h-4 text-[#2D5A45]" />
                              Drivers
                              <Badge variant="outline" className="ml-1 text-xs bg-blue-50 text-blue-700 border-blue-200">
                                {regularDrivers.length}
                              </Badge>
                            </CardTitle>
                            <p className="text-xs text-[#4A4A4A] mt-1">Drivers assigned to locations</p>
                          </div>
                          <Button onClick={() => openDriverForm(false)} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-8 px-3 text-xs">
                            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Driver
                          </Button>
                        </div>
                        {/* Filter chips */}
                        <div className="flex flex-wrap gap-2 mb-2">
                          {['', ...departmentList].map(dept => (
                            <button key={dept || 'all'} onClick={() => setDriverDeptFilter(dept)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${driverDeptFilter === dept ? 'bg-[#2D5A45] text-white' : 'bg-white text-[#4A4A4A] border border-[#D4CFC7] hover:bg-[#F5F0E8]'}`}>
                              {dept || 'All'}
                            </button>
                          ))}
                        </div>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                          <Input placeholder="Search by name, email, location…" value={driverSearch} onChange={e => setDriverSearch(e.target.value)}
                            className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm" />
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-[#F9F8F6]">
                              <tr>
                                <SortableHeader label="Name" column="name" sortCol={regDriverSortCol} sortDir={regDriverSortDir} onSort={handleRegDriverSort} />
                                <SortableHeader label="Email" column="email" sortCol={regDriverSortCol} sortDir={regDriverSortDir} onSort={handleRegDriverSort} />
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Password</th>
                                <SortableHeader label="Department" column="department" sortCol={regDriverSortCol} sortDir={regDriverSortDir} onSort={handleRegDriverSort} />
                                <SortableHeader label="Location" column="location" sortCol={regDriverSortCol} sortDir={regDriverSortDir} onSort={handleRegDriverSort} />
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Nazim Transport</th>
                                <SortableHeader label="Vehicle" column="vehicle_type" sortCol={regDriverSortCol} sortDir={regDriverSortDir} onSort={handleRegDriverSort} />
                                <SortableHeader label="Phone" column="phone" sortCol={regDriverSortCol} sortDir={regDriverSortDir} onSort={handleRegDriverSort} />
                                <SortableHeader label="Status" column="is_available" sortCol={regDriverSortCol} sortDir={regDriverSortDir} onSort={handleRegDriverSort} />
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E3DB]">
                              {sortedRegDrivers.length === 0 ? (
                                <tr><td colSpan={10} className="px-4 py-8 text-center text-[#4A4A4A]">
                                  {regularDrivers.length === 0 ? 'No drivers found. Click "Add Driver" to create one.' : 'No drivers match your search.'}
                                </td></tr>
                              ) : sortedRegDrivers.map(d => {
                                const nazim = getNazimTransport(d);
                                return (
                                  <tr key={d.id} className="hover:bg-[#FAFAFA]">
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium">{d.name.charAt(0)}</div>
                                        <span className="font-medium text-[#1A1A1A]">{d.name}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#4A4A4A]">{d.email}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[#4A4A4A] font-mono text-sm">
                                          {showPasswordMap[d.id] ? (d.password_hash || '—') : '••••••••'}
                                        </span>
                                        <button onClick={() => togglePasswordVisibility(d.id)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                                          {showPasswordMap[d.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                        <button onClick={() => openPwChange(d.id, d.name, d.email)} className="p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600" title="Change password">
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      {d.department ? <Badge variant="outline" className={getDeptBadgeCls(d.department)}>{d.department}</Badge> : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                      {d.location
                                        ? <span className="bg-[#D6E4D9] text-[#2D5A45] rounded-full px-2 py-0.5 text-xs font-medium">{d.location}</span>
                                        : <span className="text-[#4A4A4A] text-sm">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#4A4A4A]">
                                      {nazim !== '—' ? (
                                        <span className="flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
                                          {nazim}
                                        </span>
                                      ) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#4A4A4A]">
                                      {d.vehicle_type && d.vehicle_model ? `${d.vehicle_type} · ${d.vehicle_model}` : d.vehicle_model ?? d.vehicle_type ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#4A4A4A]">{d.phone ?? '—'}</td>
                                    <td className="px-4 py-3">
                                      <Badge variant="outline" className={d.is_available !== false ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}>
                                        {d.is_available !== false ? 'Active' : 'Inactive'}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => openDriverForm(false, d)} className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => confirmDeleteDriver(d)} className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
            ) : (
              <Card className="shadow-sm">
                <CardHeader className="bg-[#F9F8F6]">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <User className="w-5 h-5 text-[#2D5A45]" />
                    {USER_TYPE_LABELS[activeTab]} List
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#F9F8F6]">
                        <tr>
                          {activeTab === 'coordinator' ? (
                            <SortableHeader label="Name" column="name" sortCol={coordSortCol} sortDir={coordSortDir} onSort={handleCoordSort} />
                          ) : (
                            <SortableHeader label="Name" column="name" sortCol={diSortCol} sortDir={diSortDir} onSort={handleDiSort} />
                          )}
                          {activeTab === 'coordinator' ? (
                            <SortableHeader label="Email" column="email" sortCol={coordSortCol} sortDir={coordSortDir} onSort={handleCoordSort} />
                          ) : (
                            <SortableHeader label="Email" column="email" sortCol={diSortCol} sortDir={diSortDir} onSort={handleDiSort} />
                          )}
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Password</th>
                          {activeTab === 'coordinator' && (
                            <SortableHeader label="Country" column="country" sortCol={coordSortCol} sortDir={coordSortDir} onSort={handleCoordSort} />
                          )}
                          {activeTab === 'coordinator' && (
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Desk Incharge</th>
                          )}
                          {activeTab === 'desk-in-charge' && (
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Countries</th>
                          )}
                          {activeTab === 'coordinator' ? (
                            <SortableHeader label="Phone" column="phone" sortCol={coordSortCol} sortDir={coordSortDir} onSort={handleCoordSort} />
                          ) : (
                            <SortableHeader label="Phone" column="phone" sortCol={diSortCol} sortDir={diSortDir} onSort={handleDiSort} />
                          )}
                          {activeTab === 'coordinator' ? (
                            <SortableHeader label="Status" column="isActive" sortCol={coordSortCol} sortDir={coordSortDir} onSort={handleCoordSort} />
                          ) : (
                            <SortableHeader label="Status" column="isActive" sortCol={diSortCol} sortDir={diSortDir} onSort={handleDiSort} />
                          )}
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E3DB]">
                        {activeTab === 'coordinator' ? (
                          // ── Coordinator rows ──────────────────────────────────
                          filteredCoordinators.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-4 py-8 text-center text-[#4A4A4A]">
                                No coordinators found.
                              </td>
                            </tr>
                          ) : (
                            pagedCoordinators.map((coord) => (
                              <tr key={coord.id} className="hover:bg-[#FAFAFA]">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium">
                                      {coord.name.charAt(0)}
                                    </div>
                                    <span className="font-medium text-[#1A1A1A]">{coord.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-[#4A4A4A]">{coord.email}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[#4A4A4A] font-mono">
                                      {showPasswordMap[coord.id] ? coord.password : '••••••••'}
                                    </span>
                                    <button
                                      onClick={() => togglePasswordVisibility(coord.id)}
                                      className="p-1 hover:bg-gray-100 rounded text-[#4A4A4A]"
                                    >
                                      {showPasswordMap[coord.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-[#4A4A4A]">{coord.country}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{coord.assignedDeskInchargeName || '—'}</td>
                                <td className="px-4 py-3 text-[#4A4A4A]">{coord.phone || '—'}</td>
                                <td className="px-4 py-3">
                                  <Badge
                                    variant="outline"
                                    className={coord.isActive
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : 'bg-gray-50 text-gray-600 border-gray-200'
                                    }
                                  >
                                    {coord.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => handleToggleCoordinator(coord)}
                                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                      title={coord.isActive ? 'Deactivate' : 'Activate'}
                                    >
                                      {coord.isActive
                                        ? <ToggleRight className="w-5 h-5 text-green-600" />
                                        : <ToggleLeft className="w-5 h-5 text-gray-400" />
                                      }
                                    </button>
                                    <button
                                      onClick={() => openEditCoordinator(coord)}
                                      className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors"
                                      title="Edit"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteCoordinator(coord)}
                                      className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )
                        ) : sortedDiUsers.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-[#4A4A4A]">
                              No {USER_TYPE_LABELS[activeTab].toLowerCase()} found. Click "Add" to create one.
                            </td>
                          </tr>
                        ) : (
                          sortedDiUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-[#FAFAFA]">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium">
                                    {u.name.charAt(0)}
                                  </div>
                                  <span className="font-medium text-[#1A1A1A]">{u.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[#4A4A4A]">{u.email}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[#4A4A4A] font-mono text-sm">
                                    {showPasswordMap[u.id] ? (u.password || '—') : '••••••••'}
                                  </span>
                                  <button
                                    onClick={() => togglePasswordVisibility(u.id)}
                                    className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                                  >
                                    {showPasswordMap[u.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </button>
                                  <button onClick={() => openPwChange(u.id, u.name, u.email)} className="p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600" title="Change password">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              {activeTab === 'desk-in-charge' && (
                                <td className="px-4 py-3">
                                  {((u.assignedCountries?.length ?? 0) > 0 || (u.assignedDepartments?.length ?? 0) > 0) ? (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <div className="flex items-center gap-1.5 cursor-pointer">
                                          {(u.assignedCountries?.length ?? 0) > 0 && (
                                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#D6E4D9] text-[#2D5A45] hover:bg-[#C5D9C9] transition-colors">
                                              {u.assignedCountries!.length} countries
                                            </span>
                                          )}
                                          {(u.assignedDepartments?.length ?? 0) > 0 && (
                                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors">
                                              {u.assignedDepartments!.length} group{u.assignedDepartments!.length > 1 ? 's' : ''}
                                            </span>
                                          )}
                                        </div>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-80 p-3" align="start">
                                        {(u.assignedDepartments?.length ?? 0) > 0 && (
                                          <div className="mb-3">
                                            <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-2">
                                              Groups ({u.assignedDepartments!.length})
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                              {u.assignedDepartments!.map((dept, i) => (
                                                <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                                                  {dept}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {(u.assignedCountries?.length ?? 0) > 0 && (
                                          <>
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                              Countries ({u.assignedCountries!.length})
                                            </p>
                                            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                                              {u.assignedCountries!.map((entry, i) => (
                                                <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                                  {entry}
                                                </span>
                                              ))}
                                            </div>
                                          </>
                                        )}
                                      </PopoverContent>
                                    </Popover>
                                  ) : (
                                    <span className="text-[#4A4A4A]/50 text-sm">No items assigned</span>
                                  )}
                                </td>
                              )}
                              <td className="px-4 py-3 text-[#4A4A4A]">{u.phone || '-'}</td>
                              <td className="px-4 py-3">
                                <Badge
                                  variant="outline"
                                  className={u.isActive
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-gray-50 text-gray-600 border-gray-200'
                                  }
                                >
                                  {u.isActive ? 'Active' : 'Inactive'}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  {activeTab === 'desk-in-charge' && (
                                    <button
                                      onClick={() => {
                                        setAssigningUserId(prev => prev === u.id ? null : u.id);
                                      }}
                                      className="p-2 hover:bg-green-50 text-[#4A4A4A] hover:text-[#2D5A45] rounded-lg transition-colors"
                                      title="Assign Countries"
                                    >
                                      <MapPin className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleToggleStatus(u)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                    title={u.isActive ? 'Deactivate' : 'Activate'}
                                  >
                                    {u.isActive ? (
                                      <ToggleRight className="w-5 h-5 text-green-600" />
                                    ) : (
                                      <ToggleLeft className="w-5 h-5 text-gray-400" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => openEditModal(u)}
                                    className="p-2 hover:bg-blue-50 text-[#4A4A4A] hover:text-blue-600 rounded-lg transition-colors"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(u)}
                                    className="p-2 hover:bg-red-50 text-[#4A4A4A] hover:text-red-600 rounded-lg transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Coordinator pagination */}
                  {activeTab === 'coordinator' && coordTotalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8E3DB]">
                      <p className="text-sm text-[#4A4A4A]">
                        Showing {Math.min((coordPage - 1) * COORD_PAGE_SIZE + 1, filteredCoordinators.length)}–{Math.min(coordPage * COORD_PAGE_SIZE, filteredCoordinators.length)} of {filteredCoordinators.length} coordinators
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCoordPage(p => Math.max(1, p - 1))}
                          disabled={coordPage === 1}
                          className="px-3 py-1.5 text-sm border border-[#D4CFC7] rounded-lg hover:bg-[#F5F0E8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Previous
                        </button>
                        {Array.from({ length: coordTotalPages }, (_, i) => i + 1)
                          .filter(p => p === 1 || p === coordTotalPages || Math.abs(p - coordPage) <= 1)
                          .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                            if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('...');
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((p, i) =>
                            p === '...' ? (
                              <span key={`e${i}`} className="px-2 text-[#4A4A4A]">…</span>
                            ) : (
                              <button
                                key={p}
                                onClick={() => setCoordPage(p as number)}
                                className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                                  coordPage === p
                                    ? 'bg-[#2D5A45] text-white'
                                    : 'border border-[#D4CFC7] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                                }`}
                              >
                                {p}
                              </button>
                            )
                          )}
                        <button
                          onClick={() => setCoordPage(p => Math.min(coordTotalPages, p + 1))}
                          disabled={coordPage === coordTotalPages}
                          className="px-3 py-1.5 text-sm border border-[#D4CFC7] rounded-lg hover:bg-[#F5F0E8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Assign Countries Panel */}
            {(() => {
              const assigningUser = filteredUsers.find(u => u.id === assigningUserId);
              if (!assigningUser) return null;
              const allDeskIncharges = getUsersByType('desk-in-charge');
              return (
                <CountryAssignmentPanel
                  key={assigningUserId}
                  user={assigningUser}
                  allDeskIncharges={allDeskIncharges}
                  onSave={assignItems}
                  onClose={() => setAssigningUserId(null)}
                />
              );
            })()}
          </div>
        </main>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[#E8E3DB]">
              <h2 className="text-xl font-semibold text-[#1A1A1A]">
                {editingUser ? 'Edit' : 'Add'} {USER_TYPE_LABELS[modalUserType]}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter full name"
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">
                  {editingUser || editingCoordinator ? 'Password' : 'Password *'}
                </Label>
                {(editingUser || editingCoordinator) && (
                  <p className="text-xs text-[#4A4A4A]">Leave blank to keep current password</p>
                )}
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    type={editPwVisible ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingUser || editingCoordinator ? 'Leave blank to keep current' : 'Enter password'}
                    className="pl-10 pr-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                  />
                  <button type="button" onClick={() => setEditPwVisible(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600" tabIndex={-1}>
                    {editPwVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Enter phone number"
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                  />
                </div>
              </div>

              {modalUserType === 'location-manager' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A]">Department *</Label>
                    <select
                      value={formData.department}
                      onChange={e => setFormData({ ...formData, department: e.target.value, location: '' })}
                      className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                    >
                      <option value="">— Select department —</option>
                      {departmentList.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A]">Location *</Label>
                    <select
                      value={formData.location}
                      onChange={e => setFormData({ ...formData, location: e.target.value })}
                      disabled={!formData.department}
                      className={`w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11 ${!formData.department ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="">— Select location —</option>
                      {(departments[formData.department] ?? []).map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {modalUserType === 'coordinator' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A]">Country</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                      <Input
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        placeholder="Enter country name"
                        className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A]">Desk Incharge</Label>
                    <select
                      value={formData.assignedDeskInchargeId}
                      onChange={(e) => setFormData({ ...formData, assignedDeskInchargeId: e.target.value })}
                      className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                    >
                      <option value="">— Select desk incharge —</option>
                      {getUsersByType('desk-in-charge').map((di) => (
                        <option key={di.id} value={di.id}>{di.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-[#D4CFC7] text-[#2D5A45] focus:ring-[#2D5A45]"
                />
                <Label htmlFor="isActive" className="cursor-pointer text-[#1A1A1A]">
                  Active user
                </Label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E3DB]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  className="border-[#D4CFC7] h-11 px-6"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-11 px-6"
                >
                  {editingUser ? 'Save Changes' : 'Add User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Driver Add/Edit Dialog ── */}
      {driverFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[#E8E3DB] flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#1A1A1A]">
                {editingDriver ? 'Edit' : 'Add'} {driverFormIsHead ? 'Nazim Transport' : 'Driver'}
              </h2>
              <button onClick={() => setDriverFormOpen(false)} className="p-2 hover:bg-[#F5F0E8] rounded-lg transition-colors">
                <X className="w-5 h-5 text-[#4A4A4A]" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input value={dName} onChange={e => setDName(e.target.value)} placeholder="Enter full name"
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11" />
                </div>
              </div>
              {/* Email */}
              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input type="email" value={dEmail} onChange={e => setDEmail(e.target.value)} placeholder="Enter email address"
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11" />
                </div>
              </div>
              {/* Phone */}
              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input value={dPhone} onChange={e => setDPhone(e.target.value)} placeholder="Enter phone number"
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11" />
                </div>
              </div>
              {/* Password */}
              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">{editingDriver ? 'Password (leave blank to keep current)' : 'Password *'}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input type={dShowPwd ? 'text' : 'password'} value={dPassword} onChange={e => setDPassword(e.target.value)}
                    placeholder={editingDriver ? 'Leave blank to keep current' : 'Enter password'}
                    className="pl-10 pr-10 border-[#D4CFC7] focus:border-[#2D5A45] h-11" />
                  <button type="button" onClick={() => setDShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded text-[#4A4A4A]">
                    {dShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {/* Department */}
              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Department</Label>
                <select value={dDept} onChange={e => { setDDept(e.target.value); setDLoc(''); }}
                  className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11">
                  <option value="">— Select department —</option>
                  {departmentList.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {/* Location */}
              <div className="space-y-2">
                <Label className="text-[#1A1A1A]">Location</Label>
                <select value={dLoc} onChange={e => setDLoc(e.target.value)} disabled={!dDept}
                  className={`w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11 ${!dDept ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <option value="">— Select location —</option>
                  {(departments[dDept] ?? []).map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </div>
              {/* Vehicle section */}
              <div className="border-t border-[#E8E3DB] pt-4">
                <p className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                  <Car className="w-4 h-4 text-[#2D5A45]" /> Vehicle Details
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#4A4A4A]">Type</Label>
                    <Input value={dVType} onChange={e => setDVType(e.target.value)} placeholder="e.g. Van"
                      className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#4A4A4A]">Model</Label>
                    <Input value={dVModel} onChange={e => setDVModel(e.target.value)} placeholder="e.g. Transit"
                      className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#4A4A4A]">Registration</Label>
                    <Input value={dVReg} onChange={e => setDVReg(e.target.value)} placeholder="e.g. AB12 CDE"
                      className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#4A4A4A]">Capacity (pax)</Label>
                    <Input type="number" min="1" max="99" value={dVCap} onChange={e => setDVCap(e.target.value)} placeholder="e.g. 7"
                      className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm" />
                  </div>
                </div>
              </div>
              {/* is_head_driver toggle — edit only */}
              {editingDriver && (
                <div className="flex items-center gap-3 border border-amber-200 bg-amber-50 rounded-lg px-4 py-3">
                  <input type="checkbox" id="isHeadDriver" checked={driverFormIsHead}
                    onChange={e => setDriverFormIsHead(e.target.checked)}
                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                  <Label htmlFor="isHeadDriver" className="cursor-pointer text-sm text-[#1A1A1A]">
                    Nazim Transport (promote / demote this driver)
                  </Label>
                </div>
              )}
              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E3DB]">
                <Button type="button" variant="outline" onClick={() => setDriverFormOpen(false)} className="border-[#D4CFC7] h-11 px-6">
                  Cancel
                </Button>
                <Button onClick={handleSaveDriver} disabled={dSaving} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-11 px-6">
                  {dSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : editingDriver ? 'Save Changes' : 'Add Driver'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Driver Delete Confirmation ── */}
      {deleteDriverTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[#1A1A1A]">Remove Driver</h2>
            <p className="text-sm text-[#4A4A4A]">
              Remove <span className="font-medium text-[#1A1A1A]">{deleteDriverTarget.name}</span> from the system?
              This action cannot be undone.
            </p>
            {deleteDriverChecking ? (
              <div className="flex items-center gap-2 text-sm text-[#4A4A4A]">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking active tasks…
              </div>
            ) : deleteDriverTaskCount > 0 ? (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>
                  This driver has <strong>{deleteDriverTaskCount} pending task{deleteDriverTaskCount !== 1 ? 's' : ''}</strong>.
                  Please reassign them before deleting.
                </span>
              </div>
            ) : null}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setDeleteDriverTarget(null)} disabled={deleteDriverDeleting}
                className="border-[#D4CFC7] h-10 px-5">
                Cancel
              </Button>
              <Button onClick={handleDeleteDriver}
                disabled={deleteDriverDeleting || deleteDriverChecking || deleteDriverTaskCount > 0}
                className="bg-red-600 hover:bg-red-700 text-white h-10 px-5">
                {deleteDriverDeleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Removing…</> : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Change Password Dialog (Super Admin) ── */}
      {pwTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-[#E8E3DB]">
              <Lock className="w-5 h-5 text-[#2D5A45]" />
              <div>
                <h2 className="text-base font-semibold text-[#1A1A1A]">Change Password</h2>
                <p className="text-xs text-[#4A4A4A]">{pwTarget.name} · {pwTarget.email}</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm text-[#1A1A1A]">New Password</Label>
                <div className="relative">
                  <Input type={pwShowNew ? 'text' : 'password'} value={pwNew} onChange={e => { setPwNew(e.target.value); setPwError(''); }}
                    placeholder="At least 8 characters" className="pr-10 border-[#D4CFC7] focus:border-[#2D5A45] h-10" autoFocus />
                  <button type="button" onClick={() => setPwShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                    {pwShowNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-[#1A1A1A]">Confirm Password</Label>
                <div className="relative">
                  <Input type={pwShowConfirm ? 'text' : 'password'} value={pwConfirm} onChange={e => { setPwConfirm(e.target.value); setPwError(''); }}
                    placeholder="Repeat new password" className="pr-10 border-[#D4CFC7] focus:border-[#2D5A45] h-10" />
                  <button type="button" onClick={() => setPwShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                    {pwShowConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {pwError && <p className="text-xs text-red-600">{pwError}</p>}
              <p className="text-xs text-[#4A4A4A]">Minimum 8 characters.</p>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setPwTarget(null)} disabled={pwSaving} className="border-[#D4CFC7] h-10 px-5">
                  Cancel
                </Button>
                <Button onClick={handleSavePasswordChange} disabled={pwSaving} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-10 px-5">
                  {pwSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Change Password'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
