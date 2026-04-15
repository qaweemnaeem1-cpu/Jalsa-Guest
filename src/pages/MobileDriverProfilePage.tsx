import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Mail, Phone, Building2, Shield, LogOut,
  ChevronRight, Moon, Sun, Eye, EyeOff, Lock, Car,
} from 'lucide-react';
import { toast } from 'sonner';
import MobileDriverLayout from '@/components/MobileDriverLayout';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/contexts/DarkModeContext';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────
type ProfileView = 'main' | 'changePassword';

interface ScheduleEntry {
  date: string;
  status: 'on_duty' | 'off_duty' | 'leave' | 'half_day';
  start_time?: string;
  end_time?: string;
}

interface DriverDetails {
  phone?: string;
  email?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekDates(): string[] {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offset);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day.toISOString().split('T')[0];
  });
}

function todayDate() { return new Date().toISOString().split('T')[0]; }

const SCHEDULE_DOT: Record<string, string> = {
  on_duty:  '🟢',
  off_duty: '⚪',
  leave:    '🔴',
  half_day: '🟡',
};

const SCHEDULE_LABEL: Record<string, string> = {
  on_duty:  'On Duty',
  off_duty: 'Off Duty',
  leave:    'Leave',
  half_day: 'Half Day',
};

function fmtShift(entry?: ScheduleEntry) {
  if (!entry) return 'Not set';
  const label = SCHEDULE_LABEL[entry.status] ?? entry.status;
  if (entry.status === 'on_duty' && entry.start_time && entry.end_time) {
    return `${label} · ${entry.start_time.slice(0,5)}–${entry.end_time.slice(0,5)}`;
  }
  return label;
}

