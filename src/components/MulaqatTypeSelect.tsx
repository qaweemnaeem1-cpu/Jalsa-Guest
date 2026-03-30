import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type MulaqatType = 'No' | 'Delegation' | 'Daftari' | 'Both';

const OPTIONS: { value: MulaqatType; label: string; dotCls: string; textCls: string }[] = [
  { value: 'No',         label: 'No',         dotCls: 'bg-gray-400',   textCls: 'text-gray-500'   },
  { value: 'Delegation', label: 'Delegation',  dotCls: 'bg-green-500',  textCls: 'text-green-700'  },
  { value: 'Daftari',    label: 'Daftari',     dotCls: 'bg-blue-500',   textCls: 'text-blue-700'   },
  { value: 'Both',       label: 'Both',        dotCls: 'bg-purple-500', textCls: 'text-purple-700' },
];

interface Props {
  value: MulaqatType;
  onValueChange: (v: MulaqatType) => void;
  className?: string;
  disabled?: boolean;
  stopPropagation?: boolean;
}

export function MulaqatTypeSelect({ value, onValueChange, className, disabled, stopPropagation }: Props) {
  const selected = OPTIONS.find(o => o.value === value) ?? OPTIONS[0];

  return (
    <Select value={value} onValueChange={v => onValueChange(v as MulaqatType)} disabled={disabled}>
      <SelectTrigger
        onClick={e => { if (stopPropagation) e.stopPropagation(); }}
        className={cn(
          'bg-white border-gray-200 rounded-lg text-sm hover:border-[#2D5A45] transition-colors focus:ring-[#2D5A45] focus:border-[#2D5A45] h-auto py-1.5 min-w-[110px]',
          className,
        )}
      >
        <SelectValue>
          <span className={`flex items-center gap-1.5 ${selected.textCls}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${selected.dotCls}`} />
            {selected.label}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="rounded-lg shadow-lg border border-gray-200">
        {OPTIONS.map(opt => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="px-3 py-2 hover:bg-[#D6E4D9] hover:text-[#2D5A45] cursor-pointer rounded-md mx-1 focus:bg-[#D6E4D9] focus:text-[#2D5A45] data-[state=checked]:bg-[#D6E4D9] data-[state=checked]:font-medium"
          >
            <span className={`flex items-center gap-2 ${opt.textCls}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotCls}`} />
              {opt.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
