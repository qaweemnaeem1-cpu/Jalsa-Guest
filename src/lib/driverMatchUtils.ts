/**
 * Shared driver utilities:
 *  - ETA calculation
 *  - Airport terminal map links
 *  - Driver-guest matching preferences
 */

// ── ETA calculation ────────────────────────────────────────────────────────────

/** Average travel times in minutes: airport name → venue name */
const TRAVEL_TIMES: Record<string, Record<string, number>> = {
  Heathrow: { Jamia: 45, University: 50, Hotels: 40, 'Bait Ul Futuh': 30, 'Bait Ul Ehsan': 35 },
  Gatwick:  { Jamia: 60, University: 65, Hotels: 55, 'Bait Ul Futuh': 50, 'Bait Ul Ehsan': 55 },
  Luton:    { Jamia: 50, University: 55, Hotels: 45, 'Bait Ul Futuh': 60, 'Bait Ul Ehsan': 55 },
  Stansted: { Jamia: 70, University: 75, Hotels: 65, 'Bait Ul Futuh': 60, 'Bait Ul Ehsan': 65 },
};

const DEFAULT_MINUTES = 45;
const MULAQAT_MINUTES = 20;

interface EtaTask {
  task_type: string;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  started_at?: string | null;
}

/** Returns the estimated arrival Date, or null if task hasn't started. */
export function calculateETA(task: EtaTask): Date | null {
  if (!task.started_at) return null;
  const startedAt = new Date(task.started_at);

  if (task.task_type === 'mulaqat_transport') {
    return new Date(startedAt.getTime() + MULAQAT_MINUTES * 60_000);
  }

  // Detect airport from pickup (for pickups) or dropoff (for dropoffs)
  const airportStr =
    task.task_type === 'airport_pickup'
      ? task.pickup_location ?? ''
      : task.dropoff_location ?? '';

  const destinationStr =
    task.task_type === 'airport_pickup'
      ? task.dropoff_location ?? ''
      : task.pickup_location ?? '';

  const airportKey = Object.keys(TRAVEL_TIMES).find(a =>
    airportStr.toLowerCase().includes(a.toLowerCase()),
  );

  let minutes = DEFAULT_MINUTES;
  if (airportKey) {
    const venueKey = Object.keys(TRAVEL_TIMES[airportKey]).find(v =>
      destinationStr.toLowerCase().includes(v.toLowerCase()),
    );
    minutes = venueKey ? TRAVEL_TIMES[airportKey][venueKey] : DEFAULT_MINUTES;
  }

  return new Date(startedAt.getTime() + minutes * 60_000);
}

/** Formats an ETA date as "ETA 14:45 (~20 min)" or "Overdue by X min" */
export function formatETA(eta: Date): string {
  const now        = new Date();
  const diffMs     = eta.getTime() - now.getTime();
  const diffMin    = Math.round(diffMs / 60_000);
  const timeStr    = eta.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  if (diffMin < 0) {
    return `Overdue by ${Math.abs(diffMin)} min`;
  }
  return `ETA ${timeStr} (~${diffMin} min)`;
}

/** Returns true if ETA is in the past */
export function isETAOverdue(eta: Date): boolean {
  return eta.getTime() < Date.now();
}

// ── Airport terminal map links ─────────────────────────────────────────────────

const AIRPORT_LINKS: [string, string][] = [
  ['Heathrow Terminal 2', 'https://maps.google.com/?q=Heathrow+Terminal+2+Arrivals'],
  ['Heathrow Terminal 3', 'https://maps.google.com/?q=Heathrow+Terminal+3+Arrivals'],
  ['Heathrow Terminal 4', 'https://maps.google.com/?q=Heathrow+Terminal+4+Arrivals'],
  ['Heathrow Terminal 5', 'https://maps.google.com/?q=Heathrow+Terminal+5+Arrivals'],
  ['Heathrow T2',         'https://maps.google.com/?q=Heathrow+Terminal+2+Arrivals'],
  ['Heathrow T3',         'https://maps.google.com/?q=Heathrow+Terminal+3+Arrivals'],
  ['Heathrow T4',         'https://maps.google.com/?q=Heathrow+Terminal+4+Arrivals'],
  ['Heathrow T5',         'https://maps.google.com/?q=Heathrow+Terminal+5+Arrivals'],
  ['Heathrow',            'https://maps.google.com/?q=Heathrow+Airport+Arrivals'],
  ['Gatwick North',       'https://maps.google.com/?q=Gatwick+North+Terminal+Arrivals'],
  ['Gatwick South',       'https://maps.google.com/?q=Gatwick+South+Terminal+Arrivals'],
  ['Gatwick',             'https://maps.google.com/?q=London+Gatwick+Airport+Arrivals'],
  ['Luton',               'https://maps.google.com/?q=London+Luton+Airport+Arrivals'],
  ['Stansted',            'https://maps.google.com/?q=London+Stansted+Airport+Arrivals'],
  ['London City',         'https://maps.google.com/?q=London+City+Airport+Arrivals'],
  ['City Airport',        'https://maps.google.com/?q=London+City+Airport+Arrivals'],
];

