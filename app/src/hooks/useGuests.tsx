import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Guest, GuestStatus, GuestRemark } from '@/types';
import { useAuth } from './useAuth';

interface GuestsContextType {
  guests: Guest[];
  addGuest: (guestData: Omit<Guest, 'id' | 'referenceNumber' | 'submittedAt' | 'status'>) => Guest;
  updateGuest: (id: string, updates: Partial<Guest>) => void;
  addRemark: (guestId: string, remark: Omit<GuestRemark, 'id' | 'createdAt'>) => void;
  getGuestById: (id: string) => Guest | undefined;
  getGuestsByCountry: (countryCode: string) => Guest[];
  getGuestsByStatus: (status: GuestStatus) => Guest[];
  getMySubmissions: () => Guest[];
  getMyWaitingGuests: () => Guest[];
  getMySubmittedGuests: () => Guest[];
  getNeedsCorrectionCount: () => number;
  generateReferenceNumber: () => string;
}

const GuestsContext = createContext<GuestsContextType | undefined>(undefined);

// Generate sample guests for demo - now with draft and needs-correction examples
const generateSampleGuests = (): Guest[] => {
  return [
    {
      id: '1',
      referenceNumber: 'MEH-2024-000001',
      fullName: 'Klaus Mueller',
      country: 'Germany',
      countryCode: 'DE',
      gender: 'male',
      age: 45,
      dateOfBirth: '1979-03-15',
      passportNumber: 'C01X00T00',
      contactNumber: '+49 170 1234567',
      email: 'klaus.mueller@example.de',
      visaStatus: 'not-required',
      guestType: 'individual',
      familyMembers: [],
      designation: 'Jamaat Member',
      arrivalFlightNumber: 'LH900',
      arrivalAirport: 'LHR',
      arrivalTerminal: 'T2',
      arrivalTime: '2024-07-15T10:30',
      departureFlightNumber: 'LH901',
      departureAirport: 'LHR',
      departureTerminal: 'T2',
      departureTime: '2024-07-20T14:00',
      wheelchairRequired: false,
      status: 'accommodated',
      submittedBy: '3',
      submittedAt: '2024-01-10',
      department: 'Guest Services',
      roomAssignment: 'A-101',
    },
    {
      id: '2',
      referenceNumber: 'MEH-2024-000002',
      fullName: 'Hans Schmidt',
      country: 'Germany',
      countryCode: 'DE',
      gender: 'male',
      age: 38,
      dateOfBirth: '1986-07-22',
      passportNumber: 'C01X00T01',
      contactNumber: '+49 171 2345678',
      email: 'hans.schmidt@example.de',
      visaStatus: 'not-required',
      guestType: 'family',
      familyMembers: [
        { id: 'f1', name: 'Maria Schmidt', age: 35, relationship: 'spouse', gender: 'female' },
        { id: 'f2', name: 'Max Schmidt', age: 10, relationship: 'son', gender: 'male' },
      ],
      designation: 'Local Missionary',
      arrivalFlightNumber: 'LH902',
      arrivalAirport: 'LGW',
      arrivalTerminal: 'N',
      arrivalTime: '2024-07-15T12:00',
      departureFlightNumber: 'LH903',
      departureAirport: 'LGW',
      departureTerminal: 'N',
      departureTime: '2024-07-20T16:00',
      wheelchairRequired: false,
      status: 'accommodated',
      submittedBy: '3',
      submittedAt: '2024-01-11',
      department: 'Guest Services',
      roomAssignment: 'A-102',
    },
    {
      id: '3',
      referenceNumber: 'MEH-2024-000003',
      fullName: 'Peter Weber',
      country: 'Germany',
      countryCode: 'DE',
      gender: 'male',
      age: 52,
      dateOfBirth: '1972-11-08',
      passportNumber: 'C01X00T02',
      contactNumber: '+49 172 3456789',
      email: 'peter.weber@example.de',
      visaStatus: 'not-required',
      guestType: 'individual',
      familyMembers: [],
      designation: 'National Amir',
      arrivalFlightNumber: 'LH904',
      arrivalAirport: 'LHR',
      arrivalTerminal: 'T5',
      arrivalTime: '2024-07-15T08:00',
      departureFlightNumber: 'LH905',
      departureAirport: 'LHR',
      departureTerminal: 'T5',
      departureTime: '2024-07-20T12:00',
      wheelchairRequired: true,
      specialNeeds: 'Requires wheelchair assistance',
      status: 'accommodated',
      submittedBy: '3',
      submittedAt: '2024-01-12',
      department: 'VIP Services',
      roomAssignment: 'VIP-201',
    },
    // Draft guest for coordinator
    {
      id: '4',
      referenceNumber: 'MEH-2024-000004',
      fullName: 'Anna Schmidt',
      country: 'Germany',
      countryCode: 'DE',
      gender: 'female',
      age: 32,
      dateOfBirth: '1992-05-20',
      passportNumber: 'C01X00T03',
      contactNumber: '+49 173 4567890',
      email: 'anna.schmidt@example.de',
      visaStatus: 'not-required',
      guestType: 'individual',
      familyMembers: [],
      designation: 'Jamaat Member',
      arrivalFlightNumber: 'LH906',
      arrivalAirport: 'LHR',
      arrivalTerminal: 'T2',
      arrivalTime: '2024-07-16T09:00',
      departureFlightNumber: 'LH907',
      departureAirport: 'LHR',
      departureTerminal: 'T2',
      departureTime: '2024-07-21T15:00',
      wheelchairRequired: false,
      status: 'draft',
      submittedBy: '3',
      submittedAt: '2024-02-01',
    },
    // Needs correction guest for coordinator
    {
      id: '5',
      referenceNumber: 'MEH-2024-000005',
      fullName: 'Thomas Muller',
      country: 'Germany',
      countryCode: 'DE',
      gender: 'male',
      age: 41,
      dateOfBirth: '1983-08-12',
      passportNumber: 'C01X00T04',
      contactNumber: '+49 174 5678901',
      email: 'thomas.muller@example.de',
      visaStatus: 'pending',
      guestType: 'individual',
      familyMembers: [],
      designation: 'National Amla Member',
      arrivalFlightNumber: 'LH908',
      arrivalAirport: 'LHR',
      arrivalTerminal: 'T3',
      arrivalTime: '2024-07-17T11:00',
      departureFlightNumber: 'LH909',
      departureAirport: 'LHR',
      departureTerminal: 'T3',
      departureTime: '2024-07-22T10:00',
      wheelchairRequired: false,
      status: 'needs-correction',
      submittedBy: '3',
      submittedAt: '2024-02-05',
      remarks: [
        {
          id: 'r1',
          authorId: '2',
          authorName: 'Fatima Ali',
          authorRole: 'desk-in-charge',
          message: 'Please provide a clearer copy of the passport. The current image is blurry and the passport number is not readable.',
          createdAt: '2024-02-06T10:30:00',
        },
      ],
    },
    // Pending review guest
    {
      id: '6',
      referenceNumber: 'MEH-2024-000006',
      fullName: 'Lisa Wagner',
      country: 'Germany',
      countryCode: 'DE',
      gender: 'female',
      age: 28,
      dateOfBirth: '1996-03-08',
      passportNumber: 'C01X00T05',
      contactNumber: '+49 175 6789012',
      email: 'lisa.wagner@example.de',
      visaStatus: 'not-required',
      guestType: 'family',
      familyMembers: [
        { id: 'f3', name: 'Markus Wagner', age: 30, relationship: 'spouse', gender: 'male' },
      ],
      designation: 'Jamaat Member',
      arrivalFlightNumber: 'LH910',
      arrivalAirport: 'LGW',
      arrivalTerminal: 'N',
      arrivalTime: '2024-07-18T14:00',
      departureFlightNumber: 'LH911',
      departureAirport: 'LGW',
      departureTerminal: 'N',
      departureTime: '2024-07-23T16:00',
      wheelchairRequired: false,
      status: 'pending-review',
      submittedBy: '3',
      submittedAt: '2024-02-10',
    },
  ];
};

