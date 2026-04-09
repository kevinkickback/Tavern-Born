import { Crop, Images, Upload, User } from '@phosphor-icons/react';
import { useId, useRef } from 'react';
import { PortraitCardPreview } from '@/components/character/PortraitCardPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  DEFAULT_PORTRAIT_TRANSFORM,
  PLACEHOLDER_PORTRAITS,
} from '@/lib/portraitConstants';
import { cn } from '@/lib/utils';
import type { StepProps } from '../types';

export function BasicsStep({
  data,
  onChange,
  invalidFields = new Set(),
}: StepProps) {
  const defaultTransform = DEFAULT_PORTRAIT_TRANSFORM;
  const portraitTransform = data.portraitTransform ?? defaultTransform;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const characterNameId = useId();
  const playerNameId = useId();
  const ageId = useId();
  const genderId = useId();

  const hasError = (field: string) => invalidFields.has(field);

  const applyPortraitTransform = (
    updates: Partial<typeof portraitTransform>,
  ) => {
    onChange({
      portraitTransform: {
        ...portraitTransform,
        ...updates,
      },
    });
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      onChange({
        portrait: reader.result as string,
        portraitTransform: { ...defaultTransform },
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 shrink-0">
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
          <Label
            htmlFor={playerNameId}
            className="flex items-center gap-2 mb-2"
          >
            <User className="h-4 w-4" />
            Player Name
          </Label>
          <Input
            id={playerNameId}
            value={data.playerName}
            onChange={(e) => onChange({ playerName: e.target.value })}
            placeholder="Enter player name"
          />
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <Label htmlFor={ageId} className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4" />
            Age
          </Label>
          <Input
            id={ageId}
            type="number"
            min={0}
            step={1}
            value={data.age ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                onChange({ age: null });
                return;
              }
              const parsed = Number.parseInt(raw, 10);
              if (Number.isNaN(parsed)) {
                return;
              }
              onChange({ age: Math.max(0, parsed) });
            }}
            placeholder="Enter age"
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

      <div className="flex flex-col rounded-lg border border-border bg-muted/20 p-4">
        <Label className="flex items-center gap-2 mb-3">
          <Images className="h-4 w-4" />
          Portrait
        </Label>
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="w-full xl:w-[42%] shrink-0 flex flex-col gap-3">
            <PortraitCardPreview
              image={data.portrait}
              name={data.name}
              level={1}
              race="Race"
              characterClass="Class"
              gender={data.gender}
              lastModified={new Date().toISOString()}
              transform={portraitTransform}
              className="mx-auto max-w-xl xl:max-w-none"
            />

            <div className="rounded-lg border border-border bg-card/60 p-3">
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Crop className="h-3.5 w-3.5" />
                Image Adjust
              </Label>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-12 shrink-0 text-muted-foreground">
                    Zoom
                  </span>
                  <Slider
                    className="flex-1"
                    value={[portraitTransform.zoom]}
                    onValueChange={(value) =>
                      applyPortraitTransform({ zoom: value[0] })
                    }
                    min={50}
                    max={400}
                    step={5}
                    disabled={!data.portrait}
                  />
                  <span className="w-14 shrink-0 text-right font-medium">
                    {portraitTransform.zoom}%
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="w-12 shrink-0 text-muted-foreground">
                    Pan X
                  </span>
                  <Slider
                    className="flex-1"
                    value={[portraitTransform.panX]}
                    onValueChange={(value) =>
                      applyPortraitTransform({ panX: value[0] })
                    }
                    min={-240}
                    max={240}
                    step={5}
                    disabled={!data.portrait}
                  />
                  <span className="w-14 shrink-0 text-right font-medium">
                    {portraitTransform.panX}px
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="w-12 shrink-0 text-muted-foreground">
                    Pan Y
                  </span>
                  <Slider
                    className="flex-1"
                    value={[portraitTransform.panY]}
                    onValueChange={(value) =>
                      applyPortraitTransform({ panY: value[0] })
                    }
                    min={-240}
                    max={240}
                    step={5}
                    disabled={!data.portrait}
                  />
                  <span className="w-14 shrink-0 text-right font-medium">
                    {portraitTransform.panY}px
                  </span>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={!data.portrait}
                  onClick={() =>
                    applyPortraitTransform({ ...defaultTransform })
                  }
                >
                  Reset View
                </Button>
              </div>
            </div>
          </div>

          <div className="w-full xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 p-2">
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
                  onClick={() =>
                    onChange({
                      portrait: url,
                      portraitTransform: { ...defaultTransform },
                    })
                  }
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
