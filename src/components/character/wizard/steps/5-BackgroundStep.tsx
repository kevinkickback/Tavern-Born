import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { GameContent } from '@/components/editor/GameContent'
import { Input } from '@/components/ui/input'
import { extractProficiencyBlockNames } from '@/lib/5etools/proficiencyBlockNames'
import { formatBackgroundAbilityPatterns } from '@/lib/calculations/abilityScoreDisplay'
import { getBackgroundAbilityData } from '@/lib/calculations/abilityScores'
import { normalizeBackgroundForOriginSystem } from '@/lib/calculations/originSystem'
import { parseFeatGrantBlocks } from '@/lib/provenance/applyFeatAndOptionalFeatureGrants'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import type { Background5e } from '@/types/5etools'
import { CreatorEntityDetails, DetailSection } from '../../DetailCards'
import { sortCreatorOptions } from '../sortCreatorOptions'
import type { StepProps } from '../types'

interface BackgroundStepProps extends StepProps {
  backgrounds: Background5e[]
  recursiveLookup: RecursiveLookup
}

function getFirstStringEntry(entries: unknown[]): string {
  for (const entry of entries) {
    if (typeof entry === 'string') return entry
    if (entry && typeof entry === 'object') {
      const nested =
        (entry as { entries?: unknown[]; items?: unknown[] }).entries ??
        (entry as { entries?: unknown[]; items?: unknown[] }).items
      if (Array.isArray(nested)) {
        const found = getFirstStringEntry(nested)
        if (found) return found
      }
    }
  }
  return ''
}

