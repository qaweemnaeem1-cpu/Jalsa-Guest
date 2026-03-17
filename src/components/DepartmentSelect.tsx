import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useDepartments } from '@/hooks/useDepartments';
import { cn } from '@/lib/utils';

const DEPT_DOT_CLS: Record<string, string> = {
  'Reserve 1 (R1)': 'bg-blue-500',
  'UK Jamaat':       'bg-purple-500',
  'Central Guests':  'bg-teal-500',
};

interface DepartmentSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  includeNone?: boolean;
  disabled?: boolean;
  stopPropagation?: boolean;
}

export function DepartmentSelect({
  value,
  onValueChange,
  placeholder,
  className,
  includeNone = false,
  disabled,
  stopPropagation,
}: DepartmentSelectProps) {
  const { departmentList } = useDepartments();

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        onClick={e => { if (stopPropagation) e.stopPropagation(); }}
        className={cn(
          'bg-white border-gray-200 rounded-lg text-sm hover:border-[#2D5A45] transition-colors focus:ring-[#2D5A45] focus:border-[#2D5A45] h-auto py-1.5',
          className
        )}
      >
        <SelectValue placeholder={
          <span className="text-gray-400">{placeholder ?? 'Select Department...'}</span>
        } />
      </SelectTrigger>
      <SelectContent className="rounded-lg shadow-lg border border-gray-200">
        {includeNone && (
          <SelectItem value="__none__" className="px-3 py-2 hover:bg-[#D6E4D9] hover:text-[#2D5A45] cursor-pointer rounded-md mx-1 focus:bg-[#D6E4D9] focus:text-[#2D5A45]">
            <span className="text-gray-400">None</span>
          </SelectItem>
        )}
        {departmentList.map(dept => (
          <SelectItem
            key={dept}
            value={dept}
            className="px-3 py-2 hover:bg-[#D6E4D9] hover:text-[#2D5A45] cursor-pointer rounded-md mx-1 focus:bg-[#D6E4D9] focus:text-[#2D5A45] data-[state=checked]:bg-[#D6E4D9] data-[state=checked]:text-[#2D5A45] data-[state=checked]:font-medium"
          >
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${DEPT_DOT_CLS[dept] ?? 'bg-gray-400'}`} />
              {dept}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
