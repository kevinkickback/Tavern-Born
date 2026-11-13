import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  formatProficiencyList,
  getSavingThrowsDisplay,
  getSpellcastingStatDisplay,
} from '@/lib/calculations/classUtils'
import { getClassSummary } from '@/lib/calculations/entrySummary'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import type { Class5e } from '@/types/5etools'
import { CreatorEntityDetails, DetailHtmlSection, DetailSection } from '../../DetailCards'
import { TraitTooltip } from '../../TraitTooltip'
import { sortCreatorOptions } from '../sortCreatorOptions'
import type { StepProps } from '../types'

interface ClassStepProps extends StepProps {
  classes: Class5e[]
  recursiveLookup: RecursiveLookup
}

export function ClassStep({ data, onChange, classes, recursiveLookup }: ClassStepProps) {
  const [search, setSearch] = useState('')
  const filteredClasses = classes
  const orderedClasses = useMemo(() => sortCreatorOptions(classes), [classes])
  const searchFilteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return orderedClasses
    return orderedClasses.filter(
      (cls) => cls.name.toLowerCase().includes(query) || cls.source.toLowerCase().includes(query),
    )
  }, [orderedClasses, search])

  const selectedClass = data.class
    ? data.classSource
      ? filteredClasses.find(
          (cls) => cls.name === data.class && (cls.source ?? '') === data.classSource,
        )
      : filteredClasses.find((cls) => cls.name === data.class)
    : undefined

  useEffect(() => {
    if (filteredClasses.length === 0) return

    const hasValidSelection = filteredClasses.some(
      (cls) => cls.name === data.class && (cls.source ?? '') === (data.classSource ?? ''),
    )
    if (hasValidSelection) return

    const firstClass = orderedClasses[0]
    if (!firstClass) return

    onChange({ class: firstClass.name, classSource: firstClass.source ?? '' })
  }, [data.class, data.classSource, filteredClasses, onChange, orderedClasses])

  const spellcastingStat = selectedClass ? getSpellcastingStatDisplay(selectedClass) : 'None'
  const savingThrows = selectedClass ? getSavingThrowsDisplay(selectedClass) : 'None'
  const armorHtml = selectedClass
    ? formatProficiencyList(selectedClass.startingProficiencies?.armor, 'armor')
    : null
  const weaponsHtml = selectedClass
    ? formatProficiencyList(selectedClass.startingProficiencies?.weapons, 'weapon')
    : null
  const toolsHtml = selectedClass
    ? formatProficiencyList(selectedClass.startingProficiencies?.tools)
    : null
  const classSummary = selectedClass ? getClassSummary(selectedClass) : null
  const classFeatures = selectedClass ? getClassFeatures(selectedClass) : []

  return (
    <div className="grid min-w-0 gap-5 md:min-h-0 md:flex-1 md:grid-cols-[minmax(13rem,1fr)_minmax(0,2.6fr)] md:gap-6">
      <div className="flex h-44 min-h-0 min-w-0 flex-col md:h-auto">
        <div className="shrink-0 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-sm">
              Classes
              <span className="text-muted-foreground font-normal ml-1">
                ({filteredClasses.length})
              </span>
            </h3>
          </div>
          <div className="relative">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search classes..."
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
          {searchFilteredClasses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No classes found.</div>
          ) : (
            searchFilteredClasses.map((cls) => {
              const isSelected =
                cls.name === data.class && (cls.source ?? '') === (data.classSource ?? '')

              return (
                <button
                  type="button"
                  key={`${cls.name}|${cls.source ?? ''}`}
                  onClick={() => onChange({ class: cls.name, classSource: cls.source ?? '' })}
                  aria-pressed={isSelected}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-md transition-colors text-sm border',
                    isSelected
                      ? 'border-primary/50 bg-primary/10 text-foreground'
                      : 'bg-workspace-pane hover:bg-surface-hover border-transparent',
                  )}
                >
                  <div className="font-semibold truncate">{cls.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{cls.source}</span>
                    <span>· d{cls.hd?.faces ?? 6}</span>
                    {cls.spellcastingAbility && <span>· Spellcaster</span>}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      <CreatorEntityDetails entity={selectedClass} placeholder="Select a class to view details">
        {selectedClass && (
          <>
            {classSummary && (
              <div className="max-w-[72ch] space-y-1.5">
                <p className="text-sm leading-relaxed text-muted-foreground">{classSummary}</p>
              </div>
            )}

            <div className="grid grid-cols-1 border-y border-border @sm:grid-cols-3 @sm:divide-x @sm:divide-border">
              <DetailSection label="Hit Dice">d{selectedClass.hd?.faces ?? 6}</DetailSection>

              <DetailSection label="Saving Throws">{savingThrows}</DetailSection>

              <DetailSection label="Spellcasting Stat">{spellcastingStat}</DetailSection>
            </div>

            <div>
              <h4 className="border-b border-border pb-2 text-sm font-semibold">Training</h4>
              <DetailHtmlSection
                label="Armor Proficiencies"
                html={armorHtml}
                recursiveLookup={recursiveLookup}
              />
              <DetailHtmlSection
                label="Weapon Proficiencies"
                html={weaponsHtml}
                recursiveLookup={recursiveLookup}
              />
              <DetailHtmlSection
                label="Tool Proficiencies"
                html={toolsHtml}
                recursiveLookup={recursiveLookup}
              />
            </div>

            {classFeatures.length > 0 && (
              <div className="border-t border-border pt-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Signature Features
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {classFeatures.map((feature) => (
                    <TraitTooltip
                      key={`${feature.name}|${feature.source ?? ''}`}
                      previewKey={JSON.stringify([
                        'class-feature',
                        selectedClass.name,
                        selectedClass.source,
                        feature.name,
                        feature.source,
                        feature.entries,
                      ])}
                      name={feature.name}
                      source={feature.source}
                      entries={feature.entries}
                      recursiveLookup={recursiveLookup}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CreatorEntityDetails>
    </div>
  )
}

function getClassFeatures(
  classData: Class5e,
): Array<{ name: string; source?: string; entries: unknown[] }> {
  const features = new Map<string, { name: string; source?: string; entries: unknown[] }>()

  for (const feature of classData.classFeatures ?? []) {
    if (!feature || typeof feature === 'string') continue
    const key = `${feature.name ?? ''}|${feature.source ?? ''}`
    if (!feature.name || features.has(key)) continue
    features.set(key, {
      name: feature.name,
      source: feature.source,
      entries: feature.entries ?? [],
    })
  }

  for (const featureRef of classData.classFeatureRefs ?? []) {
    const key = `${featureRef.name ?? ''}|${featureRef.source ?? ''}`
    if (!featureRef.name) continue
    const resolvedEntries = featureRef.feature?.entries ?? []
    const existing = features.get(key)

    if (!existing) {
      features.set(key, {
        name: featureRef.name,
        source: featureRef.source,
        entries: resolvedEntries,
      })
      continue
    }

    if (existing.entries.length === 0 && resolvedEntries.length > 0) {
      features.set(key, {
        ...existing,
        entries: resolvedEntries,
      })
    }
  }

  return Array.from(features.values()).slice(0, 8)
}