let nextId = 7;
let nextReferenceNumber = 7;

export function GuestsProvider({ children }: { children: ReactNode }) {
  const [guests, setGuests] = useState<Guest[]>(generateSampleGuests());
  const { user } = useAuth();

  const generateReferenceNumber = useCallback(() => {
    const num = nextReferenceNumber.toString().padStart(6, '0');
    nextReferenceNumber++;
    return `MEH-2024-${num}`;
  }, []);

  const addGuest = useCallback((guestData: Omit<Guest, 'id' | 'referenceNumber' | 'submittedAt' | 'status'>) => {
    const newGuest: Guest = {
      ...guestData,
      id: (nextId++).toString(),
      referenceNumber: generateReferenceNumber(),
      submittedAt: new Date().toISOString().split('T')[0],
      status: 'draft',
    };
    setGuests(prev => [newGuest, ...prev]);
    return newGuest;
  }, [generateReferenceNumber]);

  const updateGuest = useCallback((id: string, updates: Partial<Guest>) => {
    setGuests(prev =>
      prev.map(guest =>
        guest.id === id ? { ...guest, ...updates } : guest
      )
    );
  }, []);

  const addRemark = useCallback((guestId: string, remark: Omit<GuestRemark, 'id' | 'createdAt'>) => {
    const newRemark: GuestRemark = {
      ...remark,
      id: `r${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setGuests(prev =>
      prev.map(guest =>
        guest.id === guestId
          ? { ...guest, remarks: [...(guest.remarks || []), newRemark] }
          : guest
      )
    );
  }, []);

  const getGuestById = useCallback((id: string) => {
    return guests.find(guest => guest.id === id);
  }, [guests]);

  const getGuestsByCountry = useCallback((countryCode: string) => {
    return guests.filter(guest => guest.countryCode === countryCode);
  }, [guests]);

  const getGuestsByStatus = useCallback((status: GuestStatus) => {
    return guests.filter(guest => guest.status === status);
  }, [guests]);

  const getMySubmissions = useCallback(() => {
    if (!user) return [];
    return guests.filter(guest => guest.submittedBy === user.id);
  }, [guests, user]);

  // For Coordinator: Waiting tab (draft + needs-correction)
  const getMyWaitingGuests = useCallback(() => {
    if (!user) return [];
    return guests.filter(guest => 
      guest.submittedBy === user.id && 
      (guest.status === 'draft' || guest.status === 'needs-correction')
    );
  }, [guests, user]);

  // For Coordinator: Submitted tab (pending-review + approved + rejected)
  const getMySubmittedGuests = useCallback(() => {
    if (!user) return [];
    return guests.filter(guest => 
      guest.submittedBy === user.id && 
      (guest.status === 'pending-review' || guest.status === 'approved' || guest.status === 'rejected')
    );
  }, [guests, user]);

  // Count of needs-correction guests for notification badge
  const getNeedsCorrectionCount = useCallback(() => {
    if (!user) return 0;
    return guests.filter(guest => 
      guest.submittedBy === user.id && guest.status === 'needs-correction'
    ).length;
  }, [guests, user]);

  return (
    <GuestsContext.Provider
      value={{
        guests,
        addGuest,
        updateGuest,
        addRemark,
        getGuestById,
        getGuestsByCountry,
        getGuestsByStatus,
        getMySubmissions,
        getMyWaitingGuests,
        getMySubmittedGuests,
        getNeedsCorrectionCount,
        generateReferenceNumber,
      }}
    >
      {children}
    </GuestsContext.Provider>
  );
}

export function useGuests() {
  const context = useContext(GuestsContext);
  if (context === undefined) {
    throw new Error('useGuests must be used within a GuestsProvider');
  }
  return context;
}
