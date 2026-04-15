import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, MapPin, Navigation, Users, Plane,
  Clock, CheckCircle2, Check, X, ChevronRight, RefreshCw,
} from 'lucide-react';
import { useDarkMode } from '@/contexts/DarkModeContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { DriverTask, DriverTaskPassenger } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────
type SubStage = 'enRoute' | 'arrived' | 'collected';

interface Peer {
  id: string;
  name: string;
}

const SUBSTAGE_ORDER: SubStage[] = ['enRoute', 'arrived', 'collected'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPriorityBadge(p?: string) {
  if (p === 'vip')    return 'bg-red-100 text-red-700';
  if (p === 'urgent') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}
function getTypeLabel(t?: string) {
  if (t === 'airport_pickup')    return 'PICKUP';
  if (t === 'airport_dropoff')   return 'DROPOFF';
  if (t === 'mulaqat_transport') return 'MULAQAT';
  return 'OTHER';
}
function fmtTime(t?: string) { return t ? t.slice(0, 5) : '—'; }
function fmtTimestamp(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function durationMinutes(from?: string, to?: string) {
  if (!from || !to) return null;
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
}

// Sub-stage persisted in localStorage
const SUBSTAGE_KEY = (id: string) => `task_substage_${id}`;

function readSubStage(taskId: string): SubStage {
  const val = localStorage.getItem(SUBSTAGE_KEY(taskId));
  if (val === 'arrived' || val === 'collected') return val;
  return 'enRoute';
}
function writeSubStage(taskId: string, s: SubStage) {
  localStorage.setItem(SUBSTAGE_KEY(taskId), s);
}
function clearSubStage(taskId: string) {
  localStorage.removeItem(SUBSTAGE_KEY(taskId));
}

// ── Timeline step ─────────────────────────────────────────────────────────────
type TimelineStatus = 'done' | 'current' | 'upcoming';

function TimelineStep({
  label,
  status,
  timestamp,
  isLast,
}: {
  label: string;
  status: TimelineStatus;
  timestamp?: string;
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-3">
      {/* Dot + line */}
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
          status === 'done'    ? 'bg-emerald-500'
          : status === 'current' ? 'bg-blue-500 ring-4 ring-blue-200 dark:ring-blue-900'
          : 'bg-gray-200 dark:bg-gray-700'
        }`}>
          {status === 'done'
            ? <Check className="w-3 h-3 text-white" />
            : <span className="w-2 h-2 rounded-full bg-white" />
          }
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 my-1 min-h-[24px] ${
            status === 'done' ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700'
          }`} />
        )}
      </div>

      {/* Content */}
      <div className="pb-4 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${
            status === 'current' ? 'text-blue-600 dark:text-blue-400'
            : status === 'done'  ? 'text-[#1A1A1A] dark:text-white'
            : 'text-gray-400 dark:text-gray-600'
          }`}>
            {label}
          </span>
          {timestamp && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{timestamp}</span>
          )}
          {status === 'current' && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
              Current
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Handover sheet ────────────────────────────────────────────────────────────
function HandoverSheet({
  peers,
  taskId,
  onClose,
  onDone,
}: {
  peers: Peer[];
  taskId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string>('');
  const [reason, setReason]     = useState('');
  const [saving, setSaving]     = useState(false);
  const { user } = useAuth();

  const handleHandover = async () => {
    if (!selected || !user) return;
    setSaving(true);
    const peer = peers.find(p => p.id === selected);
    await supabase.from('driver_tasks').update({
      driver_id:            selected,
      handed_over_from:     user.id,
      handed_over_from_name: user.name,
      handover_reason:      reason || null,
      handed_over_at:       new Date().toISOString(),
    }).eq('id', taskId);
    clearSubStage(taskId);
    setSaving(false);
    onDone();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl p-6 animate-[slideUp_0.3s_ease-out]">
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-5" />
        <h3 className="text-lg font-bold text-[#1A1A1A] dark:text-white mb-4">Handover Task</h3>

        {peers.length === 0 ? (
          <p className="text-sm text-[#4A4A4A] dark:text-gray-400 text-center py-4">No other drivers available</p>
        ) : (
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {peers.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  selected === p.id
                    ? 'border-[#2D5A45] bg-[#2D5A45]/10 dark:bg-emerald-900/20'
                    : 'border-[#E8E3DB] dark:border-gray-700'
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center text-[#2D5A45] dark:text-emerald-400 font-bold text-sm">
                  {p.name[0]}
                </div>
                <span className="text-sm font-medium text-[#1A1A1A] dark:text-white">{p.name}</span>
                {selected === p.id && <Check className="ml-auto w-4 h-4 text-[#2D5A45]" />}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason for handover (optional)"
          rows={2}
          className="w-full rounded-xl border border-[#D4CFC7] dark:border-gray-700 bg-[#F5F0E8] dark:bg-gray-800 text-[#1A1A1A] dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:border-[#2D5A45] resize-none mb-4"
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3.5 rounded-xl border border-[#E8E3DB] dark:border-gray-700 text-[#1A1A1A] dark:text-white font-semibold text-sm">
            Cancel
          </button>
          <button
            onClick={handleHandover}
            disabled={!selected || saving}
            className="flex-1 py-3.5 rounded-xl bg-amber-500 text-white font-semibold text-sm disabled:opacity-40"
          >
            {saving ? 'Handing over…' : 'Confirm Handover'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MobileDriverTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { darkMode } = useDarkMode();
  const { user } = useAuth();

  // Reflect dark mode class (the provider is mounted above this page)
  // DarkModeContext handles this via useEffect — just need the hook call
  void darkMode;

  const [task, setTask]           = useState<DriverTask | null>(null);
  const [passengers, setPassengers] = useState<DriverTaskPassenger[]>([]);
  const [peers, setPeers]         = useState<Peer[]>([]);
  const [subStage, setSubStage]   = useState<SubStage>('enRoute');
  const [loading, setLoading]     = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [showHandover, setShowHandover] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [taskRes, passRes] = await Promise.all([
      supabase.from('driver_tasks').select('*').eq('id', id).single(),
      supabase.from('driver_task_passengers').select('*').eq('task_id', id),
    ]);
    if (taskRes.data) {
      const t = taskRes.data as DriverTask;
      setTask(t);
      if (t.status === 'in_progress') {
        setSubStage(readSubStage(id));
      }
      // Fetch peers (other drivers in same transport dept)
      if (t.transport_department_id) {
        const { data: peerData } = await supabase
          .from('users')
          .select('id, name')
          .eq('role', 'driver')
          .eq('transport_department_id', t.transport_department_id)
          .neq('id', user?.id ?? '');
        setPeers((peerData ?? []) as Peer[]);
      }
    }
    setPassengers((passRes.data ?? []) as DriverTaskPassenger[]);
    setLoading(false);
  }, [id, user?.id]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleStartJourney = async () => {
    if (!task) return;
    setActionBusy(true);
    await supabase.from('driver_tasks').update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
    }).eq('id', task.id);
    writeSubStage(task.id, 'enRoute');
    await fetchTask();
    setActionBusy(false);
  };

  const handleAdvanceSubStage = () => {
    if (!task) return;
    const idx = SUBSTAGE_ORDER.indexOf(subStage);
    if (idx < SUBSTAGE_ORDER.length - 1) {
      const next = SUBSTAGE_ORDER[idx + 1];
      setSubStage(next);
      writeSubStage(task.id, next);
    }
  };

  const handleComplete = async () => {
    if (!task) return;
    setActionBusy(true);
    await supabase.from('driver_tasks').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', task.id);
    clearSubStage(task.id);
    await fetchTask();
    setActionBusy(false);
  };

  const handleHandoverDone = () => {
    setShowHandover(false);
    navigate(-1);
  };

  // ── Timeline ───────────────────────────────────────────────────────────────
  const buildTimeline = () => {
    if (!task) return [];
    const status   = task.status;
    const ssIdx    = SUBSTAGE_ORDER.indexOf(subStage);

    type Step = { label: string; status: TimelineStatus; ts?: string };
    const steps: Step[] = [];

    // 1 — Assigned
    steps.push({ label: 'Assigned', status: 'done', ts: fmtTime(task.scheduled_time) });

    // 2 — Journey Started
    if (status === 'pending') {
      steps.push({ label: 'Journey Started', status: 'current' });
    } else {
      steps.push({ label: 'Journey Started', status: 'done', ts: fmtTimestamp(task.started_at) });
    }

    // 3 — En Route / Arrived / Collected
    const subLabels: Record<SubStage, string> = {
      enRoute:   'En Route',
      arrived:   'Arrived at Pickup',
      collected: 'Guest Collected',
    };
    SUBSTAGE_ORDER.forEach((s, i) => {
      if (status === 'pending') {
        steps.push({ label: subLabels[s], status: 'upcoming' });
      } else if (status === 'in_progress') {
        if (i < ssIdx)  steps.push({ label: subLabels[s], status: 'done' });
        if (i === ssIdx) steps.push({ label: subLabels[s], status: 'current' });
        if (i > ssIdx)  steps.push({ label: subLabels[s], status: 'upcoming' });
      } else {
        steps.push({ label: subLabels[s], status: 'done' });
      }
    });

    // 4 — Trip Completed
    if (status === 'completed') {
      steps.push({ label: 'Trip Completed', status: 'done', ts: fmtTimestamp(task.completed_at) });
    } else {
      steps.push({ label: 'Trip Completed', status: 'upcoming' });
    }

    return steps;
  };

  // ── Action button ──────────────────────────────────────────────────────────
  const renderActionButton = () => {
    if (!task) return null;
    if (task.status === 'completed') return null;

    if (task.status === 'pending') {
      return (
        <button
          onClick={handleStartJourney}
          disabled={actionBusy}
          className="w-full h-16 rounded-2xl bg-[#2D5A45] text-white text-xl font-bold tracking-wide active:bg-[#234839] transition-colors disabled:opacity-60"
        >
          {actionBusy ? 'Starting…' : 'START JOURNEY'}
        </button>
      );
    }

    if (task.status === 'in_progress') {
      const isLast = subStage === 'collected';
      const labels: Record<SubStage, string> = {
        enRoute:   "I'VE ARRIVED",
        arrived:   'GUEST COLLECTED',
        collected: 'TRIP COMPLETED',
      };
      return (
        <button
          onClick={isLast ? handleComplete : handleAdvanceSubStage}
          disabled={actionBusy}
          className={`w-full h-16 rounded-2xl text-white text-xl font-bold tracking-wide transition-colors disabled:opacity-60 ${
            isLast ? 'bg-emerald-600 active:bg-emerald-700' : 'bg-[#2D5A45] active:bg-[#234839]'
          }`}
        >
          {actionBusy ? 'Saving…' : labels[subStage]}
        </button>
      );
    }

    return null;
  };

  // ── Completed summary ──────────────────────────────────────────────────────
  const renderCompletedSummary = () => {
    if (task?.status !== 'completed') return null;
    const dur = durationMinutes(task.started_at, task.completed_at);
    const dist = task.end_mileage && task.start_mileage
      ? task.end_mileage - task.start_mileage
      : null;

    return (
      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">Trip Completed</span>
          {task.completed_at && (
            <span className="text-xs text-emerald-600 dark:text-emerald-500 ml-auto">{fmtTimestamp(task.completed_at)}</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {dur && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-[#1A1A1A] dark:text-white">{dur} <span className="text-sm font-normal">min</span></p>
              <p className="text-xs text-[#4A4A4A] dark:text-gray-400">Duration</p>
            </div>
          )}
          {dist && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-[#1A1A1A] dark:text-white">{dist} <span className="text-sm font-normal">km</span></p>
              <p className="text-xs text-[#4A4A4A] dark:text-gray-400">Distance</p>
            </div>
          )}
        </div>
        {task.handed_over_from_name && (
          <p className="text-xs text-[#4A4A4A] dark:text-gray-400 pt-1">
            Handed over from {task.handed_over_from_name}
            {task.handover_reason ? ` · ${task.handover_reason}` : ''}
          </p>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] dark:bg-gray-950 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-[#2D5A45] animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] dark:bg-gray-950 flex flex-col items-center justify-center gap-3">
        <p className="text-[#4A4A4A] dark:text-gray-400 text-sm">Task not found</p>
        <button onClick={() => navigate(-1)} className="text-[#2D5A45] dark:text-emerald-400 font-medium text-sm">
          ← Back
        </button>
      </div>
    );
  }

  const timeline = buildTimeline();

  return (
    <div
      className="min-h-screen bg-[#F5F0E8] dark:bg-gray-950 flex flex-col"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >

      {/* ── Top bar ── */}
      <div
        className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-[#E8E3DB] dark:border-gray-800 flex items-center gap-3 px-4 shadow-sm"
        style={{ height: 56, paddingTop: 'env(safe-area-inset-top)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-[#F5F0E8] dark:bg-gray-800 flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#1A1A1A] dark:text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#1A1A1A] dark:text-white text-sm">{getTypeLabel(task.task_type)}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getPriorityBadge(task.priority)}`}>
          {(task.priority ?? 'Normal').toUpperCase()}
        </span>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto pt-14 pb-8 space-y-4 px-4">

        {/* ── Guest card ── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm mt-4">
          <p className="text-xs font-semibold text-[#4A4A4A] dark:text-gray-400 uppercase tracking-wide mb-3">Guest</p>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center text-[#2D5A45] dark:text-emerald-400 font-bold text-xl">
              {task.guest_name ? task.guest_name[0] : '?'}
            </div>
            <div>
              <p className="font-bold text-[#1A1A1A] dark:text-white text-base">{task.guest_name ?? '—'}</p>
              {task.delegation_name && (
                <p className="text-sm text-[#4A4A4A] dark:text-gray-400">{task.delegation_name}</p>
              )}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getPriorityBadge(task.priority)} inline-block mt-1`}>
                {(task.priority ?? 'Normal').toUpperCase()}
              </span>
            </div>
          </div>

          {/* Contact buttons */}
          <div className="space-y-2">
            <a
              href="tel:"
              className="flex items-center gap-3 bg-[#F5F0E8] dark:bg-gray-800 rounded-xl px-4 py-3 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-[#2D5A45] flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-[#4A4A4A] dark:text-gray-400">Call Guest</p>
                <p className="text-sm font-semibold text-[#1A1A1A] dark:text-white">
                  {task.notes?.match(/\+[\d\s]+/)?.[0] ?? 'No number on record'}
                </p>
              </div>
              <ChevronRight className="ml-auto w-4 h-4 text-[#4A4A4A] dark:text-gray-400" />
            </a>
            <a
              href="mailto:"
              className="flex items-center gap-3 bg-[#F5F0E8] dark:bg-gray-800 rounded-xl px-4 py-3 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-[#2D5A45] flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-[#4A4A4A] dark:text-gray-400">Email Guest</p>
                <p className="text-sm font-semibold text-[#1A1A1A] dark:text-white">—</p>
              </div>
              <ChevronRight className="ml-auto w-4 h-4 text-[#4A4A4A] dark:text-gray-400" />
            </a>
          </div>
        </div>

        {/* ── Route ── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#4A4A4A] dark:text-gray-400 uppercase tracking-wide mb-3">Route</p>
          <div className="space-y-2">
            {task.pickup_location && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(task.pickup_location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-[#F5F0E8] dark:bg-gray-800 rounded-xl px-4 py-3 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#2D5A45]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#4A4A4A] dark:text-gray-400">From</p>
                  <p className="text-sm font-semibold text-[#1A1A1A] dark:text-white truncate">{task.pickup_location}</p>
                </div>
                <Navigation className="w-4 h-4 text-[#2D5A45] shrink-0" />
              </a>
            )}
            {task.dropoff_location && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(task.dropoff_location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-[#F5F0E8] dark:bg-gray-800 rounded-xl px-4 py-3 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#4A4A4A] dark:text-gray-400">To</p>
                  <p className="text-sm font-semibold text-[#1A1A1A] dark:text-white truncate">{task.dropoff_location}</p>
                </div>
                <Navigation className="w-4 h-4 text-[#2D5A45] shrink-0" />
              </a>
            )}
          </div>
        </div>

        {/* ── Details ── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#4A4A4A] dark:text-gray-400 uppercase tracking-wide mb-3">Details</p>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            {task.flight_number && (
              <>
                <div className="flex items-center gap-1.5 text-[#4A4A4A] dark:text-gray-400">
                  <Plane className="w-3.5 h-3.5" /> Flight
                </div>
                <span className="font-medium text-[#1A1A1A] dark:text-white">{task.flight_number}</span>
              </>
            )}
            {task.scheduled_time && (
              <>
                <div className="flex items-center gap-1.5 text-[#4A4A4A] dark:text-gray-400">
                  <Clock className="w-3.5 h-3.5" /> Time
                </div>
                <span className="font-medium text-[#1A1A1A] dark:text-white">{fmtTime(task.scheduled_time)}</span>
              </>
            )}
            {task.passenger_count && (
              <>
                <div className="flex items-center gap-1.5 text-[#4A4A4A] dark:text-gray-400">
                  <Users className="w-3.5 h-3.5" /> Passengers
                </div>
                <span className="font-medium text-[#1A1A1A] dark:text-white">{task.passenger_count}</span>
              </>
            )}
            <>
              <div className="text-[#4A4A4A] dark:text-gray-400">Priority</div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${getPriorityBadge(task.priority)}`}>
                {(task.priority ?? 'Normal').toUpperCase()}
              </span>
            </>
          </div>
          {task.notes && (
            <div className="mt-3 pt-3 border-t border-[#F5F0E8] dark:border-gray-800">
              <p className="text-xs text-[#4A4A4A] dark:text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-[#1A1A1A] dark:text-white">{task.notes}</p>
            </div>
          )}
        </div>

        {/* ── Passengers (batch) ── */}
        {passengers.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-[#4A4A4A] dark:text-gray-400 uppercase tracking-wide mb-3">
              Passengers ({passengers.length})
            </p>
            <div className="space-y-2">
              {passengers.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center text-[#2D5A45] dark:text-emerald-400 font-bold text-sm shrink-0">
                    {p.guest_name[0]}
                  </div>
                  <span className="flex-1 text-sm font-medium text-[#1A1A1A] dark:text-white">{p.guest_name}</span>
                  {p.guest_phone && (
                    <a href={`tel:${p.guest_phone}`} className="w-8 h-8 rounded-full bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Phone className="w-3.5 h-3.5 text-[#2D5A45] dark:text-emerald-400" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Progress timeline ── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#4A4A4A] dark:text-gray-400 uppercase tracking-wide mb-4">Progress</p>
          {timeline.map((step, i) => (
            <TimelineStep
              key={step.label}
              label={step.label}
              status={step.status}
              timestamp={step.ts}
              isLast={i === timeline.length - 1}
            />
          ))}
        </div>

        {/* ── Completed summary ── */}
        {renderCompletedSummary()}

        {/* ── Action button ── */}
        {task.status !== 'completed' && (
          <div className="space-y-3">
            {renderActionButton()}
            <button
              onClick={() => setShowHandover(true)}
              className="w-full py-4 rounded-2xl border border-[#E8E3DB] dark:border-gray-700 flex items-center justify-center gap-2 text-sm font-semibold text-[#4A4A4A] dark:text-gray-300 active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Request Handover
            </button>
          </div>
        )}

      </div>

      {/* ── Handover sheet ── */}
      {showHandover && (
        <HandoverSheet
          peers={peers}
          taskId={task.id}
          onClose={() => setShowHandover(false)}
          onDone={handleHandoverDone}
        />
      )}
    </div>
  );
}