export function BackgroundStep({
  data,
  onChange,
  backgrounds,
  recursiveLookup,
}: BackgroundStepProps) {
  const [search, setSearch] = useState('')
  const filteredBackgrounds = backgrounds
  const orderedBackgrounds = useMemo(() => sortCreatorOptions(backgrounds), [backgrounds])

  const searchFilteredBackgrounds = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return orderedBackgrounds

    return orderedBackgrounds.filter(
      (bg) =>
        bg.name.toLowerCase().includes(query) ||
        bg.source.toLowerCase().includes(query) ||
        getFirstStringEntry([...(bg.fluffEntries ?? []), ...(bg.entries ?? [])])
          .toLowerCase()
          .includes(query),
    )
  }, [orderedBackgrounds, search])

  useEffect(() => {
    if (filteredBackgrounds.length === 0) return

    const hasValidSelection = filteredBackgrounds.some(
      (bg) => bg.name === data.background && (bg.source ?? '') === (data.backgroundSource ?? ''),
    )
    if (hasValidSelection) return

    const firstBackground = filteredBackgrounds[0]
    if (!firstBackground) return

    onChange({
      background: firstBackground.name,
      backgroundSource: firstBackground.source ?? '',
    })
  }, [data.background, data.backgroundSource, filteredBackgrounds, onChange])

  const selectedBackground = data.background
    ? data.backgroundSource
      ? filteredBackgrounds.find(
          (bg) => bg.name === data.background && (bg.source ?? '') === data.backgroundSource,
        )
      : filteredBackgrounds.find((bg) => bg.name === data.background)
    : undefined

  const skillProficiencies = selectedBackground
    ? getBackgroundProficiencyDisplay(selectedBackground.skillProficiencies)
    : 'None'
  const languageProficiencies = selectedBackground
    ? getBackgroundProficiencyDisplay(selectedBackground.languageProficiencies)
    : 'None'
  const toolProficiencies = selectedBackground
    ? getBackgroundProficiencyDisplay(selectedBackground.toolProficiencies)
    : 'None'

  const summary = selectedBackground
    ? getBackgroundOverviewDescription([
        ...(selectedBackground.fluffEntries ?? []),
        ...(selectedBackground.entries ?? []),
      ])
    : ''
  const backgroundFeature = selectedBackground
    ? getBackgroundFeatureBlock(selectedBackground.entries ?? [])
    : null
  const featureEntries = backgroundFeature?.entries ?? []
  const originBackground = normalizeBackgroundForOriginSystem(
    selectedBackground,
    data.originSystem || '2014',
  )
  const abilityPatterns = formatBackgroundAbilityPatterns(
    getBackgroundAbilityData(originBackground),
  )
  const originFeats = parseFeatGrantBlocks(originBackground?.feats)

  return (
    <div className="grid min-w-0 gap-5 md:min-h-0 md:flex-1 md:grid-cols-[minmax(13rem,1fr)_minmax(0,2.6fr)] md:gap-6">
      <div className="flex h-44 min-h-0 min-w-0 flex-col md:h-auto">
        <div className="shrink-0 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-sm">
              Backgrounds
              <span className="text-muted-foreground font-normal ml-1">
                ({filteredBackgrounds.length})
              </span>
            </h3>
          </div>
          <div className="relative">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search backgrounds..."
              className="h-8 pl-8 pr-8 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-2">
          {searchFilteredBackgrounds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No backgrounds found.
            </div>
          ) : (
            searchFilteredBackgrounds.map((bg) => {
              const isSelected =
                bg.name === data.background && (bg.source ?? '') === (data.backgroundSource ?? '')

              return (
                <button
                  type="button"
                  key={`${bg.name}|${bg.source ?? ''}`}
                  onClick={() =>
                    onChange({
                      background: bg.name,
                      backgroundSource: bg.source ?? '',
                    })
                  }
                  aria-pressed={isSelected}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-md transition-colors text-sm border',
                    isSelected
                      ? 'border-primary/50 bg-primary/10 text-foreground'
                      : 'bg-workspace-pane hover:bg-surface-hover border-transparent',
                  )}
                >
                  <div className="font-semibold truncate">{bg.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono">{bg.source}</div>
                </button>
              )
            })
          )}
        </div>
      </div>

      <CreatorEntityDetails
        entity={selectedBackground}
        placeholder="Select a background to view details"
      >
        {selectedBackground && (
          <>
            <div className="max-w-[72ch] space-y-1.5">
              {summary ? (
                <GameContent
                  entry={summary}
                  recursiveLookup={recursiveLookup}
                  className="text-sm text-muted-foreground leading-relaxed"
                />
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  No description available.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 border-y border-border @sm:grid-cols-3 @sm:divide-x @sm:divide-border">
              <DetailSection label="Skill Proficiencies" empty={skillProficiencies === 'None'}>
                {skillProficiencies}
              </DetailSection>
              <DetailSection
                label="Language Proficiencies"
                empty={languageProficiencies === 'None'}
              >
                {languageProficiencies}
              </DetailSection>
              <DetailSection label="Tool Proficiencies" empty={toolProficiencies === 'None'}>
                {toolProficiencies}
              </DetailSection>
            </div>

            {(abilityPatterns.length > 0 || originFeats.length > 0) && (
              <div className="space-y-3">
                {abilityPatterns.length > 0 && (
                  <section className="space-y-1.5">
                    <h4 className="text-sm font-semibold">Ability Score Bonuses</h4>
                    <p className="border-l-2 border-border bg-workspace-pane px-3 py-2 text-sm text-muted-foreground">
                      {abilityPatterns.join(' or ')}
                    </p>
                  </section>
                )}
                {originFeats.length > 0 && (
                  <section className="space-y-1.5">
                    <h4 className="text-sm font-semibold">Origin Feat</h4>
                    <ul className="divide-y divide-border border-y border-border text-sm [&>li]:py-2">
                      {originFeats.map((feat, index) => (
                        <li key={JSON.stringify([feat, index])}>
                          {feat.type === 'fixed' ? (
                            <GameContent
                              entry={`{@feat ${feat.name}|${feat.source}${feat.variant ? `|${feat.name} (${feat.variant})` : ''}}`}
                              recursiveLookup={recursiveLookup}
                            />
                          ) : (
                            'Choose in the Builder'
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {(selectedBackground.edition !== 'one' || featureEntries.length > 0) && (
              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Details
                  </span>
                </div>
                {featureEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No background feature details available.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">
                      Feature: {backgroundFeature?.name ?? 'Unnamed Feature'}
                    </h4>
                    {(() => {
                      const entries = featureEntries
                      const collisionCounts = new Map<string, number>()

                      return entries.map((entry) => {
                        const baseKey = getEntryBaseKey(entry)
                        const seen = collisionCounts.get(baseKey) ?? 0
                        collisionCounts.set(baseKey, seen + 1)
                        const key = seen === 0 ? baseKey : `${baseKey}#${seen}`

                        return (
                          <GameContent
                            key={key}
                            entry={entry}
                            recursiveLookup={recursiveLookup}
                            className="text-sm leading-relaxed"
                          />
                        )
                      })
                    })()}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CreatorEntityDetails>
    </div>
  )
}

function getBackgroundProficiencyDisplay(blocks: unknown[] | undefined): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return 'None'
  const names = extractProficiencyBlockNames(blocks)
  return names.length > 0 ? names.join(', ') : 'None'
}

function getEntryBaseKey(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object') {
    const record = entry as { name?: unknown; source?: unknown; type?: unknown }
    if (typeof record.name === 'string') {
      return `${record.name}|${typeof record.source === 'string' ? record.source : ''}`
    }
    return `obj:${typeof record.type === 'string' ? record.type : 'entry'}`
  }
  return String(entry)
}

function getBackgroundFeatureBlock(
  entries: unknown[],
): { name: string; entries: unknown[] } | null {
  const featureBlock = entries.find((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const record = entry as { name?: unknown; entries?: unknown[] }
    return (
      typeof record.name === 'string' &&
      /^feature\b/i.test(record.name) &&
      Array.isArray(record.entries)
    )
  })

  if (!featureBlock || typeof featureBlock !== 'object') {
    return null
  }

  const featureName = (featureBlock as { name?: unknown }).name
  const featureEntries = (featureBlock as { entries?: unknown[] }).entries

  return {
    name:
      typeof featureName === 'string' && featureName.trim().length > 0
        ? featureName.replace(/^feature\s*:?\s*/i, '').trim()
        : 'Unnamed Feature',
    entries: Array.isArray(featureEntries) ? featureEntries : [],
  }
}

function getBackgroundOverviewDescription(entries: unknown[]): string {
  for (const entry of entries) {
    if (isFeatureEntry(entry)) continue
    const text = getFirstStringEntry([entry])
    if (text) return text
  }
  return ''
}

function isFeatureEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false
  const record = entry as { name?: unknown }
  return typeof record.name === 'string' && /^feature\b/i.test(record.name)
}
