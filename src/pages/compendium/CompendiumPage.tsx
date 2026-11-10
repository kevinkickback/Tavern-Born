import { Book, Funnel, MagnifyingGlass } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { useId, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  MasterDetail,
  WorkspaceBody,
  WorkspacePage,
  WorkspacePaneHeader,
  WorkspaceToolbar,
} from '@/components/workspace'
import {
  buildCompendiumEntries,
  type CompendiumEditionFilter,
  type CompendiumEntry,
  filterCompendiumEntries,
} from '@/lib/compendiumEntries'
import { cn } from '@/lib/utils'
import { CompendiumEntryDetails } from '@/pages/compendium/CompendiumEntryDetails'
import { useGameDataStore } from '@/store/gameDataStore'

const ENTRY_TYPES = [
  'Race',
  'Class',
  'Subclass Feature',
  'Spell',
  'Item',
  'Creature',
  'Background',
  'Feat',
  'Skill',
  'Sense',
  'Action',
  'Condition',
  'Disease',
  'Status',
  'Language',
  'Deity',
  'Organization',
  'Item Property',
  'Weapon Mastery',
  'Optional Feature',
  'Variant Rule',
  'Trap / Hazard',
  'Reward',
  'Cult / Boon',
] as const

const MAX_DISPLAY = 200

export function CompendiumPage() {
  const editionLabelId = useId()
  const sourceFilterId = useId()
  const [searchParams] = useSearchParams()
  const gameData = useGameDataStore((state) => state.gameData)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set())
  const [sourceSearch, setSourceSearch] = useState('')
  const [sourceTrigger, setSourceTrigger] = useState<HTMLButtonElement | null>(null)
  const [editionFilter, setEditionFilter] = useState<CompendiumEditionFilter>('both')
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

  const sourceNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const source of gameData?.sources ?? []) {
      map.set(source.abbreviation.trim().toUpperCase(), source.name)
    }
    return map
  }, [gameData?.sources])

  const allEntries = useMemo(() => buildCompendiumEntries(gameData), [gameData])

  const allSources = useMemo(
    () =>
      Array.from(new Set(allEntries.map((entry) => entry.source.trim().toUpperCase()))).sort(
        (a, b) => {
          const nameA = sourceNameMap.get(a) ?? a
          const nameB = sourceNameMap.get(b) ?? b
          return nameA.localeCompare(nameB)
        },
      ),
    [allEntries, sourceNameMap],
  )

  const activeFilterCount = activeSources.size
  const sourceQuery = sourceSearch.trim().toLowerCase()
  const matchingSources = allSources.filter((source) =>
    `${sourceNameMap.get(source) ?? ''} ${source}`.toLowerCase().includes(sourceQuery),
  )

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
    () =>
      filterCompendiumEntries(allEntries, searchQuery, activeTypes, activeSources, editionFilter),
    [allEntries, searchQuery, activeTypes, activeSources, editionFilter],
  )

  const displayedEntries = filteredEntries.slice(0, MAX_DISPLAY)
  const hasMore = filteredEntries.length > MAX_DISPLAY

  if (!gameData) {
    return (
      <WorkspacePage>
        <WorkspaceBody className="flex items-center justify-center p-8">
          <div className="max-w-sm text-center">
            <Book className="mx-auto size-10 text-muted-foreground" weight="duotone" />
            <h2 className="mt-4 text-base font-semibold">Rules catalog unavailable</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the Included SRD in Settings, or add compatible 5etools data.
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
    <WorkspacePage>
      <div className="shrink-0 bg-surface-raised">
        <WorkspaceToolbar className="h-11 gap-3 border-b border-border-subtle bg-transparent px-3">
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
          <div className="flex shrink-0 items-center gap-2 border-l border-border pl-3">
            <span id={editionLabelId} className="text-xs font-medium text-muted-foreground">
              Edition
            </span>
            <ToggleGroup
              type="single"
              value={editionFilter}
              onValueChange={(value) => {
                if (value) setEditionFilter(value as CompendiumEditionFilter)
              }}
              variant="outline"
              aria-labelledby={editionLabelId}
            >
              <ToggleGroupItem value="5e" aria-label="5e edition" className="h-9 px-2.5 text-xs">
                5e
              </ToggleGroupItem>
              <ToggleGroupItem
                value="5.5e"
                aria-label="5.5e edition"
                className="h-9 px-2.5 text-xs"
              >
                5.5e
              </ToggleGroupItem>
              <ToggleGroupItem
                value="both"
                aria-label="Both editions"
                className="h-9 px-2.5 text-xs"
              >
                Both
              </ToggleGroupItem>
            </ToggleGroup>
            <Popover.Root
              onOpenChange={(open) => {
                if (!open) setSourceSearch('')
              }}
            >
              <Popover.Trigger asChild>
                <Button
                  ref={setSourceTrigger}
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
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  aria-label="Filter by source"
                  align="end"
                  sideOffset={6}
                  collisionBoundary={sourceTrigger?.closest('main') ?? undefined}
                  collisionPadding={12}
                  className="z-50 flex max-h-[var(--radix-popover-content-available-height)] w-72 max-w-[var(--radix-popover-content-available-width)] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
                >
                  <div className="shrink-0 border-b p-2">
                    <Input
                      aria-label="Search sources"
                      placeholder="Search sources…"
                      value={sourceSearch}
                      onChange={(event) => setSourceSearch(event.target.value)}
                    />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
                    {matchingSources.map((source, index) => (
                      <label
                        key={source}
                        htmlFor={`${sourceFilterId}-${index}`}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary"
                      >
                        <Checkbox
                          id={`${sourceFilterId}-${index}`}
                          checked={activeSources.has(source)}
                          onCheckedChange={() => toggleSource(source)}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {sourceNameMap.get(source) ?? source}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{source}</span>
                      </label>
                    ))}
                    {!matchingSources.length && (
                      <p className="px-2 py-2 text-sm text-muted-foreground">
                        No matching sources.
                      </p>
                    )}
                  </div>
                  {activeFilterCount > 0 && (
                    <div className="shrink-0 border-t p-1">
                      <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                        Clear source filters
                      </Button>
                    </div>
                  )}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </WorkspaceToolbar>
      </div>

      <WorkspaceBody className="overflow-hidden p-3">
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
                        <li key={entry.id}>
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
                                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                  {entry.description}
                                </p>
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
