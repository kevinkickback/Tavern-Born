import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, Trash, Crown } from '@phosphor-icons/react'
import { Character } from '@/types/character'
import { format } from 'date-fns'

interface CharacterCardProps {
  character: Character
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  onExport: (character: Character) => void
  isActive?: boolean
}

export function CharacterCard({ character, onLoad, onDelete, onExport, isActive = false }: CharacterCardProps) {
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
      className={`overflow-hidden hover:border-accent transition-all group cursor-pointer relative ${
        isActive ? 'border-accent border-2' : ''
      }`}
      onClick={handleCardClick}
    >
      {isActive && (
        <div className="absolute top-3 right-3 z-10">
          <Badge variant="default" className="bg-accent text-accent-foreground shadow-lg">
            Active
          </Badge>
        </div>
      )}
      <div className="relative h-64 bg-gradient-to-br from-muted to-background">
        {character.portrait ? (
          <img
            src={character.portrait}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
              <Crown className="text-4xl text-primary" />
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent opacity-90" />
        <div className="absolute bottom-4 left-4 right-4">
          <h3 className="font-display text-2xl font-bold text-foreground mb-1">
            {character.name || 'Unnamed Character'}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
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
        </div>
      </div>
      
      <div className="p-4 flex items-center justify-between border-t border-border">
        <span className="text-xs text-muted-foreground">
          Modified {format(new Date(character.lastModified), 'M/d/yyyy')}
        </span>
        <div className="flex gap-2">
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
      </div>
    </Card>
  )
}
