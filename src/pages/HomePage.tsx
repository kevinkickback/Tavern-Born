import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Plus, Upload } from '@phosphor-icons/react'
import { CharacterCard } from '@/components/character/CharacterCard'
import { CharacterCreationWizard } from '@/components/character/CharacterCreationWizard'
import { useCharacterStore } from '@/store/characterStore'
import { Character } from '@/types/character'
import { toast } from 'sonner'

export function HomePage() {
  const navigate = useNavigate()
  const { characters, activeCharacterId, setActiveCharacter, deleteCharacter } = useCharacterStore()
  const [showCreateWizard, setShowCreateWizard] = useState(false)

  const handleLoadCharacter = (id: string) => {
    setActiveCharacter(id)
  }

  const handleDeleteCharacter = (id: string) => {
    if (confirm('Are you sure you want to delete this character?')) {
      deleteCharacter(id)
      toast.success('Character deleted')
    }
  }

  const handleExportCharacter = (character: Character) => {
    const dataStr = JSON.stringify(character, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${character.name || 'character'}.dndchar`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Character exported successfully')
  }

  const handleImportCharacter = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.dndchar,.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const character = JSON.parse(text)
        useCharacterStore.getState().addCharacter(character)
        toast.success('Character imported successfully')
      } catch (error) {
        toast.error('Failed to import character file')
      }
    }
    input.click()
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold mb-2">Your Characters</h1>
          <p className="text-muted-foreground">
            Create and manage your D&D 5e characters
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={handleImportCharacter}
            className="gap-2"
          >
            <Upload />
            Import Character
          </Button>
          <Button
            variant="default"
            size="lg"
            onClick={() => setShowCreateWizard(true)}
            className="gap-2 bg-accent hover:bg-accent/90"
          >
            <Plus />
            New Character
          </Button>
        </div>
      </div>

      {characters.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-32 h-32 rounded-full bg-muted mx-auto mb-6 flex items-center justify-center">
            <Plus className="text-6xl text-muted-foreground" />
          </div>
          <h2 className="font-display text-2xl font-semibold mb-2">
            No Characters Yet
          </h2>
          <p className="text-muted-foreground mb-6">
            Create your first character to begin your adventure
          </p>
          <Button
            variant="default"
            size="lg"
            onClick={() => setShowCreateWizard(true)}
            className="gap-2"
          >
            <Plus />
            Create First Character
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              onLoad={handleLoadCharacter}
              onDelete={handleDeleteCharacter}
              onExport={handleExportCharacter}
              isActive={character.id === activeCharacterId}
            />
          ))}
        </div>
      )}

      <CharacterCreationWizard
        open={showCreateWizard}
        onOpenChange={setShowCreateWizard}
      />
    </div>
  )
}
