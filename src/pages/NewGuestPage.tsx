import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useDesignations } from '@/hooks/useDesignations';
import { useAssignableItems } from '@/hooks/useAssignableItems';
import { useAuditTrail } from '@/hooks/useAuditTrail';
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
  ChevronRight,
  LogOut,
  Plus,
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
  Upload,
  X,
  ImageIcon,
} from 'lucide-react';
import {
  AIRPORTS,
  VISA_STATUS_OPTIONS,
  VISA_TYPE_OPTIONS,
  GENDER_OPTIONS,
  GUEST_TYPE_OPTIONS,
  RELATIONSHIP_OPTIONS,
  ROLE_LABELS,
  VISA_STATUS_LABELS,
  TIER_ORDER,
  TIER_SECTION_LABEL,
  getTierBadgeLabel,
  getTierBadgeClass,
} from '@/lib/constants';
import { CountryCombobox } from '@/components/CountryCombobox';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { getRoleDisplayLabel, ProfileDialog } from '@/components/ProfileDialog';
import type { UserRole, FamilyMember, VisaDetails, Designation } from '@/types';
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

// ── Designation multi-select ──────────────────────────────────────────────────

interface DesignationMultiSelectProps {
  value: string[];
  onChange: (v: string[]) => void;
  options: Designation[];
  placeholder?: string;
}

