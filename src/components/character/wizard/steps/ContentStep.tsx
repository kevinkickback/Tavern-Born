import { BookOpen, Info, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { SourcebookChoice } from '@/components/SourcebookChoice'
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
  const query = search.trim().toLowerCase()
  const selectableSources = sources.filter((source) => source.hasCharacterOptions !== false)
  const displaySources = selectableSources.filter(
    (source) => !IMPLICIT_SOURCES.has(source.abbreviation),
  )
  const coreSource = data.originSystem
    ? selectableSources.find(
        (source) => source.abbreviation === getImplicitSource(data.originSystem || '2014'),
      )
    : undefined
  const configuredSources = data.allowedSources || []
  const allowedSources = data.originSystem
    ? normalizeSelectableAllowedSources(configuredSources, data.originSystem, sources)
    : configuredSources
  const availableSourceSet = new Set(selectableSources.map((source) => source.abbreviation))

  const sourcesByGroup = displaySources.reduce<Record<string, SourceBook[]>>((acc, source) => {
    if (!acc[source.group]) {
      acc[source.group] = []
    }
    acc[source.group].push(source)
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

  const toggleSource = (sourceAbbr: string) => {
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

  const selectNoneSources = () => {
    onChange({ allowedSources: [] })
  }

  const isPresetActive = (preset: SourcePreset) => {
    const availablePresetSources = preset.abbreviations.filter((abbreviation) =>
      availableSourceSet.has(abbreviation),
    )
    const presetSources = data.originSystem
      ? normalizeSelectableAllowedSources(availablePresetSources, data.originSystem, sources)
      : availablePresetSources
    if (presetSources.length !== allowedSources.length) {
      return false
    }
    return presetSources.every((abbreviation) => allowedSources.includes(abbreviation))
  }

  const presetSourceAbbreviations = new Set(
    SOURCE_PRESETS.flatMap((preset) => preset.abbreviations),
  )
  const hasNonPresetSourcesSelected = allowedSources.some(
    (abbreviation) => !presetSourceAbbreviations.has(abbreviation),
  )

  const sourceGuidance = 'Choose the sourcebooks you want to use for this character.'
  const sourceWarning =
    'Non-recommended sources often contain DM-only or outdated options. Select them only if your campaign uses them.'

  const includedSource = coreSource && (
    <div className="flex items-center justify-between gap-3 border-y border-border px-2 py-2 text-sm">
      <span className="font-semibold">{coreSource.name}</span>
      <span className="text-xs text-muted-foreground">Included</span>
    </div>
  )

  return (
    <section className="@container flex min-h-0 min-w-0 flex-1 flex-col">
      {!isBundledSrd && displaySources.length > 0 && (
        <div className="relative mb-1.5 shrink-0">
          <Input
            aria-label="Search sources"
            placeholder="Search by name or abbreviation…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pr-16"
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
      )}
      <div className="mb-1.5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Additional Content</h3>
          {!isBundledSrd && allowedSources.length > 0 && (
            <span
              data-allowed-sources-count
              className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold px-2 py-0.5 min-w-[1.5rem]"
            >
              {allowedSources.length}
            </span>
          )}
        </div>
        {!isBundledSrd && (
          <div className="flex flex-wrap gap-1.5">
            {[
              ...SOURCE_PRESETS.map((preset) => ({
                key: preset.id,
                label: preset.label,
                title: preset.description,
                onClick: () => applySourcePreset(preset),
                active: isPresetActive(preset),
              })),
              {
                key: 'none',
                label: 'None',
                title: 'Clear all selected content',
                onClick: selectNoneSources,
                active: false,
              },
            ].map((action) => (
              <button
                key={action.key}
                type="button"
                aria-pressed={action.active}
                onClick={action.onClick}
                className={cn(
                  'rounded-md border border-border bg-workspace-pane px-2.5 py-1 text-xs hover:bg-surface-hover',
                  action.active && 'border-primary/50 bg-primary/10 text-primary',
                )}
                title={action.title}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {isBundledSrd ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm font-semibold text-foreground">Using the included SRD</p>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
            The included SRD does not provide additional sourcebooks to enable. To add more options,
            open Settings → Game Data and add compatible 5etools data.
          </p>
        </div>
      ) : displaySources.length === 0 ? (
        <>
          {includedSource}
          <p className="py-4 text-sm text-muted-foreground">
            No additional content is available. To add sourcebooks, open Settings → Game Data.
          </p>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {query &&
            !displaySources.some(
              (source) =>
                source.name.toLowerCase().includes(query) ||
                source.abbreviation.toLowerCase().includes(query),
            ) && (
              <p role="status" className="py-6 text-sm text-muted-foreground">
                No sources match your search.
              </p>
            )}
          <section
            // biome-ignore lint/a11y/noNoninteractiveTabindex: This named scroll region needs native keyboard scrolling.
            tabIndex={0}
            aria-label="Additional Content"
            className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {!query && includedSource}
            {groupOrder.map((group) => {
              const groupSources = sourcesByGroup[group]?.filter(
                (source) =>
                  !query ||
                  source.name.toLowerCase().includes(query) ||
                  source.abbreviation.toLowerCase().includes(query),
              )
              if (!groupSources || groupSources.length === 0) return null

              return (
                <div key={group} className="space-y-1.5">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {groupLabels[group] ?? group}
                  </h5>
                  <div className="divide-y divide-border border-y border-border">
                    {groupSources.map((source) => {
                      const compatibility = data.originSystem
                        ? getSourceCompatibility(source, data.originSystem)
                        : { compatible: true }
                      return (
                        <SourcebookChoice
                          key={source.abbreviation}
                          source={source}
                          selected={allowedSources.includes(source.abbreviation)}
                          compatibility={compatibility}
                          onClick={() => toggleSource(source.abbreviation)}
                          row
                          wrapName
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>
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
        </div>
      )}
    </section>
  )
}
