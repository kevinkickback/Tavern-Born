import {
  CheckSquare,
  DotsThreeVertical,
  DownloadSimple,
  Funnel,
  ListBullets,
  MagnifyingGlass,
  Plus,
  SquaresFour,
  Trash,
  Upload,
  Users,
} from '@phosphor-icons/react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WorkspaceBody, WorkspacePage, WorkspaceToolbar } from '@/components/workspace'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { resolvePortraitSrc } from '@/lib/portraitConstants'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useCharacterStore } from '@/store/characterStore'
import type { Character } from '@/types/character'

type SortOption = 'recent' | 'name-asc' | 'name-desc' | 'level-desc' | 'level-asc'
type GroupByOption = 'none' | 'class' | 'alignment' | 'player'

interface CharacterListRowProps {
  character: Character
  isActive: boolean
  selectionMode: boolean
  isSelected: boolean
  onLoad: (id: string) => void
  onToggleSelect: (id: string) => void
  onExport: (character: Character) => void
  onDelete: (id: string) => void
}

function CharacterListRow({
  character,
  isActive,
  selectionMode,
  isSelected,
  onLoad,
  onToggleSelect,
  onExport,
  onDelete,
}: CharacterListRowProps) {
  const name = character.name || 'Unnamed Character'
  const summary = [character.race, character.class].filter(Boolean).join(' · ') || 'Unspecified'

  return (
    <div
      className={cn(
        'relative flex min-h-14 items-center border-b border-border/70 px-3 transition-colors hover:bg-secondary/40',
        isActive && 'bg-secondary/60',
        isSelected && 'bg-primary/10',
      )}
    >
      {isActive && <span className="absolute inset-y-2 left-0 w-0.5 bg-primary" />}
      {selectionMode && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(character.id)}
          aria-label={`Select ${name}`}
          className="mr-3"
        />
      )}
      <button
        type="button"
        onClick={() => (selectionMode ? onToggleSelect(character.id) : onLoad(character.id))}
        className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
      >
        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {character.portrait ? (
            <img
              src={resolvePortraitSrc(character.portrait)}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <Users className="size-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{name}</span>
            {isActive && (
              <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Active
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{summary}</p>
        </div>
        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          Level {getTotalCharacterLevel(character)}
        </span>
        <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground lg:block">
          {new Date(character.lastModified).toLocaleDateString()}
        </span>
      </button>
      {!selectionMode && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-2 size-8"
              aria-label={`Actions for ${name}`}
            >
              <DotsThreeVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onExport(character)}>
              <DownloadSimple /> Export
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(character.id)}>
              <Trash /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export function HomePage() {
  const characters = useCharacterStore((state) => state.characters)
  const activeCharacterId = useCharacterStore((state) => state.activeCharacterId)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const setActiveCharacter = useCharacterStore((state) => state.setActiveCharacter)
  const deleteCharacter = useCharacterStore((state) => state.deleteCharacter)
  const viewMode = useAppPreferencesStore((state) => state.characterViewMode)
  const setViewMode = useAppPreferencesStore((state) => state.setCharacterViewMode)
  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(null)
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false)
  const [pendingDeleteCharacterId, setPendingDeleteCharacterId] = useState<string | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [groupBy, setGroupBy] = useState<GroupByOption>('none')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([])
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)

  const sortedCharacters = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const sorted = characters.filter((character) => {
      if (!query) return true
      return [
        character.name,
        character.race,
        character.class,
        character.details?.alignment,
        character.details?.playerName,
      ].some((value) => value?.toLowerCase().includes(query))
    })
    sorted.sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      }
      if (sortBy === 'name-asc') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'name-desc') return (b.name || '').localeCompare(a.name || '')
      if (sortBy === 'level-desc') return b.level - a.level
      return a.level - b.level
    })
    return sorted
  }, [characters, searchQuery, sortBy])

  const groupedCharacters = useMemo(() => {
    if (groupBy === 'none') return null
    const groups = new Map<string, Character[]>()
    for (const character of sortedCharacters) {
      let key: string
      if (groupBy === 'class') {
        key =
          (character.classProgression?.length ?? 0) > 1
            ? 'Multiclass'
            : character.class || 'Unknown'
      } else if (groupBy === 'alignment') key = character.details?.alignment || 'Unknown'
      else key = character.details?.playerName || 'Unknown'
      groups.set(key, [...(groups.get(key) ?? []), character])
    }
    return groups
  }, [groupBy, sortedCharacters])

  const allSelected =
    sortedCharacters.length > 0 &&
    sortedCharacters.every((character) => selectedCharacterIds.includes(character.id))

  const handleLoadCharacter = useCallback(
    (id: string) => {
      if (id === activeCharacterId) return
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
    if (!pendingCharacterId) return
    setActiveCharacter(pendingCharacterId)
    setPendingCharacterId(null)
    setConfirmSwitchOpen(false)
  }

  const handleDeleteCharacter = useCallback((id: string) => {
    setPendingDeleteCharacterId(id)
    setConfirmDeleteOpen(true)
  }, [])

  const confirmDeleteCharacter = useCallback(() => {
    if (!pendingDeleteCharacterId) return
    deleteCharacter(pendingDeleteCharacterId)
    toast.success('Character deleted')
    setSelectedCharacterIds((previous) =>
      previous.filter((selectedId) => selectedId !== pendingDeleteCharacterId),
    )
    setPendingDeleteCharacterId(null)
    setConfirmDeleteOpen(false)
  }, [deleteCharacter, pendingDeleteCharacterId])

  const handleToggleCharacterSelection = (id: string) => {
    setSelectedCharacterIds((previous) =>
      previous.includes(id)
        ? previous.filter((selectedId) => selectedId !== id)
        : [...previous, id],
    )
  }

  const handleToggleAllSelection = () => {
    const visibleIds = sortedCharacters.map((character) => character.id)
    setSelectedCharacterIds((previous) =>
      allSelected
        ? previous.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...previous, ...visibleIds])),
    )
  }

  const confirmDeleteSelected = useCallback(() => {
    selectedCharacterIds.forEach(deleteCharacter)
    setSelectedCharacterIds([])
    setSelectionMode(false)
    setConfirmBulkDeleteOpen(false)
    toast.success('Selected characters deleted')
  }, [deleteCharacter, selectedCharacterIds])

  const handleToggleSelectionMode = () => {
    setSelectionMode((enabled) => {
      if (enabled) setSelectedCharacterIds([])
      return !enabled
    })
  }

  const handleExportCharacter = useCallback((character: Character) => {
    const dataBlob = new Blob([JSON.stringify(character, null, 2)], { type: 'application/json' })
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
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const character = JSON.parse(await file.text())
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

  const renderCharacter = (character: Character) =>
    viewMode === 'gallery' ? (
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
    ) : (
      <CharacterListRow
        key={character.id}
        character={character}
        onLoad={handleLoadCharacter}
        onDelete={handleDeleteCharacter}
        onExport={handleExportCharacter}
        isActive={character.id === activeCharacterId}
        selectionMode={selectionMode}
        isSelected={selectedCharacterIds.includes(character.id)}
        onToggleSelect={handleToggleCharacterSelection}
      />
    )

  return (
    <WorkspacePage>
      <div className="shrink-0 bg-surface-raised">
        <WorkspaceToolbar className="h-11 gap-3 border-b border-border-subtle bg-transparent px-4">
          <div className="relative min-w-56 flex-1">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-foreground/65" />
            <Input
              type="search"
              aria-label="Search characters"
              placeholder="Search characters"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-9 border-border-strong bg-workspace-pane pl-9 pr-20 shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground">
              {sortedCharacters.length} / {characters.length}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 border-l border-border pl-3">
            <Button
              variant={filterPanelOpen ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 gap-1.5 px-3"
              aria-expanded={filterPanelOpen}
              onClick={() => setFilterPanelOpen((open) => !open)}
            >
              <Funnel /> Sort & Group
            </Button>
            <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 p-0.5">
              <Button
                variant={viewMode === 'gallery' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8 shadow-none"
                aria-label="Gallery view"
                onClick={() => setViewMode('gallery')}
              >
                <SquaresFour />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8 shadow-none"
                aria-label="List view"
                onClick={() => setViewMode('list')}
              >
                <ListBullets />
              </Button>
            </div>
          </div>
        </WorkspaceToolbar>

        {filterPanelOpen && characters.length > 0 && (
          <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sort
            </span>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger className="h-8 w-44 bg-workspace-pane text-xs shadow-none">
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
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Group
            </span>
            <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupByOption)}>
              <SelectTrigger className="h-8 w-36 bg-workspace-pane text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="class">Class</SelectItem>
                <SelectItem value="alignment">Alignment</SelectItem>
                <SelectItem value="player">Player</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={selectionMode ? 'secondary' : 'ghost'}
              size="sm"
              className="ml-auto h-8 gap-1.5"
              onClick={handleToggleSelectionMode}
            >
              <CheckSquare /> {selectionMode ? 'Cancel Selection' : 'Select Multiple'}
            </Button>
          </div>
        )}
      </div>

      {selectionMode && (
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-primary/30 bg-primary/10 px-3">
          <Checkbox checked={allSelected} onCheckedChange={handleToggleAllSelection} />
          <button type="button" className="text-xs font-medium" onClick={handleToggleAllSelection}>
            {allSelected ? 'Deselect visible' : 'Select visible'}
          </button>
          <span className="text-xs text-muted-foreground">
            {selectedCharacterIds.length} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto h-7 gap-1.5"
            disabled={selectedCharacterIds.length === 0}
            onClick={() => setConfirmBulkDeleteOpen(true)}
          >
            <Trash /> Delete
          </Button>
        </div>
      )}

      <WorkspaceBody>
        {characters.length === 0 ? (
          <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center">
            <Users className="size-10 text-muted-foreground" weight="duotone" />
            <h2 className="mt-4 text-base font-semibold">No Characters Yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first character or import an existing Tavern-Born file.
            </p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" className="gap-1.5" onClick={() => setShowCreateWizard(true)}>
                <Plus /> New Character
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleImportCharacter}
              >
                <Upload /> Import
              </Button>
            </div>
          </div>
        ) : sortedCharacters.length === 0 ? (
          <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground">
            No characters match “{searchQuery}”
          </div>
        ) : (
          <div className={cn(viewMode === 'gallery' && 'p-4')}>
            {groupedCharacters ? (
              <div className="space-y-5">
                <div className="flex h-12 items-center gap-3 border-b border-dashed border-border px-3 text-sm">
                  <Plus className="size-4 text-muted-foreground" />
                  <button
                    type="button"
                    className="cursor-pointer font-medium hover:text-primary"
                    onClick={() => setShowCreateWizard(true)}
                  >
                    New Character
                  </button>
                  <span className="h-4 w-px bg-border" />
                  <button
                    type="button"
                    className="cursor-pointer text-muted-foreground hover:text-primary"
                    onClick={handleImportCharacter}
                  >
                    Import
                  </button>
                </div>
                {[...groupedCharacters.entries()].map(([group, groupCharacters]) => (
                  <section key={group}>
                    <div className="flex h-8 items-center gap-2 border-b border-border px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group}{' '}
                      <span className="font-normal tabular-nums">{groupCharacters.length}</span>
                    </div>
                    <div
                      className={cn(
                        viewMode === 'gallery' &&
                          'grid grid-cols-[repeat(auto-fill,minmax(min(100%,22.5rem),22.5rem))] justify-start gap-4 pt-4',
                      )}
                    >
                      {groupCharacters.map(renderCharacter)}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div
                className={cn(
                  viewMode === 'gallery' &&
                    'grid grid-cols-[repeat(auto-fill,minmax(min(100%,22.5rem),22.5rem))] justify-start gap-4',
                )}
              >
                {viewMode === 'gallery' ? (
                  <div className="grid aspect-[3/2] min-h-44 grid-rows-2 overflow-hidden rounded-xl border border-dashed border-border bg-muted/10 text-center">
                    <button
                      type="button"
                      aria-label="New Character"
                      data-character-action="new"
                      className="group relative flex min-h-0 cursor-pointer flex-col items-center justify-center gap-1.5 px-4 transition-colors hover:bg-primary/10 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      onClick={() => setShowCreateWizard(true)}
                    >
                      <Plus className="size-5 text-muted-foreground transition-colors group-hover:text-primary" />
                      <span className="text-sm font-semibold">New Character</span>
                      <span className="text-[11px] text-muted-foreground">Start from scratch</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Import"
                      data-character-action="import"
                      className="group relative flex min-h-0 cursor-pointer flex-col items-center justify-center gap-1.5 border-t border-dashed border-border px-4 transition-colors hover:bg-primary/10 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      onClick={handleImportCharacter}
                    >
                      <Upload className="size-5 text-muted-foreground transition-colors group-hover:text-primary" />
                      <span className="text-sm font-semibold">Import</span>
                      <span className="text-[11px] text-muted-foreground">
                        Open a .tbc or JSON file
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="flex h-12 items-center gap-3 border-b border-dashed border-border px-3 text-sm">
                    <Plus className="size-4 text-muted-foreground" />
                    <button
                      type="button"
                      className="cursor-pointer font-medium hover:text-primary"
                      onClick={() => setShowCreateWizard(true)}
                    >
                      New Character
                    </button>
                    <span className="h-4 w-px bg-border" />
                    <button
                      type="button"
                      className="cursor-pointer text-muted-foreground hover:text-primary"
                      onClick={handleImportCharacter}
                    >
                      Import
                    </button>
                  </div>
                )}
                {sortedCharacters.map(renderCharacter)}
              </div>
            )}
          </div>
        )}
      </WorkspaceBody>

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
            <AlertDialogAction onClick={confirmSwitchCharacter}>Discard & Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          setConfirmDeleteOpen(open)
          if (!open) setPendingDeleteCharacterId(null)
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
    </WorkspacePage>
  )
}
