import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { getAsiDisplay } from '@/lib/calculations/abilityScoreDisplay'
import { getRaceSummary } from '@/lib/calculations/entrySummary'
import {
  normalizeRaceSelectionForOriginSystem,
  usesRaceOriginBenefits,
} from '@/lib/calculations/originSystem'
import {
  getSubraceDisplayName,
  isSubraceDisplayNameAmbiguous,
} from '@/lib/calculations/raceDisplay'
import {
  getDamageTraitDisplay,
  getLanguageDisplay,
  getRaceTraits,
  getSkillProfDisplay,
  getSpeedDisplay,
  mergeRaceWithSubrace,
} from '@/lib/calculations/raceUtils'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import type { Race5e } from '@/types/5etools'
import { CreatorEntityDetails, DetailRow } from '../../DetailCards'
import { TraitTooltip } from '../../TraitTooltip'
import { sortCreatorOptions } from '../sortCreatorOptions'
import type { StepProps } from '../types'

interface RaceStepProps extends StepProps {
  races: Race5e[]
  recursiveLookup: RecursiveLookup
}

export function RaceStep({ data, onChange, races, recursiveLookup }: RaceStepProps) {
  const [search, setSearch] = useState('')
  const filteredRaces = races
  const orderedRaces = useMemo(() => sortCreatorOptions(races), [races])

  const searchFilteredRaces = useMemo(() => {
    if (!search.trim()) return orderedRaces
    const q = search.toLowerCase()
    return orderedRaces.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.subraces?.some((sr) => sr.name?.toLowerCase().includes(q)),
    )
  }, [orderedRaces, search])

  const selectedRace = data.race
    ? data.raceSource
      ? filteredRaces.find((r) => r.name === data.race && (r.source ?? '') === data.raceSource)
      : filteredRaces.find((r) => r.name === data.race)
    : undefined

  const getAvailableSubraces = useCallback(
    (race?: Race5e) => (race?.subraces || []).filter((subrace) => Boolean(subrace.name)),
    [],
  )

  useEffect(() => {
    if (filteredRaces.length === 0) return

    const hasValidSelection = filteredRaces.some(
      (race) => race.name === data.race && (race.source ?? '') === (data.raceSource ?? ''),
    )
    if (hasValidSelection) return

    const firstRace = orderedRaces[0]
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
  }, [data.race, data.raceSource, filteredRaces, getAvailableSubraces, onChange, orderedRaces])

  const subraces = getAvailableSubraces(selectedRace)
  const orderedSubraces = sortCreatorOptions(subraces, (subrace) =>
    getSubraceDisplayName(selectedRace?.name ?? '', subrace.name),
  )
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

  const normalizedSelection = normalizeRaceSelectionForOriginSystem(
    selectedRace,
    selectedSubrace,
    data.originSystem,
  )
  const displayRace =
    normalizedSelection.race && normalizedSelection.subrace
      ? mergeRaceWithSubrace(normalizedSelection.race, normalizedSelection.subrace)
      : normalizedSelection.subrace || normalizedSelection.race

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

  const showsRaceBonuses = usesRaceOriginBenefits(data.originSystem)
  const asi = showsRaceBonuses
    ? getAsiDisplay(
        normalizedSelection.race,
        data.raceAsiBlockIndex,
        data.raceAsiChoices,
        normalizedSelection.subrace,
      )
    : []
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
    <div className="grid min-w-0 gap-5 md:min-h-0 md:flex-1 md:grid-cols-[minmax(13rem,1fr)_minmax(0,2.6fr)] md:gap-6">
      {/* Left: Race list */}
      <div className="flex h-44 min-h-0 min-w-0 flex-col md:h-auto">
        <div className="shrink-0 pb-3">
          <div className="flex items-center gap-2 mb-2">
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
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-2">
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
                  aria-pressed={isSelected}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-md transition-colors text-sm',
                    isSelected
                      ? 'border border-primary/50 bg-primary/10 text-foreground'
                      : 'bg-workspace-pane hover:bg-surface-hover border border-transparent',
                  )}
                >
                  <div className="font-semibold truncate">{race.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
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
      <CreatorEntityDetails
        entity={selectedRace}
        subtitle={
          selectedRace && selectedSubrace
            ? getSubraceDisplayName(selectedRace.name, selectedSubrace.name)
            : undefined
        }
        placeholder="Select a race to view details"
      >
        {selectedRace && (
          <>
            {raceSummary && (
              <div className="max-w-[72ch] space-y-1.5">
                <p className="text-sm leading-relaxed text-muted-foreground">{raceSummary}</p>
              </div>
            )}

            {/* Subrace selector */}
            {subraces.length > 0 && (
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Subrace
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {orderedSubraces.map((sr) => {
                    const name = getSubraceDisplayName(selectedRace.name, sr.name)
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
                        {name}
                        {sr.source &&
                          isSubraceDisplayNameAmbiguous(selectedRace.name, name, subraces) && (
                            <>
                              {' · '}
                              <span className="text-[10px] opacity-75">{sr.source}</span>
                            </>
                          )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-3 divide-x divide-border border-y border-border bg-workspace-pane">
              <div className="flex min-w-0 flex-col px-2.5 py-2.5">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Size</span>
                <span className="text-sm font-semibold mt-0.5">{size.join(' / ') || '—'}</span>
              </div>
              <div className="flex min-w-0 flex-col px-2.5 py-2.5">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Speed</span>
                <span className="text-sm font-semibold mt-0.5">{speed || '—'}</span>
              </div>
              <div className="flex min-w-0 flex-col px-2.5 py-2.5">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Darkvision
                </span>
                <span className="text-sm font-semibold mt-0.5">
                  {displayRace?.darkvision ? `${displayRace.darkvision} ft.` : '—'}
                </span>
              </div>
            </div>

            <div className="border-t border-border">
              {showsRaceBonuses && (
                <DetailRow label="Ability Scores">
                  <p className="text-sm text-muted-foreground">{asi.join(' · ') || 'None'}</p>
                </DetailRow>
              )}
              <DetailRow label="Languages">
                <p className="text-sm text-muted-foreground">{languages || 'None'}</p>
              </DetailRow>
              <DetailRow label="Skill Proficiencies">
                <p className="text-sm text-muted-foreground">{skills.join(', ') || 'None'}</p>
              </DetailRow>
              <DetailRow label="Resistances">
                <p className="text-sm text-muted-foreground">
                  {resistances === '—' ? 'None' : resistances}
                </p>
              </DetailRow>
              <DetailRow label="Immunities">
                <p className="text-sm text-muted-foreground">
                  {[
                    immunities !== '—' && immunities,
                    conditionImmunities !== '—' && `${conditionImmunities} (condition)`,
                  ]
                    .filter(Boolean)
                    .join(', ') || 'None'}
                </p>
              </DetailRow>
            </div>

            {/* Traits */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Racial Traits
                </span>
              </div>
              {traits.length === 0 ? (
                <p className="text-muted-foreground text-sm">No traits available</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {traits.map((trait) => (
                    <TraitTooltip
                      key={trait.key}
                      previewKey={JSON.stringify(['race-trait', trait.key])}
                      name={trait.name}
                      source={displayRace?.source}
                      entries={trait.entries}
                      recursiveLookup={recursiveLookup}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CreatorEntityDetails>
    </div>
  )
}