function DesignationMultiSelect({ value, onChange, options, placeholder = 'Select designations' }: DesignationMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter(v => v !== name) : [...value, name]);

  const q = search.toLowerCase();
  const filtered = options.filter(o => o.name.toLowerCase().includes(q));

  // Group filtered options by tier (in order)
  const tierGroups: Array<{ tier: string; label: string; items: Designation[] }> = [];
  const ordered = [...TIER_ORDER, '__none__'] as string[];
  for (const tier of ordered) {
    const items = filtered.filter(o => (o.tier ?? '__none__') === tier);
    if (items.length === 0) continue;
    tierGroups.push({ tier, label: TIER_SECTION_LABEL[tier] ?? 'No Tier', items });
  }

  // For pills: look up tier from options
  const tierMap = new Map(options.map(o => [o.name, o.tier]));

  return (
    <div ref={ref} className="relative">
      <div
        tabIndex={0}
        role="combobox"
        aria-expanded={open}
        className="min-h-11 flex items-start flex-wrap gap-1.5 w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white cursor-pointer hover:border-[#2D5A45] transition-colors focus:outline-none focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); }
          if (e.key === 'Escape') { setOpen(false); setSearch(''); }
        }}
      >
        {value.length === 0 ? (
          <span className="text-gray-400 self-center">{placeholder}</span>
        ) : (
          value.map(v => {
            const tier = tierMap.get(v);
            const label = getTierBadgeLabel(tier);
            return (
              <span key={v} className="inline-flex items-center gap-1 bg-[#D6E4D9] text-[#2D5A45] text-xs font-medium px-2 py-0.5 rounded-full">
                {v}
                {label && <span className={`text-[10px] font-bold px-1 py-px rounded ${getTierBadgeClass(tier)}`}>{label}</span>}
                <button type="button" onClick={e => { e.stopPropagation(); toggle(v); }} className="hover:text-[#1A1A1A]">
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 ml-auto self-center shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search designations..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-[#2D5A45]"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {tierGroups.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">No results</p>
            )}
            {tierGroups.map(({ tier, label, items }) => (
              <div key={tier}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 select-none">
                  {label}
                </div>
                {items.map(opt => (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => toggle(opt.name)}
                    className={`w-[calc(100%-8px)] mx-1 my-0.5 flex items-center gap-2.5 text-left px-3 py-2 text-sm rounded-md transition-colors ${value.includes(opt.name) ? 'bg-[#D6E4D9] text-[#2D5A45] font-medium' : 'text-gray-700 hover:bg-[#D6E4D9] hover:text-[#2D5A45]'}`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${value.includes(opt.name) ? 'bg-[#2D5A45] border-[#2D5A45]' : 'border-gray-300'}`}>
                      {value.includes(opt.name) && <span className="text-white text-[10px] font-bold">✓</span>}
                    </span>
                    <span className="flex-1">{opt.name}</span>
                    {opt.tier && (
                      <span className={`text-[10px] font-bold px-1.5 py-px rounded shrink-0 ${getTierBadgeClass(opt.tier)}`}>
                        {getTierBadgeLabel(opt.tier)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Family member form (full accordion) ──────────────────────────────────────

interface FamilyMemberFormProps {
  member: FamilyMember;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (index: number, updates: Partial<FamilyMember>) => void;
  onRemove: (index: number) => void;
  designationOptions: Designation[];
  religions: Array<{ id: string; name: string }>;
  mainGuestName: string;
  mainGuestFlight: {
    arrivalFlightNumber: string;
    arrivalAirport: string;
    arrivalTerminal: string;
    arrivalTime: string;
    departureFlightNumber: string;
    departureAirport: string;
    departureTerminal: string;
    departureTime: string;
  };
  errors?: string[];
}

function FamilyMemberForm({
  member, index, isExpanded, onToggle,
  onUpdate, onRemove, designationOptions,
  religions, mainGuestName, mainGuestFlight, errors = [],
}: FamilyMemberFormProps) {
  const [relOpen, setRelOpen] = useState(false);
  const [relSearch, setRelSearch] = useState('');
  const relRef = useRef<HTMLDivElement>(null);
  const memberPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!relOpen) return;
    const handler = (e: MouseEvent) => {
      if (relRef.current && !relRef.current.contains(e.target as Node)) {
        setRelOpen(false); setRelSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [relOpen]);

  const calcAge = (dob: string) => {
    if (!dob) return 0;
    const t = new Date(), b = new Date(dob);
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a >= 0 ? a : 0;
  };

  const handleMemberPhoto = (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = (e) => onUpdate(index, { photoUrl: e.target?.result as string });
    reader.readAsDataURL(file);
  };

  const sameFlightEnabled = member.sameFlight !== false;

  const fmtDateTime = (dt?: string) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const getAirportName = (code: string) => AIRPORTS.find(a => a.code === code)?.name ?? code;

  const memberLabel = member.name
    ? `${member.name}${member.relationship ? ` (${member.relationship})` : ''}`
    : `Family Member ${index + 1}`;

  const sel = 'w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11';
  const hasError = errors.length > 0;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${hasError ? 'border-red-400' : 'border-[#E8E3DB]'}`}>
      {/* ── Accordion header ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onToggle()}
        className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors ${
          isExpanded ? 'bg-[#D6E4D9]' : hasError ? 'bg-red-50' : 'bg-gray-50 hover:bg-[#EDF4EF]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isExpanded
            ? <ChevronDown className="w-4 h-4 text-[#2D5A45] shrink-0" />
            : <ChevronRight className="w-4 h-4 text-[#4A4A4A] shrink-0" />
          }
          <span className={`text-sm font-medium truncate ${isExpanded ? 'text-[#2D5A45]' : 'text-[#1A1A1A]'}`}>
            {isExpanded ? `Family Member ${index + 1}` : memberLabel}
          </span>
          {hasError && <span className="text-xs text-red-500 shrink-0 ml-1">⚠ Required fields missing</span>}
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove(index); }}
          className="ml-2 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-lg shrink-0 transition-colors"
          aria-label="Remove family member"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Expanded form ── */}
      {isExpanded && (
        <div className="bg-white border-t border-[#E8E3DB] px-4 py-5 space-y-6">

          {/* Personal Details */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4A4A4A] border-b border-[#E8E3DB] pb-2">Personal Details</p>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="space-y-1">
                <Label className="text-[#1A1A1A] text-sm font-medium">Full Name *</Label>
                <Input
                  value={member.name}
                  onChange={e => onUpdate(index, { name: e.target.value })}
                  placeholder="Enter full name"
                  className={`border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11 ${errors.includes('Name required') ? 'border-red-400' : ''}`}
                />
                {errors.includes('Name required') && <p className="text-xs text-red-500">Full name is required</p>}
              </div>

              {/* Relationship */}
              <div className="space-y-1">
                <Label className="text-[#1A1A1A] text-sm font-medium">Relationship *</Label>
                <select
                  value={member.relationship}
                  onChange={e => onUpdate(index, { relationship: e.target.value })}
                  className={`${sel} ${errors.includes('Relationship required') ? 'border-red-400' : ''}`}
                >
                  <option value="">Select relationship</option>
                  {RELATIONSHIP_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {errors.includes('Relationship required') && <p className="text-xs text-red-500">Relationship is required</p>}
              </div>

              {/* Gender */}
              <div className="space-y-1">
                <Label className="text-[#1A1A1A] text-sm font-medium">Gender *</Label>
                <select
                  value={member.gender}
                  onChange={e => onUpdate(index, { gender: e.target.value as 'male' | 'female' })}
                  className={`${sel} ${errors.includes('Gender required') ? 'border-red-400' : ''}`}
                >
                  {GENDER_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Date of Birth + auto-age */}
              <div className="space-y-1">
                <Label className="text-[#1A1A1A] text-sm font-medium">Date of Birth *</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={member.dateOfBirth ?? ''}
                    onChange={e => {
                      const dob = e.target.value;
                      onUpdate(index, { dateOfBirth: dob, age: calcAge(dob) });
                    }}
                    className={`border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11 flex-1 ${errors.includes('Date of Birth required') ? 'border-red-400' : ''}`}
                  />
                  {member.dateOfBirth && (
                    <div className="flex items-center justify-center bg-[#F5F0E8] border border-[#E8E3DB] rounded-md px-3 text-sm text-[#2D5A45] font-medium whitespace-nowrap h-11">
                      Age {calcAge(member.dateOfBirth)}
                    </div>
                  )}
                </div>
                {errors.includes('Date of Birth required') && <p className="text-xs text-red-500">Date of birth is required</p>}
              </div>

              {/* Religion */}
              <div className="space-y-1" ref={relRef}>
                <Label className="text-[#1A1A1A] text-sm font-medium">Religion</Label>
                <div className="relative">
                  <div
                    tabIndex={0}
                    role="combobox"
                    aria-expanded={relOpen}
                    className="flex items-center justify-between w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white h-11 cursor-pointer hover:border-[#2D5A45] transition-colors focus:outline-none focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
                    onClick={() => setRelOpen(o => !o)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRelOpen(o => !o); }
                      if (e.key === 'Escape') { setRelOpen(false); setRelSearch(''); }
                    }}
                  >
                    <span className={member.religion ? 'text-[#1A1A1A]' : 'text-gray-400'}>
                      {member.religion || 'Select religion'}
                    </span>
                    <div className="flex items-center gap-1">
                      {member.religion && (
                        <button type="button" onClick={e => { e.stopPropagation(); onUpdate(index, { religion: '' }); }}
                          className="text-gray-400 hover:text-[#1A1A1A]">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${relOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  {relOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          autoFocus
                          type="text"
                          value={relSearch}
                          onChange={e => setRelSearch(e.target.value)}
                          placeholder="Search religion..."
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-[#2D5A45]"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {religions
                          .filter(r => r.name.toLowerCase().includes(relSearch.toLowerCase()))
                          .map(r => (
                            <button key={r.id} type="button"
                              onClick={() => { onUpdate(index, { religion: r.name }); setRelOpen(false); setRelSearch(''); }}
                              className={`w-[calc(100%-8px)] mx-1 my-0.5 text-left px-3 py-2 text-sm rounded-md transition-colors ${member.religion === r.name ? 'bg-[#D6E4D9] text-[#2D5A45] font-medium' : 'text-gray-700 hover:bg-[#D6E4D9] hover:text-[#2D5A45]'}`}
                            >
                              {r.name}
                            </button>
                          ))
                        }
                        {religions.filter(r => r.name.toLowerCase().includes(relSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-sm text-gray-400">No results</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Photo */}
              <div className="space-y-1">
                <Label className="text-[#1A1A1A] text-sm font-medium">Photo</Label>
                {member.photoUrl ? (
                  <div className="flex items-center gap-3 h-11">
                    <img src={member.photoUrl} alt="Member" className="w-10 h-10 rounded-lg object-cover border border-[#E8E3DB]" />
                    <button type="button" onClick={() => onUpdate(index, { photoUrl: '' })}
                      className="text-sm text-red-500 hover:text-red-700">Remove</button>
                  </div>
                ) : (
                  <div
                    onClick={() => memberPhotoRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-[#D4CFC7] rounded-md cursor-pointer hover:border-[#2D5A45] transition-colors h-11"
                  >
                    <ImageIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">Upload photo (JPG/PNG, max 5MB)</span>
                  </div>
                )}
                <input
                  ref={memberPhotoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleMemberPhoto(f); e.target.value = ''; }}
                />
              </div>
            </div>

            {/* Designation */}
            <div className="space-y-1">
              <Label className="text-[#1A1A1A] text-sm font-medium">Designation</Label>
              <DesignationMultiSelect
                value={Array.isArray(member.designation) ? member.designation : (member.designation ? [member.designation] : [])}
                onChange={v => onUpdate(index, { designation: v })}
                options={designationOptions}
                placeholder="Select designations (optional)"
              />
            </div>

            {/* Introduction */}
            <div className="space-y-1">
              <Label className="text-[#1A1A1A] text-sm font-medium">Introduction</Label>
              <textarea
                value={member.introduction ?? ''}
                onChange={e => onUpdate(index, { introduction: e.target.value })}
                placeholder="Brief introduction (optional)"
                rows={2}
                className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] resize-none"
              />
            </div>
          </div>

          {/* Contact & Documents */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4A4A4A] border-b border-[#E8E3DB] pb-2">Contact & Documents</p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-[#1A1A1A] text-sm font-medium">Passport Number *</Label>
                <Input
                  value={member.passportNumber ?? ''}
                  onChange={e => onUpdate(index, { passportNumber: e.target.value })}
                  placeholder="Enter passport number"
                  className={`border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11 ${errors.includes('Passport number required') ? 'border-red-400' : ''}`}
                />
                {errors.includes('Passport number required') && <p className="text-xs text-red-500">Passport number is required</p>}
              </div>

              <div className="space-y-1">
                <Label className="text-[#1A1A1A] text-sm font-medium">Passport Issuing Country</Label>
                <CountryCombobox
                  value={member.passportCountry ?? ''}
                  onChange={v => onUpdate(index, { passportCountry: v })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[#1A1A1A] text-sm font-medium">Contact Number</Label>
                <Input
                  value={member.contactNumber ?? ''}
                  onChange={e => onUpdate(index, { contactNumber: e.target.value })}
                  placeholder="Leave blank to use head's number"
                  className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[#1A1A1A] text-sm font-medium">Email</Label>
                <Input
                  type="email"
                  value={member.email ?? ''}
                  onChange={e => onUpdate(index, { email: e.target.value })}
                  placeholder="Optional"
                  className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                />
              </div>
            </div>
          </div>

          {/* Travel Details */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4A4A4A] border-b border-[#E8E3DB] pb-2">Travel Details</p>

            <div className="space-y-2">
              <Label className="text-[#1A1A1A] text-sm font-medium">Visa Status</Label>
              <div className="flex flex-wrap gap-2">
                {VISA_STATUS_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => onUpdate(index, { visaStatus: opt.value })}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                      (member.visaStatus ?? 'not-required') === opt.value
                        ? 'bg-green-50 text-green-700 border-green-300 ring-2 ring-green-300 ring-offset-1'
                        : 'border-[#D4CFC7] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[#1A1A1A] text-sm font-medium">Wheelchair Required</Label>
              <div className="flex gap-3">
                {([{ v: false, l: 'No' }, { v: true, l: 'Yes' }] as const).map(({ v, l }) => (
                  <button key={l} type="button"
                    onClick={() => onUpdate(index, { wheelchairRequired: v })}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      (member.wheelchairRequired ?? false) === v
                        ? 'bg-[#2D5A45] text-white border-[#2D5A45]'
                        : 'border-[#D4CFC7] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[#1A1A1A] text-sm font-medium">Special Needs</Label>
              <textarea
                value={member.specialNeeds ?? ''}
                onChange={e => onUpdate(index, { specialNeeds: e.target.value })}
                placeholder="Any special requirements..."
                rows={2}
                className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] resize-none"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[#1A1A1A] text-sm font-medium">Dietary Requirements</Label>
              <textarea
                value={member.dietaryRequirements ?? ''}
                onChange={e => onUpdate(index, { dietaryRequirements: e.target.value })}
                placeholder="Any dietary requirements..."
                rows={2}
                className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] resize-none"
              />
            </div>
          </div>

          {/* Expenses */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4A4A4A] border-b border-[#E8E3DB] pb-2">Expenses</p>

            <div className="flex gap-6">
              {(['Self', 'Jamaat'] as const).map(v => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`expenses-${member.id}`}
                    value={v}
                    checked={(member.expenses ?? 'Self') === v}
                    onChange={() => onUpdate(index, { expenses: v })}
                    className="accent-[#2D5A45]"
                  />
                  <span className="text-sm">{v}</span>
                </label>
              ))}
            </div>

            {member.expenses === 'Jamaat' && (
              <div className="space-y-1">
                <Label className="text-[#1A1A1A] text-sm font-medium">Tabshir Reference Nr.</Label>
                <Input
                  value={member.tabshirReference ?? ''}
                  onChange={e => onUpdate(index, { tabshirReference: e.target.value })}
                  placeholder="Enter Tabshir reference number"
                  className="border-[#2D5A45] ring-1 ring-[#2D5A45] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                />
              </div>
            )}
          </div>

          {/* Flight Details */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4A4A4A] border-b border-[#E8E3DB] pb-2 flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-[#2D5A45]" />
              Flight Details
            </p>

            <div className="space-y-3">
              <Label className="text-[#1A1A1A] text-sm font-medium">
                Same flight as {mainGuestName || 'Head Guest'}?
              </Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onUpdate(index, { sameFlight: true })}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                    sameFlightEnabled ? 'bg-[#2D5A45] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  YES
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate(index, { sameFlight: false })}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !sameFlightEnabled ? 'bg-[#2D5A45] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  NO
                </button>
              </div>

              {sameFlightEnabled ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm space-y-1.5">
                  <div className="flex items-center gap-2 text-green-700 font-medium mb-1">
                    <CheckSquare className="w-4 h-4" />
                    Same flight as {mainGuestName || 'Head Guest'}
                  </div>
                  {(mainGuestFlight.arrivalFlightNumber || mainGuestFlight.arrivalTime) ? (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5 text-green-800">
                        <Plane className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-medium">Arrival:</span>
                        <span>{fmtDateTime(mainGuestFlight.arrivalTime)}</span>
                        {mainGuestFlight.arrivalFlightNumber && <span>· Flight {mainGuestFlight.arrivalFlightNumber}</span>}
                        {mainGuestFlight.arrivalAirport && (
                          <span>· {getAirportName(mainGuestFlight.arrivalAirport)}{mainGuestFlight.arrivalTerminal ? ` T${mainGuestFlight.arrivalTerminal}` : ''}</span>
                        )}
                      </div>
                      {(mainGuestFlight.departureFlightNumber || mainGuestFlight.departureTime) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-green-800">
                          <Plane className="w-3.5 h-3.5 shrink-0 rotate-180" />
                          <span className="font-medium">Departure:</span>
                          <span>{fmtDateTime(mainGuestFlight.departureTime)}</span>
                          {mainGuestFlight.departureFlightNumber && <span>· Flight {mainGuestFlight.departureFlightNumber}</span>}
                          {mainGuestFlight.departureAirport && (
                            <span>· {getAirportName(mainGuestFlight.departureAirport)}{mainGuestFlight.departureTerminal ? ` T${mainGuestFlight.departureTerminal}` : ''}</span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-green-700 text-xs">
                      Flight details will be copied from the head guest when saved. Add flight details above.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                    This family member is travelling separately. A separate pickup will be arranged.
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[#1A1A1A] text-sm font-medium">Arrival Flight Number *</Label>
                      <Input
                        value={member.arrivalFlightNumber ?? ''}
                        onChange={e => onUpdate(index, { arrivalFlightNumber: e.target.value })}
                        placeholder="e.g. BA123"
                        className={`border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11 ${errors.includes('Arrival flight number required') ? 'border-red-400' : ''}`}
                      />
                      {errors.includes('Arrival flight number required') && <p className="text-xs text-red-500">Required when travelling separately</p>}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[#1A1A1A] text-sm font-medium">Arrival Airport</Label>
                      <select
                        value={member.arrivalAirport ?? ''}
                        onChange={e => onUpdate(index, { arrivalAirport: e.target.value, arrivalTerminal: '' })}
                        className={sel}
                      >
                        <option value="">Select airport</option>
                        {AIRPORTS.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[#1A1A1A] text-sm font-medium">Arrival Terminal</Label>
                      <select
                        value={member.arrivalTerminal ?? ''}
                        onChange={e => onUpdate(index, { arrivalTerminal: e.target.value })}
                        disabled={!member.arrivalAirport}
                        className={`${sel} disabled:bg-gray-100`}
                      >
                        <option value="">{member.arrivalAirport ? 'Select terminal' : 'Select airport first'}</option>
                        {(AIRPORTS.find(a => a.code === member.arrivalAirport)?.terminals ?? []).map(t => (
                          <option key={t} value={t}>Terminal {t}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[#1A1A1A] text-sm font-medium">Scheduled Arrival *</Label>
                      <Input
                        type="datetime-local"
                        value={member.arrivalTime ?? ''}
                        onChange={e => onUpdate(index, { arrivalTime: e.target.value })}
                        className={`border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11 ${errors.includes('Arrival time required') ? 'border-red-400' : ''}`}
                      />
                      {errors.includes('Arrival time required') && <p className="text-xs text-red-500">Arrival time is required</p>}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[#1A1A1A] text-sm font-medium">Departure Flight Number</Label>
                      <Input
                        value={member.departureFlightNumber ?? ''}
                        onChange={e => onUpdate(index, { departureFlightNumber: e.target.value })}
                        placeholder="e.g. BA124"
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[#1A1A1A] text-sm font-medium">Departure Airport</Label>
                      <select
                        value={member.departureAirport ?? ''}
                        onChange={e => onUpdate(index, { departureAirport: e.target.value, departureTerminal: '' })}
                        className={sel}
                      >
                        <option value="">Select airport</option>
                        {AIRPORTS.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[#1A1A1A] text-sm font-medium">Departure Terminal</Label>
                      <select
                        value={member.departureTerminal ?? ''}
                        onChange={e => onUpdate(index, { departureTerminal: e.target.value })}
                        disabled={!member.departureAirport}
                        className={`${sel} disabled:bg-gray-100`}
                      >
                        <option value="">{member.departureAirport ? 'Select terminal' : 'Select airport first'}</option>
                        {(AIRPORTS.find(a => a.code === member.departureAirport)?.terminals ?? []).map(t => (
                          <option key={t} value={t}>Terminal {t}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[#1A1A1A] text-sm font-medium">Scheduled Departure</Label>
                      <Input
                        type="datetime-local"
                        value={member.departureTime ?? ''}
                        onChange={e => onUpdate(index, { departureTime: e.target.value })}
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewGuestPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { addGuest } = useGuests();
  const { activeDesignations } = useDesignations();
  const { countries: assignableCountries } = useAssignableItems();
  const { addEntry } = useAuditTrail();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [religions, setReligions] = useState<Array<{ id: string; name: string }>>([]);
  const [expandedMemberIndex, setExpandedMemberIndex] = useState<number | null>(null);
  const [familyMemberErrors, setFamilyMemberErrors] = useState<Record<number, string[]>>({});
  const [religionSearch, setReligionSearch] = useState('');
  const [religionOpen, setReligionOpen] = useState(false);
  const religionRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoDragOver, setPhotoDragOver] = useState(false);

  const [formData, setFormData] = useState({
    fullName: '',
    country: user?.country || '',
    gender: 'male' as 'male' | 'female',
    age: '',
    dateOfBirth: '',
    guestType: 'individual' as 'individual' | 'family',
    familyMembers: [] as FamilyMember[],
    designation: [] as string[],
    passportNumber: '',
    passportCountry: '',
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
    religion: 'Ahmadi Muslim',
    introduction: '',
    isHeadOfFamily: false as boolean,
    expenses: 'Self' as 'Self' | 'Jamaat',
    tabshirReference: '',
    photoUrl: '',
  });

  useEffect(() => {
    supabase.from('religions').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setReligions(data as Array<{ id: string; name: string }>); });
  }, []);

  useEffect(() => {
    if (!religionOpen) return;
    const handler = (e: MouseEvent) => {
      if (religionRef.current && !religionRef.current.contains(e.target as Node)) {
        setReligionOpen(false);
        setReligionSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [religionOpen]);

  const handlePhotoFile = useCallback((file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      handleInputChange('photoUrl', e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const navItems = NAV_ITEMS[user.role] || [];

  const calculateAge = (dob: string): string => {
    if (!dob) return '';
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? String(age) : '';
  };

  const handleInputChange = (field: string, value: any) => {
    if (field === 'dateOfBirth') {
      setFormData(prev => ({ ...prev, dateOfBirth: value, age: calculateAge(value) }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
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
      religion: 'Ahmadi Muslim',
      visaStatus: 'not-required',
      wheelchairRequired: false,
      expenses: 'Self',
      sameFlight: true,
    };
    setFormData(prev => {
      const newIndex = prev.familyMembers.length;
      setExpandedMemberIndex(newIndex);
      return { ...prev, familyMembers: [...prev.familyMembers, newMember] };
    });
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
    if (!formData.country && user?.role !== 'coordinator') {
      toast.error('Country is required');
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
    if (formData.designation.length === 0) {
      toast.error('Designation is required');
      return;
    }
    if (formData.guestType === 'family') {
      if (formData.familyMembers.length === 0) {
        toast.error('Please add at least one family member');
        return;
      }
      const errorMap: Record<number, string[]> = {};
      let hasValidationErrors = false;
      for (const [idx, member] of formData.familyMembers.entries()) {
        const errs: string[] = [];
        if (!member.name.trim() || member.name.trim().length < 2) errs.push('Name required');
        if (!member.relationship) errs.push('Relationship required');
        if (!member.gender) errs.push('Gender required');
        if (!member.dateOfBirth) errs.push('Date of Birth required');
        if (!member.passportNumber?.trim()) errs.push('Passport number required');
        if (member.sameFlight === false) {
          if (!member.arrivalFlightNumber?.trim()) errs.push('Arrival flight number required');
          if (!member.arrivalTime) errs.push('Arrival time required');
        }
        if (errs.length > 0) { errorMap[idx] = errs; hasValidationErrors = true; }
      }
      if (hasValidationErrors) {
        setFamilyMemberErrors(errorMap);
        const firstErrIdx = Number(Object.keys(errorMap)[0]);
        setExpandedMemberIndex(firstErrIdx);
        toast.error('Please correct family member details');
        return;
      }
      setFamilyMemberErrors({});
    }

    setIsSubmitting(true);

    try {
      const resolvedCountry = user?.role === 'coordinator' ? (user.country || '') : formData.country;
      const toNull = (v: unknown) =>
        v === '' || v === undefined || v === null ? null : v;
      const toInt = (v: unknown) => { const n = parseInt(String(v)); return isNaN(n) ? null : n; };
      const toBool = (v: unknown) => v === true || v === 'true';
      const now = new Date().toISOString();

      if (formData.guestType === 'family') {
        // ── Family registration: each member gets its own guest row ──────────
        const familyGroupId = crypto.randomUUID();
        const familyName = (formData.fullName.split(' ').pop() ?? formData.fullName) + ' Family';

        const { count } = await supabase.from('guests').select('*', { count: 'exact', head: true });
        let nextRef = (count ?? 0) + 1;

        const sharedFields = {
          guest_type:        'Family',
          family_group_id:   familyGroupId,
          family_name:       familyName,
          country:           resolvedCountry,
          visa_status:       toNull(formData.visaStatus) ?? 'Not Required',
          expenses:          toNull(formData.expenses) ?? 'Self',
          tabshir_reference: toNull(formData.tabshirReference),
          passport_country:  toNull(formData.passportCountry),
          status:            'Awaiting Review',
          appeal_status:     'none',
          submitted_by:      user.id,
          submitted_at:      now,
          resubmit_count:    0,
        };

        // Insert head guest
        const mainInsert = {
          ...sharedFields,
          reference:         `MEH-2024-${String(nextRef).padStart(6, '0')}`,
          full_name:         toNull(formData.fullName),
          gender:            toNull(formData.gender),
          date_of_birth:     toNull(formData.dateOfBirth),
          age:               formData.dateOfBirth
            ? (() => { const b = new Date(formData.dateOfBirth); const t = new Date(); let a = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--; return a >= 0 ? a : null; })()
            : toInt(formData.age),
          passport_number:   toNull(formData.passportNumber),
          contact_number:    toNull(formData.contactNumber),
          email:             toNull(formData.email),
          flight_number:     toNull(formData.arrivalFlightNumber),
          arrival_airport:   toNull(formData.arrivalAirport),
          arrival_terminal:  toNull(formData.arrivalTerminal),
          arrival_time:      toNull(formData.arrivalTime),
          departure_airport:  toNull(formData.departureAirport),
          departure_terminal: toNull(formData.departureTerminal),
          departure_time:    toNull(formData.departureTime),
          special_needs:     toNull(formData.specialNeeds),
          dietary_requirements: toNull(formData.dietaryRequirements),
          wheelchair_required: toBool(formData.wheelchairRequired),
          religion:          toNull(formData.religion),
          introduction:      toNull(formData.introduction),
          designation:       formData.designation.length > 0 ? formData.designation : null,
          is_head_of_family: true,
          relationship:      'Self',
          photo_url:         toNull(formData.photoUrl),
        };

        const { data: mainData, error: mainError } = await supabase
          .from('guests').insert(mainInsert).select().single();
        if (mainError || !mainData) {
          toast.error(mainError?.message ?? 'Failed to register guest');
          return;
        }

        // Insert each family member with full data
        for (const m of formData.familyMembers) {
          nextRef++;
          const useSameFlight = m.sameFlight !== false;
          const memberAge = m.dateOfBirth
            ? (() => { const t = new Date(), b = new Date(m.dateOfBirth!); let a = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--; return a >= 0 ? a : null; })()
            : toInt(m.age);
          await supabase.from('guests').insert({
            ...sharedFields,
            reference:            `MEH-2024-${String(nextRef).padStart(6, '0')}`,
            full_name:            toNull(m.name),
            gender:               toNull(m.gender),
            age:                  memberAge,
            date_of_birth:        toNull(m.dateOfBirth),
            designation:          Array.isArray(m.designation) && m.designation.length > 0 ? m.designation : null,
            religion:             toNull(m.religion),
            relationship:         m.relationship,
            is_head_of_family:    false,
            passport_number:      toNull(m.passportNumber),
            passport_country:     toNull(m.passportCountry),
            contact_number:       toNull(m.contactNumber) ?? toNull(formData.contactNumber),
            email:                toNull(m.email),
            visa_status:          m.visaStatus ?? sharedFields.visa_status,
            wheelchair_required:  m.wheelchairRequired ?? false,
            special_needs:        toNull(m.specialNeeds),
            dietary_requirements: toNull(m.dietaryRequirements),
            introduction:         toNull(m.introduction),
            photo_url:            toNull(m.photoUrl),
            expenses:             m.expenses ?? formData.expenses,
            tabshir_reference:    toNull(m.tabshirReference) ?? toNull(formData.tabshirReference),
            // Flight — inherit from head guest if sameFlight, else use member's own data
            flight_number:        useSameFlight ? toNull(formData.arrivalFlightNumber)  : toNull(m.arrivalFlightNumber),
            arrival_airport:      useSameFlight ? toNull(formData.arrivalAirport)       : toNull(m.arrivalAirport),
            arrival_terminal:     useSameFlight ? toNull(formData.arrivalTerminal)      : toNull(m.arrivalTerminal),
            arrival_time:         useSameFlight ? toNull(formData.arrivalTime)          : toNull(m.arrivalTime),
            departure_airport:    useSameFlight ? toNull(formData.departureAirport)     : toNull(m.departureAirport),
            departure_terminal:   useSameFlight ? toNull(formData.departureTerminal)    : toNull(m.departureTerminal),
            departure_time:       useSameFlight ? toNull(formData.departureTime)        : toNull(m.departureTime),
          });
        }

        addEntry({
          guestId: mainData.id,
          guestName: formData.fullName,
          guestReference: mainData.reference,
          type: 'submission',
          action: `Family registered: ${familyName} (${formData.familyMembers.length + 1} members)`,
          createdBy: { id: user.id, name: user.name, role: user.role as 'coordinator' | 'super-admin' | 'desk-in-charge' },
          createdAt: now,
        });
        toast.success(`${familyName} registered with ${formData.familyMembers.length + 1} members`);

      } else {
        // ── Individual registration (unchanged path) ─────────────────────────
        const result = await addGuest({
          fullName: formData.fullName,
          country: resolvedCountry,
          countryCode: user?.role === 'coordinator' ? (user.countryCode || resolvedCountry) : formData.country,
          gender: formData.gender,
          age: parseInt(formData.age),
          dateOfBirth: formData.dateOfBirth,
          passportNumber: formData.passportNumber,
          passportCountry: formData.passportCountry,
          contactNumber: formData.contactNumber,
          email: formData.email,
          visaStatus: formData.visaStatus,
          visaDetails: formData.visaStatus !== 'not-required' ? formData.visaDetails : undefined,
          guestType: formData.guestType,
          familyMembers: [],
          designation: formData.designation.length > 0 ? formData.designation : [],
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
          religion: formData.religion || undefined,
          introduction: formData.introduction || undefined,
          isHeadOfFamily: formData.isHeadOfFamily,
          expenses: formData.expenses,
          tabshirReference: formData.tabshirReference || undefined,
          photoUrl: formData.photoUrl || undefined,
          submittedBy: user.id,
        });

        if (!result) return;
        addEntry({
          guestId: result.id,
          guestName: result.fullName,
          guestReference: result.referenceNumber,
          type: 'submission',
          action: 'Guest registered and submitted for review',
          createdBy: { id: user.id, name: user.name, role: user.role as 'coordinator' | 'super-admin' | 'desk-in-charge' },
          createdAt: now,
        });
        toast.success('Guest registered successfully');
      }

      navigate(user.role === 'coordinator' ? '/coordinator/pending' : user.role === 'desk-in-charge' ? '/desk/review' : '/guests');
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

          <nav className="p-4 space-y-1 flex-1">
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

          {user.role === 'coordinator' && (
            <div className="px-4 mb-2">
              <button
                type="button"
                disabled
                className="w-full bg-[#2D5A45] text-white rounded-lg py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium opacity-50 cursor-default"
              >
                <Plus className="w-5 h-5" />
                New Registration
              </button>
            </div>
          )}

          <SidebarUserFooter />
        </aside>

        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => navigate(user.role === 'coordinator' ? '/coordinator/pending' : user.role === 'desk-in-charge' ? '/desk/review' : '/guests')}
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
                <CardHeader className="bg-[#D6E4D9]/30 border-l-4 border-[#2D5A45] py-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
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
                      <Label className="text-[#1A1A1A] font-medium">Registration Country *</Label>
                      {user?.role === 'coordinator' ? (
                        <div>
                          <input
                            type="text"
                            value={user.country || ''}
                            readOnly
                            className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white text-[#4A4A4A] h-11 cursor-not-allowed"
                          />
                          <p className="text-xs text-[#4A4A4A] mt-1">Auto-assigned based on your coordinator role</p>
                        </div>
                      ) : user?.role === 'desk-in-charge' ? (
                        <div>
                          <CountryCombobox
                            value={formData.country}
                            onChange={(v) => handleInputChange('country', v)}
                          />
                          <p className="text-xs text-[#4A4A4A] mt-1">Select the country this guest is being registered under</p>
                        </div>
                      ) : (
                        <select
                          value={formData.country}
                          onChange={(e) => handleInputChange('country', e.target.value)}
                          className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] h-11"
                        >
                          <option value="">Select country</option>
                          {assignableCountries.filter(c => c.isActive).map((country) => (
                            <option key={country.id} value={country.name}>{country.name}</option>
                          ))}
                        </select>
                      )}
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
                      <Label className="text-[#1A1A1A] font-medium">Religion</Label>
                      <div ref={religionRef} className="relative">
                        <div
                          tabIndex={0}
                          role="combobox"
                          aria-expanded={religionOpen}
                          className="flex items-center justify-between w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white h-11 cursor-pointer hover:border-[#2D5A45] transition-colors focus:outline-none focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
                          onClick={() => setReligionOpen(o => !o)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setReligionOpen(o => !o); }
                            if (e.key === 'Escape') { setReligionOpen(false); setReligionSearch(''); }
                          }}
                        >
                          <span className={formData.religion ? 'text-[#1A1A1A]' : 'text-gray-400'}>
                            {formData.religion || 'Select religion'}
                          </span>
                          <div className="flex items-center gap-1">
                            {formData.religion && (
                              <button type="button" onClick={e => { e.stopPropagation(); handleInputChange('religion', ''); }}
                                className="text-gray-400 hover:text-[#1A1A1A]">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${religionOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                        {religionOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                            <div className="p-2 border-b border-gray-100">
                              <input
                                autoFocus
                                type="text"
                                value={religionSearch}
                                onChange={e => setReligionSearch(e.target.value)}
                                placeholder="Search religion..."
                                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-[#2D5A45]"
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto py-1">
                              {religions
                                .filter(r => r.name.toLowerCase().includes(religionSearch.toLowerCase()))
                                .map(r => (
                                  <button key={r.id} type="button"
                                    onClick={() => { handleInputChange('religion', r.name); setReligionOpen(false); setReligionSearch(''); }}
                                    className={`w-[calc(100%-8px)] mx-1 my-0.5 text-left px-3 py-2 text-sm rounded-md transition-colors ${formData.religion === r.name ? 'bg-[#D6E4D9] text-[#2D5A45] font-medium' : 'text-gray-700 hover:bg-[#D6E4D9] hover:text-[#2D5A45]'}`}
                                  >
                                    {r.name}
                                  </button>
                                ))
                              }
                              {religions.filter(r => r.name.toLowerCase().includes(religionSearch.toLowerCase())).length === 0 && (
                                <p className="px-3 py-2 text-sm text-gray-400">No results</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Date of Birth</Label>
                      <Input
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                        className="border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45] h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#1A1A1A] font-medium">Age</Label>
                      <Input
                        type="number"
                        value={formData.age}
                        readOnly
                        placeholder="Auto-calculated from date of birth"
                        className="border-[#D4CFC7] h-11 bg-white text-[#1A1A1A] cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A] font-medium">Introduction</Label>
                    <textarea
                      value={formData.introduction}
                      onChange={(e) => handleInputChange('introduction', e.target.value)}
                      placeholder="Brief introduction about the guest"
                      rows={3}
                      className="w-full px-3 py-2.5 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] resize-none"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Guest Type & Designation */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#D6E4D9]/30 border-l-4 border-[#2D5A45] py-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
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

                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A] font-medium">Is this guest the Head of Family?</Label>
                    <RadioGroup
                      value={formData.isHeadOfFamily ? 'yes' : 'no'}
                      onValueChange={(v) => handleInputChange('isHeadOfFamily', v === 'yes')}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="hof-no" />
                        <Label htmlFor="hof-no" className="cursor-pointer">No</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="hof-yes" />
                        <Label htmlFor="hof-yes" className="cursor-pointer">Yes</Label>
                      </div>
                    </RadioGroup>
                    {formData.guestType === 'family' && formData.isHeadOfFamily && (
                      <p className="text-xs text-[#2D5A45] bg-[#E8F5EE] px-3 py-2 rounded-md mt-1">
                        This guest will be marked as the head of the family group.
                      </p>
                    )}
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
                      
                      <div className="space-y-3">
                        {formData.familyMembers.map((member, index) => (
                          <FamilyMemberForm
                            key={member.id}
                            member={member}
                            index={index}
                            isExpanded={expandedMemberIndex === index}
                            onToggle={() => setExpandedMemberIndex(prev => prev === index ? null : index)}
                            onUpdate={handleUpdateFamilyMember}
                            onRemove={handleRemoveFamilyMember}
                            designationOptions={activeDesignations}
                            religions={religions}
                            mainGuestName={formData.fullName}
                            mainGuestFlight={{
                              arrivalFlightNumber: formData.arrivalFlightNumber,
                              arrivalAirport: formData.arrivalAirport,
                              arrivalTerminal: formData.arrivalTerminal,
                              arrivalTime: formData.arrivalTime,
                              departureFlightNumber: formData.departureFlightNumber,
                              departureAirport: formData.departureAirport,
                              departureTerminal: formData.departureTerminal,
                              departureTime: formData.departureTime,
                            }}
                            errors={familyMemberErrors[index] ?? []}
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
                    <DesignationMultiSelect
                      value={formData.designation}
                      onChange={(v) => handleInputChange('designation', v)}
                      options={activeDesignations}
                      placeholder="Select designations"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Expenses */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#D6E4D9]/30 border-l-4 border-[#2D5A45] py-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
                    <CreditCard className="w-5 h-5 text-[#2D5A45]" />
                    Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A] font-medium">Expenses Covered By</Label>
                    <RadioGroup
                      value={formData.expenses}
                      onValueChange={(v) => handleInputChange('expenses', v as 'Self' | 'Jamaat')}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Self" id="exp-self" />
                        <Label htmlFor="exp-self" className="cursor-pointer">Self</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Jamaat" id="exp-jamaat" />
                        <Label htmlFor="exp-jamaat" className="cursor-pointer">Jamaat</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[#1A1A1A] font-medium">Tabshir Reference Nr.</Label>
                    <Input
                      value={formData.tabshirReference}
                      onChange={(e) => handleInputChange('tabshirReference', e.target.value)}
                      placeholder="Enter Tabshir reference number"
                      className={`h-11 transition-colors ${formData.expenses === 'Jamaat' ? 'border-[#2D5A45] ring-1 ring-[#2D5A45] focus:border-[#2D5A45] focus:ring-[#2D5A45]' : 'border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-[#2D5A45]'}`}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Contact & Documents */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#D6E4D9]/30 border-l-4 border-[#2D5A45] py-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
                    <FileText className="w-5 h-5 text-[#2D5A45]" />
                    Contact & Documents
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-6 items-start">
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
                      <Label className="text-[#1A1A1A] font-medium">Passport Issuing Country</Label>
                      <CountryCombobox
                        value={formData.passportCountry}
                        onChange={(v) => handleInputChange('passportCountry', v)}
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
                <CardHeader className="bg-[#D6E4D9]/30 border-l-4 border-[#2D5A45] py-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
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
                <CardHeader className="bg-[#D6E4D9]/30 border-l-4 border-[#2D5A45] py-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
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
                <CardHeader className="bg-[#D6E4D9]/30 border-l-4 border-[#2D5A45] py-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
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
                <CardHeader className="bg-[#D6E4D9]/30 border-l-4 border-[#2D5A45] py-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
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

              {/* Photo Upload */}
              <Card className="shadow-sm">
                <CardHeader className="bg-[#D6E4D9]/30 border-l-4 border-[#2D5A45] py-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
                    <ImageIcon className="w-5 h-5 text-[#2D5A45]" />
                    Guest Photo
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {formData.photoUrl ? (
                    <div className="flex items-start gap-4">
                      <img
                        src={formData.photoUrl}
                        alt="Guest photo preview"
                        className="w-32 h-32 object-cover rounded-lg border border-[#E8E3DB]"
                      />
                      <div className="space-y-2">
                        <p className="text-sm text-[#4A4A4A]">Photo uploaded successfully</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleInputChange('photoUrl', '')}
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Remove Photo
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      tabIndex={0}
                      role="button"
                      aria-label="Upload guest photo"
                      onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
                      onDragLeave={() => setPhotoDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setPhotoDragOver(false);
                        const file = e.dataTransfer.files[0];
                        if (file) handlePhotoFile(file);
                      }}
                      onClick={() => photoInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); photoInputRef.current?.click(); }
                      }}
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors focus:outline-none focus:border-[#2D5A45] focus:ring-2 focus:ring-[#2D5A45] focus:ring-offset-1 ${photoDragOver ? 'border-[#2D5A45] bg-[#E8F5EE]' : 'border-[#D4CFC7] hover:border-[#2D5A45] hover:bg-[#F5F0E8]'}`}
                    >
                      <Upload className="w-8 h-8 text-[#4A4A4A] mx-auto mb-3" />
                      <p className="text-sm font-medium text-[#1A1A1A]">Drag & drop a photo here, or click to select</p>
                      <p className="text-xs text-[#4A4A4A] mt-1">JPG, PNG or WEBP · Max 5 MB</p>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoFile(file);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  )}
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
