import { Clock, Crown, Sword, Trash, Upload, User } from '@phosphor-icons/react'
import { memo } from 'react'
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
  isActive = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  cardSize = 340,
}: CharacterCardProps) {
  const sizeVariant = cardSize <= 300 ? 'small' : cardSize <= 380 ? 'medium' : 'large'
  const isSmall = sizeVariant === 'small'
  const isMedium = sizeVariant === 'medium'

  const rightPanelWidth = isSmall ? 'w-[69%]' : isMedium ? 'w-[63%]' : 'w-[56%]'
  const shellPadding = isSmall ? 'p-2.5' : isMedium ? 'p-3.5' : 'p-4'
  const _titleGap = isSmall ? 'gap-1.5' : 'gap-2'
  const titleClass = isSmall ? 'text-[0.95rem]' : isMedium ? 'text-[1.15rem]' : 'text-[1.45rem]'
  const detailsGap = isSmall ? 'gap-1' : isMedium ? 'gap-1.5' : 'gap-2'
  const detailText = isSmall ? 'text-[0.9rem]' : isMedium ? 'text-[0.95rem]' : 'text-[1.02rem]'
  const actionButtonClass = isSmall
    ? 'h-8 min-w-10 px-2.5'
    : isMedium
      ? 'h-9 min-w-11 px-3'
      : 'h-10 min-w-12 px-3.5'
  const actionIconClass = isSmall ? 'size-4' : 'size-5'
  const footerTextClass = isSmall ? 'text-[9px]' : isMedium ? 'text-[10px]' : 'text-xs'
  const portraitTransform = character.portraitTransform
  const portraitZoom = (portraitTransform?.zoom ?? 100) / 100
  const portraitPanX = portraitTransform?.panX ?? 0
  const portraitPanY = portraitTransform?.panY ?? 0
  const portraitRotation = portraitTransform?.rotation ?? 0

  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect?.(character.id)
      return
    }

    onLoad(character.id)
  }

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation()
    onExport(character)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(character.id)
  }

  return (
    <Card
      className={`group relative aspect-[3/2] cursor-pointer overflow-hidden border transition-colors hover:border-accent ${isActive ? 'border-accent border-2' : ''} ${isSelected ? 'ring-2 ring-primary/50' : ''}`}
      onClick={handleCardClick}
    >
      {character.portrait ? (
        <img
          src={character.portrait}
          alt={`${character.name || 'Character'} portrait`}
          className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full max-w-none select-none object-contain"
          style={{
            transform: `translate(calc(-50% + ${portraitPanX - 92}px), calc(-50% + ${portraitPanY}px)) scale(${portraitZoom}) rotate(${portraitRotation}deg)`,
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

      {selectionMode && (
        <div className="absolute top-3 left-3 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect?.(character.id)}
            aria-label={`Select ${character.name || 'character'}`}
            className="border-white shadow-md"
          />
        </div>
      )}

      <div
        className={cn(
          'absolute inset-y-0 right-0 z-[1] flex flex-col items-end text-right',
          rightPanelWidth,
          shellPadding,
        )}
      >
        <div className="flex w-full justify-end">
          <div className="ml-auto flex max-w-full flex-col items-end">
            <div className="flex min-w-0 flex-col items-end">
              <h3
                className={cn(
                  'max-w-full whitespace-normal break-normal [overflow-wrap:normal] hyphens-none text-right font-display font-bold leading-tight text-foreground',
                  titleClass,
                )}
              >
                {character.name || 'Unnamed Character'}
              </h3>
            </div>
          </div>
        </div>

        <div className={cn('mt-auto flex w-full flex-col items-end', isSmall ? 'gap-2' : 'gap-3')}>
          <div className={cn('flex flex-col items-end', detailsGap, detailText)}>
            <div className="flex items-center gap-2 text-foreground/90">
              <span className="font-semibold">Level {getTotalCharacterLevel(character)}</span>
              <Crown
                className={cn('text-accent-foreground', isSmall ? 'size-3.5' : 'size-4')}
                weight="fill"
              />
            </div>
            {character.race && (
              <div className="flex items-center gap-2 text-foreground/90">
                <span className="font-medium">{character.race}</span>
                <User
                  className={cn('text-accent-foreground', isSmall ? 'size-3.5' : 'size-4')}
                  weight="fill"
                />
              </div>
            )}
            {character.class && (
              <div className="flex items-center gap-2 text-foreground/90">
                <span className="font-medium">{character.class}</span>
                <Sword
                  className={cn('text-accent-foreground', isSmall ? 'size-3.5' : 'size-4')}
                  weight="fill"
                />
              </div>
            )}
          </div>

          {!selectionMode && (
            <div className={cn('flex', isSmall ? 'gap-2' : 'gap-3')}>
              <Button
                variant="outline"
                size="default"
                className={cn(actionButtonClass, 'bg-background/55 backdrop-blur-sm')}
                onClick={handleExport}
              >
                <Upload className={actionIconClass} />
              </Button>
              <Button
                variant="destructive"
                size="default"
                className={actionButtonClass}
                onClick={handleDelete}
              >
                <Trash className={actionIconClass} />
              </Button>
            </div>
          )}

          <span
            className={cn(
              'flex max-w-full items-center gap-1 text-muted-foreground italic whitespace-nowrap',
              footerTextClass,
            )}
          >
            <Clock size={isSmall ? 10 : 12} />
            Last modified: {new Date(character.lastModified).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Card>
  )
})
