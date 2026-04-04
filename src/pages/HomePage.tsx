import { useMemo, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Upload, Trash, CheckSquare, SlidersHorizontal } from '@phosphor-icons/react'
import { CharacterCard } from '@/components/character/CharacterCard'
import { CharacterCreationWizard } from '@/components/character/wizard/CharacterCreationWizard'
import { useCharacterStore } from '@/store/characterStore'
import { Character } from '@/types/character'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type SortOption = 'recent' | 'name-asc' | 'name-desc' | 'level-desc' | 'level-asc'

export function HomePage() {
  const characters = useCharacterStore((state) => state.characters)
  const activeCharacterId = useCharacterStore((state) => state.activeCharacterId)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const setActiveCharacter = useCharacterStore((state) => state.setActiveCharacter)
  const deleteCharacter = useCharacterStore((state) => state.deleteCharacter)
  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(null)
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([])
  const [cardSize, setCardSize] = useState(460)
  const [toolbarOpen, setToolbarOpen] = useState(false)

  const sortedCharacters = useMemo(() => {
    const sorted = [...characters]

    sorted.sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      }

      if (sortBy === 'name-asc') {
        return (a.name || '').localeCompare(b.name || '')
      }

      if (sortBy === 'name-desc') {
        return (b.name || '').localeCompare(a.name || '')
      }

      if (sortBy === 'level-desc') {
        return b.level - a.level
      }

      return a.level - b.level
    })

    return sorted
  }, [characters, sortBy])

  const allSelected = sortedCharacters.length > 0 && selectedCharacterIds.length === sortedCharacters.length

  const handleLoadCharacter = useCallback((id: string) => {
    if (id === activeCharacterId) {
      return
    }

    if (hasUnsavedChanges) {
      setPendingCharacterId(id)
      setConfirmSwitchOpen(true)
      return
    }

    setActiveCharacter(id)
  }, [activeCharacterId, hasUnsavedChanges, setActiveCharacter])

  const confirmSwitchCharacter = () => {
    if (!pendingCharacterId) {
      return
    }

    setActiveCharacter(pendingCharacterId)
    setPendingCharacterId(null)
    setConfirmSwitchOpen(false)
  }

  const handleDeleteCharacter = useCallback((id: string) => {
    if (confirm('Are you sure you want to delete this character?')) {
      deleteCharacter(id)
      toast.success('Character deleted')
      setSelectedCharacterIds((prev) => prev.filter((selectedId) => selectedId !== id))
    }
  }, [deleteCharacter])

  const handleToggleCharacterSelection = (id: string) => {
    setSelectedCharacterIds((prev) =>
      prev.includes(id)
        ? prev.filter((selectedId) => selectedId !== id)
        : [...prev, id],
    )
  }

  const handleToggleAllSelection = () => {
    if (allSelected) {
      setSelectedCharacterIds([])
      return
    }

    setSelectedCharacterIds(sortedCharacters.map((character) => character.id))
  }

  const handleDeleteSelected = () => {
    if (selectedCharacterIds.length === 0) {
      toast.info('No characters selected')
      return
    }

    if (!confirm(`Delete ${selectedCharacterIds.length} selected character(s)?`)) {
      return
    }

    selectedCharacterIds.forEach((id) => deleteCharacter(id))
    setSelectedCharacterIds([])
    setSelectionMode(false)
    toast.success('Selected characters deleted')
  }

  const handleToggleSelectionMode = () => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedCharacterIds([])
      }
      return !prev
    })
  }

  const handleExportCharacter = useCallback((character: Character) => {
    const dataStr = JSON.stringify(character, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${character.name || 'character'}.dndchar`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Character exported successfully')
  }, [])

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
      {characters.length > 0 && (
        <div className="relative mb-8 flex flex-col gap-2">
          {/* Main toolbar row */}
          <div className="flex flex-wrap items-center gap-3">
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

            <div className="ml-auto relative shrink-0">
              <div className="relative">
                <Button
                  variant={toolbarOpen ? 'default' : 'outline'}
                  size="lg"
                  className="h-10 px-3"
                  onClick={() => setToolbarOpen((v) => !v)}
                  title="Toolbar"
                >
                  <SlidersHorizontal className="size-6" weight="bold" />
                  <span className="sr-only">Toolbar</span>
                </Button>

                {toolbarOpen && (
                  <div className="absolute right-0 top-full z-10 mt-2 flex flex-col gap-2 rounded-lg border bg-background/95 px-1.5 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:right-full lg:top-1/2 lg:mt-0 lg:mr-3 lg:flex-row lg:flex-nowrap lg:items-center lg:-translate-y-1/2 lg:px-2 lg:py-2">
                    <div className="flex h-8 items-center gap-2 rounded-md border bg-card px-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Sort</span>
                      <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                        <SelectTrigger
                          className="!h-4 min-h-0 w-28 gap-1 border-0 bg-transparent px-0 py-0 text-[11px] leading-none shadow-none ring-0 focus:ring-0 focus:ring-offset-0 [&_svg]:size-3"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="recent">Recently Modified</SelectItem>
                          <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                          <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                          <SelectItem value="level-desc">Level (High-Low)</SelectItem>
                          <SelectItem value="level-asc">Level (Low-High)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="hidden h-8 w-px bg-border" />

                    <div className="flex h-8 items-center gap-2 rounded-md border bg-card px-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Card Size</span>
                      <div className="w-20">
                        <Slider
                          min={360}
                          max={560}
                          step={10}
                          value={[cardSize]}
                          onValueChange={(value) => setCardSize(value[0])}
                        />
                      </div>
                    </div>

                    <div className="hidden xl:block h-8 w-px bg-border" />

                    <Button
                      variant={selectionMode ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 shrink-0 gap-1.5 bg-card"
                      onClick={handleToggleSelectionMode}
                    >
                      <CheckSquare size={16} />
                      Multi Select
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selection controls row */}
          {selectionMode && (
            <div className="mt-2 flex items-center gap-3 rounded-lg border bg-card px-4 py-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={allSelected} onCheckedChange={handleToggleAllSelection} />
                <span className="text-sm text-muted-foreground">
                  {allSelected ? 'Deselect All' : 'Select All'}
                </span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                disabled={selectedCharacterIds.length === 0}
                onClick={handleDeleteSelected}
              >
                <Trash size={14} />
                Delete ({selectedCharacterIds.length})
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                {selectedCharacterIds.length} selected
              </span>
            </div>
          )}
        </div>
      )}

      {characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center min-h-[60vh]">
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
        <div
          className="grid gap-6 justify-start"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${cardSize}px), ${cardSize}px))`,
            maxWidth: '100%',
          }}
        >
          {sortedCharacters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              onLoad={handleLoadCharacter}
              onDelete={handleDeleteCharacter}
              onExport={handleExportCharacter}
              isActive={character.id === activeCharacterId}
              selectionMode={selectionMode}
              isSelected={selectedCharacterIds.includes(character.id)}
              onToggleSelect={handleToggleCharacterSelection}
              cardSize={cardSize}
            />
          ))}
        </div>
      )}

      <CharacterCreationWizard
        open={showCreateWizard}
        onOpenChange={setShowCreateWizard}
      />

      <AlertDialog open={confirmSwitchOpen} onOpenChange={setConfirmSwitchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on the current character. Switching characters will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingCharacterId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitchCharacter}>Discard & Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
