import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { RacialAbilityBonusPanel } from '@/components/character/AbilityBonusPanels'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getAsiDisplay } from '@/lib/calculations/abilityScoreDisplay'
import {
  getRaceAbilityData,
  hasFlexibleRaceOriginAsi,
  hasUnresolvedRaceAbilityChoices,
} from '@/lib/calculations/abilityScores'
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
  getAvailableSubraces,
  getDamageTraitDisplay,
  getLanguageDisplay,
  getRaceSizeOptions,
  getRaceTraits,
  getSkillProfDisplay,
  getSpeedDisplay,
  mergeRaceWithSubrace,
  RACE_SIZE_LABELS,
  requiresDraconicAncestry,
} from '@/lib/calculations/raceUtils'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import { CharacterEditingContext } from '@/store/characterEditingContext'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { DetailRow } from '../../DetailCards'
import { CreatorChoicePill, RaceChoiceRow } from '../../RaceChoiceRow'
import { TraitTooltip } from '../../TraitTooltip'
import { CreatorChoiceDetails, type CreatorChoiceReviewProps } from '../CreatorChoiceDetails'
import { CreatorChoices } from '../CreatorChoices'
import { type CreatorChoiceCatalog, getCreatorChoiceGroups } from '../creatorChoiceGroups'
import { sortCreatorOptions } from '../sortCreatorOptions'
import type { StepProps } from '../types'
import type { useCreatorRaceDraft } from '../useCreatorRaceDraft'

interface RaceStepProps extends StepProps, CreatorChoiceReviewProps {
  races: Race5e[]
  recursiveLookup: RecursiveLookup
  raceDraft?: ReturnType<typeof useCreatorRaceDraft>
  choiceCatalog?: CreatorChoiceCatalog
  laterOriginDraft?: Character
}

const subscribeToEmptyDraft = () => () => undefined

function getWizardSubraces(race?: Race5e) {
  return getAvailableSubraces(race)
}

