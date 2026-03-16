import { useState, useMemo } from 'react'
import { useGameDataStore } from '@/store/gameDataStore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MagnifyingGlass, Book, CaretRight, CaretLeft, Funnel, X } from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'

const ENTRY_TYPES = [
  'Race',
  'Class',
  'Spell',
  'Item',
  'Background',
  'Feat',
  'Skill',
  'Action',
  'Condition',
  'Language',
  'Deity',
] as const

interface CompendiumEntry {
  name: string
  type: string
  source: string
  description?: string
  data: any
}


const MAX_DISPLAY = 200

export function CompendiumPage() {
  const gameData = useGameDataStore((state) => state.gameData)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set())
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<CompendiumEntry | null>(null)
  const [detailCollapsed, setDetailCollapsed] = useState(false)

  const allEntries = useMemo(() => {
    if (!gameData) return []

    const entries: CompendiumEntry[] = []

    if (gameData.races) {
      Object.values(gameData.races).forEach((race: any) => {
        entries.push({
          name: race.name,
          type: 'Race',
          source: race.source || 'Unknown',
          description: race.entries?.[0] || '',
          data: race,
        })
      })
    }

    if (gameData.classes) {
      Object.values(gameData.classes).forEach((cls: any) => {
        entries.push({
          name: cls.name,
          type: 'Class',
          source: cls.source || 'Unknown',
          description: cls.fluff?.entries?.[0] || '',
          data: cls,
        })
      })
    }

    if (gameData.spells) {
      Object.values(gameData.spells).forEach((spell: any) => {
        entries.push({
          name: spell.name,
          type: 'Spell',
          source: spell.source || 'Unknown',
          description: `Level ${spell.level} ${spell.school}`,
          data: spell,
        })
      })
    }

    if (gameData.items) {
      gameData.items.forEach((item: any) => {
        entries.push({
          name: item.name,
          type: 'Item',
          source: item.source || 'Unknown',
          description: item.entries?.[0] || item.type || '',
          data: item,
        })
      })
    }

    if (gameData.backgrounds) {
      Object.values(gameData.backgrounds).forEach((bg: any) => {
        entries.push({
          name: bg.name,
          type: 'Background',
          source: bg.source || 'Unknown',
          description: bg.entries?.[0] || '',
          data: bg,
        })
      })
    }

    if (gameData.feats) {
      Object.values(gameData.feats).forEach((feat: any) => {
        entries.push({
          name: feat.name,
          type: 'Feat',
          source: feat.source || 'Unknown',
          description: feat.entries?.[0] || '',
          data: feat,
        })
      })
    }

    if (gameData.skills) {
      Object.values(gameData.skills).forEach((skill: any) => {
        entries.push({
          name: skill.name,
          type: 'Skill',
          source: skill.source || 'Unknown',
          description: skill.entries?.[0] || '',
          data: skill,
        })
      })
    }

    if (gameData.actions) {
      gameData.actions.forEach((action: any) => {
        entries.push({
          name: action.name,
          type: 'Action',
          source: action.source || 'Unknown',
          description: action.entries?.[0] || '',
          data: action,
        })
      })
    }

    if (gameData.conditions) {
      gameData.conditions.forEach((cond: any) => {
        entries.push({
          name: cond.name,
          type: 'Condition',
          source: cond.source || 'Unknown',
          description: cond.entries?.[0] || '',
          data: cond,
        })
      })
    }

    if (gameData.languages) {
      Object.values(gameData.languages).forEach((lang: any) => {
        entries.push({
          name: lang.name,
          type: 'Language',
          source: lang.source || 'Unknown',
          description: lang.entries?.[0] || lang.type || '',
          data: lang,
        })
      })
    }

    if (gameData.deities) {
      gameData.deities.forEach((deity: any) => {
        entries.push({
          name: deity.name,
          type: 'Deity',
          source: deity.source || 'Unknown',
          description: deity.title || deity.alignment || '',
          data: deity,
        })
      })
    }

    return entries
  }, [gameData])

  const allSources = useMemo(
    () => Array.from(new Set(allEntries.map((e) => e.source))).sort(),
    [allEntries],
  )

  const sourceNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of gameData?.sources ?? []) {
      map.set(s.abbreviation, s.name)
    }
    return map
  }, [gameData?.sources])

  const activeFilterCount = activeTypes.size + activeSources.size

  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  const toggleSource = (source: string) => {
    setActiveSources((prev) => {
      const next = new Set(prev)
      next.has(source) ? next.delete(source) : next.add(source)
      return next
    })
  }

  const clearFilters = () => {
    setActiveTypes(new Set())
    setActiveSources(new Set())
  }

  const filteredEntries = useMemo(() => {
    let filtered = allEntries

    if (activeTypes.size > 0) {
      filtered = filtered.filter((entry) => activeTypes.has(entry.type))
    }

    if (activeSources.size > 0) {
      filtered = filtered.filter((entry) => activeSources.has(entry.source))
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (entry) =>
          entry.name.toLowerCase().includes(query) ||
          entry.type.toLowerCase().includes(query) ||
          entry.source.toLowerCase().includes(query),
      )
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }, [allEntries, searchQuery, activeTypes, activeSources])

  const displayedEntries = filteredEntries.slice(0, MAX_DISPLAY)
  const hasMore = filteredEntries.length > MAX_DISPLAY

  if (!gameData) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Data Loaded</CardTitle>
            <CardDescription>
              Please configure and load a data source in Settings before using the Compendium.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Book className="text-3xl text-accent" weight="duotone" />
            <div>
              <h1 className="text-3xl font-display font-bold">Compendium</h1>
              <p className="text-sm text-muted-foreground">
                Search and explore all loaded D&D 5e content
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name, type, or source..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background"
              />
            </div>
            <Button
              variant={filtersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
              onClick={() => setFiltersOpen((o) => !o)}
              className="gap-2 shrink-0"
            >
              <Funnel className="h-4 w-4" weight={activeFilterCount > 0 ? 'fill' : 'regular'} />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{activeFilterCount}</Badge>
              )}
            </Button>
          </div>

          {filtersOpen && (
            <div className="mt-3 pt-3 border-t border-border space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1 w-14 shrink-0">Type</span>
                <div className="flex flex-wrap gap-1.5">
                  {ENTRY_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                        activeTypes.has(t)
                          ? 'bg-accent text-accent-foreground border-accent'
                          : 'bg-background text-foreground border-border hover:border-accent/60',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1 w-14 shrink-0">Source</span>
                <div className="flex-1 space-y-2">
                  <Select
                    value=""
                    onValueChange={(s) => s && toggleSource(s)}
                  >
                    <SelectTrigger className="h-8 w-56 text-xs bg-background">
                      <SelectValue placeholder="Add source filter…" />
                    </SelectTrigger>
                    <SelectContent>
                      {allSources.filter((s) => !activeSources.has(s)).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">{sourceNameMap.get(s) ?? s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeSources.size > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(activeSources).sort().map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleSource(s)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border bg-accent text-accent-foreground border-accent hover:bg-accent/80 transition-colors"
                        >
                          {sourceNameMap.get(s) ?? s} <X className="h-2.5 w-2.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" /> Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full p-6">
          {/* Single split-pane card — same pattern as fizbanes-forge Build pages.
              Left pane: flex-1 (expands when right collapses).
              Right pane: fixed width, collapses to 0 via CSS transition.
              Toggle button: absolutely positioned top-right of the card body. */}
          <Card className="h-full overflow-hidden flex flex-col">
            <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">

              {/* Toggle button — absolute, top-right of the card body */}
              <button
                onClick={() => setDetailCollapsed((c) => !c)}
                title={detailCollapsed ? 'Expand details panel' : 'Collapse details panel'}
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/80 transition-all"
              >
                {detailCollapsed ? (
                  <CaretLeft className="h-3.5 w-3.5" />
                ) : (
                  <CaretRight className="h-3.5 w-3.5" />
                )}
              </button>

              {/* Left pane — always flex-1, expands naturally when right collapses */}
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Results ({filteredEntries.length}
                      {hasMore && ` — showing first ${MAX_DISPLAY}`})
                    </span>
                  </div>
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4 space-y-2">
                    {filteredEntries.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        No entries found
                      </div>
                    ) : (
                      displayedEntries.map((entry) => (
                        <button
                          key={`${entry.type}-${entry.source}-${entry.name}`}
                          onClick={() => {
                            setSelectedEntry(entry)
                            if (detailCollapsed) setDetailCollapsed(false)
                          }}
                          className={cn(
                            'w-full text-left p-3 rounded-lg border transition-colors hover:border-accent',
                            selectedEntry === entry
                              ? 'border-accent bg-accent/10'
                              : 'border-border bg-card'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold truncate">{entry.name}</h3>
                              {entry.description && (
                                <p className="text-sm text-muted-foreground line-clamp-1">
                                  {typeof entry.description === 'string'
                                    ? entry.description
                                    : JSON.stringify(entry.description)}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <Badge variant="outline" className="text-xs">
                                {entry.type}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {entry.source}
                              </Badge>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Right pane — collapses to 0 width via CSS transition, same as forge .info-panel */}
              <div
                className={cn(
                  'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                  detailCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'min-w-[320px]',
                  !detailCollapsed && 'w-[42%]',
                )}
              >
                <div className="p-4 border-b border-border">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Details
                  </span>
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4">
                    {selectedEntry ? (
                      <div className="space-y-4">
                        <div>
                          <h2 className="text-2xl font-display font-bold mb-2">
                            {selectedEntry.name}
                          </h2>
                          <div className="flex gap-2 mb-4">
                            <Badge>{selectedEntry.type}</Badge>
                            <Badge variant="outline">{selectedEntry.source}</Badge>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          {selectedEntry.type === 'Spell' && (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm p-4 bg-muted/50 rounded-lg">
                              <div><span className="text-muted-foreground">Level: </span><span className="font-medium">{selectedEntry.data.level === 0 ? 'Cantrip' : `Level ${selectedEntry.data.level}`}</span></div>
                              <div><span className="text-muted-foreground">School: </span><span className="font-medium capitalize">{selectedEntry.data.school}</span></div>
                              {selectedEntry.data.time?.[0] && <div><span className="text-muted-foreground">Casting Time: </span><span className="font-medium">{selectedEntry.data.time[0].number} {selectedEntry.data.time[0].unit}</span></div>}
                              {selectedEntry.data.range?.distance && <div><span className="text-muted-foreground">Range: </span><span className="font-medium">{selectedEntry.data.range.distance.amount ?? selectedEntry.data.range.distance.type} {selectedEntry.data.range.distance.amount != null ? selectedEntry.data.range.distance.type : ''}</span></div>}
                              {selectedEntry.data.duration?.[0] && <div><span className="text-muted-foreground">Duration: </span><span className="font-medium capitalize">{selectedEntry.data.duration[0].type}{selectedEntry.data.duration[0].duration ? ` ${selectedEntry.data.duration[0].duration.amount} ${selectedEntry.data.duration[0].duration.type}` : ''}</span></div>}
                            </div>
                          )}
                          {(selectedEntry.data.entries ?? []).length > 0 ? (
                            (selectedEntry.data.entries as any[]).map((entry: any, i: number) => (
                              <div
                                key={i}
                                className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
                                dangerouslySetInnerHTML={{ __html: renderEntry(entry) }}
                              />
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground italic">No description available for this entry.</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                        Select an entry to view details
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
