import { CopySimple, DownloadSimple, Trash } from '@phosphor-icons/react'
import { type MouseEvent, memo } from 'react'
import { AdditionalContentBadge } from '@/components/character/AdditionalContentBadge'
import { CharacterCardFrame } from '@/components/character/CharacterCardFrame'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import { getRaceDisplayName } from '@/lib/calculations/raceDisplay'
import { getCharacterClassEntries, getTotalCharacterLevel } from '@/lib/characterUtils'
import { cn } from '@/lib/utils'
import type { Character } from '@/types/character'

interface CharacterCardProps {
  character: Character
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  onExport: (character: Character) => void
  onDuplicate: (character: Character) => void
  isActive?: boolean
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
  highlighted?: boolean
  usesAdditionalContent?: boolean
  isLibraryPending?: boolean
}

export const CharacterCard = memo(function CharacterCard({
  character,
  onLoad,
  onDelete,
  onExport,
  onDuplicate,
  isActive = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  highlighted = false,
  usesAdditionalContent = false,
  isLibraryPending = false,
}: CharacterCardProps) {
  const { ref: routeFocusRef, highlighted: routeFocusHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(highlighted)
  const actionButtonClass = 'size-auto aspect-square w-full p-0'

  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest('[data-slot="character-card-actions"]')
    ) {
      return
    }
    if (selectionMode) {
      if (isLibraryPending) return
      onToggleSelect?.(character.id)
    } else {
      onLoad(character.id)
    }
  }

  return (
    <Card
      ref={routeFocusRef}
      className={cn(
        '@container group/card relative aspect-[3/2] cursor-pointer overflow-hidden border transition-colors hover:border-accent',
        isActive && 'border-2 border-accent',
        isSelected && 'ring-2 ring-primary/50',
        routeFocusHighlighted && 'animate-route-focus',
      )}
      onClick={handleCardClick}
    >
      <CharacterCardFrame
        image={character.portrait}
        imageAlt={`${character.name || 'Character'} portrait`}
        name={character.name}
        level={getTotalCharacterLevel(character)}
        race={getRaceDisplayName(character.race, character.subrace)}
        classes={getCharacterClassEntries(character)}
        originSystem={character.originSystem}
        lastModified={character.lastModified}
        transform={character.portraitTransform}
        statusBadge={!selectionMode && usesAdditionalContent && <AdditionalContentBadge />}
        selectionControl={
          selectionMode && (
            <Checkbox
              disabled={isLibraryPending}
              checked={isSelected}
              onCheckedChange={() => onToggleSelect?.(character.id)}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Select ${character.name || 'character'}`}
              className="border-white shadow-md"
            />
          )
        }
      />

      {!selectionMode && (
        <TooltipProvider delayDuration={300}>
          <div
            data-slot="character-card-actions"
            className={cn(
              'absolute bottom-3 left-3 z-10 grid w-[6.75rem] max-w-[calc(36%-0.75rem)] grid-cols-3 gap-1 motion-safe:transition-opacity',
              '[@media(hover:hover)_and_(not_(any-pointer:coarse))]:group-[&:not(:hover):not(:focus-within)]/card:pointer-events-none',
              '[@media(hover:hover)_and_(not_(any-pointer:coarse))]:group-[&:not(:hover):not(:focus-within)]/card:opacity-0',
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Duplicate ${character.name || 'character'}`}
                  disabled={isLibraryPending}
                  className={cn(actionButtonClass, 'bg-background/55 backdrop-blur-sm')}
                  onClick={() => onDuplicate(character)}
                >
                  <CopySimple />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Duplicate character</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Export ${character.name || 'character'}`}
                  className={cn(actionButtonClass, 'bg-background/55 backdrop-blur-sm')}
                  onClick={() => onExport(character)}
                >
                  <DownloadSimple />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export character</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  aria-label={`Delete ${character.name || 'character'}`}
                  disabled={isLibraryPending}
                  className={actionButtonClass}
                  onClick={() => onDelete(character.id)}
                >
                  <Trash />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete character</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      )}
    </Card>
  )
})
