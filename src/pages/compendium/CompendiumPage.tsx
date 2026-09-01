import { Book, Funnel, MagnifyingGlass } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  MasterDetail,
  WorkspaceBody,
  WorkspacePage,
  WorkspacePaneHeader,
  WorkspaceToolbar,
} from '@/components/workspace'
import {
  buildCompendiumEntries,
  type CompendiumEntry,
  filterCompendiumEntries,
} from '@/lib/compendiumEntries'
import { renderEntry } from '@/lib/renderer'
import { getImplicitSource } from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import { CompendiumEntryDetails } from '@/pages/compendium/CompendiumEntryDetails'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

const ENTRY_TYPES = [
  'Race',
  'Class',
  'Spell',
  'Item',
  'Background',
  'Feat',
  'Skill',
  'Sense',
  'Action',
  'Condition',
  'Language',
  'Deity',
  'Optional Feature',
  'Variant Rule',
  'Trap / Hazard',
  'Reward',
  'Cult / Boon',
] as const

const MAX_DISPLAY = 200

export function CompendiumPage() {
  const [searchParams] = useSearchParams()
  const gameData = useGameDataStore((state) => state.gameData)
  const allowedSources = useCharacterStore((state) => state.activeCharacter?.allowedSources)
  const originSystem = useCharacterStore((state) => state.activeCharacter?.originSystem)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set())
  const [selectedEntry, setSelectedEntry] = useState<CompendiumEntry | null>(null)

  const activeTypes = useMemo(
    () =>
      new Set(
        searchParams
          .getAll('type')
          .filter((type) => ENTRY_TYPES.includes(type as (typeof ENTRY_TYPES)[number])),
      ),
    [searchParams],
  )

  const effectiveAllowedSources = useMemo(() => {
    if (!allowedSources) return undefined
    const implicit = getImplicitSource(originSystem ?? '2014')
    return allowedSources.includes(implicit) ? allowedSources : [...allowedSources, implicit]
  }, [allowedSources, originSystem])

  const sourceNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const source of gameData?.sources ?? []) {
      map.set(source.abbreviation, source.name)
    }
    return map
  }, [gameData?.sources])

  const allEntries = useMemo(() => {
    const entries = buildCompendiumEntries(gameData)
    if (!effectiveAllowedSources || effectiveAllowedSources.length === 0) return entries
    const sourcesSet = new Set(effectiveAllowedSources.map((source) => source.toUpperCase()))
    return entries.filter((entry) => sourcesSet.has(entry.source.toUpperCase()))
  }, [gameData, effectiveAllowedSources])

  const allSources = useMemo(
    () =>
      Array.from(new Set(allEntries.map((entry) => entry.source))).sort((a, b) => {
        const nameA = sourceNameMap.get(a) ?? a
        const nameB = sourceNameMap.get(b) ?? b
        return nameA.localeCompare(nameB)
      }),
    [allEntries, sourceNameMap],
  )

  const activeFilterCount = activeSources.size

  const toggleSource = (source: string) => {
    setActiveSources((previous) => {
      const next = new Set(previous)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }

  const clearFilters = () => {
    setActiveSources(new Set())
  }

  const filteredEntries = useMemo(
    () => filterCompendiumEntries(allEntries, searchQuery, activeTypes, activeSources),
    [allEntries, searchQuery, activeTypes, activeSources],
  )

  const displayedEntries = filteredEntries.slice(0, MAX_DISPLAY)
  const hasMore = filteredEntries.length > MAX_DISPLAY

  if (!gameData) {
    return (
      <WorkspacePage>
        <WorkspaceBody className="flex items-center justify-center p-8">
          <div className="max-w-sm text-center">
            <Book className="mx-auto size-10 text-muted-foreground" weight="duotone" />
            <h2 className="mt-4 text-base font-semibold">No game data loaded</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure a game-data source before browsing the compendium.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/settings">Open Settings</Link>
            </Button>
          </div>
        </WorkspaceBody>
      </WorkspacePage>
    )
  }

  return (
    <WorkspacePage className="gap-3 p-3">
      <div className="shrink-0 overflow-hidden rounded-md border border-border-subtle bg-surface-raised">
        <WorkspaceToolbar className="h-11 gap-3 border-0 bg-transparent px-3">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-foreground/65" />
            <Input
              type="search"
              aria-label="Search compendium"
              placeholder="Search names, descriptions, traits, and sources"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-9 border-border-strong bg-workspace-pane pl-9 pr-24 text-sm shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground">
              {filteredEntries.length.toLocaleString()} results
            </span>
          </div>
          <div className="shrink-0 border-l border-border pl-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={activeFilterCount > 0 ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-9 gap-1.5 px-3"
                >
                  <Funnel weight={activeFilterCount > 0 ? 'fill' : 'regular'} />
                  Sources
                  {activeFilterCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-4 min-w-4 px-1 text-[10px] tabular-nums"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Filter by source</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allSources.map((source) => (
                  <DropdownMenuCheckboxItem
                    key={source}
                    checked={activeSources.has(source)}
                    onCheckedChange={() => toggleSource(source)}
                    onSelect={(event) => event.preventDefault()}
                    className="cursor-pointer"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {sourceNameMap.get(source) ?? source}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{source}</span>
                  </DropdownMenuCheckboxItem>
                ))}
                {activeFilterCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={clearFilters} className="cursor-pointer">
                      Clear source filters
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </WorkspaceToolbar>
      </div>

      <WorkspaceBody className="overflow-hidden">
        <MasterDetail
          className="gap-3 overflow-visible"
          masterWidth="clamp(21rem, 36vw, 28rem)"
          masterClassName="overflow-hidden rounded-lg border border-border bg-workspace-pane"
          detailClassName="overflow-hidden rounded-lg border border-border bg-workspace-detail"
          master={
            <div className="flex h-full min-h-0 flex-col">
              <WorkspacePaneHeader
                title="Results"
                count={
                  <>
                    {filteredEntries.length.toLocaleString()}
                    {hasMore && ` · first ${MAX_DISPLAY}`}
                  </>
                }
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {filteredEntries.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No entries found
                  </div>
                ) : (
                  <ul>
                    {displayedEntries.map((entry) => {
                      const selected = selectedEntry === entry
                      return (
                        <li key={`${entry.type}-${entry.source}-${entry.name}`}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setSelectedEntry(entry)}
                            className={cn(
                              'relative flex w-full items-start gap-2 border-b border-border/70 px-3 py-2 text-left transition-colors',
                              selected ? 'bg-secondary text-foreground' : 'hover:bg-secondary/45',
                            )}
                          >
                            {selected && (
                              <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-primary" />
                            )}
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-sm font-medium">{entry.name}</h3>
                              {entry.description && (
                                <p
                                  className="mt-0.5 line-clamp-1 text-xs text-muted-foreground"
                                  dangerouslySetInnerHTML={{
                                    __html: renderEntry(entry.description),
                                  }}
                                />
                              )}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-0.5">
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {entry.type}
                              </span>
                              <span className="text-[10px] text-muted-foreground/70">
                                {entry.source}
                              </span>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          }
          detail={
            <div className="flex h-full min-h-0 flex-col">
              <WorkspacePaneHeader title="Entry details">
                {selectedEntry && (
                  <div className="ml-auto flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold">{selectedEntry.name}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {selectedEntry.source}
                    </Badge>
                  </div>
                )}
              </WorkspacePaneHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
                {selectedEntry ? (
                  <div className="mx-auto max-w-3xl">
                    <CompendiumEntryDetails selectedEntry={selectedEntry} />
                  </div>
                ) : (
                  <div className="flex h-full min-h-48 items-center justify-center text-sm text-muted-foreground">
                    Select an entry to view its details
                  </div>
                )}
              </div>
            </div>
          }
        />
      </WorkspaceBody>
    </WorkspacePage>
  )
}
