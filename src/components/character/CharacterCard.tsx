import { memo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Upload, Trash, Clock, User, Crown, Sword } from '@phosphor-icons/react'
import { Character } from '@/types/character'
import { cn } from '@/lib/utils'

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

  const headerOuterPadding = 'px-0 pt-0'
  const headerInnerPadding = isSmall ? 'pl-5 pr-3 pt-3 pb-1' : isMedium ? 'pl-6 pr-4 pt-3 pb-1' : 'pl-7 pr-4 pt-3 pb-1'
  const bodyPadding = isSmall ? 'px-3 pt-14 pb-3' : isMedium ? 'px-3 pt-16 pb-3' : 'px-4 pt-16 pb-3.5'
  const nameClass = isSmall ? 'text-[1rem]' : isMedium ? 'text-[1.1rem]' : 'text-[1.2rem]'
  const detailGap = isSmall ? 'gap-1.5' : 'gap-2'
  const detailTextClass = isSmall ? 'text-[0.9rem]' : 'text-[0.95rem]'
  const iconClass = isSmall ? 'size-3.5' : 'size-4'
  const actionButtonClass = isSmall ? 'h-10 min-w-12 px-3' : isMedium ? 'h-11 min-w-14 px-3.5' : 'h-12 min-w-14 px-4'
  const actionIconClass = isSmall ? 'size-4' : 'size-5'
  const footerTextClass = isSmall ? 'text-[10px]' : 'text-xs'
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

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleSelect?.(character.id)
  }

  return (
    <Card
      className={`group relative aspect-[3/2] cursor-pointer overflow-hidden border bg-card p-0 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_4px_8px_rgba(0,0,0,0.2)] ${isActive ? 'border-accent border-2' : ''} ${isSelected ? 'ring-2 ring-primary/50 shadow-[0_0_12px_rgba(244,63,94,0.25)]' : ''}`}
      onClick={handleCardClick}
    >
      {character.portrait ? (
        <div
          className="absolute inset-y-0 left-[-20%] z-0 w-[90%]"
          style={{
            backgroundImage: `url(${character.portrait})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 30%',
            backgroundRepeat: 'no-repeat',
            WebkitMaskImage:
              'linear-gradient(to right, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.9) 15%, rgba(0, 0, 0, 0.8) 30%, rgba(0, 0, 0, 0.65) 45%, rgba(0, 0, 0, 0.45) 60%, rgba(0, 0, 0, 0.2) 75%, rgba(0, 0, 0, 0) 89%, rgba(0, 0, 0, 0) 100%)',
            maskImage:
              'linear-gradient(to right, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.9) 15%, rgba(0, 0, 0, 0.8) 30%, rgba(0, 0, 0, 0.65) 45%, rgba(0, 0, 0, 0.45) 60%, rgba(0, 0, 0, 0.2) 75%, rgba(0, 0, 0, 0) 89%, rgba(0, 0, 0, 0) 100%)',
          }}
        />
      ) : (
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-muted to-background" />
      )}

      <div className="absolute inset-y-0 left-0 z-0 w-[82%] bg-gradient-to-r from-transparent from-0% via-card/10 via-[24%] to-transparent to-[100%]" />
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent from-[18%] via-card/28 via-[42%] to-card/94 to-[73%]" />

      {selectionMode && (
        <div className="absolute top-3 left-3 z-10" onClick={handleCheckboxClick}>
          <Checkbox checked={isSelected} aria-label={`Select ${character.name || 'character'}`} />
        </div>
      )}

      <div className="relative z-[1] flex h-full flex-col">
        <div className={cn('absolute inset-x-0 top-0 z-[2] flex justify-end', headerOuterPadding)}>
          <div className={cn('flex w-full items-center justify-end gap-2 bg-gradient-to-l from-accent/12 via-accent/8 via-35% to-transparent', headerInnerPadding)}>
            <h3 className={cn('min-w-0 text-right font-display font-semibold leading-tight text-foreground whitespace-nowrap overflow-hidden text-ellipsis', nameClass)}>
              {character.name || 'Unnamed Character'}
            </h3>
            {isActive && (
              <Badge variant="default" className="shrink-0 bg-accent text-accent-foreground shadow-sm">
                Active
              </Badge>
            )}
          </div>
        </div>

        <div className={cn('flex h-full flex-col justify-between items-end text-right', bodyPadding)}>
          <div className={cn('flex w-full flex-col items-end', detailGap, detailTextClass)}>
            <div className="flex items-center gap-2 text-foreground/90 flex-row-reverse">
              <Crown className={cn('text-accent shrink-0', iconClass)} weight="fill" />
              <span className="font-semibold">Level {character.level}</span>
            </div>
            {character.race && (
              <div className="flex items-center gap-2 text-foreground/90 flex-row-reverse">
                <User className={cn('text-accent shrink-0', iconClass)} weight="fill" />
                <span className="font-medium">{character.race}</span>
              </div>
            )}
            {character.class && (
              <div className="flex items-center gap-2 text-foreground/90 flex-row-reverse">
                <Sword className={cn('text-accent shrink-0', iconClass)} weight="fill" />
                <span className="font-medium">{character.class}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {!selectionMode && (
              <div className={cn('flex justify-end', isSmall ? 'gap-2' : 'gap-3')}>
                <Button
                  variant="outline"
                  size="default"
                  className={cn(actionButtonClass, 'border-border bg-background/30 text-foreground hover:bg-background/50')}
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

            <div className={cn('flex items-center gap-1 justify-end text-muted-foreground', footerTextClass)}>
              <Clock size={isSmall ? 10 : 12} className="opacity-70" />
              <span className="italic">Last modified: {new Date(character.lastModified).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
})
