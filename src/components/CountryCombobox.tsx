import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { ALL_COUNTRIES } from '@/lib/constants';

interface Props {
  value: string;           // country name (e.g. "Pakistan")
  onChange: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Compact mode: smaller trigger for inline table use */
  compact?: boolean;
  /** Hide the clear (×) button */
  hideClear?: boolean;
}

export function CountryCombobox({
  value,
  onChange,
  placeholder = 'Search and select country...',
  disabled,
  className,
  compact = false,
  hideClear = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = ALL_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const triggerBase = compact
    ? 'flex items-center justify-between gap-2 px-3 py-1.5 border rounded-lg text-sm outline-none min-w-[150px]'
    : 'flex items-center justify-between w-full px-3 py-2.5 border rounded-lg text-sm h-11 outline-none';

  const triggerState = disabled
    ? 'bg-[#F5F0E8] border-[#D4CFC7] text-[#4A4A4A] cursor-not-allowed'
    : 'bg-white border-gray-200 cursor-pointer hover:border-[#2D5A45] focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45] transition-colors';

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <div
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

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 border border-gray-200 rounded-md">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search country..."
                className="flex-1 text-sm outline-none bg-transparent text-[#1A1A1A] placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No countries found</p>
            ) : (
              filtered.map(c => {
                const isSelected = value === c.name;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { onChange(c.name); setOpen(false); setSearch(''); }}
                    className={[
                      'w-full flex items-center justify-between text-left px-3 py-2 text-sm rounded-md mx-1 my-0.5 cursor-pointer transition-colors',
                      'w-[calc(100%-8px)]',
                      isSelected
                        ? 'bg-[#D6E4D9] text-[#2D5A45] font-medium'
                        : 'text-gray-700 hover:bg-[#D6E4D9] hover:text-[#2D5A45]',
                    ].join(' ')}
                  >
                    <span>{c.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
