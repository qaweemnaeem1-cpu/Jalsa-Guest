import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useDesignations } from '@/hooks/useDesignations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  ArrowLeft,
  ChevronDown,
  LogOut,
  Plus,
  Trash2,
  Plane,
  User,
  Calendar,
  FileText,
  Briefcase,
  UsersRound,
  CreditCard,
  Clock,
  ScrollText,
  ClipboardList,
  CheckSquare,
  XCircle,
  MessageSquare,
} from 'lucide-react';
import { 
  COUNTRIES, 
  AIRPORTS, 
  VISA_STATUS_OPTIONS, 
  VISA_TYPE_OPTIONS,
  GENDER_OPTIONS, 
  GUEST_TYPE_OPTIONS,
  RELATIONSHIP_OPTIONS,
  ROLE_LABELS,
  VISA_STATUS_LABELS,
} from '@/lib/constants';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { getRoleDisplayLabel, ProfileDialog } from '@/components/ProfileDialog';
import type { UserRole, FamilyMember, VisaDetails } from '@/types';
import { SUPER_ADMIN_NAV, DESK_NAV, COORD_NAV } from '@/lib/navItems';

const NAV_ITEMS: Record<UserRole, { icon: any; label: string; href: string }[]> = {
  'super-admin': SUPER_ADMIN_NAV,
  'desk-in-charge': DESK_NAV,
  'coordinator': COORD_NAV,
  'transport': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'accommodation': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
  'viewer': [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Guests', href: '/guests' },
  ],
};

interface FamilyMemberFormProps {
  member: FamilyMember;
  index: number;
  onUpdate: (index: number, updates: Partial<FamilyMember>) => void;
  onRemove: (index: number) => void;
}