/** Returns a Google Maps link for an airport/terminal combination. */
export function getMapLink(airport?: string | null, terminal?: string | null): string {
  const combined = [airport, terminal].filter(Boolean).join(' ');
  if (!combined) return '#';

  for (const [name, url] of AIRPORT_LINKS) {
    if (combined.toLowerCase().includes(name.toLowerCase())) return url;
  }

  // Fallback: Google Maps search
  return `https://maps.google.com/?q=${encodeURIComponent(combined + ' Arrivals')}`;
}

/** Returns true if the string looks like it contains an airport name. */
export function looksLikeAirport(location?: string | null): boolean {
  if (!location) return false;
  const lower = location.toLowerCase();
  return ['heathrow', 'gatwick', 'luton', 'stansted', 'city airport', 'london city'].some(k =>
    lower.includes(k),
  );
}

// ── Driver-guest matching preferences ─────────────────────────────────────────

export interface DriverPreferences {
  vipDriver?: string;           // driver id
  languageDrivers: Record<string, string>; // language → driver id
}

export const SUPPORTED_LANGUAGES = [
  'German', 'French', 'Arabic', 'Urdu', 'Spanish',
  'Turkish', 'Bengali', 'Punjabi',
];

export const COUNTRY_LANGUAGE: Record<string, string> = {
  Germany:      'German',
  Austria:      'German',
  Switzerland:  'German',
  France:       'French',
  Belgium:      'French',
  Egypt:        'Arabic',
  'Saudi Arabia': 'Arabic',
  Jordan:       'Arabic',
  UAE:          'Arabic',
  Morocco:      'Arabic',
  Pakistan:     'Urdu',
  Bangladesh:   'Bengali',
  India:        'Urdu',
  Spain:        'Spanish',
  'Latin America': 'Spanish',
  Turkey:       'Turkish',
};

const VIP_DESIGNATIONS = ['National Amir', 'Nazir', 'Khalifa', 'National Amir Sahib', 'Nazir Sahib'];

export function isVIPGuest(designation?: string | string[] | null): boolean {
  if (!designation) return false;
  const desigs = Array.isArray(designation) ? designation : [designation];
  return desigs.some(d =>
    VIP_DESIGNATIONS.some(v => d.toLowerCase().includes(v.toLowerCase())),
  );
}

export function loadDriverPreferences(location: string): DriverPreferences {
  try {
    const raw = localStorage.getItem(`driver_preferences_${location}`);
    if (raw) return { languageDrivers: {}, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { languageDrivers: {} };
}

export function saveDriverPreferences(location: string, prefs: DriverPreferences): void {
  localStorage.setItem(`driver_preferences_${location}`, JSON.stringify(prefs));
}

interface DriverForMatching {
  id: string;
  name: string;
  is_available?: boolean;
  vehicle_capacity?: number;
}

interface GuestForMatching {
  country?: string;
  designation?: string | string[];
  guestType?: string;
  familyGroupId?: string | null;
}

export function getPreferredDriver(
  guest: GuestForMatching,
  drivers: DriverForMatching[],
  prefs: DriverPreferences,
): { driver: DriverForMatching; reason: string } | null {
  const available = drivers.filter(d => d.is_available);
  if (available.length === 0) return null;

  // Rule 1: VIP guests
  if (isVIPGuest(guest.designation) && prefs.vipDriver) {
    const vip = available.find(d => d.id === prefs.vipDriver);
    if (vip) return { driver: vip, reason: 'VIP preference' };
  }

  // Rule 2: Language matching
  if (guest.country && prefs.languageDrivers) {
    const lang = COUNTRY_LANGUAGE[guest.country];
    if (lang && prefs.languageDrivers[lang]) {
      const langDriver = available.find(d => d.id === prefs.languageDrivers[lang]);
      if (langDriver) return { driver: langDriver, reason: `${lang} speaker` };
    }
  }

  // Rule 3: Vehicle size for families
  const isFamily = guest.guestType === 'family' || guest.guestType === 'Family' || !!guest.familyGroupId;
  if (isFamily) {
    const largeVehicle = available.find(d => (d.vehicle_capacity ?? 0) >= 6);
    if (largeVehicle) return { driver: largeVehicle, reason: 'Van for family group' };
  }

  // Default: first available
  return available[0] ? { driver: available[0], reason: 'available' } : null;
}
