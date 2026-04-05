import type { ReactNode } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface RichTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  label?: ReactNode;
  helpText?: string;
  id?: string;
}

export function RichTextArea({
  value,
  onChange,
  placeholder,
  rows = 6,
  label,
  helpText,
  id,
}: RichTextAreaProps) {
  return (
    <div className="space-y-2">
      {label && (
        <div>
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
        </div>
      )}

      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="resize-none font-mono text-sm"
      />

      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
