import { useState, useEffect } from 'react';
import {
  Users, UserPlus, Phone, MessageSquare, ChevronRight, X,
  Car, ClipboardList, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import MobileTransportHeadLayout from '@/components/MobileTransportHeadLayout';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Driver {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  is_available: boolean;
  vehicle_type?: string;
  vehicle_reg?: string;
  active_tasks?: number;
}

interface GuestAssignment {
  id: string;
  guest_name: string;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  task_type?: string;
  status: string;
}

type Tab = 'drivers' | 'guests';

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-[#E8E3DB] dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-[#1A1A1A] dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2D5A45] dark:focus:ring-emerald-500';
const labelCls = 'block text-xs font-medium text-[#4A4A4A] dark:text-gray-400 mb-1';

export default function MobileTransportTeamPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const deptId = (user as { transportDepartmentId?: string })?.transportDepartmentId;

  const [tab, setTab] = useState<Tab>('drivers');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [guests, setGuests] = useState<GuestAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [assignSheet, setAssignSheet] = useState<GuestAssignment | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Add driver form
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [saving, setSaving] = useState(false);

  async function fetchAll() {
    if (!deptId) return;
    setLoading(true);
    try {
      const [drRes, gaRes, taskRes] = await Promise.all([
        supabase.from('users').select('id,name,phone,email,is_available,vehicle_type,vehicle_reg').eq('transport_department_id', deptId).eq('role', 'driver').eq('is_head_driver', false),
        supabase.from('driver_tasks').select('id,guest_name,assigned_driver_id,assigned_driver_name,task_type,status').eq('transport_department_id', deptId).in('status', ['pending', 'in_progress']),
        supabase.from('driver_tasks').select('id,assigned_driver_id,status').eq('transport_department_id', deptId).eq('status', 'in_progress'),
      ]);
      const driverList = (drRes.data ?? []) as Driver[];
      const taskList = taskRes.data ?? [];
      const enriched = driverList.map(d => ({
        ...d,
        active_tasks: taskList.filter(t => t.assigned_driver_id === d.id).length,
      }));
      setDrivers(enriched);
      setGuests(gaRes.data ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchAll(); }, [deptId]);

  async function handleAddDriver() {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('users').insert({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        password_hash: form.password || 'changeme',
        role: 'driver',
        is_head_driver: false,
        transport_department_id: deptId,
        is_available: false,
      });
      if (error) throw error;
      toast.success('Driver added');
      setForm({ name: '', email: '', phone: '', password: '' });
      setShowAddDriver(false);
      void fetchAll();
    } catch {
      toast.error('Failed to add driver');
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign(driverId: string) {
    if (!assignSheet) return;
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    setAssigning(true);
    try {
      const { error } = await supabase.from('driver_tasks').update({
        assigned_driver_id: driverId,
        assigned_driver_name: driver.name,
      }).eq('id', assignSheet.id);
      if (error) throw error;
      toast.success(`Assigned to ${driver.name}`);
      setAssignSheet(null);
      void fetchAll();
    } catch {
      toast.error('Failed to assign');
    } finally {
      setAssigning(false);
    }
  }

  const Skeleton = ({ cls = '' }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl ${cls}`} />
  );

  return (
    <MobileTransportHeadLayout>
      <div className="px-4 pt-4 pb-6 space-y-4">

        {/* Header + Add button */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#1A1A1A] dark:text-gray-100">Team</h1>
          <button
            onClick={() => setShowAddDriver(true)}
            className="flex items-center gap-1.5 bg-[#2D5A45] text-white text-sm font-medium px-3 py-2 rounded-xl active:bg-[#234839]"
          >
            <UserPlus className="w-4 h-4" />
            Add Driver
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex bg-[#E8E3DB] dark:bg-gray-800 rounded-xl p-1">
          {(['drivers', 'guests'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t
                  ? 'bg-white dark:bg-gray-700 text-[#2D5A45] dark:text-emerald-400 shadow-sm'
                  : 'text-[#4A4A4A] dark:text-gray-400'
              }`}
            >
              {t === 'drivers' ? (
                <span className="flex items-center justify-center gap-1.5"><Users className="w-3.5 h-3.5" /> Drivers</span>
              ) : (
                <span className="flex items-center justify-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Guest Assignments</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Drivers tab ── */}
        {tab === 'drivers' && (
          loading ? (
            <div className="space-y-3">
              {[0,1,2].map(i => <Skeleton key={i} cls="h-20" />)}
            </div>
          ) : drivers.length === 0 ? (
            <div className="text-center py-12 text-[#4A4A4A] dark:text-gray-500 text-sm">
              No drivers yet. Tap Add Driver to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {drivers.map(d => (
                <div
                  key={d.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-[#E8E3DB] dark:border-gray-700 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#D6E4D9] dark:bg-emerald-900/40 flex items-center justify-center text-sm font-semibold text-[#2D5A45] dark:text-emerald-400 shrink-0">
                      {d.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#1A1A1A] dark:text-gray-100 truncate">{d.name}</span>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${d.is_available ? 'bg-emerald-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      </div>
                      <div className="text-xs text-[#4A4A4A] dark:text-gray-400 mt-0.5 truncate">
                        {d.vehicle_type ?? 'No vehicle'}{d.vehicle_reg ? ` · ${d.vehicle_reg}` : ''}
                        {(d.active_tasks ?? 0) > 0 && ` · ${d.active_tasks} active`}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {d.phone && (
                        <a
                          href={`tel:${d.phone}`}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F5F0E8] dark:bg-gray-700 active:bg-[#E8E3DB] dark:active:bg-gray-600"
                        >
                          <Phone className="w-3.5 h-3.5 text-[#2D5A45] dark:text-emerald-400" />
                        </a>
                      )}
                      <button
                        onClick={() => navigate('/transport-m/messages')}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F5F0E8] dark:bg-gray-700 active:bg-[#E8E3DB] dark:active:bg-gray-600"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#2D5A45] dark:text-emerald-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Guest assignments tab ── */}
        {tab === 'guests' && (
          loading ? (
            <div className="space-y-3">
              {[0,1,2].map(i => <Skeleton key={i} cls="h-16" />)}
            </div>
          ) : guests.length === 0 ? (
            <div className="text-center py-12 text-[#4A4A4A] dark:text-gray-500 text-sm">
              No active guest tasks
            </div>
          ) : (
            <div className="space-y-2">
              {guests.map(g => (
                <div
                  key={g.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-[#E8E3DB] dark:border-gray-700 px-4 py-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100 truncate">{g.guest_name}</div>
                    <div className="text-xs text-[#4A4A4A] dark:text-gray-400 mt-0.5 flex items-center gap-1">
                      <Car className="w-3 h-3" />
                      {g.assigned_driver_name ?? 'Unassigned'}
                    </div>
                  </div>
                  <button
                    onClick={() => setAssignSheet(g)}
                    className="flex items-center gap-1 text-xs bg-[#F5F0E8] dark:bg-gray-700 text-[#2D5A45] dark:text-emerald-400 px-3 py-1.5 rounded-lg font-medium active:bg-[#E8E3DB] dark:active:bg-gray-600 shrink-0"
                  >
                    {g.assigned_driver_name ? 'Reassign' : 'Assign'}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Add Driver bottom sheet ── */}
      {showAddDriver && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddDriver(false)} />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-t-2xl px-4 pt-4 pb-8"
            style={{ animation: 'slideUp 0.28s ease-out both' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-[#1A1A1A] dark:text-gray-100">Add New Driver</h3>
              <button onClick={() => setShowAddDriver(false)}>
                <X className="w-5 h-5 text-[#4A4A4A] dark:text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Full Name *</label>
                <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ahmed Khan" />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ahmed@example.com" />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input className={inputCls} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+44 7700 000000" />
              </div>
              <div>
                <label className={labelCls}>Temporary Password</label>
                <input className={inputCls} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 characters" />
              </div>
              <button
                disabled={saving}
                onClick={handleAddDriver}
                className="w-full py-3 mt-1 bg-[#2D5A45] text-white rounded-xl text-sm font-semibold active:bg-[#234839] disabled:opacity-50"
              >
                {saving ? 'Adding…' : 'Add Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign driver bottom sheet ── */}
      {assignSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAssignSheet(null)} />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-t-2xl px-4 pt-4 pb-8 space-y-3"
            style={{ animation: 'slideUp 0.28s ease-out both' }}
          >
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mb-1" />
            <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-gray-100">
              Assign driver for <span className="text-[#2D5A45]">{assignSheet.guest_name}</span>
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {drivers.filter(d => d.is_available).map(d => (
                <button
                  key={d.id}
                  disabled={assigning}
                  onClick={() => handleAssign(d.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F5F0E8] dark:bg-gray-800 active:bg-[#E8E3DB] dark:active:bg-gray-700 border border-[#E8E3DB] dark:border-gray-700"
                >
                  <div className="w-8 h-8 rounded-full bg-[#D6E4D9] dark:bg-emerald-900/40 flex items-center justify-center text-xs font-semibold text-[#2D5A45] dark:text-emerald-400">
                    {d.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100">{d.name}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
                </button>
              ))}
              {drivers.filter(d => d.is_available).length === 0 && (
                <p className="text-sm text-center text-[#4A4A4A] dark:text-gray-500 py-4">No available drivers</p>
              )}
            </div>
            <button onClick={() => setAssignSheet(null)} className="w-full py-3 rounded-xl text-sm font-medium text-[#4A4A4A] dark:text-gray-400 bg-gray-100 dark:bg-gray-800">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Driver sheet also needs ChevronDown placeholder for TS */}
      <span className="hidden"><ChevronDown /></span>
    </MobileTransportHeadLayout>
  );
}
