import { BookOpen, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { SourcebookChoice } from '@/components/SourcebookChoice'
import { Input } from '@/components/ui/input'
import type { VariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import {
  getSourceCompatibility,
  normalizeAllowedSources,
  normalizeSelectableAllowedSources,
} from '@/lib/sourceCompatibility'
import { IMPLICIT_SOURCES, SOURCE_PRESETS, type SourcePreset } from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'
import type { StepProps } from '../types'
import { NO_CONTENT_SPECIFIC_RULES, WizardVariantOptions } from '../WizardVariantOptions'

export function ContentStep({
  data,
  onChange,
  sources = [],
  contentAvailability = NO_CONTENT_SPECIFIC_RULES,
  isBundledSrd = false,
}: StepProps & {
  sources?: SourceBook[]
  contentAvailability?: VariantRuleContentAvailability
  isBundledSrd?: boolean
}) {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const selectableSources = sources.filter((source) => source.hasCharacterOptions !== false)
  const displaySources = selectableSources.filter(
    (source) => !IMPLICIT_SOURCES.has(source.abbreviation),
  )
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
  const preferNewerPrintingsEnabled =
    data.originSystem === '2024' || (data.variantRules?.preferNewerPrintings ?? false)

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 md:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" weight="fill" />
            <h4 className="font-semibold text-lg">Additional Content</h4>
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
            <div className="flex items-center gap-2 text-sm flex-wrap justify-end">
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
              ].map((action, index, allActions) => (
                <div key={action.key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={action.onClick}
                    className={cn(
                      'font-medium text-primary hover:underline',
                      action.active && 'underline',
                    )}
                    title={action.title}
                  >
                    {action.label}
                  </button>
                  {index < allActions.length - 1 && (
                    <span className="text-muted-foreground">|</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {isBundledSrd ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm font-semibold text-foreground">Using the included SRD</p>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
              The included SRD does not provide additional sourcebooks to enable. To add more
              options, open Settings → Game Data and add compatible 5etools data.
            </p>
          </div>
        ) : displaySources.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-border rounded-lg">
            No additional content is available. To add sourcebooks, open Settings → Game Data.
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div className="relative shrink-0">
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
                    <div className="grid grid-cols-2 gap-2">
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
                            className="transition-all"
                            wrapName
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </section>
          </div>
        )}
      </section>

      <aside className="shrink-0 space-y-5 md:w-56 md:overflow-y-auto md:border-l md:border-border md:pl-5">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Options for this content</h3>
          <WizardVariantOptions
            data={data}
            onChange={onChange}
            keys={['optionalClassFeatures', 'anyRaceSubclasses', 'preferNewerPrintings']}
            contentAvailability={contentAvailability}
          />
        </section>{' '}
        <div aria-live="polite" className="contents">
          {hasNonPresetSourcesSelected && (
            <div className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
              <Warning className="h-3.5 w-3.5 flex-shrink-0 text-warning" />
              <span>
                Non-recommended sources often contain DM-only or outdated content. These may clutter
                your options with material not intended for players.
              </span>
            </div>
          )}

          {data.originSystem === '2024' && (
            <div className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
              <Warning className="h-3.5 w-3.5 flex-shrink-0 text-warning" />
              <span>
                {preferNewerPrintingsEnabled
                  ? 'Revised replacements are always used. Compatible older options remain available when no revised version exists.'
                  : ''}
              </span>
            </div>
          )}

          {data.originSystem === '2014' && (
            <div className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
              <Warning className="h-3.5 w-3.5 flex-shrink-0 text-warning" />
              <span>
                {preferNewerPrintingsEnabled
                  ? 'Older printings are hidden where a newer version exists in your selected sources. Disable "Prefer Newer Printings" to see all options.'
                  : 'Some races and features appear in multiple printings across your selected sources (e.g., ERLW content updated in MPMM). Enable "Prefer Newer Printings" to automatically hide older versions.'}
              </span>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
