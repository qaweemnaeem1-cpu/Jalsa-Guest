import type { User } from '@/types';

// ── Visibility field keys ──────────────────────────────────────────────────────

export interface FieldVisibility {
  // Personal
  name: boolean;
  gender: boolean;
  dob: boolean;
  age: boolean;
  country: boolean;
  photo: boolean;
  religion: boolean;
  designation: boolean;
  tierBadge: boolean;      // full tier badge (VIP / T2 …)
  specialStar: boolean;    // ⭐ star for tier 1-2
  introduction: boolean;
  contactNumber: boolean;
  email: boolean;
  passport: boolean;
  passportCountry: boolean;
  visaStatus: boolean;
  // Travel
  flightDetails: boolean;
  // Medical / special
  wheelchair: boolean;
  specialNeeds: boolean;
  dietary: boolean;
  // Administrative
  expenses: boolean;
  tabshirReference: boolean;
  familyMembers: boolean;
  // Placement
  department: boolean;
  location: boolean;
  roomBed: boolean;
  transportTeam: boolean;
  driverAssigned: boolean;
  checkInOut: boolean;
  status: boolean;
}

// ── Per-role definitions ──────────────────────────────────────────────────────

const FIELD_VISIBILITY: Record<string, FieldVisibility> = {
  'super-admin': {
    name: true, gender: true, dob: true, age: true, country: true, photo: true,
    religion: true, designation: true, tierBadge: true, specialStar: false,
    introduction: true, contactNumber: true, email: true,
    passport: true, passportCountry: true, visaStatus: true,
    flightDetails: true, wheelchair: true, specialNeeds: true, dietary: true,
    expenses: true, tabshirReference: true, familyMembers: true,
    department: true, location: true, roomBed: true,
    transportTeam: true, driverAssigned: true, checkInOut: true, status: true,
  },
  'desk-in-charge': {
    name: true, gender: true, dob: true, age: true, country: true, photo: true,
    religion: true, designation: true, tierBadge: true, specialStar: false,
    introduction: true, contactNumber: true, email: true,
    passport: true, passportCountry: true, visaStatus: true,
    flightDetails: true, wheelchair: true, specialNeeds: true, dietary: true,
    expenses: true, tabshirReference: true, familyMembers: true,
    department: true, location: true, roomBed: true,
    transportTeam: true, driverAssigned: true, checkInOut: true, status: true,
  },
  'coordinator': {
    name: true, gender: true, dob: true, age: true, country: true, photo: true,
    religion: true, designation: true, tierBadge: false, specialStar: false,
    introduction: true, contactNumber: true, email: true,
    passport: true, passportCountry: true, visaStatus: true,
    flightDetails: true, wheelchair: true, specialNeeds: true, dietary: true,
    expenses: true, tabshirReference: true, familyMembers: true,
    department: false, location: false, roomBed: false,
    transportTeam: false, driverAssigned: false, checkInOut: false, status: true,
  },
  'department-head': {
    name: true, gender: true, dob: true, age: true, country: true, photo: true,
    religion: true, designation: true, tierBadge: false, specialStar: true,
    introduction: true, contactNumber: true, email: true,
    passport: true, passportCountry: true, visaStatus: true,
    flightDetails: true, wheelchair: true, specialNeeds: true, dietary: true,
    expenses: false, tabshirReference: false, familyMembers: true,
    department: true, location: true, roomBed: true,
    transportTeam: true, driverAssigned: true, checkInOut: false, status: true,
  },
  'transport-head': {
    name: true, gender: true, dob: false, age: false, country: true, photo: true,
    religion: true, designation: true, tierBadge: false, specialStar: true,
    introduction: true, contactNumber: true, email: false,
    passport: false, passportCountry: false, visaStatus: false,
    flightDetails: true, wheelchair: true, specialNeeds: true, dietary: false,
    expenses: false, tabshirReference: false, familyMembers: true,
    department: false, location: true, roomBed: false,
    transportTeam: true, driverAssigned: true, checkInOut: false, status: true,
  },
  'driver': {
    name: true, gender: false, dob: false, age: false, country: true, photo: true,
    religion: false, designation: true, tierBadge: false, specialStar: true,
    introduction: false, contactNumber: true, email: false,
    passport: false, passportCountry: false, visaStatus: false,
    flightDetails: true, wheelchair: true, specialNeeds: false, dietary: false,
    expenses: false, tabshirReference: false, familyMembers: false,
    department: false, location: true, roomBed: false,
    transportTeam: false, driverAssigned: false, checkInOut: false, status: false,
  },
  'location-manager': {
    name: true, gender: true, dob: false, age: true, country: true, photo: true,
    religion: true, designation: true, tierBadge: false, specialStar: true,
    introduction: true, contactNumber: true, email: false,
    passport: false, passportCountry: false, visaStatus: false,
    flightDetails: true, wheelchair: true, specialNeeds: true, dietary: true,
    expenses: false, tabshirReference: false, familyMembers: true,
    department: false, location: true, roomBed: true,
    transportTeam: true, driverAssigned: true, checkInOut: true, status: true,
  },
};

// Fallback for 'transport', 'accommodation', 'viewer', unknown roles
const COORDINATOR_VISIBILITY = FIELD_VISIBILITY['coordinator'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the full visibility map for a given user.
 * Head drivers (role='driver', isHeadDriver=true) get the transport-head config.
 */
export function getVisibility(user: User | null | undefined): FieldVisibility {
  if (!user) return COORDINATOR_VISIBILITY;
  if (user.role === 'driver' && user.isHeadDriver) {
    return FIELD_VISIBILITY['transport-head'];
  }
  return FIELD_VISIBILITY[user.role] ?? COORDINATOR_VISIBILITY;
}

/**
 * Convenience — check a single field for the given role string.
 * Transport head is indicated by role='driver' + isHeadDriver=true.
 */
export function canSeeField(role: string, field: keyof FieldVisibility): boolean {
  return FIELD_VISIBILITY[role]?.[field] ?? false;
}

export { FIELD_VISIBILITY };
