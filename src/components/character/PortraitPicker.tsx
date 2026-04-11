import { Crop, Image, Images, Upload, X } from '@phosphor-icons/react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { PortraitCardPreview } from '@/components/character/PortraitCardPreview'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { MAX_PORTRAIT_SIZE } from '@/lib/calculations/gameRules'
import { DEFAULT_PORTRAIT_TRANSFORM, PLACEHOLDER_PORTRAITS } from '@/lib/portraitConstants'
import { cn } from '@/lib/utils'
import type { PortraitTransform } from '@/types/character'

interface PortraitPickerProps {
  portrait?: string | null
  transform?: PortraitTransform
  name?: string
  level?: number
  race?: string
  characterClass?: string
  gender?: string
  lastModified?: string
  onPortraitChange: (portrait: string | null) => void
  onTransformChange: (transform: PortraitTransform) => void
}

export function PortraitPicker({
  portrait,
  transform,
  name,
  level,
  race,
  characterClass,
  gender,
  lastModified,
  onPortraitChange,
  onTransformChange,
}: PortraitPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = transform ?? DEFAULT_PORTRAIT_TRANSFORM

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    if (file.size > MAX_PORTRAIT_SIZE) {
      toast.error('File size must be less than 5MB')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      onPortraitChange(reader.result as string)
      onTransformChange(DEFAULT_PORTRAIT_TRANSFORM)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
    reader.readAsDataURL(file)
  }

  const handleClear = () => {
    onPortraitChange(null)
    onTransformChange(DEFAULT_PORTRAIT_TRANSFORM)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handlePlaceholder = (src: string) => {
    onPortraitChange(src)
    onTransformChange(DEFAULT_PORTRAIT_TRANSFORM)
  }

  const handleTransformChange = (updates: Partial<PortraitTransform>) => {
    onTransformChange({ ...t, ...updates })
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
      {/* Left: preview + image controls always together */}
      <div className="w-full lg:w-1/2 space-y-3">
        <Label className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          Card Preview
        </Label>
        <div className="rounded-xl border-2 border-dashed border-border p-2 sm:p-3">
          <PortraitCardPreview
            image={portrait}
            name={name}
            level={level}
            race={race}
            characterClass={characterClass}
            gender={gender}
            lastModified={lastModified}
            transform={t}
          />
        </div>

        <div className="space-y-3 sm:space-y-4">
          <Label className="flex items-center gap-2">
            <Crop className="h-5 w-5" />
            Image Controls
          </Label>

          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Zoom</span>
                <span className="text-sm font-medium">{t.zoom}%</span>
              </div>
              <Slider
                value={[t.zoom]}
                onValueChange={(value) => handleTransformChange({ zoom: value[0] })}
                min={50}
                max={400}
                step={5}
                disabled={!portrait}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Pan X</span>
                <span className="text-sm font-medium">{t.panX}px</span>
              </div>
              <Slider
                value={[t.panX]}
                onValueChange={(value) => handleTransformChange({ panX: value[0] })}
                min={-240}
                max={240}
                step={5}
                disabled={!portrait}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Pan Y</span>
                <span className="text-sm font-medium">{t.panY}px</span>
              </div>
              <Slider
                value={[t.panY]}
                onValueChange={(value) => handleTransformChange({ panY: value[0] })}
                min={-240}
                max={240}
                step={5}
                disabled={!portrait}
                className="w-full"
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onTransformChange(DEFAULT_PORTRAIT_TRANSFORM)}
              disabled={!portrait}
              className="w-full"
            >
              Reset View
            </Button>
          </div>
        </div>
      </div>

      {/* Right: upload + placeholders */}
      <div className="w-full lg:w-1/2 flex flex-col gap-3 sm:gap-4">
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Images className="h-5 w-5" />
            Select Portrait
          </Label>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 p-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative aspect-square rounded-lg border-2 border-dashed border-border hover:border-accent/60 transition-all flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-accent"
            >
              <Upload className="h-5 w-5" />
              <span className="text-[10px] leading-tight">Upload</span>
            </button>

            {PLACEHOLDER_PORTRAITS.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => handlePlaceholder(src)}
                className={cn(
                  'relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105',
                  portrait === src
                    ? 'border-accent ring-2 ring-accent/50'
                    : 'border-border hover:border-accent/50',
                )}
              >
                <img
                  src={src}
                  alt={`Placeholder ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleClear}
          disabled={!portrait}
          className="w-full"
        >
          <X className="h-4 w-4 mr-2" />
          Clear Portrait
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  )
}
