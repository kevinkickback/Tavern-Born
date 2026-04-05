import { Images, Upload, User } from '@phosphor-icons/react';
import { useId, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { StepProps } from '../types';

const PLACEHOLDER_PORTRAITS = [
  '/assets/images/characters/placeholder_char_card.jpg',
  '/assets/images/characters/placeholder_char_card0.jpg',
  '/assets/images/characters/placeholder_char_card2.jpg',
  '/assets/images/characters/placeholder_char_card3.jpg',
  '/assets/images/characters/placeholder_char_card4.jpg',
  '/assets/images/characters/placeholder_char_card5.jpg',
  '/assets/images/characters/placeholder_char_card6.jpg',
  '/assets/images/characters/placeholder_char_card7.jpg',
  '/assets/images/characters/placeholder_char_card8.jpg',
  '/assets/images/characters/placeholder_char_card9.jpg',
  '/assets/images/characters/placeholder_char_card10.jpg',
  '/assets/images/characters/placeholder_char_card11.jpg',
];

export function BasicsStep({
  data,
  onChange,
  invalidFields = new Set(),
}: StepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const characterNameId = useId();
  const genderId = useId();

  const hasError = (field: string) => invalidFields.has(field);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      onChange({ portrait: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="grid grid-cols-2 gap-4 shrink-0">
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <Label
            htmlFor={characterNameId}
            className="flex items-center gap-2 mb-2"
          >
            <User className="h-4 w-4" />
            Character Name
          </Label>
          <Input
            id={characterNameId}
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Enter character name"
            className={cn(
              'text-lg',
              hasError('name') &&
                'border-destructive focus-visible:ring-destructive animate-shake',
            )}
          />
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <Label htmlFor={genderId} className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4" />
            Gender
          </Label>
          <Select
            value={data.gender}
            onValueChange={(value) => onChange({ gender: value })}
          >
            <SelectTrigger id={genderId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Non-binary">Non-binary</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border bg-muted/20 p-4">
        <Label className="flex items-center gap-2 mb-3">
          <Images className="h-4 w-4" />
          Portrait
        </Label>
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="w-1/3 shrink-0 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center aspect-[2/3] max-h-full">
            {data.portrait ? (
              <img
                src={data.portrait}
                alt="Selected portrait"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <User className="h-10 w-10 opacity-40" />
                <span className="text-xs">No portrait</span>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative aspect-square rounded-lg border-2 border-dashed border-border hover:border-accent/60 transition-all flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-accent"
              >
                <Upload className="h-5 w-5" />
                <span className="text-[10px] leading-tight">Upload</span>
              </button>

              {PLACEHOLDER_PORTRAITS.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => onChange({ portrait: url })}
                  className={cn(
                    'relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105',
                    data.portrait === url
                      ? 'border-accent ring-2 ring-accent/50'
                      : 'border-border hover:border-accent/50',
                  )}
                >
                  <img
                    src={url}
                    alt={`Portrait ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
    </div>
  );
}