// ── Shared full-screen form wrapper (same as vehicle page) ────────────────────
function FullScreenForm({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 bg-[#F5F0E8] dark:bg-gray-950 z-50 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center h-14 px-4 shrink-0">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-800 dark:text-gray-100" />
        </button>
        <h1 className="flex-1 text-center font-bold text-base text-gray-800 dark:text-gray-100 -ml-9 pr-9">{title}</h1>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

const inputCls =
  'w-full h-12 px-4 text-base rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-[#2D5A45] focus:ring-2 focus:ring-[#2D5A45]/20 pr-12';

const labelCls = 'block text-sm text-gray-500 dark:text-gray-400 mb-1 font-medium';

// ── Change password form ──────────────────────────────────────────────────────
function ChangePasswordView({
  userEmail,
  userId,
  onBack,
}: {
  userEmail: string;
  userId: string;
  onBack: () => void;
}) {
  const [current, setCurrent]       = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [errors, setErrors]           = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!current)         errs.current = 'Enter your current password';
    if (newPw.length < 8) errs.newPw   = 'Minimum 8 characters';
    if (newPw !== confirm) errs.confirm = 'Passwords do not match';
    return errs;
  };

  const handleChange = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    setErrors({});

    // 1 — Verify current password
    const { data } = await supabase.rpc('verify_login', {
      user_email:    userEmail,
      user_password: current,
    });

    if (!data?.success) {
      setSaving(false);
      setErrors({ current: 'Current password is incorrect' });
      return;
    }

    // 2 — Update password (plain text for demo; real app should use server-side hashing)
    const { error } = await supabase
      .from('users')
      .update({ password_hash: newPw })
      .eq('id', userId);

    setSaving(false);
    if (error) {
      toast.error('Failed to change password');
    } else {
      toast.success('Password changed successfully');
      onBack();
    }
  };

  function PasswordInput({
    label,
    value,
    onChange,
    show,
    onToggle,
    error,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggle: () => void;
    error?: string;
    placeholder?: string;
  }) {
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={inputCls}
          />
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600 transition-colors"
          >
            {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <FullScreenForm title="Change Password" onBack={onBack}>
      <div className="px-4 py-6 space-y-4">
        <PasswordInput
          label="Current Password"
          value={current}
          onChange={setCurrent}
          show={showCurrent}
          onToggle={() => setShowCurrent(p => !p)}
          error={errors.current}
          placeholder="Enter current password"
        />
        <PasswordInput
          label="New Password"
          value={newPw}
          onChange={setNewPw}
          show={showNew}
          onToggle={() => setShowNew(p => !p)}
          error={errors.newPw}
          placeholder="Min 8 characters"
        />
        <PasswordInput
          label="Confirm New Password"
          value={confirm}
          onChange={setConfirm}
          show={showConfirm}
          onToggle={() => setShowConfirm(p => !p)}
          error={errors.confirm}
          placeholder="Repeat new password"
        />

        <p className="text-xs text-gray-400 dark:text-gray-500">Password must be at least 8 characters.</p>

        <button
          onClick={handleChange}
          disabled={saving}
          className="w-full h-14 rounded-2xl bg-[#2D5A45] text-white text-lg font-bold active:bg-[#234839] transition-colors disabled:opacity-60 mt-4"
        >
          {saving ? 'Changing…' : 'CHANGE PASSWORD'}
        </button>
      </div>
    </FullScreenForm>
  );
}

// ── Info row (read-only) ──────────────────────────────────────────────────────
function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className="w-9 h-9 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 text-[#2D5A45] dark:text-emerald-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-base text-gray-800 dark:text-gray-100 truncate">{value ?? '—'}</p>
      </div>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-[#2D5A45]' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-0'}`}
      />
    </button>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl ${className ?? ''}`} />;
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionTitle({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-5 pb-2">
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

// ── Logout confirm dialog ─────────────────────────────────────────────────────
function LogoutDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-3xl p-6 animate-[slideUp_0.25s_ease-out]"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-5" />
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
          <LogOut className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-800 dark:text-white text-center mb-1">Log Out</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">Are you sure you want to log out?</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3.5 rounded-xl bg-red-500 text-white font-semibold text-sm active:bg-red-600 transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MobileDriverProfilePage() {
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useDarkMode();
  const navigate = useNavigate();

  const [view, setView]               = useState<ProfileView>('main');
  const [schedule, setSchedule]       = useState<Record<string, ScheduleEntry>>({});
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [details, setDetails]         = useState<DriverDetails>({});
  const [showLogout, setShowLogout]   = useState(false);

  const weekDates = getWeekDates();

  // ── Fetch schedule + extra user fields ─────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    const [schedRes, userRes] = await Promise.all([
      supabase
        .from('driver_schedules')
        .select('*')
        .eq('driver_id', user.id)
        .in('date', weekDates),
      supabase
        .from('users')
        .select('phone,email')
        .eq('id', user.id)
        .single(),
    ]);

    if (schedRes.data) {
      const map: Record<string, ScheduleEntry> = {};
      for (const row of schedRes.data as ScheduleEntry[]) {
        map[row.date] = row;
      }
      setSchedule(map);
    }
    if (userRes.data) {
      setDetails(userRes.data as DriverDetails);
    }
    setScheduleLoading(false);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // ── Initials ───────────────────────────────────────────────────────────────
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const todayStr = todayDate();

  // ── Change password sub-view ───────────────────────────────────────────────
  if (view === 'changePassword' && user) {
    return (
      <ChangePasswordView
        userEmail={user.email}
        userId={user.id}
        onBack={() => setView('main')}
      />
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <MobileDriverLayout>
      <div className="pb-8">

        {/* ── Profile header ── */}
        <div className="flex flex-col items-center pt-6 pb-4 px-4">
          <div className="w-20 h-20 rounded-full bg-[#D6E4D9] dark:bg-emerald-900/50 flex items-center justify-center mb-3 shadow-sm">
            <span className="text-[#2D5A45] dark:text-emerald-400 text-2xl font-bold">{initials}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{user?.name ?? 'Driver'}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{user?.email ?? ''}</p>
          {user?.transportDepartmentName && (
            <span className="mt-2 px-3 py-1 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 text-[#2D5A45] dark:text-emerald-400 text-xs font-semibold">
              {user.transportDepartmentName}
            </span>
          )}
          {user?.isHeadDriver && (
            <span className="mt-1.5 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold">
              Head Driver
            </span>
          )}
        </div>

        {/* ── Personal info ── */}
        <SectionTitle label="Personal Info" />
        <div className="mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <InfoRow icon={<Mail className="w-4 h-4" />}      label="Email"              value={details.email ?? user?.email} />
          <InfoRow icon={<Phone className="w-4 h-4" />}     label="Phone"              value={details.phone} />
          <InfoRow icon={<Building2 className="w-4 h-4" />} label="Transport Dept"     value={user?.transportDepartmentName} />
          <InfoRow icon={<Car className="w-4 h-4" />}       label="Vehicle"            value={user?.vehicleModel} />
          <InfoRow icon={<Shield className="w-4 h-4" />}    label="Role"               value={user?.isHeadDriver ? 'Head Driver' : 'Driver'} />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-600 px-4 mt-2">
          Contact your Transport Head or Admin to update personal details.
        </p>

        {/* ── Weekly schedule ── */}
        <SectionTitle label="My Schedule This Week" />
        <div className="mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          {scheduleLoading ? (
            <div className="p-4 space-y-3">
              {[0,1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : (
            weekDates.map((date, idx) => {
              const entry = schedule[date];
              const isToday = date === todayStr;
              const dot = entry ? (SCHEDULE_DOT[entry.status] ?? '⚪') : '⚪';
              return (
                <div
                  key={date}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    idx < 6 ? 'border-b border-gray-100 dark:border-gray-700' : ''
                  } ${isToday ? 'border-l-4 border-[#2D5A45] dark:border-emerald-500 pl-3' : ''}`}
                >
                  <span className={`w-8 text-xs font-semibold shrink-0 ${isToday ? 'text-[#2D5A45] dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {DAY_LABELS[idx]}
                  </span>
                  <span className="text-sm shrink-0">{dot}</span>
                  <span className={`text-sm flex-1 ${isToday ? 'font-bold text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                    {fmtShift(entry)}
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#2D5A45]/10 dark:bg-emerald-900/30 text-[#2D5A45] dark:text-emerald-400">
                      TODAY
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-600 px-4 mt-2">
          Schedule is set by your Transport Department Head and is read-only here.
        </p>

        {/* ── Settings ── */}
        <SectionTitle label="Settings" />
        <div className="mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">

          {/* Dark mode */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-700">
            <div className="w-9 h-9 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              {darkMode
                ? <Moon className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />
                : <Sun className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />
              }
            </div>
            <div className="flex-1">
              <p className="text-base text-gray-800 dark:text-gray-100">Dark Mode</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{darkMode ? 'On' : 'Off'}</p>
            </div>
            <Toggle checked={darkMode} onChange={toggleDarkMode} />
          </div>

          {/* Change password */}
          <button
            onClick={() => setView('changePassword')}
            className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />
            </div>
            <span className="flex-1 text-left text-base text-gray-800 dark:text-gray-100">Change Password</span>
            <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
          </button>

        </div>

        {/* ── Log out ── */}
        <div className="mx-4 mt-4">
          <button
            onClick={() => setShowLogout(true)}
            className="w-full h-14 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-lg font-bold flex items-center justify-center gap-2 active:bg-red-100 dark:active:bg-red-900/30 transition-colors"
          >
            <LogOut className="w-5 h-5" /> LOG OUT
          </button>
        </div>

        {/* ── User icon row ── */}
        <div className="flex items-center justify-center gap-2 mt-6">
          <User className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
          <p className="text-xs text-gray-300 dark:text-gray-600">Jalsa Guest v1.0 · Driver App</p>
        </div>

      </div>

      {/* ── Logout confirm sheet ── */}
      {showLogout && (
        <LogoutDialog
          onConfirm={handleLogout}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </MobileDriverLayout>
  );
}
