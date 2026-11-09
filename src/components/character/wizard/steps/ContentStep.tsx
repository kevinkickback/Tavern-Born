import { Info, Warning } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { SourcebookBrowser } from '@/components/SourcebookBrowser'
import { Button } from '@/components/ui/button'
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
  renderIntro,
}: StepProps & {
  sources?: SourceBook[]
  isBundledSrd?: boolean
  renderIntro?: (titleAccessory?: ReactNode, actions?: ReactNode) => ReactNode
}) {
  const selectableSources = sources.filter((source) => source.hasCharacterOptions !== false)
  const displaySources = sources.filter(
    (source) => source.hasCharacterOptions !== false || IMPLICIT_SOURCES.has(source.abbreviation),
  )
  const hasAdditionalSources = selectableSources.some(
    (source) => !IMPLICIT_SOURCES.has(source.abbreviation),
  )
  const includedCore = getImplicitSource(data.originSystem)
  if (displaySources.some((source) => source.abbreviation === includedCore)) {
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
  const allowedSources = normalizeSelectableAllowedSources(
    data.allowedSources,
    data.originSystem,
    sources,
  )
  const availableSourceSet = new Set(selectableSources.map((source) => source.abbreviation))

  const toggleSource = (sourceAbbr: string) => {
    if (IMPLICIT_SOURCES.has(sourceAbbr)) return
    const source =
      selectableSources.find((candidate) => candidate.abbreviation === sourceAbbr) ?? sourceAbbr
    if (!getSourceCompatibility(source, data.originSystem).compatible) return
    const nextSources = allowedSources.includes(sourceAbbr)
      ? allowedSources.filter((source) => source !== sourceAbbr)
      : [...allowedSources, sourceAbbr]
    onChange({ allowedSources: normalizeAllowedSources(nextSources, data.originSystem, sources) })
  }

  const getPresetSources = (preset: SourcePreset) =>
    normalizeSelectableAllowedSources(
      preset.abbreviations.filter((abbreviation) => availableSourceSet.has(abbreviation)),
      data.originSystem,
      sources,
    )

  const isPresetActive = (preset: SourcePreset) => {
    const presetSources = getPresetSources(preset)
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

  const sourceWarning =
    'Books outside the presets can include DM-only or outdated options. Select them only if your campaign uses them.'

  const count = !isBundledSrd && allowedSources.length > 0 && (
    <span className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <span data-allowed-sources-count>{allowedSources.length}</span> selected
    </span>
  )
  const presets = !isBundledSrd && hasAdditionalSources && (
    <fieldset
      className="ml-auto flex flex-wrap items-center justify-end gap-1.5"
      aria-label="Sourcebook presets"
    >
      <span className="mr-1 text-xs text-muted-foreground">Presets</span>
      {SOURCE_PRESETS.map((preset) => (
        <Button
          key={preset.id}
          type="button"
          size="sm"
          variant={activePreset === preset.id ? 'default' : 'outline'}
          aria-pressed={activePreset === preset.id}
          title={preset.description}
          onClick={() => onChange({ allowedSources: getPresetSources(preset) })}
        >
          {preset.label}
        </Button>
      ))}
      <Button
        type="button"
        size="sm"
        variant={activePreset === 'none' ? 'default' : 'outline'}
        aria-pressed={activePreset === 'none'}
        onClick={() => onChange({ allowedSources: [] })}
      >
        None
      </Button>
    </fieldset>
  )

  return (
    <section className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-2 max-lg:gap-1.5">
      {renderIntro ? renderIntro(count, presets) : presets}
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
          <SourcebookBrowser
            sources={displaySources}
            allowedSources={allowedSources}
            originSystem={data.originSystem}
            requiredSource={includedCore}
            onToggleSource={toggleSource}
            variant="wizard"
          />
          {hasAdditionalSources && (
            <div className="shrink-0 space-y-1.5 text-xs leading-relaxed">
              <div aria-live="polite" aria-atomic="true">
                <p
                  aria-hidden={!hasNonPresetSourcesSelected}
                  className={cn(
                    'flex items-start gap-2 border-l-2 border-border bg-surface-raised/50 px-3 py-1 text-warning-foreground transition-opacity duration-200 motion-reduce:transition-none',
                    !hasNonPresetSourcesSelected && 'opacity-0',
                  )}
                >
                  <Warning className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
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
