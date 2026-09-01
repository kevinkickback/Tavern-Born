import { Crop, Image, Images, Upload, X } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { PortraitCardPreview } from '@/components/character/PortraitCardPreview'
import { Button } from '@/components/ui/button'
import { SplitPane } from '@/components/ui/SplitPane'
import { Slider } from '@/components/ui/slider'
import { WorkspacePaneHeader } from '@/components/workspace'
import { MAX_PORTRAIT_SIZE } from '@/lib/calculations/gameRules'
import {
  DEFAULT_PORTRAIT_TRANSFORM,
  PLACEHOLDER_PORTRAITS,
  resolvePortraitSrc,
} from '@/lib/portraitConstants'
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
  density?: 'default' | 'compact'
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
  density = 'default',
}: PortraitPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  const [libraryCollapsed, setLibraryCollapsed] = useState(false)
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
    <>
      <SplitPane
        className={cn(
          'my-0 h-full overflow-visible',
          !previewCollapsed && !libraryCollapsed && 'gap-3',
        )}
        leftClassName={cn(
          'rounded-lg bg-workspace-detail',
          previewCollapsed ? 'border-0' : 'border border-border',
        )}
        rightClassName={cn(
          'rounded-lg bg-workspace-pane',
          libraryCollapsed ? 'border-0' : 'border border-border',
        )}
        leftWidth="var(--workspace-master-width)"
        leftCollapsed={previewCollapsed}
        rightCollapsed={libraryCollapsed}
        onLeftCollapsedChange={setPreviewCollapsed}
        onRightCollapsedChange={setLibraryCollapsed}
        left={
          <section className="flex h-full w-full flex-col overflow-hidden">
            <WorkspacePaneHeader
              title="Card preview"
              icon={<Image className="size-4 text-primary" weight="duotone" />}
              className="pr-20"
            />
            <div className="space-y-4 p-4">
              <div className="rounded-lg border border-border bg-workspace-pane p-2 sm:p-3">
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
              <div className="space-y-3 border-t border-border pt-3">
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
                  className="h-8 w-full text-xs"
                >
                  Reset View
                </Button>
              </div>
            </div>
          </section>
        }
        right={
          <section className="flex h-full w-full flex-col overflow-hidden">
            <WorkspacePaneHeader
              title="Portrait library"
              icon={<Images className="size-4 text-primary" weight="duotone" />}
              className="pr-20"
            />
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                density === 'compact' ? 'gap-3 p-3' : 'gap-4 p-4',
              )}
            >
              <div
                className={cn(
                  'grid flex-1 content-start overflow-y-auto pr-1',
                  density === 'compact'
                    ? 'grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2'
                    : 'grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3',
                )}
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-accent/60 hover:bg-surface-hover hover:text-accent-foreground"
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-xs leading-tight">Upload</span>
                </button>

                {PLACEHOLDER_PORTRAITS.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => handlePlaceholder(src)}
                    aria-pressed={Boolean(portrait && resolvePortraitSrc(portrait) === src)}
                    className={cn(
                      'relative aspect-square cursor-pointer overflow-hidden rounded-lg border transition-colors',
                      portrait && resolvePortraitSrc(portrait) === src
                        ? 'border-accent bg-surface-selected ring-1 ring-accent/50'
                        : 'border-border hover:border-accent/50 hover:bg-surface-hover',
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
          </section>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
    </>
  )
}
