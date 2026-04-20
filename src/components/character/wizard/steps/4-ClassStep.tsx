import {
  BookOpen,
  ChartBar,
  MagicWand,
  MagnifyingGlass,
  Shield,
  Sword,
  Toolbox,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { buildSuppressedKeys } from '@/lib/5etools/reprints'
import {
  formatProficiencyList,
  getSavingThrowsDisplay,
  getSpellcastingStatDisplay,
} from '@/lib/calculations/classUtils'
import { getClassSummary } from '@/lib/calculations/entrySummary'
import { cn } from '@/lib/utils'
import type { Class5e } from '@/types/5etools'
import { DetailHtmlSection, DetailSection } from '../../DetailCards'
import { TraitTooltip } from '../../TraitTooltip'
import type { StepProps } from '../types'

interface ClassStepProps extends StepProps {
  classes: Class5e[]
}

export function ClassStep({ data, onChange, classes }: ClassStepProps) {
  const [search, setSearch] = useState('')
  const allowedSources = data.allowedSources ?? []
  const sourceFilteredClasses =
    allowedSources.length > 0
      ? classes.filter((cls) => allowedSources.includes(cls.source))
      : classes
  const suppressedClassKeys =
    data.variantRules?.preferNewerPrintings && allowedSources.length > 0
      ? buildSuppressedKeys(sourceFilteredClasses, new Set(allowedSources))
      : undefined
  const filteredClasses = sourceFilteredClasses.filter(
    (cls) => !suppressedClassKeys?.has(`${cls.name}|${cls.source}`),
  )
  const searchFilteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return filteredClasses
    return filteredClasses.filter(
      (cls) => cls.name.toLowerCase().includes(query) || cls.source.toLowerCase().includes(query),
    )
  }, [filteredClasses, search])

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

    const firstClass = filteredClasses[0]
    if (!firstClass) return

    onChange({ class: firstClass.name, classSource: firstClass.source ?? '' })
  }, [data.class, data.classSource, filteredClasses, onChange])

  const spellcastingStat = selectedClass ? getSpellcastingStatDisplay(selectedClass) : 'None'
  const savingThrows = selectedClass ? getSavingThrowsDisplay(selectedClass) : 'None'
  const armorHtml = selectedClass
    ? formatProficiencyList(selectedClass.startingProficiencies?.armor)
    : null
  const weaponsHtml = selectedClass
    ? formatProficiencyList(selectedClass.startingProficiencies?.weapons)
    : null
  const toolsHtml = selectedClass
    ? formatProficiencyList(selectedClass.startingProficiencies?.tools)
    : null
  const classSummary = selectedClass ? getClassSummary(selectedClass) : null
  const classFeatures = selectedClass ? getClassFeatures(selectedClass) : []

  return (
    <div className="flex h-full gap-5">
      <div className="w-72 flex-shrink-0 flex flex-col rounded-lg border border-border bg-muted/20">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <MagicWand className="h-4 w-4 text-primary" weight="fill" />
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

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {searchFilteredClasses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {allowedSources.length > 0
                ? 'No classes found in selected sources.'
                : 'No classes found.'}
            </div>
          ) : (
            searchFilteredClasses.map((cls) => {
              const isSelected =
                cls.name === data.class && (cls.source ?? '') === (data.classSource ?? '')

              return (
                <button
                  type="button"
                  key={`${cls.name}|${cls.source ?? ''}`}
                  onClick={() => onChange({ class: cls.name, classSource: cls.source ?? '' })}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md transition-all text-sm border',
                    isSelected
                      ? 'bg-accent/15 text-foreground border-accent/40'
                      : 'hover:bg-muted/50 border-transparent',
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

      <div className="flex-1 min-w-0 flex flex-col rounded-lg border border-border bg-muted/20 overflow-hidden">
        {!selectedClass ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <MagicWand className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Select a class to view details</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl font-bold">{selectedClass.name}</h2>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="font-mono">{selectedClass.source}</span>
                  {selectedClass.page && <span>p.{selectedClass.page}</span>}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {classSummary && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookOpen className="h-3.5 w-3.5 text-primary" weight="fill" />
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Class Overview
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{classSummary}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-card border border-border">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Hit Dice
                  </span>
                  <span className="text-sm font-semibold mt-0.5 font-mono">
                    d{selectedClass.hd?.faces ?? 6}
                  </span>
                </div>

                <DetailSection icon={ChartBar} label="Saving Throws">
                  {savingThrows}
                </DetailSection>

                <DetailSection icon={MagicWand} label="Spellcasting Stat">
                  {spellcastingStat}
                </DetailSection>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <DetailHtmlSection icon={Shield} label="Armor Proficiencies" html={armorHtml} />
                <DetailHtmlSection icon={Sword} label="Weapon Proficiencies" html={weaponsHtml} />
                <DetailHtmlSection icon={Toolbox} label="Tool Proficiencies" html={toolsHtml} />
              </div>

              {classFeatures.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <MagicWand className="h-3.5 w-3.5 text-primary" weight="fill" />
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Signature Features
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {classFeatures.map((feature) => (
                      <TraitTooltip
                        key={`${feature.name}|${feature.source ?? ''}`}
                        name={feature.name}
                        entries={feature.entries}
                      >
                        <span className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-muted/40 hover:bg-accent/10 hover:border-accent transition-colors cursor-help text-sm font-medium">
                          {feature.name}
                        </span>
                      </TraitTooltip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
