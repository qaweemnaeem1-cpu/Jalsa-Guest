import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Compact mode: smaller trigger for inline table use */
  compact?: boolean;
  /** Hide the clear (×) button */
  hideClear?: boolean;
}

interface OptionItem {
  name: string;
  type: 'country' | 'department';
}

export function DelegationCombobox({
  value,
  onChange,
  placeholder = 'Search country or department...',
  disabled,
  className,
  compact = false,
  hideClear = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch countries and departments on mount
  useEffect(() => {
    Promise.all([
      supabase.from('countries').select('name').eq('is_active', true).order('name'),
      supabase.from('departments').select('name').eq('type', 'group').eq('is_active', true).order('name'),
    ]).then(([{ data: cData }, { data: dData }]) => {
      if (cData) setCountries(cData.map((r: { name: string }) => r.name));
      if (dData) setDepartments(dData.map((r: { name: string }) => r.name));
    });
  }, []);

  // Dropdown position state (for portal)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  // Recompute position when opening
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 240),
    });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const q = search.toLowerCase();
  const filteredCountries = countries.filter(n => n.toLowerCase().includes(q));
  const filteredDepartments = departments.filter(n => n.toLowerCase().includes(q));

  const triggerBase = compact
    ? 'flex items-center justify-between gap-2 px-3 py-1.5 border rounded-lg text-sm outline-none min-w-[150px]'
    : 'flex items-center justify-between w-full px-3 py-2.5 border rounded-lg text-sm h-11 outline-none';

  const triggerState = disabled
    ? 'bg-[#F5F0E8] border-[#D4CFC7] text-[#4A4A4A] cursor-not-allowed'
    : 'bg-white border-gray-200 cursor-pointer hover:border-[#2D5A45] focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] transition-colors';

  const renderOption = (item: OptionItem) => {
    const isSelected = value === item.name;
    const icon = item.type === 'country' ? '🌍' : '🏢';
    return (
      <button
        key={`${item.type}-${item.name}`}
        type="button"
        onClick={() => { onChange(item.name); setOpen(false); setSearch(''); }}
        className={[
          'w-[calc(100%-8px)] mx-1 my-0.5 flex items-center justify-between text-left px-3 py-2 text-sm rounded-md cursor-pointer transition-colors',
          isSelected
            ? 'bg-[#D6E4D9] text-[#2D5A45] font-medium'
            : 'text-gray-700 hover:bg-[#D6E4D9] hover:text-[#2D5A45]',
        ].join(' ')}
      >
        <span className="flex items-center gap-2 truncate">
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{item.name}</span>
        </span>
        {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-1" />}
      </button>
    );
  };

  const hasResults = filteredCountries.length > 0 || filteredDepartments.length > 0;

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      style={{ position: 'absolute', top: coords.top, left: coords.left, width: coords.width, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-lg"
    >
      {/* Search */}
      <div className="p-2 border-b border-gray-100">
        <div className="flex items-center gap-2 px-2 py-1.5 border border-gray-200 rounded-md">
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 text-sm outline-none bg-transparent text-[#1A1A1A] placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Options */}
      <div className="max-h-64 overflow-y-auto py-1">
        {!hasResults ? (
          <p className="px-3 py-2 text-sm text-gray-400">No results found</p>
        ) : (
          <>
            {filteredCountries.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Countries</span>
                </div>
                {filteredCountries.map(name => renderOption({ name, type: 'country' }))}
              </>
            )}

            {filteredDepartments.length > 0 && (
              <>
                <div className={`px-3 pb-1 ${filteredCountries.length > 0 ? 'pt-3 mt-1 border-t border-gray-100' : 'pt-2'}`}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Groups</span>
                </div>
                {filteredDepartments.map(name => renderOption({ name, type: 'department' }))}
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className={`relative ${className ?? ''}`}>
      <div
        ref={triggerRef}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={open}
        className={`${triggerBase} ${triggerState}`}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); }
          if (e.key === 'Escape') { setOpen(false); setSearch(''); }
        }}
      >
        <span className={value ? 'text-[#1A1A1A] truncate' : 'text-gray-400 truncate'}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && !disabled && !hideClear && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="text-gray-400 hover:text-[#1A1A1A] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {dropdown}
    </div>
  );
}
