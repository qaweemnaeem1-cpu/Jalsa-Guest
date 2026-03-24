import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';
import { ALL_COUNTRIES } from '@/lib/constants';

interface Props {
  value: string;           // country name (e.g. "Pakistan")
  onChange: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CountryCombobox({ value, onChange, placeholder = 'Search and select country...', disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = ALL_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <div
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={open}
        className={`flex items-center justify-between w-full px-3 py-2.5 border rounded-md text-sm h-11 outline-none ${
          disabled
            ? 'bg-[#F5F0E8] border-[#D4CFC7] text-[#4A4A4A] cursor-not-allowed'
            : 'bg-white border-[#D4CFC7] cursor-pointer hover:border-[#2D5A45] focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]'
        }`}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); }
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <span className={value ? 'text-[#1A1A1A]' : 'text-[#9A9A9A]'}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="text-[#9A9A9A] hover:text-[#1A1A1A]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-[#4A4A4A] transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E8E3DB] rounded-md shadow-lg">
          <div className="p-2 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-2 px-2 py-1.5 border border-[#D4CFC7] rounded-md">
              <Search className="w-3.5 h-3.5 text-[#9A9A9A] shrink-0" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type to search..."
                className="flex-1 text-sm outline-none bg-transparent text-[#1A1A1A] placeholder:text-[#9A9A9A]"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[#9A9A9A]">No countries found</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { onChange(c.name); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[#F5F0E8] transition-colors ${
                    value === c.name ? 'bg-[#E8F5EE] text-[#2D5A45] font-medium' : 'text-[#1A1A1A]'
                  }`}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
