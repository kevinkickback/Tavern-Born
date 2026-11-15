import { type MouseEvent, memo } from 'react'
import { AdditionalContentBadge } from '@/components/character/AdditionalContentBadge'
import { CharacterCardActions } from '@/components/character/CharacterCardActions'
import { CharacterCardFrame } from '@/components/character/CharacterCardFrame'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
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
          '@container relative aspect-[3/2] overflow-hidden border motion-safe:transition-colors group-hover/card:border-accent',
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
          race={character.race}
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
          <CharacterCardActions
            name={character.name}
            pending={isLibraryPending}
            actions={{
              duplicate: () => onDuplicate(character),
              export: () => onExport(character),
              delete: () => onDelete(character.id),
            }}
          />
        )}
      </Card>
    </Card>
  )
})
