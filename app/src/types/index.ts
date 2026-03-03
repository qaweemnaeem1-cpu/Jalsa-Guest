export type UserRole = 'super-admin' | 'desk-in-charge' | 'coordinator' | 'transport' | 'accommodation' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  country?: string;
  countryCode?: string;
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
  | 'draft'            // Coordinator saved but not yet submitted
  | 'pending-review'   // Submitted, waiting for Desk Incharge approval
  | 'needs-correction' // Desk Incharge flagged it, sent back to Coordinator
  | 'approved'         // Desk Incharge approved
  | 'rejected'         // Desk Incharge rejected permanently
  | 'accommodated'
  | 'checked-in';

export type VisaStatus = 'not-required' | 'pending' | 'approved' | 'rejected' | 'expired';
export type GuestType = 'individual' | 'family';

export interface VisaDetails {
  visaNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  visaType?: 'tourist' | 'business' | 'transit' | 'other';
  notes?: string;
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
  department?: string;
  roomAssignment?: string;
  remarks?: GuestRemark[];
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
