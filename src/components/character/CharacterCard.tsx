import { CopySimple, DownloadSimple, Trash } from '@phosphor-icons/react'
import { type MouseEvent, memo } from 'react'
import { AdditionalContentBadge } from '@/components/character/AdditionalContentBadge'
import {
  CHARACTER_CARD_REVEAL_CLASS,
  CharacterCardFrame,
} from '@/components/character/CharacterCardFrame'
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
      data-slot="character-card-hit-area"
      className="group/card block cursor-pointer rounded-none border-0 bg-transparent p-0 shadow-none"
      onClick={handleCardClick}
    >
      <Card
        ref={routeFocusRef}
        className={cn(
          '@container relative aspect-[3/2] overflow-hidden border transition-colors group-hover/card:border-accent motion-safe:transition-[border-color,translate] motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover/card:-translate-y-0.5',
          isActive && 'border-2 border-accent',
          isSelected && 'ring-2 ring-primary/50',
          routeFocusHighlighted && 'animate-route-focus',
        )}
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
                'absolute bottom-3 left-2.5 z-10 grid w-[7.125rem] max-w-[calc(36%-0.625rem)] grid-cols-3 gap-[3px]',
                CHARACTER_CARD_REVEAL_CLASS,
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
                    <CopySimple className="size-[18px]" />
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
                    <DownloadSimple className="size-[18px]" />
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
                    <Trash className="size-[18px]" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete character</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )}
      </Card>
    </Card>
  )
})
