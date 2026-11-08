import { BookOpen, CaretDown, Check, Info, MagnifyingGlass, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { SourcebookChoice } from '@/components/SourcebookChoice'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  getSourceCompatibility,
  normalizeAllowedSources,
  normalizeSelectableAllowedSources,
} from '@/lib/sourceCompatibility'
import {
  getImplicitSource,
  IMPLICIT_SOURCES,
  SOURCE_PRESETS,
  type SourcePreset,
} from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'
import type { StepProps } from '../types'

export function ContentStep({
  data,
  onChange,
  sources = [],
  isBundledSrd = false,
}: StepProps & {
  sources?: SourceBook[]
  isBundledSrd?: boolean
}) {
  const [search, setSearch] = useState('')
  const [requestedCategory, setCategory] = useState('all')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const selectableSources = sources.filter((source) => source.hasCharacterOptions !== false)
  const displaySources = sources.filter(
    (source) => source.hasCharacterOptions !== false || IMPLICIT_SOURCES.has(source.abbreviation),
  )
  const hasAdditionalSources = selectableSources.some(
    (source) => !IMPLICIT_SOURCES.has(source.abbreviation),
  )
  const query = hasAdditionalSources ? search.trim().toLowerCase() : ''
  const filterSelected = hasAdditionalSources && selectedOnly
  const includedCore = data.originSystem ? getImplicitSource(data.originSystem) : undefined
  if (includedCore && displaySources.some((source) => source.abbreviation === includedCore)) {
    const otherEdition = data.originSystem === '2024' ? '2014' : '2024'
    const otherCore = getImplicitSource(otherEdition)
    if (!displaySources.some((source) => source.abbreviation === otherCore)) {
      // This is a disabled reference in the UI. Only the loaded catalog supplies selectable content.
      displaySources.push({
        abbreviation: otherCore,
        name: "Player's Handbook",
        group: 'core',
        year: Number(otherEdition),
        hasCharacterOptions: false,
      })
    }
  }
  const configuredSources = data.allowedSources || []
  const allowedSources = data.originSystem
    ? normalizeSelectableAllowedSources(configuredSources, data.originSystem, sources)
    : configuredSources
  const selected = new Set(allowedSources)
  const availableSourceSet = new Set(selectableSources.map((source) => source.abbreviation))

  const sourcesByGroup = displaySources.reduce<Record<string, SourceBook[]>>((acc, source) => {
    const group = IMPLICIT_SOURCES.has(source.abbreviation) ? 'core' : source.group
    if (!acc[group]) acc[group] = []
    acc[group].push(source)
    return acc
  }, {})

  const groupLabels: Record<string, string> = {
    core: 'Core Rulebooks',
    supplement: 'Supplements',
    setting: 'Setting Books',
    adventure: 'Adventure Books',
    'organized-play': 'Organized Play',
    playtest: 'Playtest & Unofficial',
    other: 'Other Sources',
  }

  const groupOrder = [
    ...new Set([
      'core',
      'supplement',
      'setting',
      'adventure',
      'organized-play',
      'playtest',
      'other',
      ...Object.keys(sourcesByGroup),
    ]),
  ]

  const category =
    hasAdditionalSources && sourcesByGroup[requestedCategory]?.length ? requestedCategory : 'all'
  const visibleGroups = groupOrder.flatMap((group) => {
    if (category !== 'all' && category !== group) return []
    const books = (sourcesByGroup[group] ?? [])
      .filter(
        (source) =>
          (!filterSelected ||
            (!IMPLICIT_SOURCES.has(source.abbreviation) && selected.has(source.abbreviation))) &&
          (source.name.toLowerCase().includes(query) ||
            source.abbreviation.toLowerCase().includes(query)),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || a.abbreviation.localeCompare(b.abbreviation))
    return books.length > 0 ? [{ group, books }] : []
  })

  const toggleSource = (sourceAbbr: string) => {
    if (IMPLICIT_SOURCES.has(sourceAbbr)) return
    const source =
      selectableSources.find((candidate) => candidate.abbreviation === sourceAbbr) ?? sourceAbbr
    if (data.originSystem && !getSourceCompatibility(source, data.originSystem).compatible) return
    const currentSources = allowedSources
    const nextSources = currentSources.includes(sourceAbbr)
      ? currentSources.filter((source) => source !== sourceAbbr)
      : [...currentSources, sourceAbbr]
    const normalizedSources = data.originSystem
      ? normalizeAllowedSources(nextSources, data.originSystem, sources)
      : nextSources
    onChange({ allowedSources: normalizedSources })
  }

  const applySourcePreset = (preset: SourcePreset) => {
    const presetSources = preset.abbreviations.filter((abbreviation) =>
      availableSourceSet.has(abbreviation),
    )
    onChange({
      allowedSources: data.originSystem
        ? normalizeAllowedSources(presetSources, data.originSystem, sources)
        : presetSources,
    })
  }

  const isPresetActive = (preset: SourcePreset) => {
    const availablePresetSources = preset.abbreviations.filter((abbreviation) =>
      availableSourceSet.has(abbreviation),
    )
    const presetSources = data.originSystem
      ? normalizeSelectableAllowedSources(availablePresetSources, data.originSystem, sources)
      : availablePresetSources
    if (presetSources.length === 0 || presetSources.length !== allowedSources.length) {
      return false
    }
    return presetSources.every((abbreviation) => allowedSources.includes(abbreviation))
  }

  const activePreset =
    allowedSources.length === 0 ? 'none' : (SOURCE_PRESETS.find(isPresetActive)?.id ?? 'custom')
  const presetSourceAbbreviations = new Set(
    SOURCE_PRESETS.flatMap((preset) => preset.abbreviations),
  )
  const hasNonPresetSourcesSelected = allowedSources.some(
    (abbreviation) => !presetSourceAbbreviations.has(abbreviation),
  )

  const sourceGuidance = 'Choose the sourcebooks you want to use for this character.'
  const sourceWarning =
    'Non-recommended sources often contain DM-only or outdated options. Select them only if your campaign uses them.'

  return (
    <section className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-2 max-lg:gap-1.5">
      <div className="shrink-0 pb-1">
        {!isBundledSrd && hasAdditionalSources && (
          <div className="flex flex-wrap items-center gap-2">
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
              {groupOrder
                .filter((group) => sourcesByGroup[group]?.length > 0)
                .map((group) => (
                  <option key={group} value={group}>
                    {groupLabels[group] ?? group}
                  </option>
                ))}
            </select>
            <Button
              type="button"
              variant={filterSelected ? 'secondary' : 'outline'}
              className="h-9"
              aria-label={`${filterSelected ? 'Show all sourcebooks' : 'Show selected sourcebooks'} (${allowedSources.length} selected)`}
              onClick={() => setSelectedOnly(!filterSelected)}
            >
              {filterSelected ? 'Show all · ' : ''}
              <span data-allowed-sources-count={allowedSources.length > 0 ? '' : undefined}>
                {allowedSources.length}
              </span>{' '}
              selected
            </Button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  aria-label="Sourcebook presets"
                >
                  Presets <CaretDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SOURCE_PRESETS.map((preset) => (
                  <DropdownMenuItem
                    key={preset.id}
                    title={preset.description}
                    aria-current={activePreset === preset.id}
                    onSelect={() => applySourcePreset(preset)}
                  >
                    {activePreset === preset.id && <Check aria-hidden="true" />}
                    {preset.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  aria-current={activePreset === 'none'}
                  onSelect={() => onChange({ allowedSources: [] })}
                >
                  {activePreset === 'none' && <Check aria-hidden="true" />}
                  None
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {isBundledSrd ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm font-semibold">Using the included SRD</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            The included SRD does not provide additional sourcebooks to enable. To add more options,
            open Settings → Game Data and add compatible 5etools data.
          </p>
        </div>
      ) : displaySources.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No additional content is available. To add sourcebooks, open Settings → Game Data.
        </p>
      ) : (
        <>
          <section
            // biome-ignore lint/a11y/noNoninteractiveTabindex: This named scroll region needs native keyboard scrolling.
            tabIndex={0}
            aria-label="Additional Content"
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {visibleGroups.length === 0 && (
              <p role="status" className="p-3 text-sm text-muted-foreground">
                {category === 'all' && !filterSelected
                  ? 'No sources match your search.'
                  : 'No books match these filters.'}
              </p>
            )}
            {visibleGroups.map(({ group, books }) => (
              <section key={group} className="space-y-2">
                <h4 className="flex items-baseline gap-2 text-sm font-semibold">
                  {groupLabels[group] ?? group}
                  <span aria-hidden="true" className="text-xs font-normal text-muted-foreground">
                    {books.length}
                  </span>
                </h4>
                <div className="grid gap-2 @min-[25rem]:grid-cols-2 @min-[54rem]:grid-cols-3">
                  {books.map((source) => (
                    <SourcebookChoice
                      key={source.abbreviation}
                      source={source}
                      selected={selected.has(source.abbreviation)}
                      included={source.abbreviation === includedCore}
                      compatibility={
                        data.originSystem
                          ? getSourceCompatibility(source, data.originSystem)
                          : { compatible: !IMPLICIT_SOURCES.has(source.abbreviation) }
                      }
                      onClick={() => toggleSource(source.abbreviation)}
                      showSelection
                      wrapName
                    />
                  ))}
                </div>
              </section>
            ))}
            {!hasAdditionalSources && (
              <p className="py-2 text-sm text-muted-foreground">
                No additional content is available. To add sourcebooks, open Settings → Game Data.
              </p>
            )}
          </section>
          {hasAdditionalSources && (
            <div className="shrink-0 space-y-1.5 text-xs leading-relaxed">
              <div
                className="grid border-l-2 border-border bg-surface-raised/50"
                aria-live="polite"
                aria-atomic="true"
              >
                <p
                  aria-hidden={hasNonPresetSourcesSelected}
                  className={cn(
                    'col-start-1 row-start-1 flex items-start gap-2 px-3 py-1 text-muted-foreground transition-opacity duration-200 motion-reduce:transition-none',
                    hasNonPresetSourcesSelected && 'opacity-0',
                  )}
                >
                  <BookOpen className="mt-0.5 size-4 shrink-0" />
                  <span>{sourceGuidance}</span>
                </p>
                <p
                  aria-hidden={!hasNonPresetSourcesSelected}
                  className={cn(
                    'col-start-1 row-start-1 flex items-start gap-2 px-3 py-1 text-warning-foreground transition-opacity duration-200 motion-reduce:transition-none',
                    !hasNonPresetSourcesSelected && 'opacity-0',
                  )}
                >
                  <Warning className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>{sourceWarning}</span>
                </p>
              </div>
              {data.originSystem === '2024' && (
                <p className="flex items-start gap-2 text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    Revised replacements are always used. Compatible older options remain available
                    when no revised version exists.
                  </span>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
