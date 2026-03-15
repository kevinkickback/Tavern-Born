import { memo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, Trash, Crown, Clock } from '@phosphor-icons/react'
import { Character } from '@/types/character'

interface CharacterCardProps {
  character: Character
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  onExport: (character: Character) => void
  isActive?: boolean
}

export const CharacterCard = memo(function CharacterCard({ character, onLoad, onDelete, onExport, isActive = false }: CharacterCardProps) {
  const handleCardClick = () => {
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
      className={`overflow-hidden hover:border-accent transition-colors group cursor-pointer relative aspect-[3/2] ${isActive ? 'border-accent border-2' : ''
        }`}
      onClick={handleCardClick}
    >
      {/* Portrait background - positioned left */}
      {character.portrait ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${character.portrait})`,
            backgroundSize: 'cover',
            backgroundPosition: '20% center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-muted to-background" />
      )}

      {/* Gradient overlay: transparent on left, card bg on right */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent from-15% via-card/70 via-45% to-card to-70%" />

      {/* Active badge */}
      {isActive && (
        <div className="absolute top-3 right-3 z-10">
          <Badge variant="default" className="bg-accent text-accent-foreground shadow-lg">
            Active
          </Badge>
        </div>
      )}

      {/* Content - right aligned */}
      <div className="relative z-[1] flex flex-col justify-end h-full p-4 items-end text-right gap-3">
        <div className="flex flex-col items-end gap-1">
          <h3 className="font-display text-xl font-bold text-foreground">
            {character.name || 'Unnamed Character'}
          </h3>
          <Badge variant="secondary" className="font-mono text-xs">
            Level {character.level}
          </Badge>
          {character.race && (
            <Badge variant="outline" className="text-xs">
              {character.race}
            </Badge>
          )}
          {character.class && (
            <Badge variant="outline" className="text-xs bg-primary/10">
              {character.class}
            </Badge>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
            >
              <Upload />
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
            >
              <Trash />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock size={12} />
            {new Date(character.lastModified).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Card>
  )
})
