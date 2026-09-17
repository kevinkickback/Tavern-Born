import { Trash, Upload } from '@phosphor-icons/react'
import { CharacterCardFrame } from '@/components/character/CharacterCardFrame'
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
  className,
}: PortraitCardPreviewProps) {
  return (
    <div className={cn('w-full', className)}>
      <div className="group relative aspect-[3/2] w-full overflow-hidden rounded-lg border border-border bg-background">
        <CharacterCardFrame
          image={image}
          imageAlt="Character portrait card preview"
          name={name}
          level={level}
          race={race}
          characterClass={characterClass}
          gender={gender}
          lastModified={lastModified}
          transform={transform}
          portraitTransition
          actions={
            typeof level === 'number' ? (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="default"
                  className="h-9 min-w-11 bg-background/55 px-3 backdrop-blur-sm"
                  disabled
                >
                  <Upload className="size-5" />
                </Button>
                <Button variant="destructive" size="default" className="h-9 min-w-11 px-3" disabled>
                  <Trash className="size-5" />
                </Button>
              </div>
            ) : undefined
          }
        />
      </div>
    </div>
  )
}
