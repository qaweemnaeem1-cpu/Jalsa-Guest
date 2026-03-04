import { useState, useMemo } from 'react';
import { X, Search, ChevronDown, ChevronRight, Check, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { CONTINENT_ORDER } from '@/data/countries';
import { useAssignableItems } from '@/hooks/useAssignableItems';
import type { SystemUser } from '@/hooks/useUsers';

interface CountryAssignmentPanelProps {
  user: SystemUser;
  allDeskIncharges: SystemUser[];
  onSave: (userId: string, countries: string[], departments: string[]) => void;
  onClose: () => void;
}

// Strip HTML tags from search input for security
function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim();
}

// Get up to 2 initials from a name
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

// Deterministic color per user id
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500',
  'bg-teal-500',  'bg-indigo-500', 'bg-rose-500',   'bg-amber-500',
];
function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ── Row component shared for both countries and departments ───────────────────
function ItemRow({
  name,
  checked,
  onToggle,
  sharedDIs,
}: {
  name: string;
  checked: boolean;
  onToggle: () => void;
  sharedDIs: SystemUser[];
}) {
  return (
    <label className="flex items-center gap-3 px-5 py-2 hover:bg-[#F0F7F3] cursor-pointer transition-colors border-b border-[#E8E3DB]/50 last:border-0">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="border-[#D4CFC7] data-[state=checked]:bg-[#2D5A45] data-[state=checked]:border-[#2D5A45]"
      />
      <span className="flex-1 text-sm text-[#1A1A1A]">{name}</span>
      {sharedDIs.length > 0 && (
        <div className="flex items-center gap-0.5">
          {sharedDIs.slice(0, 4).map(di => (
            <Tooltip key={di.id}>
              <TooltipTrigger asChild>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold cursor-default ${avatarColor(di.id)}`}
                >
                  {getInitials(di.name)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{di.name}</TooltipContent>
            </Tooltip>
          ))}
          {sharedDIs.length > 4 && (
            <span className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-gray-700 text-[9px] font-bold">
              +{sharedDIs.length - 4}
            </span>
          )}
        </div>
      )}
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function CountryAssignmentPanel({
  user,
  allDeskIncharges,
  onSave,
  onClose,
}: CountryAssignmentPanelProps) {
  const { countries: allCountries, departments: allDepartments } = useAssignableItems();

  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    user.assignedCountries ?? []
  );
  const [selectedDepts, setSelectedDepts] = useState<string[]>(
    user.assignedDepartments ?? []
  );
  const [search, setSearch] = useState('');
  const [openContinents, setOpenContinents] = useState<Record<string, boolean>>({});
  const [deptOpen, setDeptOpen] = useState(false);

  // Other desk incharges (not this user)
  const otherDIs = useMemo(
    () => allDeskIncharges.filter(d => d.id !== user.id),
    [allDeskIncharges, user.id]
  );

  // Map: item name → list of other DIs who have it
  const itemToDIs = useMemo(() => {
    const map: Record<string, SystemUser[]> = {};
    for (const di of otherDIs) {
      for (const c of di.assignedCountries ?? []) {
        if (!map[c]) map[c] = [];
        map[c].push(di);
      }
      for (const d of di.assignedDepartments ?? []) {
        if (!map[d]) map[d] = [];
        map[d].push(di);
      }
    }
    return map;
  }, [otherDIs]);

  const cleanSearch = stripHtml(search).toLowerCase();

  // Active countries grouped by continent (filtered by search)
  const filteredByContinent = useMemo(() => {
    return CONTINENT_ORDER.reduce(
      (acc, continent) => {
        acc[continent] = allCountries
          .filter(c => c.isActive && c.continent === continent)
          .filter(c => cleanSearch === '' || c.name.toLowerCase().includes(cleanSearch))
          .sort((a, b) => a.name.localeCompare(b.name));
        return acc;
      },
      {} as Record<string, typeof allCountries>
    );
  }, [allCountries, cleanSearch]);

  // Active departments filtered by search
  const filteredDepts = useMemo(
    () =>
      allDepartments
        .filter(d => d.isActive)
        .filter(d => cleanSearch === '' || d.name.toLowerCase().includes(cleanSearch))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allDepartments, cleanSearch]
  );

  const totalSelected = selectedCountries.length + selectedDepts.length;
  const totalAvailable = allCountries.filter(c => c.isActive).length + allDepartments.filter(d => d.isActive).length;

  const toggleCountry = (name: string) =>
    setSelectedCountries(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);

  const toggleDept = (name: string) =>
    setSelectedDepts(prev => prev.includes(name) ? prev.filter(d => d !== name) : [...prev, name]);

  const toggleContinent = (continent: string) =>
    setOpenContinents(prev => ({ ...prev, [continent]: !prev[continent] }));

  const isOpen = (continent: string) => cleanSearch !== '' || !!openContinents[continent];

  const allContinentsEmpty = CONTINENT_ORDER.every(
    c => (filteredByContinent[c] ?? []).length === 0
  );
  const noResults = allContinentsEmpty && filteredDepts.length === 0;

  const handleSave = () => {
    onSave(user.id, selectedCountries, selectedDepts);
    toast.success(`Assignment saved for ${user.name}`);
    onClose();
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-4 rounded-xl border border-[#2D5A45]/30 bg-white shadow-md overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#E8F5EE] border-b border-[#2D5A45]/20">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-[#1A1A1A]">Assignment</span>
            <span className="text-sm text-[#4A4A4A]">— {user.name}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#4A4A4A]">
              <span className="font-semibold text-[#2D5A45]">{selectedCountries.length}</span> countries
              {selectedDepts.length > 0 && (
                <>, <span className="font-semibold text-purple-600">{selectedDepts.length}</span> departments</>
              )}
              &nbsp;·&nbsp;
              <span className="font-semibold">{totalAvailable}</span> total
            </span>
            <button
              onClick={onClose}
              className="p-1 hover:bg-[#2D5A45]/10 rounded transition-colors"
              aria-label="Close panel"
            >
              <X className="w-4 h-4 text-[#4A4A4A]" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex" style={{ height: '440px' }}>

          {/* Left pane — assigned pills */}
          <div className="w-64 flex-shrink-0 border-r border-[#E8E3DB] flex flex-col">
            <div className="px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">
                Assigned ({totalSelected})
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {totalSelected === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-[#4A4A4A]/60 text-center px-2">
                    No items assigned yet.
                    <br />
                    Select from the list →
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {/* Green pills — countries */}
                  {selectedCountries.map(name => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#D6E4D9] text-[#2D5A45]"
                    >
                      {name}
                      <button
                        onClick={() => toggleCountry(name)}
                        className="hover:text-red-600 transition-colors ml-0.5"
                        aria-label={`Remove ${name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {/* Purple pills — departments */}
                  {selectedDepts.map(name => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200"
                    >
                      {name}
                      <button
                        onClick={() => toggleDept(name)}
                        className="hover:text-red-600 transition-colors ml-0.5"
                        aria-label={`Remove ${name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right pane — browser */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search */}
            <div className="px-4 pt-3 pb-2 border-b border-[#E8E3DB]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4A4A4A]" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search countries or departments…"
                  className="pl-8 h-8 text-sm border-[#D4CFC7] focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4A4A4A] hover:text-[#1A1A1A]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto">

              {/* Departments section */}
              {filteredDepts.length > 0 && (
                <Collapsible
                  open={deptOpen || cleanSearch !== ''}
                  onOpenChange={setDeptOpen}
                >
                  <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#FAFAFA] border-b border-[#E8E3DB] transition-colors">
                    <div className="flex items-center gap-2">
                      {(deptOpen || cleanSearch !== '') ? (
                        <ChevronDown className="w-3.5 h-3.5 text-purple-600" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-purple-600" />
                      )}
                      <Building2 className="w-3.5 h-3.5 text-purple-600" />
                      <span className="text-sm font-semibold text-[#1A1A1A]">Departments</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedDepts.length > 0 && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                          {selectedDepts.length} selected
                        </span>
                      )}
                      <span className="text-xs text-[#4A4A4A]">{filteredDepts.length}</span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="bg-[#FDFAFF]">
                      {filteredDepts.map(dept => (
                        <ItemRow
                          key={dept.name}
                          name={dept.name}
                          checked={selectedDepts.includes(dept.name)}
                          onToggle={() => toggleDept(dept.name)}
                          sharedDIs={itemToDIs[dept.name] ?? []}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Country continent accordions */}
              {CONTINENT_ORDER.map(continent => {
                const countries = filteredByContinent[continent] ?? [];
                if (countries.length === 0) return null;
                const assignedInContinent = countries.filter(c => selectedCountries.includes(c.name)).length;

                return (
                  <Collapsible
                    key={continent}
                    open={isOpen(continent)}
                    onOpenChange={() => toggleContinent(continent)}
                  >
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#FAFAFA] border-b border-[#E8E3DB] transition-colors">
                      <div className="flex items-center gap-2">
                        {isOpen(continent) ? (
                          <ChevronDown className="w-3.5 h-3.5 text-[#4A4A4A]" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-[#4A4A4A]" />
                        )}
                        <span className="text-sm font-semibold text-[#1A1A1A]">{continent}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {assignedInContinent > 0 && (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[#D6E4D9] text-[#2D5A45]">
                            {assignedInContinent} selected
                          </span>
                        )}
                        <span className="text-xs text-[#4A4A4A]">{countries.length}</span>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="bg-[#FAFAFA]">
                        {countries.map(country => (
                          <ItemRow
                            key={country.name}
                            name={country.name}
                            checked={selectedCountries.includes(country.name)}
                            onToggle={() => toggleCountry(country.name)}
                            sharedDIs={itemToDIs[country.name] ?? []}
                          />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {noResults && (
                <div className="flex items-center justify-center h-24 text-sm text-[#4A4A4A]/60">
                  No items match "{search}"
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3 border-t border-[#E8E3DB] bg-[#F9F8F6]">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-9 px-4 border-[#D4CFC7] text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="h-9 px-4 bg-[#2D5A45] hover:bg-[#234839] text-white text-sm"
          >
            <Check className="w-4 h-4 mr-1.5" />
            Save Assignment
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
