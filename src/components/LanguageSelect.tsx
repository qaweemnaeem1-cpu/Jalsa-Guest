import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export const LANG_DOT_CLS: Record<string, string> = {
  'English': 'bg-blue-500',
  'Spanish': 'bg-orange-500',
  'French':  'bg-indigo-500',
  'Arabic':  'bg-emerald-500',
  'German':  'bg-red-500',
};

interface LanguageSelectProps {
  value: string | null | undefined;
  onValueChange: (v: string) => void;
  languages: string[];
  className?: string;
  stopPropagation?: boolean;
}

export function LanguageSelect({
  value,
  onValueChange,
  languages,
  className,
  stopPropagation,
}: LanguageSelectProps) {
  // Use a sentinel for "clear" since shadcn Select doesn't support empty string as a selectable value
  const selectValue = value || '';

  return (
    <Select
      value={selectValue}
      onValueChange={v => onValueChange(v === '__clear__' ? '' : v)}
    >
      <SelectTrigger
        onClick={e => { if (stopPropagation) e.stopPropagation(); }}
        className={cn(
          'bg-white border-gray-200 rounded-lg text-sm hover:border-[#2D5A45] transition-colors focus:ring-[#2D5A45] focus:border-[#2D5A45] h-auto py-1.5',
          className
        )}
      >
        <SelectValue placeholder={<span className="text-gray-400">Language...</span>} />
      </SelectTrigger>
      <SelectContent className="rounded-lg shadow-lg border border-gray-200">
        <SelectItem
          value="__clear__"
          className="px-3 py-2 hover:bg-[#D6E4D9] hover:text-[#2D5A45] cursor-pointer rounded-md mx-1 focus:bg-[#D6E4D9] focus:text-[#2D5A45]"
        >
          <span className="text-gray-400 italic">Not set</span>
        </SelectItem>
        {languages.map(lang => (
          <SelectItem
            key={lang}
            value={lang}
            className="px-3 py-2 hover:bg-[#D6E4D9] hover:text-[#2D5A45] cursor-pointer rounded-md mx-1 focus:bg-[#D6E4D9] focus:text-[#2D5A45] data-[state=checked]:bg-[#D6E4D9] data-[state=checked]:text-[#2D5A45] data-[state=checked]:font-medium"
          >
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${LANG_DOT_CLS[lang] ?? 'bg-gray-500'}`} />
              {lang}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