function FamilyMemberForm({ member, index, onUpdate, onRemove }: FamilyMemberFormProps) {
  return (
    <div className="bg-[#F5F0E8] rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-[#1A1A1A]">Family Member {index + 1}</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[#1A1A1A]">Full Name *</Label>
          <Input
            value={member.name}
            onChange={(e) => onUpdate(index, { name: e.target.value })}
            placeholder="Enter full name"
            className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45]"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-[#1A1A1A]">Age *</Label>
          <Input
            type="number"
            value={member.age || ''}
            onChange={(e) => onUpdate(index, { age: parseInt(e.target.value) || 0 })}
            placeholder="Enter age"
            className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45]"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-[#1A1A1A]">Relationship to Applicant *</Label>
          <select
            value={member.relationship}
            onChange={(e) => onUpdate(index, { relationship: e.target.value })}
            className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-[#2D5A45]"
          >
            <option value="">Select relationship</option>
            {RELATIONSHIP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        
        <div className="space-y-2">
          <Label className="text-[#1A1A1A]">Gender *</Label>
          <select
            value={member.gender}
            onChange={(e) => onUpdate(index, { gender: e.target.value as 'male' | 'female' })}
            className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-[#2D5A45]"
          >
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function NewGuestPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { addGuest } = useGuests();
  const { activeDesignations } = useDesignations();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    fullName: '',
    country: user?.countryCode || '',
    gender: 'male' as 'male' | 'female',
    age: '',
    dateOfBirth: '',
    guestType: 'individual' as 'individual' | 'family',
    familyMembers: [] as FamilyMember[],
    designation: '',
    passportNumber: '',
    contactNumber: '',
    email: '',
    visaStatus: 'not-required' as 'not-required' | 'pending' | 'approved' | 'rejected' | 'expired',
    visaDetails: {
      visaNumber: '',
      issueDate: '',
      expiryDate: '',
      visaType: 'tourist' as 'tourist' | 'business' | 'transit' | 'other',
      notes: '',
    } as VisaDetails,
    arrivalFlightNumber: '',
    arrivalAirport: '',
    arrivalTerminal: '',
    arrivalTime: '',
    departureFlightNumber: '',
    departureAirport: '',
    departureTerminal: '',
    departureTime: '',
    specialNeeds: '',
    dietaryRequirements: '',
    wheelchairRequired: false,
  });

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleVisaDetailChange = (field: keyof VisaDetails, value: any) => {
    setFormData(prev => ({
      ...prev,
      visaDetails: {
        ...prev.visaDetails,
        [field]: value,
      },
    }));
  };

  const handleAddFamilyMember = () => {
    const newMember: FamilyMember = {
      id: Date.now().toString(),
      name: '',
      age: 0,
      relationship: '',
      gender: 'male',
    };
    setFormData(prev => ({
      ...prev,
      familyMembers: [...prev.familyMembers, newMember],
    }));
  };

  const handleUpdateFamilyMember = (index: number, updates: Partial<FamilyMember>) => {
    setFormData(prev => ({
      ...prev,
      familyMembers: prev.familyMembers.map((member, i) =>
        i === index ? { ...member, ...updates } : member
      ),
    }));
  };

  const handleRemoveFamilyMember = (index: number) => {
    setFormData(prev => ({
      ...prev,
      familyMembers: prev.familyMembers.filter((_, i) => i !== index),
    }));
  };

  const getTerminals = (airportCode: string) => {
    const airport = AIRPORTS.find(a => a.code === airportCode);
    return airport?.terminals || [];
  };

  const getVisaStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'expired':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!formData.country) {
      toast.error('Country is required');
      return;
    }
    if (!formData.age) {
      toast.error('Age is required');
      return;
    }
    if (!formData.passportNumber.trim()) {
      toast.error('Passport number is required');
      return;
    }
    if (!formData.contactNumber.trim()) {
      toast.error('Contact number is required');
      return;
    }
    if (!formData.designation) {
      toast.error('Designation is required');
      return;
    }
    if (formData.guestType === 'family') {
      if (formData.familyMembers.length === 0) {
        toast.error('Please add at least one family member');
        return;
      }
      for (const member of formData.familyMembers) {
        if (!member.name.trim() || !member.age || !member.relationship) {
          toast.error('Please fill in all family member details');
          return;
        }
      }
    }

    setIsSubmitting(true);
    
    try {
      const country = COUNTRIES.find(c => c.code === formData.country);
      
      addGuest({
        fullName: formData.fullName,
        country: country?.name || formData.country,
        countryCode: formData.country,
        gender: formData.gender,
        age: parseInt(formData.age),
        dateOfBirth: formData.dateOfBirth,
        passportNumber: formData.passportNumber,
        contactNumber: formData.contactNumber,
        email: formData.email,
        visaStatus: formData.visaStatus,
        visaDetails: formData.visaStatus !== 'not-required' ? formData.visaDetails : undefined,
        guestType: formData.guestType,
        familyMembers: formData.familyMembers,
        designation: formData.designation,
        arrivalFlightNumber: formData.arrivalFlightNumber,
        arrivalAirport: formData.arrivalAirport,
        arrivalTerminal: formData.arrivalTerminal,
        arrivalTime: formData.arrivalTime,
        departureFlightNumber: formData.departureFlightNumber,
        departureAirport: formData.departureAirport,
        departureTerminal: formData.departureTerminal,
        departureTime: formData.departureTime,
        specialNeeds: formData.specialNeeds,
        dietaryRequirements: formData.dietaryRequirements,
        wheelchairRequired: formData.wheelchairRequired,
        submittedBy: user.id,
      });

      toast.success('Guest registered — awaiting review');
      navigate(user.role === 'coordinator' ? '/coordinator/pending' : '/guests');
    } catch (error) {
      toast.error('Failed to register guest. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0 flex flex-col">
          <div className="p-4 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
              <div>
                <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
                <p className="text-xs text-[#4A4A4A]">{user.role === 'coordinator' ? 'Coordinator View' : 'Jalsa Salana UK'}</p>
              </div>
            </div>
          </div>

          <nav className="p-4 space-y-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {navItems.map((item, index) => (
              <button
                key={index}
                onClick={() => navigate(item.href)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
          <SidebarUserFooter />
        </aside>

        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => navigate(user.role === 'coordinator' ? '/coordinator/pending' : '/guests')}
                  className="border-[#D4CFC7]"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <h1 className="text-xl font-semibold text-[#1A1A1A]">Register New Guest</h1>
              </div>
              
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-3 hover:bg-[#F5F0E8] rounded-lg px-3 py-2 transition-colors"
                >
                  <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-medium">
                    {user.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                    <p className="text-xs text-[#4A4A4A]">{getRoleDisplayLabel(user)}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#4A4A4A]" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-[#E8E3DB] py-1 z-50">
                    <div className="px-4 py-2 border-b border-[#E8E3DB]">
                      <p className="text-sm font-medium text-[#1A1A1A]">{user.name}</p>
                      <p className="text-xs text-[#4A4A4A]">{user.email}</p>
                    </div>
                    <button
                      onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
                    >
                      <User className="w-4 h-4 text-[#4A4A4A]" />
                      Profile
                    </button>
                    <button
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="p-6 max-w-5xl mx-auto">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Information */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#F9F8F6]">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <User className="w-5 h-5 text-[#2D5A45]" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Full Name *</Label>
                      <Input
                        value={formData.fullName}
                        onChange={(e) => handleInputChange('fullName', e.target.value)}
                        placeholder="Enter full name"
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Country *</Label>
                      <select
                        value={formData.country}
                        onChange={(e) => handleInputChange('country', e.target.value)}
                        className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                      >
                        <option value="">Select country</option>
                        {COUNTRIES.map((country) => (
                          <option key={country.code} value={country.code}>{country.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Gender</Label>
                      <select
                        value={formData.gender}
                        onChange={(e) => handleInputChange('gender', e.target.value)}
                        className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                      >
                        {GENDER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Age *</Label>
                      <Input
                        type="number"
                        value={formData.age}
                        onChange={(e) => handleInputChange('age', e.target.value)}
                        placeholder="Enter age"
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-[#1A1A1A] font-medium">Date of Birth</Label>
                      <Input
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11 max-w-md"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Guest Type & Designation */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#F9F8F6]">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <UsersRound className="w-5 h-5 text-[#2D5A45]" />
                    Guest Type & Designation
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-3">
                    <Label className="text-[#1A1A1A] font-medium">Is the guest coming with family or as an individual? *</Label>
                    <RadioGroup
                      value={formData.guestType}
                      onValueChange={(value) => handleInputChange('guestType', value)}
                      className="flex gap-6"
                    >
                      {GUEST_TYPE_OPTIONS.map((option) => (
                        <div key={option.value} className="flex items-center space-x-2">
                          <RadioGroupItem value={option.value} id={option.value} />
                          <Label htmlFor={option.value} className="cursor-pointer">{option.label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  {formData.guestType === 'family' && (
                    <div className="space-y-4">
                      <Separator />
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-[#1A1A1A]">Family Members</h4>
                        <Button
                          type="button"
                          onClick={handleAddFamilyMember}
                          variant="outline"
                          size="sm"
                          className="border-[#2D5A45] text-[#2D5A45] hover:bg-[#E8F5EE]"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Family Member
                        </Button>
                      </div>
                      
                      {formData.familyMembers.length === 0 && (
                        <p className="text-sm text-[#4A4A4A] bg-[#F5F0E8] p-4 rounded-lg">
                          No family members added yet. Click "Add Family Member" to add family members.
                        </p>
                      )}
                      
                      <div className="space-y-4">
                        {formData.familyMembers.map((member, index) => (
                          <FamilyMemberForm
                            key={member.id}
                            member={member}
                            index={index}
                            onUpdate={handleUpdateFamilyMember}
                            onRemove={handleRemoveFamilyMember}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A] font-medium flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Designation *
                    </Label>
                    <select
                      value={formData.designation}
                      onChange={(e) => handleInputChange('designation', e.target.value)}
                      className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                    >
                      <option value="">Select designation</option>
                      {activeDesignations.map((designation) => (
                        <option key={designation} value={designation}>{designation}</option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Contact & Documents */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#F9F8F6]">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="w-5 h-5 text-[#2D5A45]" />
                    Contact & Documents
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Passport Number *</Label>
                      <Input
                        value={formData.passportNumber}
                        onChange={(e) => handleInputChange('passportNumber', e.target.value)}
                        placeholder="Enter passport number"
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Contact Number *</Label>
                      <Input
                        value={formData.contactNumber}
                        onChange={(e) => handleInputChange('contactNumber', e.target.value)}
                        placeholder="Enter contact number"
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Email</Label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="Enter email address"
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Visa Application Section */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#F9F8F6]">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CreditCard className="w-5 h-5 text-[#2D5A45]" />
                    Visa Application
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A] font-medium">Visa Status *</Label>
                    <div className="flex flex-wrap gap-3">
                      {VISA_STATUS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleInputChange('visaStatus', option.value)}
                          className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                            formData.visaStatus === option.value
                              ? getVisaStatusBadgeColor(option.value) + ' border-current ring-2 ring-offset-1'
                              : 'border-[#D4CFC7] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {formData.visaStatus !== 'not-required' && (
                    <div className="space-y-6 pt-4 border-t border-[#E8E3DB]">
                      <div className="flex items-center gap-2 mb-4">
                        <Badge variant="outline" className={getVisaStatusBadgeColor(formData.visaStatus)}>
                          {VISA_STATUS_LABELS[formData.visaStatus]}
                        </Badge>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[#1A1A1A] font-medium">Visa Number</Label>
                          <Input
                            value={formData.visaDetails.visaNumber}
                            onChange={(e) => handleVisaDetailChange('visaNumber', e.target.value)}
                            placeholder="Enter visa number"
                            className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[#1A1A1A] font-medium">Visa Type</Label>
                          <select
                            value={formData.visaDetails.visaType}
                            onChange={(e) => handleVisaDetailChange('visaType', e.target.value)}
                            className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                          >
                            {VISA_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[#1A1A1A] font-medium">Issue Date</Label>
                          <Input
                            type="date"
                            value={formData.visaDetails.issueDate}
                            onChange={(e) => handleVisaDetailChange('issueDate', e.target.value)}
                            className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[#1A1A1A] font-medium">Expiry Date</Label>
                          <Input
                            type="date"
                            value={formData.visaDetails.expiryDate}
                            onChange={(e) => handleVisaDetailChange('expiryDate', e.target.value)}
                            className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-[#1A1A1A] font-medium">Additional Notes</Label>
                          <textarea
                            value={formData.visaDetails.notes}
                            onChange={(e) => handleVisaDetailChange('notes', e.target.value)}
                            placeholder="Enter any additional visa-related notes"
                            rows={3}
                            className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Arrival Information */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#F9F8F6]">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Plane className="w-5 h-5 text-[#2D5A45]" />
                    Arrival Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Flight Number</Label>
                      <Input
                        value={formData.arrivalFlightNumber}
                        onChange={(e) => handleInputChange('arrivalFlightNumber', e.target.value)}
                        placeholder="e.g., BA123"
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Airport *</Label>
                      <select
                        value={formData.arrivalAirport}
                        onChange={(e) => {
                          handleInputChange('arrivalAirport', e.target.value);
                          handleInputChange('arrivalTerminal', '');
                        }}
                        className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                      >
                        <option value="">Select airport</option>
                        {AIRPORTS.map((airport) => (
                          <option key={airport.code} value={airport.code}>{airport.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Terminal</Label>
                      <select
                        value={formData.arrivalTerminal}
                        onChange={(e) => handleInputChange('arrivalTerminal', e.target.value)}
                        disabled={!formData.arrivalAirport}
                        className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11 disabled:bg-gray-100"
                      >
                        <option value="">{formData.arrivalAirport ? 'Select terminal' : 'Select airport first'}</option>
                        {getTerminals(formData.arrivalAirport).map((terminal) => (
                          <option key={terminal} value={terminal}>Terminal {terminal}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Scheduled Arrival Time</Label>
                      <Input
                        type="datetime-local"
                        value={formData.arrivalTime}
                        onChange={(e) => handleInputChange('arrivalTime', e.target.value)}
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Departure Information */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#F9F8F6]">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Plane className="w-5 h-5 text-[#2D5A45] rotate-180" />
                    Departure Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Flight Number</Label>
                      <Input
                        value={formData.departureFlightNumber}
                        onChange={(e) => handleInputChange('departureFlightNumber', e.target.value)}
                        placeholder="e.g., BA124"
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Airport</Label>
                      <select
                        value={formData.departureAirport}
                        onChange={(e) => {
                          handleInputChange('departureAirport', e.target.value);
                          handleInputChange('departureTerminal', '');
                        }}
                        className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                      >
                        <option value="">Select airport</option>
                        {AIRPORTS.map((airport) => (
                          <option key={airport.code} value={airport.code}>{airport.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Terminal</Label>
                      <select
                        value={formData.departureTerminal}
                        onChange={(e) => handleInputChange('departureTerminal', e.target.value)}
                        disabled={!formData.departureAirport}
                        className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11 disabled:bg-gray-100"
                      >
                        <option value="">{formData.departureAirport ? 'Select terminal' : 'Select airport first'}</option>
                        {getTerminals(formData.departureAirport).map((terminal) => (
                          <option key={terminal} value={terminal}>Terminal {terminal}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Scheduled Departure Time</Label>
                      <Input
                        type="datetime-local"
                        value={formData.departureTime}
                        onChange={(e) => handleInputChange('departureTime', e.target.value)}
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Special Requirements */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#F9F8F6]">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="w-5 h-5 text-[#2D5A45]" />
                    Special Requirements
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A] font-medium">Special Needs / Medical Requirements</Label>
                    <textarea
                      value={formData.specialNeeds}
                      onChange={(e) => handleInputChange('specialNeeds', e.target.value)}
                      placeholder="Enter any special needs or medical requirements"
                      rows={3}
                      className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A] font-medium">Dietary Requirements</Label>
                    <Input
                      value={formData.dietaryRequirements}
                      onChange={(e) => handleInputChange('dietaryRequirements', e.target.value)}
                      placeholder="Enter dietary requirements"
                      className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="wheelchair"
                      checked={formData.wheelchairRequired}
                      onCheckedChange={(checked) => handleInputChange('wheelchairRequired', checked)}
                    />
                    <Label htmlFor="wheelchair" className="cursor-pointer text-[#1A1A1A]">
                      Wheelchair required
                    </Label>
                  </div>
                </CardContent>
              </Card>

              {/* Form Actions */}
              <div className="flex justify-end gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/guests')}
                  className="border-[#D4CFC7] px-8 h-11"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white px-8 h-11"
                >
                  {isSubmitting ? 'Registering...' : 'Register Guest'}
                </Button>
              </div>
            </form>
          </div>
        </main>
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
