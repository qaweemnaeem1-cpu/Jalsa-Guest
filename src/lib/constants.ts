import type { Designation } from '@/types';

// Default designations - these can be managed by Admin
export const DEFAULT_DESIGNATIONS: string[] = [
  'Central Missionary',
  'National Amir',
  'National Sadr',
  'Local Missionary',
  'National Amla Member',
  'Jamaat Member',
  'Missionary Incharge',
  'National Sadr and Missionary Incharge',
  'National Amir and Missionary Incharge',
  'Government Official',
  'Member of Parliament',
  'Mayor',
  'Banker',
  'Member Family',
  'Doctor',
  'Waqf Doctor',
  'Waqf Teacher',
  'Chief Imam',
  'Journalist',
  'King',
  'IAAAE Member',
  'Police Official',
  'Jamaat Employee',
  'EXTERNAL GUEST',
  'Waqf Zindagi',
  'Other',
  'Naib Nazir',
  'Jamaat Official',
  'Additional Nazir',
  'Khuddam',
  'Naib Wakil',
  'Nazim Waqf-e-Jadid',
  'Principal Jamia Ahmadiyya',
  'Sadr Majlis Khuddamul Ahmadiyya (MKA)',
  'Sadr Majlis Ansarullah',
  'Sadr Majlis Lajna Imaillah',
  'Nazir',
  'Wakil',
  'Sadr Anjuman Ahmadiyya Rabwah or Qadian',
];

// Initial designations data for storage
export const INITIAL_DESIGNATIONS: Designation[] = DEFAULT_DESIGNATIONS.map((name, index) => ({
  id: `desig-${index + 1}`,
  name,
  isActive: true,
  createdAt: new Date().toISOString(),
}));

export const COUNTRIES = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'DE', name: 'Germany' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'TZ', name: 'Tanzania' },
];

export const AIRPORTS = [
  { code: 'LHR', name: 'Heathrow (LHR)', terminals: ['T2', 'T3', 'T4', 'T5'] },
  { code: 'LGW', name: 'Gatwick (LGW)', terminals: ['N', 'S'] },
  { code: 'STN', name: 'Stansted (STN)', terminals: ['Main'] },
  { code: 'LTN', name: 'Luton (LTN)', terminals: ['Main'] },
  { code: 'MAN', name: 'Manchester (MAN)', terminals: ['T1', 'T2', 'T3'] },
];

export const VISA_STATUS_OPTIONS = [
  { value: 'not-required', label: 'Not Required' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
] as const;

export const VISA_TYPE_OPTIONS = [
  { value: 'tourist', label: 'Tourist Visa' },
  { value: 'business', label: 'Business Visa' },
  { value: 'transit', label: 'Transit Visa' },
  { value: 'other', label: 'Other' },
] as const;

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

export const GUEST_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'family', label: 'Family' },
] as const;

export const RELATIONSHIP_OPTIONS = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'brother', label: 'Brother' },
  { value: 'sister', label: 'Sister' },
  { value: 'grandfather', label: 'Grandfather' },
  { value: 'grandmother', label: 'Grandmother' },
  { value: 'grandson', label: 'Grandson' },
  { value: 'granddaughter', label: 'Granddaughter' },
  { value: 'uncle', label: 'Uncle' },
  { value: 'aunt', label: 'Aunt' },
  { value: 'nephew', label: 'Nephew' },
  { value: 'niece', label: 'Niece' },
  { value: 'cousin', label: 'Cousin' },
  { value: 'other', label: 'Other' },
] as const;

export const GUEST_STATUS_LABELS: Record<string, string> = {
  'draft': 'Draft',
  'pending-review': 'Awaiting Review',
  'needs-correction': 'Needs Correction',
  'approved': 'Approved',
  'rejected': 'Rejected',
  'accommodated': 'Accommodated',
  'checked-in': 'Checked In',
};

export const ROLE_LABELS: Record<string, string> = {
  'super-admin': 'Super Admin',
  'desk-in-charge': 'Desk In-Charge',
  'coordinator': 'Coordinator',
  'transport': 'Transport',
  'accommodation': 'Accommodation',
  'viewer': 'Viewer',
};

export const VISA_STATUS_LABELS: Record<string, string> = {
  'not-required': 'Not Required',
  'pending': 'Pending',
  'approved': 'Approved',
  'rejected': 'Rejected',
  'expired': 'Expired',
};
