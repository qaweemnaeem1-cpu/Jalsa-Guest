import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export function sortData<T extends Record<string, unknown>>(
  data: T[],
  col: string | null,
  dir: 'asc' | 'desc',
): T[] {
  if (!col) return data;
  return [...data].sort((a, b) => {
    const va = String(a[col] ?? '').toLowerCase();
    const vb = String(b[col] ?? '').toLowerCase();
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

interface SortableHeaderProps {
  label: string;
  column: string;
  sortCol: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (col: string) => void;
  className?: string;
}

export function SortableHeader({
  label,
  column,
  sortCol,
  sortDir,
  onSort,
  className = '',
}: SortableHeaderProps) {
  const isActive = sortCol === column;

  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors whitespace-nowrap ${
        isActive ? 'text-[#2D5A45]' : 'text-gray-500 hover:text-gray-700'
      } ${className}`}
      onClick={() => onSort(column)}
    >
      <span className="flex items-center gap-1">
        {label}
        {isActive ? (
          sortDir === 'asc' ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-40" />
        )}
      </span>
    </th>
  );
}
