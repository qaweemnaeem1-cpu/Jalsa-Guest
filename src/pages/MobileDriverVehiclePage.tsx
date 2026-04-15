import { useState } from 'react';
import { Car, Fuel, Wrench, AlertTriangle, ChevronRight, CheckCircle2 } from 'lucide-react';
import MobileDriverLayout from '@/components/MobileDriverLayout';
import { useAuth } from '@/hooks/useAuth';

interface MaintenanceItem {
  id: string;
  label: string;
  lastChecked: string;
  status: 'ok' | 'due' | 'overdue';
}

const SAMPLE_MAINTENANCE: MaintenanceItem[] = [
  { id: '1', label: 'Engine Oil',     lastChecked: '2026-03-10', status: 'ok'      },
  { id: '2', label: 'Tyre Pressure',  lastChecked: '2026-04-01', status: 'ok'      },
  { id: '3', label: 'Brake Fluid',    lastChecked: '2026-02-15', status: 'due'     },
  { id: '4', label: 'Air Filter',     lastChecked: '2025-11-20', status: 'overdue' },
];

function StatusBadge({ status }: { status: MaintenanceItem['status'] }) {
  if (status === 'ok')      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === 'due')     return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <AlertTriangle className="w-4 h-4 text-red-500" />;
}

export default function MobileDriverVehiclePage() {
  const { user } = useAuth();
  const [fuelLevel] = useState(72); // placeholder — would come from DB

  return (
    <MobileDriverLayout>
      <div className="px-4 py-4 space-y-4">

        {/* Vehicle card */}
        <div className="rounded-2xl bg-[#2D5A45] dark:bg-gray-900 p-5 text-white shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
              <Car className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white/70 text-xs">Assigned Vehicle</p>
              <p className="font-bold text-base">{user?.vehicleModel ?? 'No vehicle assigned'}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-white/60 text-xs mb-0.5">Registration</p>
              <p className="font-semibold text-sm">{user?.vehicleRegistration ?? '—'}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-white/60 text-xs mb-0.5">Type</p>
              <p className="font-semibold text-sm">{user?.vehicleType ?? '—'}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-white/60 text-xs mb-0.5">Capacity</p>
              <p className="font-semibold text-sm">
                {user?.vehicleCapacity ? `${user.vehicleCapacity} pax` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Fuel level */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-[#E8E3DB] dark:border-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Fuel className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />
              <p className="font-semibold text-[#1A1A1A] dark:text-white text-sm">Fuel Level</p>
            </div>
            <span className={`text-sm font-bold ${fuelLevel < 25 ? 'text-red-500' : fuelLevel < 50 ? 'text-amber-500' : 'text-emerald-600'}`}>
              {fuelLevel}%
            </span>
          </div>
          <div className="h-3 bg-[#F5F0E8] dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                fuelLevel < 25 ? 'bg-red-500' : fuelLevel < 50 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${fuelLevel}%` }}
            />
          </div>
          {fuelLevel < 25 && (
            <p className="text-xs text-red-500 mt-2">Fuel low — please refuel soon</p>
          )}
        </div>

        {/* Maintenance checklist */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-[#1A1A1A] dark:text-white" />
              <h2 className="font-bold text-[#1A1A1A] dark:text-white text-sm">Maintenance</h2>
            </div>
          </div>

          <div className="space-y-2">
            {SAMPLE_MAINTENANCE.map(item => (
              <div
                key={item.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-[#E8E3DB] dark:border-gray-800 px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={item.status} />
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A] dark:text-white">{item.label}</p>
                    <p className="text-xs text-[#4A4A4A] dark:text-gray-400">Last: {item.lastChecked}</p>
                  </div>
                </div>
                {(item.status === 'due' || item.status === 'overdue') && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    item.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {item.status === 'overdue' ? 'OVERDUE' : 'DUE'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Report issue button */}
        <button className="w-full rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-red-600 dark:text-red-400">Report Vehicle Issue</span>
          </div>
          <ChevronRight className="w-4 h-4 text-red-400" />
        </button>

      </div>
    </MobileDriverLayout>
  );
}
