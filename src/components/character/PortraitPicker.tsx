import { Crop, Image, Images, Upload, X } from '@phosphor-icons/react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { PortraitCardPreview } from '@/components/character/PortraitCardPreview'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-stretch">
      {/* Left col: Card Preview + Image Controls */}
      <div className="w-full lg:w-[42%]">
        {/* ── Card Preview + Image Controls ── */}
        <Card className="w-full overflow-hidden">
          <div className="h-10 bg-gradient-to-r from-indigo-500/20 via-indigo-500/10 to-transparent border-b border-border/40 flex items-center gap-3 px-4 shrink-0">
            <Image className="h-4 w-4 text-indigo-600 dark:text-indigo-400" weight="duotone" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Card Preview
            </span>
          </div>
          <div className="p-4 space-y-4">
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

            {/* Image Controls — inline below preview */}
            <div className="border-t border-border/40 pt-3 space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Crop className="h-3.5 w-3.5" weight="duotone" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Image Controls
                </span>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-10 shrink-0">Zoom</span>
                  <Slider
                    value={[t.zoom]}
                    onValueChange={(value) => handleTransformChange({ zoom: value[0] })}
                    min={50}
                    max={400}
                    step={5}
                    disabled={!portrait}
                    className="flex-1"
                  />
                  <span className="text-xs font-medium tabular-nums w-10 text-right shrink-0">
                    {t.zoom}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-10 shrink-0">Pan X</span>
                  <Slider
                    value={[t.panX]}
                    onValueChange={(value) => handleTransformChange({ panX: value[0] })}
                    min={-240}
                    max={240}
                    step={5}
                    disabled={!portrait}
                    className="flex-1"
                  />
                  <span className="text-xs font-medium tabular-nums w-10 text-right shrink-0">
                    {t.panX}px
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-10 shrink-0">Pan Y</span>
                  <Slider
                    value={[t.panY]}
                    onValueChange={(value) => handleTransformChange({ panY: value[0] })}
                    min={-240}
                    max={240}
                    step={5}
                    disabled={!portrait}
                    className="flex-1"
                  />
                  <span className="text-xs font-medium tabular-nums w-10 text-right shrink-0">
                    {t.panY}px
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onTransformChange(DEFAULT_PORTRAIT_TRANSFORM)}
                disabled={!portrait}
                className="w-full h-7 text-xs"
              >
                Reset View
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Right col: Select Portrait */}
      <div className="w-full lg:w-[58%] lg:flex lg:flex-col">
        <Card className="w-full overflow-hidden lg:flex lg:flex-col lg:flex-1">
          <div className="h-10 bg-gradient-to-r from-violet-500/20 via-violet-500/10 to-transparent border-b border-border/40 flex items-center gap-3 px-4 shrink-0">
            <Images className="h-4 w-4 text-violet-600 dark:text-violet-400" weight="duotone" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Select Portrait
            </span>
          </div>
          <div className="p-4 flex flex-col flex-1 gap-4">
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 flex-1 content-start">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative aspect-square rounded-lg border-2 border-dashed border-border hover:border-accent/60 transition-all flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-accent-foreground"
              >
                <Upload className="h-5 w-5" />
                <span className="text-xs leading-tight">Upload</span>
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
        </Card>
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
