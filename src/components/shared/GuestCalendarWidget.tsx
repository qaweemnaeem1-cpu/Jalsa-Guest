import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate, formatTime } from '@/utils/dateHelpers';
import type { Guest } from '@/types';

export interface GuestCalendarWidgetProps {
  /** Pre-filtered guest list for this role (location, department, transport dept, etc.). */
  guests: Guest[];
  /** Optional title override — defaults to "📅 Upcoming Schedule". */
  title?: string;
  /**
   * Optional custom per-guest row renderer for the day popup.
   * `type` is 'arrival' or 'departure'. If omitted, a default compact row is rendered.
   */
  renderGuestLine?: (guest: Guest, type: 'arrival' | 'departure') => ReactNode;
  /** Optional click handler for guest rows in the popup (e.g. open guest modal). */
  onGuestClick?: (guestId: string) => void;
}

function defaultRenderGuestLine(guest: Guest, type: 'arrival' | 'departure'): ReactNode {
  const time     = type === 'arrival' ? guest.arrival_time     : guest.departure_time;
  const flight   = type === 'arrival' ? guest.arrivalFlightNumber : guest.departureFlightNumber;
  const airport  = type === 'arrival' ? guest.arrivalAirport   : guest.departureAirport;
  const terminal = type === 'arrival' ? guest.arrivalTerminal  : guest.departureTerminal;
  const dotCls = type === 'arrival' ? 'bg-green-500' : 'bg-yellow-500';
  const meta = [flight, airport, terminal ? `T${terminal}` : ''].filter(Boolean).join(' · ');
  return (
    <>
      <span className={`w-2 h-2 rounded-full ${dotCls} shrink-0`} />
      <span className="text-gray-500">{formatTime(time)}</span>
      <span className="font-medium text-gray-800">{guest.fullName}</span>
      {meta && <span className="text-gray-400 text-xs">{meta}</span>}
    </>
  );
}

export function GuestCalendarWidget({
  guests,
  title = '📅 Upcoming Schedule',
  renderGuestLine = defaultRenderGuestLine,
  onGuestClick,
}: GuestCalendarWidgetProps) {
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { arrivalsByDay, departuresByDay } = useMemo(() => {
    const a: Record<string, number> = {};
    const d: Record<string, number> = {};
    for (const g of guests) {
      if (g.arrival_date)   a[g.arrival_date]   = (a[g.arrival_date]   ?? 0) + 1;
      if (g.departure_date) d[g.departure_date] = (d[g.departure_date] ?? 0) + 1;
    }
    return { arrivalsByDay: a, departuresByDay: d };
  }, [guests]);

  const selectedDayArrivals = useMemo(
    () => selectedDate ? guests.filter(g => g.arrival_date   === selectedDate) : [],
    [guests, selectedDate],
  );
  const selectedDayDepartures = useMemo(
    () => selectedDate ? guests.filter(g => g.departure_date === selectedDate) : [],
    [guests, selectedDate],
  );

  const year  = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDayRaw = new Date(year, month, 1).getDay();
  const firstDayMonIdx = (firstDayRaw + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayMonIdx; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
            aria-label="Previous month"
          ><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
          <span className="text-sm font-semibold text-gray-800 min-w-[120px] text-center">
            {calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => setCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
            aria-label="Next month"
          ><ChevronRight className="w-4 h-4 text-gray-600" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(h => (
          <div key={h} className="text-xs font-medium text-gray-400 uppercase text-center py-1">{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const aCount = arrivalsByDay[dateStr]   ?? 0;
          const dCount = departuresByDay[dateStr] ?? 0;
          const hasA = aCount > 0;
          const hasD = dCount > 0;
          const isToday = dateStr === todayStr;
          const isSel = dateStr === selectedDate;
          const bg = hasA && hasD
            ? 'bg-gradient-to-br from-green-50 to-yellow-50 text-gray-800'
            : hasA ? 'bg-green-50 text-green-800'
            : hasD ? 'bg-yellow-50 text-yellow-800'
            : 'bg-white text-gray-600 hover:bg-gray-50';
          const todayBorder = isToday ? 'border-2 border-[#2D5A45] font-bold' : 'border border-transparent';
          const selRing = isSel ? 'ring-2 ring-[#2D5A45]' : '';
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(isSel ? null : dateStr)}
              className={`relative w-full aspect-square rounded-lg text-center text-sm cursor-pointer transition-colors ${bg} ${todayBorder} ${selRing}`}
            >
              <span>{d}</span>
              {hasA && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 text-white text-[9px] flex items-center justify-center font-bold">{aCount}</span>
              )}
              {hasD && (
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-yellow-500 text-white text-[9px] flex items-center justify-center font-bold">{dCount}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300" />
          Arriving
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-300" />
          Departing
        </div>
      </div>

      {selectedDate && (selectedDayArrivals.length > 0 || selectedDayDepartures.length > 0) && (
        <div className="mt-3 bg-gray-50 rounded-xl p-4 border border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">{formatDate(selectedDate)}</h4>
          {selectedDayArrivals.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-bold text-green-700 uppercase">Arriving ({selectedDayArrivals.length})</span>
              {selectedDayArrivals.map(g => (
                <div
                  key={g.id}
                  onClick={onGuestClick ? () => onGuestClick(g.id) : undefined}
                  className={`flex items-center gap-2 mt-1.5 text-sm ${onGuestClick ? 'cursor-pointer hover:bg-white rounded px-1 py-0.5' : ''}`}
                >
                  {renderGuestLine(g, 'arrival')}
                </div>
              ))}
            </div>
          )}
          {selectedDayDepartures.length > 0 && (
            <div>
              <span className="text-xs font-bold text-yellow-700 uppercase">Departing ({selectedDayDepartures.length})</span>
              {selectedDayDepartures.map(g => (
                <div
                  key={g.id}
                  onClick={onGuestClick ? () => onGuestClick(g.id) : undefined}
                  className={`flex items-center gap-2 mt-1.5 text-sm ${onGuestClick ? 'cursor-pointer hover:bg-white rounded px-1 py-0.5' : ''}`}
                >
                  {renderGuestLine(g, 'departure')}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
