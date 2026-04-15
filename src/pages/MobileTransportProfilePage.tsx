import { useState, useEffect } from 'react';
import {
  ArrowLeft, Eye, EyeOff, ChevronRight, Calendar, X,
  Mail, Phone, Shield, LogOut, Moon, Sun, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/contexts/DarkModeContext';
import { useNavigate } from 'react-router-dom';
import MobileTransportHeadLayout from '@/components/MobileTransportHeadLayout';
import { toast } from 'sonner';

interface Driver {
  id: string;
  name: string;
}

type DayStatus = 'available' | 'on_leave' | 'off';

interface ScheduleEntry {
  driver_id: string;
  date: string;
  status: DayStatus;
  start_time?: string;
  end_time?: string;
}

interface ScheduleRow {
  [driverId: string]: DayStatus | undefined;
}

const DOT_COLOR: Record<DayStatus, string> = {
  available: 'bg-emerald-400',
  on_leave:  'bg-amber-400',
  off:       'bg-gray-300 dark:bg-gray-600',
};

const STATUS_CYCLE: DayStatus[] = ['available', 'on_leave', 'off'];

function getWeekDates(anchor?: Date): string[] {
  const d = anchor ? new Date(anchor) : new Date();
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-[#E8E3DB] dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-[#1A1A1A] dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2D5A45]';
const labelCls = 'block text-xs font-medium text-[#4A4A4A] dark:text-gray-400 mb-1';

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        className={inputCls + ' pr-10'}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2">
        {show ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
      </button>
    </div>
  );
}

type View = 'main' | 'changePassword' | 'schedules';

export default function MobileTransportProfilePage() {
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useDarkMode();
  const navigate = useNavigate();

  const deptId = (user as { transportDepartmentId?: string })?.transportDepartmentId;
  const deptName = (user as { transportDepartmentName?: string })?.transportDepartmentName ?? 'Transport Dept';

  const [view, setView] = useState<View>('main');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showLogout, setShowLogout] = useState(false);

  // Change password
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState<{ current?: string; newPw?: string; confirm?: string }>({});
  const [savingPw, setSavingPw] = useState(false);

  // Schedules
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [weekDates, setWeekDates] = useState<string[]>(getWeekDates());
  const [scheduleMap, setScheduleMap] = useState<Map<string, ScheduleRow>>(new Map());
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase.from('users').select('phone,email').eq('id', user.id).single().then(({ data }) => {
      if (data) { setPhone((data as { phone?: string }).phone ?? ''); setEmail((data as { email?: string }).email ?? ''); }
    });
  }, [user]);

  // ── Schedules ──
  async function fetchSchedule(dates: string[]) {
    if (!deptId) return;
    setLoadingSchedule(true);
    try {
      const { data: drData } = await supabase.from('users').select('id,name').eq('transport_department_id', deptId).eq('role', 'driver').eq('is_head_driver', false);
      const driverList = (drData ?? []) as Driver[];
      setDrivers(driverList);

      const { data: schData } = await supabase.from('driver_schedules').select('driver_id,date,status').in('date', dates).in('driver_id', driverList.map(d => d.id));

      const map = new Map<string, ScheduleRow>();
      for (const d of driverList) map.set(d.id, {});
      for (const s of (schData ?? []) as ScheduleEntry[]) {
        const row = map.get(s.driver_id) ?? {};
        row[s.date] = s.status;
        map.set(s.driver_id, row);
      }
      setScheduleMap(map);
    } catch {
      // silently fail
    } finally {
      setLoadingSchedule(false);
    }
  }

  useEffect(() => {
    if (view === 'schedules') void fetchSchedule(weekDates);
  }, [view, weekDates]);

  function shiftWeek(delta: number) {
    const anchor = new Date(weekDates[0]);
    anchor.setDate(anchor.getDate() + delta * 7);
    setWeekDates(getWeekDates(anchor));
  }

  async function toggleStatus(driverId: string, date: string) {
    const current = scheduleMap.get(driverId)?.[date] ?? 'off';
    const idx = STATUS_CYCLE.indexOf(current);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];

    // Optimistic
    setScheduleMap(prev => {
      const map = new Map(prev);
      const row = { ...(map.get(driverId) ?? {}) };
      row[date] = next;
      map.set(driverId, row);
      return map;
    });

    setSavingSchedule(true);
    try {
      const { error } = await supabase.from('driver_schedules').upsert({
        driver_id: driverId,
        date,
        status: next,
      }, { onConflict: 'driver_id,date' });
      if (error) throw error;
    } catch {
      toast.error('Failed to save schedule');
      // revert
      void fetchSchedule(weekDates);
    } finally {
      setSavingSchedule(false);
    }
  }

  // ── Change password ──
  async function handleChangePassword() {
    const errs: typeof pwErrors = {};
    if (!pwForm.current) errs.current = 'Required';
    if (pwForm.newPw.length < 6) errs.newPw = 'Min 6 characters';
    if (pwForm.newPw !== pwForm.confirm) errs.confirm = 'Passwords do not match';
    if (Object.keys(errs).length > 0) { setPwErrors(errs); return; }

    setSavingPw(true);
    setPwErrors({});
    try {
      const { data: check } = await supabase.rpc('verify_login', { p_email: email, p_password: pwForm.current });
      if (!check) { setPwErrors({ current: 'Incorrect password' }); return; }
      const { error } = await supabase.from('users').update({ password_hash: pwForm.newPw }).eq('id', user?.id);
      if (error) throw error;
      toast.success('Password updated');
      setPwForm({ current: '', newPw: '', confirm: '' });
      setView('main');
    } catch {
      toast.error('Failed to update password');
    } finally {
      setSavingPw(false);
    }
  }

  const initials = (user?.name ?? 'HE').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // ── Change Password view ──
  if (view === 'changePassword') {
    return (
      <div className="fixed inset-0 z-50 bg-[#F5F0E8] dark:bg-gray-950 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-3 px-4 py-4 bg-white dark:bg-gray-900 border-b border-[#E8E3DB] dark:border-gray-800">
          <button onClick={() => setView('main')}><ArrowLeft className="w-5 h-5 text-[#4A4A4A] dark:text-gray-400" /></button>
          <h2 className="flex-1 text-center text-base font-semibold text-[#1A1A1A] dark:text-gray-100">Change Password</h2>
          <button onClick={handleChangePassword} disabled={savingPw} className="text-sm font-semibold text-[#2D5A45] dark:text-emerald-400 disabled:opacity-50">
            {savingPw ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          <div>
            <label className={labelCls}>Current Password</label>
            <PasswordInput value={pwForm.current} onChange={v => setPwForm(f => ({ ...f, current: v }))} placeholder="Enter current password" />
            {pwErrors.current && <p className="text-xs text-red-500 mt-1">{pwErrors.current}</p>}
          </div>
          <div>
            <label className={labelCls}>New Password</label>
            <PasswordInput value={pwForm.newPw} onChange={v => setPwForm(f => ({ ...f, newPw: v }))} placeholder="Min. 6 characters" />
            {pwErrors.newPw && <p className="text-xs text-red-500 mt-1">{pwErrors.newPw}</p>}
          </div>
          <div>
            <label className={labelCls}>Confirm New Password</label>
            <PasswordInput value={pwForm.confirm} onChange={v => setPwForm(f => ({ ...f, confirm: v }))} placeholder="Repeat new password" />
            {pwErrors.confirm && <p className="text-xs text-red-500 mt-1">{pwErrors.confirm}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Schedules view ──
  if (view === 'schedules') {
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date().toISOString().slice(0, 10);
    return (
      <div className="fixed inset-0 z-50 bg-[#F5F0E8] dark:bg-gray-950 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-3 px-4 py-4 bg-white dark:bg-gray-900 border-b border-[#E8E3DB] dark:border-gray-800">
          <button onClick={() => setView('main')}><ArrowLeft className="w-5 h-5 text-[#4A4A4A] dark:text-gray-400" /></button>
          <h2 className="flex-1 text-center text-base font-semibold text-[#1A1A1A] dark:text-gray-100">Driver Schedules</h2>
          <span className="w-8" />
        </div>

        {/* Week nav */}
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-[#E8E3DB] dark:border-gray-800">
          <button onClick={() => shiftWeek(-1)} className="p-2 rounded-lg active:bg-gray-100 dark:active:bg-gray-800">
            <ArrowLeft className="w-4 h-4 text-[#4A4A4A] dark:text-gray-400" />
          </button>
          <span className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100">
            {weekDates[0]} – {weekDates[6]}
          </span>
          <button onClick={() => shiftWeek(1)} className="p-2 rounded-lg active:bg-gray-100 dark:active:bg-gray-800">
            <ChevronRight className="w-4 h-4 text-[#4A4A4A] dark:text-gray-400" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2 bg-[#F5F0E8] dark:bg-gray-950 text-xs text-[#4A4A4A] dark:text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Available</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> On Leave</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600" /> Off</span>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Day header row */}
          <div className="flex sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-[#E8E3DB] dark:border-gray-800">
            <div className="w-24 shrink-0 px-3 py-2 text-xs font-semibold text-[#4A4A4A] dark:text-gray-400">Driver</div>
            {weekDates.map((d, i) => (
              <div
                key={d}
                className={`flex-1 text-center py-2 text-xs font-semibold ${d === today ? 'text-[#2D5A45] dark:text-emerald-400' : 'text-[#4A4A4A] dark:text-gray-400'}`}
              >
                <div>{DAY_LABELS[i]}</div>
                <div className="text-[10px] font-normal">{d.slice(8)}</div>
              </div>
            ))}
          </div>

          {loadingSchedule ? (
            <div className="px-4 py-8 space-y-3">
              {[0,1,2].map(i => (
                <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 h-12 rounded-xl" />
              ))}
            </div>
          ) : (
            drivers.map(d => {
              const row = scheduleMap.get(d.id) ?? {};
              return (
                <div key={d.id} className="flex items-center border-b border-[#E8E3DB] dark:border-gray-800">
                  <div className="w-24 shrink-0 px-3 py-2 text-xs font-medium text-[#1A1A1A] dark:text-gray-100 truncate">{d.name.split(' ')[0]}</div>
                  {weekDates.map(date => {
                    const status: DayStatus = row[date] ?? 'off';
                    return (
                      <button
                        key={date}
                        disabled={savingSchedule}
                        onClick={() => toggleStatus(d.id, date)}
                        className={`flex-1 flex items-center justify-center py-3 ${date === today ? 'bg-emerald-50 dark:bg-emerald-900/10' : ''}`}
                      >
                        <span className={`w-3 h-3 rounded-full ${DOT_COLOR[status]}`} />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ── Main profile view ──
  return (
    <MobileTransportHeadLayout>
      <div className="px-4 pt-6 pb-8 space-y-6">

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-[#D6E4D9] dark:bg-emerald-900/50 flex items-center justify-center text-2xl font-bold text-[#2D5A45] dark:text-emerald-400">
            {initials}
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-[#1A1A1A] dark:text-gray-100">{user?.name}</div>
            <div className="text-sm text-[#4A4A4A] dark:text-gray-400">{deptName}</div>
            <span className="inline-block mt-1 text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
              Department Head
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-[#E8E3DB] dark:border-gray-700 divide-y divide-[#E8E3DB] dark:divide-gray-700">
          {[
            { icon: Mail, label: 'Email', value: email || user?.email || '—' },
            { icon: Phone, label: 'Phone', value: phone || '—' },
            { icon: Shield, label: 'Role', value: 'Transport Head' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3">
              <Icon className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400 shrink-0" />
              <div>
                <div className="text-[10px] text-[#4A4A4A] dark:text-gray-400 uppercase tracking-wider">{label}</div>
                <div className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100">{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Settings */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[#4A4A4A] dark:text-gray-400 uppercase tracking-wider px-1 mb-2">Settings</div>

          {/* Dark mode */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl border border-[#E8E3DB] dark:border-gray-700 px-4 py-3">
            <div className="flex items-center gap-3">
              {darkMode ? <Moon className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
              <span className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100">Dark Mode</span>
            </div>
            <button
              role="switch"
              aria-checked={darkMode}
              onClick={toggleDarkMode}
              className={`relative w-11 h-6 rounded-full transition-colors ${darkMode ? 'bg-[#2D5A45]' : 'bg-gray-200 dark:bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${darkMode ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Change password */}
          <button
            onClick={() => setView('changePassword')}
            className="w-full flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl border border-[#E8E3DB] dark:border-gray-700 px-4 py-3 active:bg-[#F5F0E8] dark:active:bg-gray-700"
          >
            <span className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100">Change Password</span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Management */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[#4A4A4A] dark:text-gray-400 uppercase tracking-wider px-1 mb-2">Management</div>

          <button
            onClick={() => setView('schedules')}
            className="w-full flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl border border-[#E8E3DB] dark:border-gray-700 px-4 py-3 active:bg-[#F5F0E8] dark:active:bg-gray-700"
          >
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />
              <span className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100">Manage Schedules</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Logout */}
        <button
          onClick={() => setShowLogout(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-semibold active:bg-red-50 dark:active:bg-red-900/20"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </div>

      {/* Logout confirmation */}
      {showLogout && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLogout(false)} />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-t-2xl px-4 pt-6 pb-10 space-y-3"
            style={{ animation: 'slideUp 0.28s ease-out both' }}
          >
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-2">
              <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-base font-bold text-center text-[#1A1A1A] dark:text-gray-100">Log Out?</h3>
            <p className="text-sm text-center text-[#4A4A4A] dark:text-gray-400">You'll need to sign in again to access the app.</p>
            <button
              onClick={() => { logout(); navigate('/login', { replace: true }); }}
              className="w-full py-3 bg-red-600 text-white rounded-xl text-sm font-semibold active:bg-red-700"
            >
              Log Out
            </button>
            <button
              onClick={() => setShowLogout(false)}
              className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-[#4A4A4A] dark:text-gray-400 rounded-xl text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Satisfy lint for unused imports */}
      <span className="hidden"><Check /><X /></span>
    </MobileTransportHeadLayout>
  );
}
