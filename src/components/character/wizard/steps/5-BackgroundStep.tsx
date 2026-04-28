import { BookOpen, MagnifyingGlass, Shield, Toolbox, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import { buildSuppressedKeys } from '@/lib/5etools/reprints'
import { renderEntry } from '@/lib/renderer'
import { getImplicitSource } from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import type { Background5e } from '@/types/5etools'
import { DetailSection } from '../../DetailCards'
import type { StepProps } from '../types'

interface BackgroundStepProps extends StepProps {
  backgrounds: Background5e[]
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

export function BackgroundStep({ data, onChange, backgrounds }: BackgroundStepProps) {
  const [search, setSearch] = useState('')
  const allowedSources = useMemo(() => {
    const base = data.allowedSources ?? []
    const implicit = getImplicitSource((data.originSystem || '2014') as '2014' | '2024')
    return base.includes(implicit) ? base : [...base, implicit]
  }, [data.allowedSources, data.originSystem])
  const sourceFilteredBackgrounds =
    allowedSources.length > 0
      ? backgrounds.filter((bg) => allowedSources.includes(bg.source))
      : backgrounds
  const suppressedBackgroundKeys =
    data.variantRules?.preferNewerPrintings && allowedSources.length > 0
      ? buildSuppressedKeys(sourceFilteredBackgrounds, new Set(allowedSources))
      : undefined
  const filteredBackgrounds = sourceFilteredBackgrounds.filter(
    (bg) => !suppressedBackgroundKeys?.has(`${bg.name}|${bg.source}`),
  )

  const searchFilteredBackgrounds = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return filteredBackgrounds

    return filteredBackgrounds.filter(
      (bg) =>
        bg.name.toLowerCase().includes(query) ||
        bg.source.toLowerCase().includes(query) ||
        getFirstStringEntry(bg.entries ?? [])
          .toLowerCase()
          .includes(query),
    )
  }, [filteredBackgrounds, search])

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
    ? getBackgroundOverviewDescription(selectedBackground.entries ?? [])
    : ''
  const backgroundFeature = selectedBackground
    ? getBackgroundFeatureBlock(selectedBackground.entries ?? [])
    : null
  const featureEntries = backgroundFeature?.entries ?? []

  return (
    <div className="flex h-full gap-5">
      <div className="w-72 flex-shrink-0 flex flex-col rounded-lg border border-border bg-muted/20">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4 text-primary" weight="fill" />
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

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {searchFilteredBackgrounds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {allowedSources.length > 0
                ? 'No backgrounds found in selected sources.'
                : 'No backgrounds found.'}
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
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md transition-all text-sm border',
                    isSelected
                      ? 'bg-accent/15 text-foreground border-accent/40'
                      : 'hover:bg-muted/50 border-transparent',
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

      <div className="flex-1 min-w-0 flex flex-col rounded-lg border border-border bg-muted/20 overflow-hidden">
        {!selectedBackground ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Select a background to view details</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl font-bold">{selectedBackground.name}</h2>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="font-mono">{selectedBackground.source}</span>
                  {selectedBackground.page && <span>p.{selectedBackground.page}</span>}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <BookOpen className="h-3.5 w-3.5 text-primary" weight="fill" />
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Background Overview
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {summary || 'No description available.'}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <DetailSection
                  icon={Shield}
                  label="Skill Proficiencies"
                  empty={skillProficiencies === 'None'}
                >
                  {skillProficiencies}
                </DetailSection>
                <DetailSection
                  icon={BookOpen}
                  label="Language Proficiencies"
                  empty={languageProficiencies === 'None'}
                >
                  {languageProficiencies}
                </DetailSection>
                <DetailSection
                  icon={Toolbox}
                  label="Tool Proficiencies"
                  empty={toolProficiencies === 'None'}
                >
                  {toolProficiencies}
                </DetailSection>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-primary" weight="fill" />
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
                          <div
                            key={key}
                            className="text-sm leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: renderEntry(entry) }}
                          />
                        )
                      })
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
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
    const record = entry as { name?: unknown; source?: unknown }
    if (typeof record.name === 'string') {
      return `${record.name}|${typeof record.source === 'string' ? record.source : ''}`
    }
    return JSON.stringify(entry)
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
