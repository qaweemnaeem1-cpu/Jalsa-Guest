export type UserRole = 'super-admin' | 'desk-in-charge' | 'coordinator' | 'transport' | 'accommodation' | 'viewer' | 'department-head';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  country?: string;
  countryCode?: string;
  assignedCountries?: string[];
  department?: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  age: number;
  relationship: string;
  gender: 'male' | 'female';
}

export interface GuestRemark {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  message: string;
  createdAt: string;
}

export type GuestStatus =
  | 'Awaiting Review'   // Submitted, waiting for Desk Incharge approval
  | 'Needs Correction'  // Desk Incharge flagged it, sent back to Coordinator
  | 'Approved'          // Desk Incharge approved
  | 'Rejected'          // Desk Incharge rejected permanently
  | 'Accommodated';     // Guest has been assigned accommodation

export type VisaStatus = 'not-required' | 'pending' | 'approved' | 'rejected' | 'expired';
export type GuestType = 'individual' | 'family';

export interface VisaDetails {
  visaNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  visaType?: 'tourist' | 'business' | 'transit' | 'other';
  notes?: string;
}

export interface GuestStatusEvent {
  id: string;
  status: GuestStatus;
  changedBy: string;
  changedByRole: UserRole;
  changedAt: string;
  remark?: string;
}

export interface Guest {
  id: string;
  referenceNumber: string;
  fullName: string;
  country: string;
  countryCode: string;
  gender: 'male' | 'female';
  age: number;
  dateOfBirth?: string;
  passportNumber: string;
  contactNumber: string;
  email?: string;
  visaStatus: VisaStatus;
  visaDetails?: VisaDetails;
  guestType: GuestType;
  familyMembers: FamilyMember[];
  designation: string;
  arrivalFlightNumber?: string;
  arrivalAirport?: string;
  arrivalTerminal?: string;
  arrivalTime?: string;
  departureFlightNumber?: string;
  departureAirport?: string;
  departureTerminal?: string;
  departureTime?: string;
  specialNeeds?: string;
  dietaryRequirements?: string;
  wheelchairRequired: boolean;
  status: GuestStatus;
  submittedBy: string;
  submittedAt: string;
  resubmittedAt?: string;
  resubmitCount: number;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  appealStatus?: 'none' | 'pending' | 'overturned' | 'denied';
  appealReason?: string;
  appealedAt?: string;
  department?: string;
  roomAssignment?: string;
  assignedDepartment?: string;
  assignedDepartmentAt?: string;
  assignedDepartmentBy?: string;
  placedLocation?: string;
  placedAt?: string;
  placedBy?: string;
  remarks?: GuestRemark[];
  statusHistory?: GuestStatusEvent[];
}

export function canTransitionStatus(from: GuestStatus, to: GuestStatus): boolean {
  const transitions: Record<GuestStatus, GuestStatus[]> = {
    'Awaiting Review': ['Approved', 'Needs Correction', 'Rejected'],
    'Needs Correction': ['Awaiting Review'],
    'Rejected': ['Awaiting Review'],
    'Approved': ['Accommodated'],
    'Accommodated': [],
  };
  return transitions[from]?.includes(to) ?? false;
}

export interface Designation {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface Country {
  code: string;
  name: string;
  coordinator: string;
  totalRegistrations: number;
  approved: number;
  pending: number;
}
