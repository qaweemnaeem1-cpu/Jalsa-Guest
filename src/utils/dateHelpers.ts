/**
 * Safe date/time display helpers.
 *
 * DB stores arrival_date (DATE "2026-07-22") and arrival_time (TIME "17:45").
 * rowToGuest recombines them into guest.arrivalTime = "2026-07-22T17:45".
 * These helpers handle "YYYY-MM-DDTHH:MM[:SS][.sssZ]", "YYYY-MM-DD", "HH:MM[:SS]",
 * full ISO timestamps, and nullish values. They never throw.
 */

function extractDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value);
  if (s.includes('T')) return s.split('T')[0];
  // Pure time string "HH:MM" or "HH:MM:SS" — no date available
  if (s.includes(':') && !s.includes('-')) return null;
  return s;
}

function extractTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value);
  if (s.includes('T')) {
    const t = s.split('T')[1];
    return t ? t.slice(0, 5) : null;
  }
  if (s.includes(':') && !s.includes('-')) return s.slice(0, 5);
  return null;
}

/** "2026-07-22" → "22 Jul 2026". Also handles full ISO and returns '—' for nullish. */
export function formatDate(value: string | null | undefined): string {
  const d = extractDate(value);
  if (!d) return '—';
  try {
    const date = new Date(`${d}T12:00:00`); // noon avoids timezone-shift to adjacent day
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

/** "2026-07-22" → "22 Jul" */
export function formatDateShort(value: string | null | undefined): string {
  const d = extractDate(value);
  if (!d) return '—';
  try {
    const date = new Date(`${d}T12:00:00`);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return d;
  }
}

/**
 * Format date with weekday: "Mon, 22 Jul" or "Mon, 22 Jul 2026".
 * `long` appends year.
 */
export function formatDateWithWeekday(value: string | null | undefined, opts?: { long?: boolean }): string {
  const d = extractDate(value);
  if (!d) return '—';
  try {
    const date = new Date(`${d}T12:00:00`);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('en-GB', opts?.long
      ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return d;
  }
}

/** "17:45[:00]" → "17:45". Never calls new Date — pure string slice. */
export function formatTime(value: string | null | undefined): string {
  const t = extractTime(value);
  if (!t) return '—';
  return t;
}

/**
 * formatDateTime — accepts either a single combined value ("2026-07-22T17:45")
 * or two separate strings (dateStr, timeStr).
 * Returns "22 Jul 2026 · 17:45".
 */
export function formatDateTime(value: string | null | undefined): string;
export function formatDateTime(dateStr: string | null | undefined, timeStr: string | null | undefined): string;
export function formatDateTime(a: string | null | undefined, b?: string | null | undefined): string {
  if (b !== undefined) {
    const d = formatDate(a);
    const t = formatTime(b);
    if (d === '—' && t === '—') return '—';
    if (d === '—') return t;
    if (t === '—') return d;
    return `${d} · ${t}`;
  }
  const d = formatDate(a);
  const t = formatTime(a);
  if (d === '—' && t === '—') return '—';
  if (d === '—') return t;
  if (t === '—') return d;
  return `${d} · ${t}`;
}

/** "22 Jul · 17:45" — same overload as formatDateTime */
export function formatDateTimeShort(value: string | null | undefined): string;
export function formatDateTimeShort(dateStr: string | null | undefined, timeStr: string | null | undefined): string;
export function formatDateTimeShort(a: string | null | undefined, b?: string | null | undefined): string {
  const d = b !== undefined ? formatDateShort(a) : formatDateShort(a);
  const t = b !== undefined ? formatTime(b) : formatTime(a);
  if (d === '—' && t === '—') return '—';
  if (d === '—') return t;
  if (t === '—') return d;
  return `${d} · ${t}`;
}

/** Full ISO timestamp ("2026-07-22T17:45:00.000Z") → "22 Jul 2026 · 17:45" (local time) */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return String(value);
  }
}

/** ISO timestamp → "17:45" (local time part only) */
export function formatTimestampTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(value);
  }
}

/** ISO timestamp → "22 Jul" (local date part only) */
export function formatTimestampDateShort(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return String(value);
  }
}

export function isToday(value: string | null | undefined): boolean {
  const d = extractDate(value);
  if (!d) return false;
  try {
    const check = new Date(`${d}T12:00:00`);
    if (isNaN(check.getTime())) return false;
    const today = new Date();
    return today.toDateString() === check.toDateString();
  } catch {
    return false;
  }
}

export function isPast(value: string | null | undefined): boolean {
  const d = extractDate(value);
  if (!d) return false;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const check = new Date(`${d}T12:00:00`);
    if (isNaN(check.getTime())) return false;
    return check < today;
  } catch {
    return false;
  }
}

export function isFuture(value: string | null | undefined): boolean {
  const d = extractDate(value);
  if (!d) return false;
  try {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const check = new Date(`${d}T12:00:00`);
    if (isNaN(check.getTime())) return false;
    return check > today;
  } catch {
    return false;
  }
}
