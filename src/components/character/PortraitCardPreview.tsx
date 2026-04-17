import { Clock, Crown, Sword, Trash, Upload, User } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PortraitTransform } from '@/types/character'

interface PortraitCardPreviewProps {
  image?: string | null
  name?: string
  level?: number
  race?: string
  characterClass?: string
  gender?: string
  lastModified?: string
  transform?: PortraitTransform
  className?: string
}

export function PortraitCardPreview({
  image,
  name,
  level,
  race,
  characterClass,
  gender,
  lastModified,
  transform,
  className: containerClassName,
}: PortraitCardPreviewProps) {
  const zoom = (transform?.zoom ?? 100) / 100
  const panX = transform?.panX ?? 0
  const panY = transform?.panY ?? 0
  const rotation = transform?.rotation ?? 0

  return (
    <div className={cn('w-full', containerClassName)}>
      <div className="group relative aspect-[3/2] w-full overflow-hidden rounded-lg border border-border bg-background">
        {image ? (
          <img
            src={image}
            alt="Character portrait card preview"
            className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full max-w-none select-none object-contain"
            style={{
              transform: `translate(calc(-50% + ${panX - 92}px), calc(-50% + ${panY}px)) scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s ease-out',
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-background" />
        )}

        <div className="absolute inset-y-0 right-0 w-[84%] bg-gradient-to-l from-card/98 via-card/75 to-transparent" />
        <div className="absolute inset-y-0 right-0 w-[64%] bg-gradient-to-l from-card/99 via-card/88 to-transparent" />
        <div className="absolute inset-y-0 right-0 w-[30%] bg-gradient-to-l from-card via-card/99 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-[20%] bg-gradient-to-b from-background/60 via-background/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-background/70 via-background/25 to-transparent" />

        <div className="absolute inset-y-0 right-0 z-[1] flex w-[63%] flex-col items-end p-3.5 text-right">
          <div className="ml-auto flex max-w-full flex-col items-end">
            <div className="flex min-w-0 flex-col items-end">
              <h3 className="max-w-full whitespace-normal break-normal [overflow-wrap:normal] hyphens-none text-right font-display text-xl font-bold leading-tight text-foreground">
                {name || 'Unnamed Character'}
              </h3>
            </div>
          </div>

          {typeof level === 'number' ? (
            <div className="mt-auto flex w-full flex-col items-end gap-3 text-sm">
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2 text-foreground/90">
                  <span className="font-semibold">Level {level}</span>
                  <Crown className="size-4 text-accent" weight="fill" />
                </div>
                {race && (
                  <div className="flex items-center gap-2 text-foreground/90">
                    <span className="font-medium">{race}</span>
                    <User className="size-4 text-accent" weight="fill" />
                  </div>
                )}
                {characterClass && (
                  <div className="flex items-center gap-2 text-foreground/90">
                    <span className="font-medium">{characterClass}</span>
                    <Sword className="size-4 text-accent" weight="fill" />
                  </div>
                )}
              </div>

              <div className="flex w-full flex-col items-end gap-3">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="default"
                    className="h-9 min-w-11 px-3 bg-background/55 backdrop-blur-sm"
                    disabled
                  >
                    <Upload className="size-5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="default"
                    className="h-9 min-w-11 px-3"
                    disabled
                  >
                    <Trash className="size-5" />
                  </Button>
                </div>

                {lastModified && (
                  <span className="flex items-center gap-1 whitespace-nowrap text-xs italic text-muted-foreground">
                    <Clock size={12} />
                    Last modified: {new Date(lastModified).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-auto text-xs italic text-muted-foreground">
              {gender || 'Unspecified'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
