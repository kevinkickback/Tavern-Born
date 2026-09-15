import { CopySimple, DownloadSimple, Trash, Upload } from '@phosphor-icons/react'
import { memo } from 'react'
import { CharacterCardFrame } from '@/components/character/CharacterCardFrame'
import { CharacterReadinessBadge } from '@/components/character/CharacterReadinessBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { cn } from '@/lib/utils'
import type { Character } from '@/types/character'

interface CharacterCardProps {
  character: Character
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  onExport: (character: Character) => void
  onDuplicate: (character: Character) => void
  onExportTemplate: (character: Character) => void
  isActive?: boolean
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
  cardSize?: number
}

export const CharacterCard = memo(function CharacterCard({
  character,
  onLoad,
  onDelete,
  onExport,
  onDuplicate,
  onExportTemplate,
  isActive = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  cardSize = 340,
}: CharacterCardProps) {
  const isSmall = cardSize <= 300
  const isMedium = cardSize > 300 && cardSize <= 380
  const actionButtonClass = isSmall
    ? 'h-8 min-w-10 px-2.5'
    : isMedium
      ? 'h-9 min-w-11 px-3'
      : 'h-10 min-w-12 px-3.5'
  const actionIconClass = isSmall ? 'size-4' : 'size-5'

  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect?.(character.id)
    } else {
      onLoad(character.id)
    }
  }

  return (
    <Card
      className={cn(
        'group relative aspect-[3/2] cursor-pointer overflow-hidden border transition-colors hover:border-accent',
        isActive && 'border-2 border-accent',
        isSelected && 'ring-2 ring-primary/50',
      )}
      onClick={handleCardClick}
    >
      <CharacterCardFrame
        image={character.portrait}
        imageAlt={`${character.name || 'Character'} portrait`}
        name={character.name}
        level={getTotalCharacterLevel(character)}
        race={character.race}
        characterClass={character.class}
        lastModified={character.lastModified}
        transform={character.portraitTransform}
        cardSize={cardSize}
        actions={
          !selectionMode ? (
            <div className={cn('flex', isSmall ? 'gap-2' : 'gap-3')}>
              <Button
                variant="outline"
                size="default"
                aria-label={`Duplicate ${character.name || 'character'}`}
                className={cn(actionButtonClass, 'bg-background/55 backdrop-blur-sm')}
                onClick={(event) => {
                  event.stopPropagation()
                  onDuplicate(character)
                }}
              >
                <CopySimple className={actionIconClass} />
              </Button>
              <Button
                variant="outline"
                size="default"
                aria-label={`Export ${character.name || 'character'} as template`}
                className={cn(actionButtonClass, 'bg-background/55 backdrop-blur-sm')}
                onClick={(event) => {
                  event.stopPropagation()
                  onExportTemplate(character)
                }}
              >
                <DownloadSimple className={actionIconClass} />
              </Button>
              <Button
                variant="outline"
                size="default"
                aria-label={`Export ${character.name || 'character'}`}
                className={cn(actionButtonClass, 'bg-background/55 backdrop-blur-sm')}
                onClick={(event) => {
                  event.stopPropagation()
                  onExport(character)
                }}
              >
                <Upload className={actionIconClass} />
              </Button>
              <Button
                variant="destructive"
                size="default"
                aria-label={`Delete ${character.name || 'character'}`}
                className={actionButtonClass}
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(character.id)
                }}
              >
                <Trash className={actionIconClass} />
              </Button>
            </div>
          ) : undefined
        }
      />

      {isActive && (
        <CharacterReadinessBadge
          character={character}
          className="pointer-events-none absolute left-3 top-3 z-10 shadow-sm"
        />
      )}

      {selectionMode && (
        <div className="absolute left-3 top-3 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect?.(character.id)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${character.name || 'character'}`}
            className="border-white shadow-md"
          />
        </div>
      )}
    </Card>
  )
})