export function RaceStep({
  data,
  onChange,
  races,
  recursiveLookup,
  raceDraft,
  choiceCatalog,
  laterOriginDraft,
  onChoicesPendingChange,
  choicesReviewRef,
}: RaceStepProps) {
  const [search, setSearch] = useState('')
  const [viewReset, resetView] = useState(0)
  const raceCharacter = useSyncExternalStore(
    raceDraft?.store?.subscribe ?? subscribeToEmptyDraft,
    () => raceDraft?.store?.getState().activeCharacter,
  )
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

  useEffect(() => {
    if (filteredRaces.length === 0) return

    const hasValidSelection = filteredRaces.some(
      (race) => race.name === data.race && (race.source ?? '') === (data.raceSource ?? ''),
    )
    if (hasValidSelection) return

    const firstRace = orderedRaces[0]
    if (!firstRace) return

    const subraces = getWizardSubraces(firstRace)
    const child = subraces.length === 1 ? subraces[0] : undefined
    onChange({
      race: firstRace.name,
      raceSource: firstRace.source ?? '',
      subrace: child?.name ?? '',
      subraceSource: child?.source ?? '',
      raceSize: undefined,
      raceAsiChoices: [],
      raceAsiBlockIndex: 0,
    })
  }, [data.race, data.raceSource, filteredRaces, onChange, orderedRaces])

  const requiresAncestry = requiresDraconicAncestry(selectedRace)
  const subraces = getWizardSubraces(selectedRace)
  const orderedSubraces = sortCreatorOptions(subraces, (subrace) =>
    getSubraceDisplayName(selectedRace?.name ?? '', subrace.name),
  )
  const selectedSubrace = subraces.find(
    (sr) => sr.name === data.subrace && (sr.source ?? '') === (data.subraceSource ?? ''),
  )

  useEffect(() => {
    if (!selectedRace || selectedSubrace || (requiresAncestry && data.subrace)) return
    if (subraces.length !== 1) {
      if (data.subrace || data.subraceSource) {
        onChange({ subrace: '', subraceSource: '', raceSize: undefined, raceAsiChoices: [] })
      }
      return
    }
    const firstSubrace = subraces[0]
    if (!firstSubrace) return
    onChange({
      subrace: firstSubrace.name,
      subraceSource: firstSubrace.source ?? '',
      raceSize: undefined,
      raceAsiChoices: [],
    })
  }, [
    data.subrace,
    data.subraceSource,
    onChange,
    requiresAncestry,
    selectedRace,
    selectedSubrace,
    subraces,
  ])

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
    resetView((version) => version + 1)
    if (race === selectedRace) return
    const subraces = getWizardSubraces(race)
    const child = subraces.length === 1 ? subraces[0] : undefined
    onChange({
      race: race.name,
      raceSource: race.source ?? '',
      subrace: child?.name ?? '',
      subraceSource: child?.source ?? '',
      raceSize: undefined,
      raceAsiChoices: [],
      raceAsiBlockIndex: 0,
    })
  }

  const handleSelectSubrace = (subrace: Race5e) => {
    if (subrace === selectedSubrace) return
    const next = normalizeRaceSelectionForOriginSystem(selectedRace, subrace, data.originSystem)
    const before = getRaceAbilityData(
      normalizedSelection.race,
      normalizedSelection.subrace,
      data.raceAsiBlockIndex,
    )
    const after = getRaceAbilityData(next.race, next.subrace, data.raceAsiBlockIndex)
    const raceAsiChoices = after.choices.map((choice, index) => {
      const previous = before.choices[index]
      return choice.source === 'race' &&
        previous?.source === 'race' &&
        choice.count === previous.count &&
        choice.amount === previous.amount &&
        choice.from.join() === previous.from.join()
        ? (data.raceAsiChoices[index] ?? [])
        : []
    })
    onChange({
      subrace: subrace.name,
      subraceSource: subrace.source ?? '',
      raceSize:
        selectedSubrace?._isVersion || subrace._isVersion || selectedSubrace?.size || subrace.size
          ? undefined
          : data.raceSize,
      raceAsiChoices: raceAsiChoices.some((choices) => choices.length) ? raceAsiChoices : [],
    })
  }

  const showsRaceBonuses = usesRaceOriginBenefits(data.originSystem)
  const asi = showsRaceBonuses
    ? getRaceAbilityData(
        normalizedSelection.race,
        normalizedSelection.subrace,
        data.raceAsiBlockIndex,
      )
    : undefined
  const size = displayRace?.size ?? []
  const sizeOptions = getRaceSizeOptions(displayRace)
  const hasSubraceChoice = subraces.length > 1
  const hasSizeChoice = sizeOptions.length > 1
  const selectedSize =
    data.raceSize && sizeOptions.includes(data.raceSize) ? data.raceSize : undefined
  const hasAbilityChoice = !!asi?.choices.length
  const groups =
    raceCharacter &&
    choiceCatalog &&
    getCreatorChoiceGroups(raceCharacter, choiceCatalog, 'race', laterOriginDraft ?? raceCharacter)
  const hasChoices =
    hasSubraceChoice ||
    hasSizeChoice ||
    hasAbilityChoice ||
    !!(
      groups &&
      (groups.choices.length || groups.racialProfiles.length || groups.fixedFeatOwners.length)
    )
  const subracePending = hasSubraceChoice && !selectedSubrace
  const sizePending = !subracePending && hasSizeChoice && !selectedSize
  const abilitiesPending =
    !subracePending && !!asi && hasUnresolvedRaceAbilityChoices(asi, data.raceAsiChoices)
  const choicesPending = subracePending || sizePending || abilitiesPending || !!groups?.hasPending
  const speed = getSpeedDisplay(displayRace)
  const parent = normalizedSelection.race
  const child = normalizedSelection.subrace
  const asiSummary = getAsiDisplay(parent, data.raceAsiBlockIndex, data.raceAsiChoices, child)
  const languages = getLanguageDisplay(displayRace)
  const skills = getSkillProfDisplay(displayRace)
  const traits = getRaceTraits(displayRace)
  const resistances = getDamageTraitDisplay(displayRace?.resist)
  const immunities = getDamageTraitDisplay(displayRace?.immune)
  const conditionImmunities = getDamageTraitDisplay(displayRace?.conditionImmune)
  const raceSummary = getRaceSummary(displayRace)
  const subtitle =
    selectedRace && selectedSubrace
      ? getSubraceDisplayName(selectedRace.name, selectedSubrace.name)
      : undefined

  const description = selectedRace && (
    <>
      {raceSummary && (
        <div className="max-w-[72ch] space-y-1.5">
          <p className="text-sm leading-relaxed text-muted-foreground">{raceSummary}</p>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-3 divide-x divide-border border-y border-border bg-workspace-pane">
        <div className="flex min-w-0 flex-col px-2.5 py-2.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Size</span>
          <span className="mt-0.5 text-sm font-semibold">
            {sizeOptions.map((value) => RACE_SIZE_LABELS[value]).join(' / ') ||
              size.join(' / ') ||
              '—'}
          </span>
        </div>
        <div className="flex min-w-0 flex-col px-2.5 py-2.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Speed</span>
          <span className="mt-0.5 text-sm font-semibold">{speed || '—'}</span>
        </div>
        <div className="flex min-w-0 flex-col px-2.5 py-2.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Darkvision</span>
          <span className="mt-0.5 text-sm font-semibold">
            {displayRace?.darkvision ? `${displayRace.darkvision} ft.` : '—'}
          </span>
        </div>
      </div>

      <div className="border-t border-border">
        {showsRaceBonuses && (
          <DetailRow label="Ability Scores">
            <p className="text-sm text-muted-foreground">{asiSummary.join(' · ') || 'None'}</p>
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

      <div className="rounded-lg border border-border bg-card p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
          Racial Traits
        </h4>
        {traits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No traits available</p>
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
  )

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
              const raceSubraces = getWizardSubraces(race)
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

      <CreatorChoiceDetails
        key={JSON.stringify([selectedRace?.name, selectedRace?.source, viewReset])}
        kind="Race"
        entity={selectedRace}
        subtitle={subtitle}
        description={description}
        pending={choicesPending}
        onChoicesPendingChange={onChoicesPendingChange}
        choicesReviewRef={choicesReviewRef}
        choices={
          hasChoices &&
          selectedRace && (
            <section aria-label="Race choices" className="space-y-2">
              {hasSubraceChoice && (
                <RaceChoiceRow
                  title={requiresAncestry ? 'Draconic Ancestry' : 'Subrace'}
                  detail="Choose a lineage"
                  pending={subracePending}
                  complete={!!selectedSubrace}
                >
                  {orderedSubraces.map((sr) => {
                    const name = getSubraceDisplayName(selectedRace.name, sr.name)
                    const isActive =
                      sr.name === data.subrace && (sr.source ?? '') === (data.subraceSource ?? '')
                    return (
                      <button
                        key={`${sr.name}|${sr.source ?? ''}`}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => handleSelectSubrace(sr)}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                          isActive
                            ? 'border-primary/50 bg-primary/15 text-primary'
                            : 'border-border bg-workspace-pane text-muted-foreground hover:border-primary/35 hover:text-foreground',
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
                </RaceChoiceRow>
              )}
              {!subracePending && hasSizeChoice && (
                <RaceChoiceRow
                  title="Size"
                  detail="Choose your character’s size"
                  pending={sizePending}
                  complete={!!selectedSize}
                >
                  {selectedSize ? (
                    <CreatorChoicePill
                      remove={{
                        label: `Remove ${RACE_SIZE_LABELS[selectedSize]} as racial size`,
                        onClick: () => onChange({ raceSize: undefined }),
                      }}
                    >
                      {RACE_SIZE_LABELS[selectedSize]}
                    </CreatorChoicePill>
                  ) : (
                    <Select
                      value={selectedSize ?? ''}
                      onValueChange={(value) => {
                        const raceSize = sizeOptions.find((size) => size === value)
                        if (raceSize) onChange({ raceSize })
                      }}
                    >
                      <SelectTrigger aria-label="Racial size" className="min-w-40">
                        <SelectValue placeholder="Choose size" />
                      </SelectTrigger>
                      <SelectContent>
                        {sizeOptions.map((value) => (
                          <SelectItem key={value} value={value}>
                            {RACE_SIZE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </RaceChoiceRow>
              )}
              {!subracePending && hasAbilityChoice && asi && (
                <div className="pt-2 [&_[data-testid=race-ability-choices]]:mt-0 [&_[data-testid=race-ability-choices]]:max-w-none">
                  <RacialAbilityBonusPanel
                    data={{ ...asi, fixed: [] }}
                    selections={data.raceAsiChoices}
                    distribution={data.raceAsiBlockIndex}
                    markUnfilled
                    onDistributionChange={
                      hasFlexibleRaceOriginAsi(parent, child)
                        ? (value) => onChange({ raceAsiBlockIndex: value, raceAsiChoices: [] })
                        : undefined
                    }
                    onChoicesChange={(raceAsiChoices) => onChange({ raceAsiChoices })}
                  />
                </div>
              )}
              {raceDraft?.error ? (
                <p className="text-sm text-destructive" role="alert">
                  {raceDraft.error}
                </p>
              ) : (
                !subracePending &&
                raceDraft?.store && (
                  <CharacterEditingContext.Provider value={raceDraft.store}>
                    <CreatorChoices scope="race" groups={groups || undefined} />
                  </CharacterEditingContext.Provider>
                )
              )}
            </section>
          )
        }
      />
    </div>
  )
}
