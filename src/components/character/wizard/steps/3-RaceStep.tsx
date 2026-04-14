import { BookOpen, ChartBar, Eye, MagnifyingGlass, Shield, Users, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { buildSuppressedKeys } from '@/lib/5etools/reprints'
import { getRaceSummary } from '@/lib/calculations/entrySummary'
import { normalizeRaceSelectionForOriginSystem } from '@/lib/calculations/originSystem'
import {
  getAsiDisplay,
  getDamageTraitDisplay,
  getLanguageDisplay,
  getRaceTraits,
  getSkillProfDisplay,
  getSpeedDisplay,
  mergeRaceWithSubrace,
} from '@/lib/calculations/raceUtils'
import { cn } from '@/lib/utils'
import type { Race5e } from '@/types/5etools'
import { DetailSection } from '../../DetailCards'
import { TraitTooltip } from '../../TraitTooltip'
import type { StepProps } from '../types'

interface RaceStepProps extends StepProps {
  races: Race5e[]
}

export function RaceStep({ data, onChange, races }: RaceStepProps) {
  const [search, setSearch] = useState('')
  const allowedSources = data.allowedSources ?? []

  const filteredRaces = useMemo(() => {
    const sourceFiltered =
      allowedSources.length > 0
        ? races.filter((race) => allowedSources.includes(race.source))
        : races
    const suppressedKeys =
      data.variantRules?.preferNewerPrintings && allowedSources.length > 0
        ? buildSuppressedKeys(sourceFiltered, new Set(allowedSources))
        : undefined
    return sourceFiltered.filter((race) => !suppressedKeys?.has(`${race.name}|${race.source}`))
  }, [races, allowedSources, data.variantRules?.preferNewerPrintings])

  const searchFilteredRaces = useMemo(() => {
    if (!search.trim()) return filteredRaces
    const q = search.toLowerCase()
    return filteredRaces.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.subraces?.some((sr) => sr.name?.toLowerCase().includes(q)),
    )
  }, [filteredRaces, search])

  const selectedRace = data.race
    ? data.raceSource
      ? filteredRaces.find((r) => r.name === data.race && (r.source ?? '') === data.raceSource)
      : filteredRaces.find((r) => r.name === data.race)
    : undefined

  const getAvailableSubraces = useCallback(
    (race?: Race5e) =>
      (race?.subraces || []).filter((sr) => {
        if (!sr.name) return false
        if (allowedSources.length === 0) return true
        const src = (sr as { source?: string }).source ?? race?.source ?? ''
        if (!allowedSources.includes(src)) return false
        const suppressedKeys =
          data.variantRules?.preferNewerPrintings && allowedSources.length > 0
            ? buildSuppressedKeys(filteredRaces, new Set(allowedSources))
            : undefined
        return !suppressedKeys?.has(`${sr.name}|${src}`)
      }),
    [allowedSources, data.variantRules?.preferNewerPrintings, filteredRaces],
  )

  useEffect(() => {
    if (filteredRaces.length === 0) return

    const hasValidSelection = filteredRaces.some(
      (race) => race.name === data.race && (race.source ?? '') === (data.raceSource ?? ''),
    )
    if (hasValidSelection) return

    const firstRace = filteredRaces[0]
    if (!firstRace) return

    const firstSubrace = getAvailableSubraces(firstRace)[0]
    onChange({
      race: firstRace.name,
      raceSource: firstRace.source ?? '',
      subrace: firstSubrace?.name ?? '',
      subraceSource: firstSubrace?.source ?? '',
      raceAsiChoices: [],
      raceAsiBlockIndex: 0,
    })
  }, [data.race, data.raceSource, filteredRaces, getAvailableSubraces, onChange])

  const subraces = getAvailableSubraces(selectedRace)
  const selectedSubrace = subraces.find(
    (sr) => sr.name === data.subrace && (sr.source ?? '') === (data.subraceSource ?? ''),
  )

  useEffect(() => {
    if (!selectedRace) return
    if (subraces.length === 0) {
      if (data.subrace || data.subraceSource) {
        onChange({ subrace: '', subraceSource: '' })
      }
      return
    }
    if (selectedSubrace) return
    const firstSubrace = subraces[0]
    if (!firstSubrace) return
    onChange({
      subrace: firstSubrace.name,
      subraceSource: firstSubrace.source ?? '',
    })
  }, [data.subrace, data.subraceSource, onChange, selectedRace, selectedSubrace, subraces])

  const displayRace = (() => {
    const normalizedSelection = normalizeRaceSelectionForOriginSystem(
      selectedRace,
      selectedSubrace,
      (data.originSystem || '2014') as '2014' | '2024',
    )
    return normalizedSelection.race && normalizedSelection.subrace
      ? mergeRaceWithSubrace(normalizedSelection.race, normalizedSelection.subrace)
      : normalizedSelection.subrace || normalizedSelection.race
  })()

  const handleSelectRace = (race: Race5e) => {
    const firstSubrace = getAvailableSubraces(race)[0]
    onChange({
      race: race.name,
      raceSource: race.source ?? '',
      subrace: firstSubrace?.name ?? '',
      subraceSource: firstSubrace?.source ?? '',
      raceAsiChoices: [],
      raceAsiBlockIndex: 0,
    })
  }

  const handleSelectSubrace = (subrace: Race5e) => {
    onChange({
      subrace: subrace.name,
      subraceSource: subrace.source ?? '',
      raceAsiChoices: [],
    })
  }

  const asi = getAsiDisplay(displayRace, data.raceAsiBlockIndex ?? 0)
  const size = displayRace?.size ?? []
  const speed = getSpeedDisplay(displayRace)
  const languages = getLanguageDisplay(displayRace)
  const skills = getSkillProfDisplay(displayRace)
  const traits = getRaceTraits(displayRace)
  const resistances = getDamageTraitDisplay(displayRace?.resist)
  const immunities = getDamageTraitDisplay(displayRace?.immune)
  const conditionImmunities = getDamageTraitDisplay(displayRace?.conditionImmune)
  const raceSummary = getRaceSummary(displayRace)

  return (
    <div className="flex h-full gap-5">
      {/* Left: Race list */}
      <div className="w-72 flex-shrink-0 flex flex-col rounded-lg border border-border bg-muted/20">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-accent" weight="fill" />
            <h3 className="font-semibold text-sm">
              Races
              <span className="text-muted-foreground font-normal ml-1">
                ({filteredRaces.length})
              </span>
            </h3>
          </div>
          <div className="relative">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search races..."
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
          {searchFilteredRaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No races found</div>
          ) : (
            searchFilteredRaces.map((race) => {
              const isSelected = race.name === data.race && (race.source ?? '') === data.raceSource
              const raceSubraces = getAvailableSubraces(race)
              return (
                <button
                  key={`${race.name}|${race.source ?? ''}`}
                  type="button"
                  onClick={() => handleSelectRace(race)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md transition-all text-sm',
                    isSelected
                      ? 'bg-accent/15 text-foreground border border-accent/40'
                      : 'hover:bg-muted/50 border border-transparent',
                  )}
                >
                  <div className="font-semibold truncate">{race.name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                    <span className="font-mono">{race.source}</span>
                    {raceSubraces.length > 0 && (
                      <span>
                        · {raceSubraces.length} subrace
                        {raceSubraces.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right: Race details */}
      <div className="flex-1 min-w-0 flex flex-col rounded-lg border border-border bg-muted/20 overflow-hidden">
        {!selectedRace ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Select a race to view details</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl font-bold">
                  {selectedRace.name}
                  {selectedSubrace && (
                    <span className="text-accent ml-1.5">({selectedSubrace.name})</span>
                  )}
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="font-mono">{selectedRace.source}</span>
                  {selectedRace.page && <span>p.{selectedRace.page}</span>}
                </div>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {raceSummary && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookOpen className="h-3.5 w-3.5 text-accent" weight="fill" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Race Overview
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{raceSummary}</p>
                </div>
              )}

              {/* Subrace selector */}
              {subraces.length > 0 && (
                <div className="rounded-lg border border-border bg-card/50 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Subrace
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {subraces.map((sr) => {
                      const isActive =
                        sr.name === data.subrace && (sr.source ?? '') === (data.subraceSource ?? '')
                      return (
                        <button
                          key={`${sr.name}|${sr.source ?? ''}`}
                          type="button"
                          onClick={() => handleSelectSubrace(sr)}
                          className={cn(
                            'px-3 py-1.5 rounded-md text-xs font-semibold transition-all border',
                            isActive
                              ? 'bg-accent text-accent-foreground border-accent'
                              : 'bg-card border-border hover:border-accent/50 text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {sr.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Quick stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-card border border-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Size
                  </span>
                  <span className="text-sm font-semibold mt-0.5">{size.join(' / ') || '—'}</span>
                </div>
                <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-card border border-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Speed
                  </span>
                  <span className="text-sm font-semibold mt-0.5">{speed || '—'}</span>
                </div>
                <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-card border border-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Darkvision
                  </span>
                  <span className="text-sm font-semibold mt-0.5">
                    {displayRace?.darkvision ? `${displayRace.darkvision} ft.` : '—'}
                  </span>
                </div>
              </div>

              {/* Ability Scores */}
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <ChartBar className="h-3.5 w-3.5 text-accent" weight="fill" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Ability Scores
                  </span>
                </div>
                {asi.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {asi.map((a) => (
                      <span
                        key={a}
                        className="inline-flex items-center px-2.5 py-1 rounded-md bg-accent/10 border border-accent/30 text-sm font-medium"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Info sections — always shown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <DetailSection icon={BookOpen} label="Languages" empty={!languages}>
                  {languages || 'None'}
                </DetailSection>

                <DetailSection
                  icon={BookOpen}
                  label="Skill Proficiencies"
                  empty={skills.length === 0}
                >
                  {skills.length > 0 ? skills.join(', ') : 'None'}
                </DetailSection>

                <DetailSection icon={Shield} label="Resistances" empty={resistances === '—'}>
                  {resistances === '—' ? 'None' : resistances}
                </DetailSection>

                <DetailSection
                  icon={Shield}
                  label="Immunities"
                  empty={immunities === '—' && conditionImmunities === '—'}
                >
                  {immunities !== '—' || conditionImmunities !== '—'
                    ? [
                        immunities !== '—' ? immunities : '',
                        conditionImmunities !== '—' ? `${conditionImmunities} (condition)` : '',
                      ]
                        .filter(Boolean)
                        .join(', ')
                    : 'None'}
                </DetailSection>
              </div>

              {/* Traits */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Eye className="h-3.5 w-3.5 text-accent" weight="fill" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Racial Traits
                  </span>
                </div>
                {traits.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No traits available</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {traits.map((trait) => (
                      <TraitTooltip
                        key={`${trait.name}|${trait.entries?.length ?? 0}`}
                        name={trait.name}
                        entries={trait.entries}
                      >
                        <span className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-muted/40 hover:bg-accent/10 hover:border-accent transition-colors cursor-help text-sm font-medium">
                          {trait.name}
                        </span>
                      </TraitTooltip>
                    ))}
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
