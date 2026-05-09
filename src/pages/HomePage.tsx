import { CheckSquare, Funnel, Plus, Trash, Upload, Users } from '@phosphor-icons/react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CharacterCard } from '@/components/character/CharacterCard'
import { CharacterCreationWizard } from '@/components/character/wizard/CharacterCreationWizard'
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
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import type { Character } from '@/types/character'

type SortOption = 'recent' | 'name-asc' | 'name-desc' | 'level-desc' | 'level-asc'
type GroupByOption = 'none' | 'class' | 'alignment' | 'player'

export function HomePage() {
  const characters = useCharacterStore((state) => state.characters)
  const activeCharacterId = useCharacterStore((state) => state.activeCharacterId)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const setActiveCharacter = useCharacterStore((state) => state.setActiveCharacter)
  const deleteCharacter = useCharacterStore((state) => state.deleteCharacter)
  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(null)
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false)
  const [pendingDeleteCharacterId, setPendingDeleteCharacterId] = useState<string | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [groupBy, setGroupBy] = useState<GroupByOption>('none')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([])
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)

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

  const groupedCharacters = useMemo(() => {
    if (groupBy === 'none') return null

    const groups = new Map<string, Character[]>()
    for (const char of sortedCharacters) {
      let key: string
      if (groupBy === 'class')
        key = (char.classProgression?.length ?? 0) > 1 ? 'Multiclass' : char.class || 'Unknown'
      else if (groupBy === 'alignment') key = char.details?.alignment || 'Unknown'
      else key = char.details?.playerName || 'Unknown'

      const existing = groups.get(key) ?? []
      existing.push(char)
      groups.set(key, existing)
    }
    return groups
  }, [groupBy, sortedCharacters])

  const allSelected =
    sortedCharacters.length > 0 && selectedCharacterIds.length === sortedCharacters.length

  const handleLoadCharacter = useCallback(
    (id: string) => {
      if (id === activeCharacterId) {
        return
      }

      if (hasUnsavedChanges) {
        setPendingCharacterId(id)
        setConfirmSwitchOpen(true)
        return
      }

      setActiveCharacter(id)
    },
    [activeCharacterId, hasUnsavedChanges, setActiveCharacter],
  )

  const confirmSwitchCharacter = () => {
    if (!pendingCharacterId) {
      return
    }

    setActiveCharacter(pendingCharacterId)
    setPendingCharacterId(null)
    setConfirmSwitchOpen(false)
  }

  const handleDeleteCharacter = useCallback((id: string) => {
    setPendingDeleteCharacterId(id)
    setConfirmDeleteOpen(true)
  }, [])

  const confirmDeleteCharacter = useCallback(() => {
    if (!pendingDeleteCharacterId) {
      return
    }

    deleteCharacter(pendingDeleteCharacterId)
    toast.success('Character deleted')
    setSelectedCharacterIds((prev) =>
      prev.filter((selectedId) => selectedId !== pendingDeleteCharacterId),
    )
    setPendingDeleteCharacterId(null)
    setConfirmDeleteOpen(false)
  }, [deleteCharacter, pendingDeleteCharacterId])

  const handleToggleCharacterSelection = (id: string) => {
    setSelectedCharacterIds((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id],
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

    setConfirmBulkDeleteOpen(true)
  }

  const confirmDeleteSelected = useCallback(() => {
    selectedCharacterIds.forEach((id) => {
      deleteCharacter(id)
    })
    setSelectedCharacterIds([])
    setSelectionMode(false)
    setConfirmBulkDeleteOpen(false)
    toast.success('Selected characters deleted')
  }, [deleteCharacter, selectedCharacterIds])

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
    link.download = `${character.name || 'character'}.tbc`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Character exported successfully')
  }, [])

  const handleImportCharacter = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.tbc,.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const character = JSON.parse(text)

        const { validateCharacterData } = await import('@/store/characterStore')
        const validationError = validateCharacterData(character)
        if (validationError) {
          toast.error(`Invalid character: ${validationError}`)
          return
        }

        useCharacterStore.getState().addCharacter(character)
        toast.success('Character imported successfully')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        toast.error(`Failed to import character: ${message}`)
      }
    }
    input.click()
  }

  return (
    <div>
      <div className="px-6 py-5 page-header-band mb-6">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" weight="duotone" />
          <div>
            <h1 className="text-2xl font-display font-bold">Home</h1>
            <p className="text-sm text-muted-foreground">
              Manage and switch between your characters
            </p>
          </div>
          {characters.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {characters.length}
            </span>
          )}
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="max-w-7xl mx-auto w-full">
          <Card className="w-full overflow-hidden">
            <div className="relative flex flex-row overflow-hidden -my-6">
              {/* Toggle button — tracks panel open/closed position like race/background pages */}
              {characters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterPanelOpen((o) => !o)}
                  title={filterPanelOpen ? 'Hide filters' : 'Show filters'}
                  className={cn(
                    'absolute top-2 z-20 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/80 transition-all duration-300',
                    filterPanelOpen ? 'right-[216px]' : 'right-2',
                  )}
                >
                  <Funnel className="h-3.5 w-3.5" weight={filterPanelOpen ? 'fill' : 'regular'} />
                </button>
              )}

              {/* Main panel */}
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="bg-gradient-to-r from-accent/20 to-accent/10 border-b border-border px-4 py-3">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Characters
                  </span>
                </div>

                {/* Toolbar — New Character + Import (hidden in empty state; buttons are there instead) */}
                {characters.length > 0 && (
                  <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1.5 bg-accent hover:bg-accent/90"
                      onClick={() => setShowCreateWizard(true)}
                    >
                      <Plus size={13} />
                      New Character
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={handleImportCharacter}
                    >
                      <Upload size={13} />
                      Import
                    </Button>
                  </div>
                )}

                {/* Selection banner */}
                {selectionMode && (
                  <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={allSelected} onCheckedChange={handleToggleAllSelection} />
                      <span className="text-sm text-muted-foreground">
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </span>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      disabled={selectedCharacterIds.length === 0}
                      onClick={handleDeleteSelected}
                    >
                      <Trash size={13} />
                      Delete ({selectedCharacterIds.length})
                    </Button>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {selectedCharacterIds.length} selected
                    </span>
                  </div>
                )}

                {/* Character grid or empty state */}
                <div className="p-4">
                  {characters.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                        <Users className="size-10 text-muted-foreground" weight="duotone" />
                      </div>
                      <div>
                        <h3 className="font-display text-lg font-semibold">No Characters Yet</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Create your first character to begin your adventure
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          size="sm"
                          className="gap-1.5 bg-accent hover:bg-accent/90"
                          onClick={() => setShowCreateWizard(true)}
                        >
                          <Plus size={15} />
                          New Character
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={handleImportCharacter}
                        >
                          <Upload size={15} />
                          Import
                        </Button>
                      </div>
                    </div>
                  ) : groupedCharacters ? (
                    <div className="flex flex-col gap-6">
                      {[...groupedCharacters.entries()].map(([group, chars]) => (
                        <div key={group}>
                          <div className="mb-3 flex items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              {group}
                            </span>
                            <span className="text-xs text-muted-foreground">({chars.length})</span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                          <div
                            className="grid gap-6"
                            style={{
                              gridTemplateColumns:
                                'repeat(auto-fill, minmax(min(100%, 360px), 1fr))',
                            }}
                          >
                            {chars.map((character) => (
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
                                cardSize={360}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="grid gap-6"
                      style={{
                        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))',
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
                          cardSize={360}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Zero-width flex child — stretches to container height so h-full works on the overlay */}
              <div className="w-0 flex-shrink-0 relative">
                <div
                  className={cn(
                    'absolute top-0 right-0 h-full w-52 flex flex-col border-l border-border bg-card z-10 transition-transform duration-300 ease-in-out',
                    filterPanelOpen
                      ? 'translate-x-0 shadow-xl'
                      : 'translate-x-full pointer-events-none',
                  )}
                >
                  <div className="bg-gradient-to-r from-accent/10 to-transparent border-b border-border px-4 py-4 flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Filters
                    </span>
                  </div>

                  <div className="p-4 flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground font-medium">Sort by</span>
                      <Select
                        value={sortBy}
                        onValueChange={(value) => setSortBy(value as SortOption)}
                      >
                        <SelectTrigger className="h-8 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recent">Recently Modified</SelectItem>
                          <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                          <SelectItem value="name-desc">Name (Z–A)</SelectItem>
                          <SelectItem value="level-desc">Level (High–Low)</SelectItem>
                          <SelectItem value="level-asc">Level (Low–High)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="h-px bg-border" />

                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground font-medium">Group by</span>
                      <Select
                        value={groupBy}
                        onValueChange={(value) => setGroupBy(value as GroupByOption)}
                      >
                        <SelectTrigger className="h-8 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="class">Class</SelectItem>
                          <SelectItem value="alignment">Alignment</SelectItem>
                          <SelectItem value="player">Player</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="h-px bg-border" />

                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground font-medium">
                        Bulk Actions
                      </span>
                      <Button
                        variant={selectionMode ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 text-xs gap-1.5 w-full justify-start"
                        onClick={handleToggleSelectionMode}
                      >
                        <CheckSquare size={14} />
                        {selectionMode ? 'Cancel Multi-Select' : 'Multi-Select'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <CharacterCreationWizard open={showCreateWizard} onOpenChange={setShowCreateWizard} />

        <AlertDialog open={confirmSwitchOpen} onOpenChange={setConfirmSwitchOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes on the current character. Switching characters will discard
                them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingCharacterId(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmSwitchCharacter}>
                Discard & Switch
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={confirmDeleteOpen}
          onOpenChange={(open) => {
            setConfirmDeleteOpen(open)
            if (!open) {
              setPendingDeleteCharacterId(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete character?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirmDeleteCharacter}
              >
                Delete Character
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmBulkDeleteOpen} onOpenChange={setConfirmBulkDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete selected characters?</AlertDialogTitle>
              <AlertDialogDescription>
                Delete {selectedCharacterIds.length} selected character(s)? This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirmDeleteSelected}
              >
                Delete Selected
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
