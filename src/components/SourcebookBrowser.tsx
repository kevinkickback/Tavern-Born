import { MagnifyingGlass } from '@phosphor-icons/react'
import { useState } from 'react'
import { SourcebookChoice } from '@/components/SourcebookChoice'
import { Input } from '@/components/ui/input'
import { getSourceCompatibility } from '@/lib/sourceCompatibility'
import { IMPLICIT_SOURCES } from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'
import type { OriginSystem } from '@/types/character'

const groupLabels = new Map([
  ['core', 'Core Rulebooks'],
  ['supplement', 'Supplements'],
  ['setting', 'Setting Books'],
  ['adventure', 'Adventure Books'],
  ['organized-play', 'Organized Play'],
  ['playtest', 'Playtest & Unofficial'],
  ['other', 'Other Sources'],
])

interface SourcebookBrowserProps {
  sources: readonly SourceBook[]
  allowedSources: readonly string[]
  originSystem: OriginSystem
  onToggleSource: (abbreviation: string) => void
  requiredSource?: string
  variant?: 'default' | 'wizard'
}

export function SourcebookBrowser({
  sources,
  allowedSources,
  originSystem,
  onToggleSource,
  requiredSource,
  variant = 'default',
}: SourcebookBrowserProps) {
  const [search, setSearch] = useState('')
  const [requestedCategory, setCategory] = useState('all')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const isWizard = variant === 'wizard'
  const showFilters = sources.some((source) => !IMPLICIT_SOURCES.has(source.abbreviation))
  const selected = new Set(allowedSources)
  const sourcesByGroup = new Map<string, SourceBook[]>()
  for (const source of sources) {
    const group = IMPLICIT_SOURCES.has(source.abbreviation) ? 'core' : source.group
    const books = sourcesByGroup.get(group) ?? []
    books.push(source)
    sourcesByGroup.set(group, books)
  }
  const categories = [...new Set([...groupLabels.keys(), ...sourcesByGroup.keys()])].filter(
    (group) => sourcesByGroup.has(group),
  )
  const category = showFilters && sourcesByGroup.has(requestedCategory) ? requestedCategory : 'all'
  const filterSelected = showFilters && selectedOnly
  const query = showFilters ? search.trim().toLowerCase() : ''
  const visibleGroups = categories.flatMap((group) => {
    if (category !== 'all' && category !== group) return []
    const books = (sourcesByGroup.get(group) ?? [])
      .filter(
        (source) =>
          (!filterSelected ||
            (!IMPLICIT_SOURCES.has(source.abbreviation) && selected.has(source.abbreviation))) &&
          (source.name.toLowerCase().includes(query) ||
            source.abbreviation.toLowerCase().includes(query)),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || a.abbreviation.localeCompare(b.abbreviation))
    return books.length ? [{ group, books }] : []
  })

  return (
    <div className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {showFilters && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-1">
          <div className="relative min-w-36 flex-1">
            <MagnifyingGlass
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search sources"
              placeholder="Find a book by name or code…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-8 pr-14"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute inset-y-0 right-3 text-xs text-primary"
              >
                Clear
              </button>
            )}
          </div>
          <select
            aria-label="Sourcebook category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-9 max-w-full rounded-md border border-border bg-workspace-pane px-2 text-sm focus-visible:outline-ring"
          >
            <option value="all">All sourcebooks</option>
            {categories.map((group) => (
              <option key={group} value={group}>
                {groupLabels.get(group) ?? group}
              </option>
            ))}
          </select>
          <select
            aria-label="Sourcebook selection filter"
            value={filterSelected ? 'selected' : 'all'}
            onChange={(event) => setSelectedOnly(event.target.value === 'selected')}
            className="h-9 max-w-full rounded-md border border-border bg-workspace-pane px-2 text-sm focus-visible:outline-ring"
          >
            <option value="all">Show all</option>
            <option value="selected">Selected only</option>
          </select>
        </div>
      )}
      <section
        // The wizard's scroll region needs native keyboard scrolling.
        tabIndex={isWizard ? 0 : undefined}
        aria-label={isWizard ? 'Additional Content' : 'Sourcebooks'}
        className={cn(
          'min-h-0 flex-1 space-y-4',
          isWizard &&
            'overflow-y-auto rounded-lg border border-border bg-workspace-canvas p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {visibleGroups.length === 0 && showFilters && (
          <p role="status" className="p-3 text-sm text-muted-foreground">
            {category === 'all' && !filterSelected
              ? 'No sources match your search.'
              : 'No books match these filters.'}
          </p>
        )}
        {visibleGroups.map(({ group, books }) => (
          <section key={group} className="space-y-2">
            <h4 className="flex items-baseline gap-2 text-sm font-semibold">
              {groupLabels.get(group) ?? group}
              <span aria-hidden="true" className="text-xs font-normal text-muted-foreground">
                {books.length}
              </span>
            </h4>
            <div
              className={cn(
                'grid gap-2 @min-[25rem]:grid-cols-2 @min-[54rem]:grid-cols-3',
                !isWizard && '@min-[68rem]:grid-cols-4',
              )}
            >
              {books.map((source) => (
                <SourcebookChoice
                  key={source.abbreviation}
                  source={source}
                  selected={selected.has(source.abbreviation)}
                  required={source.abbreviation === requiredSource}
                  compatibility={getSourceCompatibility(source, originSystem)}
                  onClick={() => onToggleSource(source.abbreviation)}
                  variant={variant}
                  className={isWizard ? undefined : 'min-h-14 cursor-pointer transition-colors'}
                />
              ))}
            </div>
          </section>
        ))}
        {!showFilters && (
          <p className="py-2 text-sm text-muted-foreground">
            No additional content is available. To add sourcebooks, open Settings → Game Data.
          </p>
        )}
      </section>
    </div>
  )
}
