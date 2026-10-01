import { ArrowRight, Buildings, FilePdf } from '@phosphor-icons/react'
import { type ReactNode, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameContent } from '@/components/editor/GameContent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useClassResources } from '@/hooks/character/useClassResources'
import { useSavingThrows } from '@/hooks/character/useSavingThrows'
import { useSkills } from '@/hooks/character/useSkills'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useItemLookup, useOrganizations, useSpellLookup } from '@/hooks/data/useGameData'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { resolveItemReference } from '@/lib/5etools/itemResolvers'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  formatModifier,
} from '@/lib/calculations/abilityScores'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getProficiencyBonus } from '@/lib/calculations/gameRules'
import { getRaceTraits } from '@/lib/calculations/raceUtils'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  isRitualSpell,
} from '@/lib/calculations/spellUtils'
import { collectSubclassFeatures } from '@/lib/character/classChoiceOptions'
import {
  CUSTOM_ORGANIZATION_KEY,
  getOrganizationKey,
  resolveOrganizationImageSrc,
} from '@/lib/character/organizationConstants'
import { getCharacterClassEntries, getTotalCharacterLevel } from '@/lib/characterUtils'
import { resolvePortraitSrc } from '@/lib/portraitConstants'
import { useGameDataStore } from '@/store/gameDataStore'
import type { ClassFeature, OptionalFeatureLike } from '@/types/5etools'
import type { CharacterAction } from '@/types/actions'
import type { Character, CharacterClassChoiceOption, Feat, Feature } from '@/types/character'

const ACTION_GROUPS: Array<{ kind: CharacterAction['kind']; label: string }> = [
  { kind: 'attack', label: 'Attacks' },
  { kind: 'action', label: 'Actions' },
  { kind: 'bonus-action', label: 'Bonus Actions' },
  { kind: 'reaction', label: 'Reactions' },
  { kind: 'passive', label: 'Passive' },
  { kind: 'special', label: 'Rules & Special' },
]

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/40 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function OverviewSection({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string
  count?: number
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details
      className="group rounded-xl border border-border bg-card"
      open={defaultOpen || undefined}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {count !== undefined && <Badge variant="outline">{count}</Badge>}
          <span aria-hidden="true" className="transition-transform group-open:rotate-90">
            ▸
          </span>
        </span>
      </summary>
      <div className="border-t border-border px-4 py-3">{children}</div>
    </details>
  )
}

function DetailEntry({
  name,
  source,
  children,
  status,
}: {
  name: string
  source?: string
  children?: ReactNode
  status?: string
}) {
  return (
    <li className="rounded-lg border border-border/80 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{name}</span>
        {status && <Badge variant="outline">{status}</Badge>}
        {source && <span className="text-xs text-muted-foreground">{source}</span>}
      </div>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </li>
  )
}

function actionMechanics(action: CharacterAction): string[] {
  const details: string[] = []
  if (action.attackBonus !== undefined) details.push(`${formatModifier(action.attackBonus)} to hit`)
  if (action.save?.dc !== undefined)
    details.push(`DC ${action.save.dc}${action.save.ability ? ` ${action.save.ability}` : ''}`)
  if (action.range) details.push(action.range)
  for (const damage of action.damage ?? []) {
    const amount = [damage.dice, damage.bonus ? formatModifier(damage.bonus) : '']
      .filter(Boolean)
      .join(' ')
    details.push([amount, damage.damageType].filter(Boolean).join(' '))
  }
  if (action.properties?.length) details.push(action.properties.join(', '))
  if (action.mastery?.length)
    details.push(`Mastery: ${action.mastery.map((entry) => entry.name).join(', ')}`)
  if (action.resourceCost)
    details.push(`Costs ${action.resourceCost.amount} ${action.resourceCost.resourceId}`)
  if (action.recharge?.rest) details.push(`Recovers on ${action.recharge.rest} rest`)
  if (action.recharge?.note) details.push(action.recharge.note)
  return details
}

function ProficiencyList({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      <p className="mt-1 text-sm">{values.length ? values.join(', ') : 'None'}</p>
    </div>
  )
}

function FeatureList({
  features,
  entriesByKey,
}: {
  features: readonly Feature[]
  entriesByKey: ReadonlyMap<string, unknown[]>
}) {
  return features.length ? (
    <ul className="space-y-2">
      {features.map((feature) => (
        <DetailEntry
          key={feature.id}
          name={feature.name}
          source={feature.source}
          status={
            !feature.description &&
            !entriesByKey.get(getEntityLookupKey(feature.name, feature.source))?.length
              ? 'Details unavailable'
              : undefined
          }
        >
          {feature.description ? (
            <GameContent entry={feature.description} />
          ) : entriesByKey.has(getEntityLookupKey(feature.name, feature.source)) ? (
            <GameContent
              entry={entriesByKey.get(getEntityLookupKey(feature.name, feature.source))}
            />
          ) : null}
        </DetailEntry>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">No features recorded.</p>
  )
}

export function CharacterOverview({
  character,
  calculation,
  actions,
  effectiveAC,
  effectiveMaxHP,
  hitDicePools,
  sourceNames,
  ready,
}: {
  character: Character
  calculation: CharacterCalculationContext
  actions: CharacterAction[]
  effectiveAC: number
  effectiveMaxHP: number
  hitDicePools: Array<{ id: string; label: string; die: number; max: number; used: number }>
  sourceNames: string[]
  ready: boolean
}) {
  const navigate = useNavigate()
  const { skills, passivePerception } = useSkills()
  const { savingThrows } = useSavingThrows()
  const { resources } = useClassResources()
  const spellcasting = useSpellSlots()
  const spellLookup = useSpellLookup()
  const itemLookup = useItemLookup()
  const organizations = useOrganizations()
  const [failedOrganizationImage, setFailedOrganizationImage] = useState('')
  const filteredData = useFilteredGameData()
  const rawData = useGameDataStore((state) => state.gameData)
  const availableSpellKeys = useMemo(
    () =>
      new Set(filteredData.spells.map((spell) => getSpellReferenceKey(spell.name, spell.source))),
    [filteredData.spells],
  )
  const availableItemKeys = useMemo(
    () =>
      new Set(
        [...filteredData.items, ...filteredData.itemsBase].map((item) =>
          getEntityLookupKey(item.name, item.source),
        ),
      ),
    [filteredData.items, filteredData.itemsBase],
  )
  const availableFeatKeys = useMemo(
    () => new Set(filteredData.feats.map((feat) => getEntityLookupKey(feat.name, feat.source))),
    [filteredData.feats],
  )
  const level = getTotalCharacterLevel(character)
  const classes = getCharacterClassEntries(character)
  const selectedOrganization = organizations.find(
    (organization) =>
      getOrganizationKey(organization.name, organization.source) ===
      character.details.organizationSelectionKey,
  )
  const customOrganization = character.details.organizationSelectionKey === CUSTOM_ORGANIZATION_KEY
  const organizationName =
    (customOrganization
      ? character.details.organizationCustomName
      : selectedOrganization?.name
    )?.trim() || character.details.faction?.trim()
  const organizationDescription = customOrganization
    ? character.details.organizationCustomDescription
    : selectedOrganization?.description
  const organizationImage =
    (customOrganization
      ? character.details.organizationCustomImage
      : selectedOrganization?.imagePath) || ''
  const featureEntriesByKey = useMemo(() => {
    const classFeatureRecords = calculation.classes.flatMap((classData) => {
      const classEntry = classes.find(
        (entry) => entry.name === classData.name && entry.source === classData.source,
      )
      const selectedSubclass = classEntry
        ? getSelectedSubclassData(classData, classEntry)
        : undefined
      return [
        ...(classData.classFeatures ?? []).filter(
          (feature): feature is ClassFeature => typeof feature !== 'string',
        ),
        ...(classData.classFeatureRefs ?? []).flatMap((reference) =>
          reference.feature ? [reference.feature] : [],
        ),
        ...collectSubclassFeatures(selectedSubclass),
      ]
    })
    const records: Array<{ name: string; source?: string; entries?: unknown[] }> = [
      ...filteredData.classFeatures,
      ...(filteredData.optionalfeatures as OptionalFeatureLike[]),
      ...classFeatureRecords,
      ...(rawData?.classFeatures ?? []),
      ...((rawData?.optionalfeatures ?? []) as OptionalFeatureLike[]),
    ]
    const byKey = new Map<string, unknown[]>()
    for (const record of records) {
      if (!record.source) continue
      const key = getEntityLookupKey(record.name, record.source)
      if (!byKey.has(key) || (!byKey.get(key)?.length && record.entries?.length)) {
        byKey.set(key, record.entries ?? [])
      }
    }
    const race = calculation.raceResolution.mergedRace
    if (race) {
      for (const trait of getRaceTraits(race)) {
        const key = getEntityLookupKey(trait.name, race.source)
        if (!byKey.has(key)) byKey.set(key, trait.entries)
      }
    }
    return byKey
  }, [
    calculation.classes,
    calculation.raceResolution.mergedRace,
    classes,
    filteredData.classFeatures,
    filteredData.optionalfeatures,
    rawData,
  ])
  const resolveChoiceOption = (option: CharacterClassChoiceOption): unknown[] | undefined => {
    if (!option.source) return undefined
    const key = getEntityLookupKey(option.name, option.source)
    if (
      option.entityType === 'classFeature' ||
      option.entityType === 'subclassFeature' ||
      option.entityType === 'optionalFeature'
    ) {
      return featureEntriesByKey.get(key)
    }
    if (option.entityType === 'item') {
      const item = resolveItemReference(option, itemLookup)
      return item ? (item.entries ?? []) : undefined
    }
    if (option.entityType === 'feat') {
      const feat = [...filteredData.feats, ...(rawData?.feats ?? [])].find(
        (entry) => getEntityLookupKey(entry.name, entry.source) === key,
      )
      return feat ? (feat.entries ?? []) : undefined
    }
    const creature = [...filteredData.creatures, ...(rawData?.creatures ?? [])].find(
      (entry) => getEntityLookupKey(entry.name, entry.source) === key,
    )
    if (!creature) return undefined
    return [
      ...(creature.entries ?? []),
      ...(['trait', 'action', 'bonus', 'reaction'] as const).flatMap((kind) =>
        (creature[kind] ?? []).map((entry) => ({
          type: 'entries',
          name: entry.name,
          entries: entry.entries ?? [],
        })),
      ),
    ]
  }
  const racialFeatureNames = new Set(
    Object.entries(character.provenance.features ?? {})
      .filter(([, tags]) =>
        tags.some((tag) => tag.sourceType === 'race' || tag.sourceType === 'subrace'),
      )
      .map(([name]) => name),
  )
  const resolvedRaceTraits = getRaceTraits(calculation.raceResolution.mergedRace)
  const racialFeatures = character.features.filter(
    (feature) =>
      racialFeatureNames.has(feature.name) ||
      (feature.source === calculation.raceResolution.mergedRace?.source &&
        resolvedRaceTraits.some((trait) => trait.name === feature.name)),
  )
  const otherFeatures = character.features.filter((feature) => !racialFeatures.includes(feature))
  const raceTraits = resolvedRaceTraits.filter(
    (trait) => !racialFeatures.some((feature) => feature.name === trait.name),
  )
  const selectedFeats: Feat[] = [
    ...character.feats,
    ...(character.specialFeats ?? []),
    ...(character.classFeatChoices ?? []).flatMap((choice) => choice.feats),
  ]
  const unresolvedAutomation = actions.filter(
    (action) => action.kind === 'special' || !action.active,
  )
  const conditionalNotes = calculation.effects.declarations.filter(
    (effect) => effect.operation.kind === 'conditional-note',
  )
  const spells = useMemo(() => {
    const seen = new Set<string>()
    return spellcasting.spellProfiles.flatMap((profile) => {
      const references = [
        ...profile.cantrips,
        ...profile.spellsKnown,
        ...profile.preparedSpells,
        ...(profile.fixedSpells ?? []),
        ...(profile.alwaysPreparedSpells ?? []),
      ]
      return references.flatMap((reference) => {
        const key = `${profile.id}|${getSpellReferenceKey(reference)}`
        if (seen.has(key)) return []
        seen.add(key)
        const resolved = resolveSpellReference(reference, spellLookup)
        const separator = reference.lastIndexOf('|')
        return [
          {
            key,
            name: resolved?.name ?? (separator < 0 ? reference : reference.slice(0, separator)),
            source:
              resolved?.source ?? (separator < 0 ? undefined : reference.slice(separator + 1)),
            level: resolved?.level,
            entries: resolved?.entries,
            mechanics: resolved
              ? [
                  formatCastingTime(resolved.time),
                  formatRange(resolved.range),
                  formatComponents(resolved.components),
                  formatDuration(resolved.duration),
                  isRitualSpell(resolved) ? 'Ritual' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '',
            profile: profile.label,
            status: profile.cantrips.includes(reference)
              ? 'Cantrip'
              : profile.preparedSpells.includes(reference) ||
                  (profile.alwaysPreparedSpells ?? []).includes(reference) ||
                  profile.alwaysPrepared
                ? 'Prepared'
                : 'Known',
            unresolved: !resolved,
            sourceUnavailable: resolved
              ? !availableSpellKeys.has(getSpellReferenceKey(resolved.name, resolved.source))
              : false,
          },
        ]
      })
    })
  }, [spellcasting.spellProfiles, spellLookup, availableSpellKeys])

  return (
    <div className="space-y-4">
      <Card className="gap-4 p-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          {character.portrait && (
            <div className="aspect-[3/2] w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-48">
              <img
                src={resolvePortraitSrc(character.portrait)}
                alt={`${character.name || 'Character'} portrait`}
                className="block h-full w-full object-cover object-[50%_25%]"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Character overview
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold">
              {character.name || 'Unnamed Character'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {character.subrace
                ? `${character.subrace} ${character.race}`
                : character.race || 'Species undecided'}
              {' · '}
              {classes
                .map(
                  (entry) =>
                    `${entry.name} ${entry.levels}${entry.subclass ? ` (${entry.subclass})` : ''}`,
                )
                .join(' / ') || 'Class undecided'}
              {' · '}Level {level}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {character.background || 'Background undecided'} · {character.originSystem} rules
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Armor Class" value={effectiveAC} />
          <StatCard label="Current HP" value={character.hitPoints.current} />
          <StatCard label="Temporary HP" value={character.hitPoints.temporary} />
          <StatCard label="Max HP" value={effectiveMaxHP} />
          <StatCard label="Proficiency" value={formatModifier(getProficiencyBonus(level))} />
          <StatCard label="Initiative" value={formatModifier(calculation.initiativeModifier)} />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITY_NAMES.map((ability) => (
            <div
              key={ability}
              className="rounded-lg border border-border px-2 py-2 text-center"
              data-testid={`review-ability-${ability}`}
            >
              <div className="text-[10px] font-semibold text-muted-foreground">
                {ABILITY_ABBREVIATIONS[ability]}
              </div>
              <div className="font-semibold tabular-nums">
                {calculation.abilityScores.total[ability]}
              </div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {formatModifier(calculation.abilityScores.modifiers[ability])}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(calculation.movement.speeds).map(([mode, speed]) => (
            <Badge
              key={mode}
              variant="outline"
              className="capitalize"
              data-testid={`review-movement-${mode}`}
            >
              {mode} {speed} ft.
            </Badge>
          ))}
          {calculation.movement.hover && <Badge variant="outline">Hover</Badge>}
          {calculation.senses.map((sense) => (
            <Badge key={sense.type} variant="outline">
              {sense.type}
              {sense.range != null ? ` ${sense.range} ft.` : ''}
            </Badge>
          ))}
        </div>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <OverviewSection title="Proficiencies & skills" defaultOpen>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <ProficiencyList label="Armor" values={character.proficiencies.armor} />
                <ProficiencyList label="Weapons" values={character.proficiencies.weapons} />
                <ProficiencyList label="Tools" values={character.proficiencies.tools} />
                <ProficiencyList label="Languages" values={character.proficiencies.languages} />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Saving throws
                </h3>
                <div className="mt-1 grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
                  {savingThrows.map((save) => (
                    <span key={save.ability}>
                      {save.proficient ? '●' : '○'} {save.ability} {save.modifierString}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Skills
                </h3>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {skills.map((skill) => (
                    <span key={skill.name}>
                      {skill.expertise ? '◆' : skill.proficient ? '●' : '○'} {skill.name}{' '}
                      {skill.modifierString}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Passive Perception {passivePerception} · ◆ Expertise · ● Proficient
                </p>
              </div>
            </div>
          </OverviewSection>

          <OverviewSection title="Attacks & actions" count={actions.length}>
            {actions.length ? (
              <div className="space-y-4">
                {ACTION_GROUPS.map(({ kind, label }) => {
                  const grouped = actions.filter((action) => action.kind === kind)
                  if (!grouped.length) return null
                  return (
                    <section key={kind}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {label}
                      </h3>
                      <ul className="space-y-2">
                        {grouped.map((action) => (
                          <DetailEntry
                            key={action.id}
                            name={action.name}
                            source={action.source.name}
                            status={!action.active ? 'Inactive' : undefined}
                          >
                            <div className="space-y-1">
                              {actionMechanics(action).length > 0 && (
                                <p>{actionMechanics(action).join(' · ')}</p>
                              )}
                              {action.description && <GameContent entry={action.description} />}
                              {action.inactiveReason && <p>Inactive: {action.inactiveReason}</p>}
                            </div>
                          </DetailEntry>
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No actions are currently available.</p>
            )}
          </OverviewSection>

          <OverviewSection
            title="Traits & features"
            count={
              racialFeatures.length +
              raceTraits.length +
              otherFeatures.length +
              (character.classChoiceSelections?.length ?? 0)
            }
          >
            <div className="space-y-4">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Species traits
                </h3>
                {racialFeatures.length > 0 && (
                  <FeatureList features={racialFeatures} entriesByKey={featureEntriesByKey} />
                )}
                {raceTraits.length > 0 && (
                  <ul className="space-y-2">
                    {raceTraits.map((trait) => (
                      <DetailEntry
                        key={trait.key}
                        name={trait.name}
                        source={calculation.raceResolution.mergedRace?.source}
                      >
                        <GameContent entry={trait.entries} />
                      </DetailEntry>
                    ))}
                  </ul>
                )}
                {racialFeatures.length === 0 && raceTraits.length === 0 && (
                  <p className="text-sm text-muted-foreground">No species traits recorded.</p>
                )}
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Class, subclass & other features
                </h3>
                <FeatureList features={otherFeatures} entriesByKey={featureEntriesByKey} />
              </section>
              {(character.classChoiceSelections?.length ?? 0) > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Feature choices
                  </h3>
                  <ul className="space-y-2">
                    {character.classChoiceSelections?.map((choice) => (
                      <DetailEntry
                        key={choice.choiceId}
                        name={choice.label}
                        source={`${choice.className} ${choice.classLevel}`}
                        status={
                          choice.inactive
                            ? 'Inactive'
                            : choice.selected.length === 0
                              ? 'Unresolved'
                              : undefined
                        }
                      >
                        {choice.selected.length ? (
                          <ul className="space-y-2">
                            {choice.selected.map((option) => {
                              const entries = resolveChoiceOption(option)
                              return (
                                <li
                                  key={`${option.entityType}|${option.name}|${option.source ?? ''}`}
                                >
                                  <div className="flex flex-wrap items-center gap-2 font-medium">
                                    <span>
                                      {option.name}
                                      {option.source ? ` (${option.source})` : ''}
                                    </span>
                                    {entries === undefined && (
                                      <Badge variant="outline">Unresolved source</Badge>
                                    )}
                                  </div>
                                  {entries?.length ? <GameContent entry={entries} /> : null}
                                </li>
                              )
                            })}
                          </ul>
                        ) : (
                          <p>No option selected.</p>
                        )}
                      </DetailEntry>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </OverviewSection>

          <OverviewSection title="Feats" count={selectedFeats.length}>
            {selectedFeats.length ? (
              <ul className="space-y-2">
                {selectedFeats.map((feat) => {
                  const resolved = calculation.feats.find(
                    (entry) =>
                      getEntityLookupKey(entry.name, entry.source) ===
                      getEntityLookupKey(feat.name, feat.source),
                  )
                  return (
                    <DetailEntry
                      key={feat.id}
                      name={feat.name}
                      source={feat.source}
                      status={
                        !resolved
                          ? 'Unresolved source'
                          : !availableFeatKeys.has(getEntityLookupKey(feat.name, feat.source))
                            ? 'Source unavailable'
                            : undefined
                      }
                    >
                      {resolved?.entries?.length ? (
                        <GameContent entry={resolved.entries} />
                      ) : feat.description ? (
                        <GameContent entry={feat.description} />
                      ) : null}
                    </DetailEntry>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No feats selected.</p>
            )}
          </OverviewSection>
        </div>

        <div className="space-y-4">
          <OverviewSection title="Spells & spellcasting" count={spells.length}>
            <div className="space-y-4">
              {spellcasting.spellcastingDetails.map((detail) => (
                <div key={detail.profileId} className="rounded-lg border border-border p-3 text-sm">
                  <strong>{detail.className}</strong>
                  <p className="mt-1 text-muted-foreground">
                    {detail.spellcastingAbility ? `${detail.spellcastingAbility} · ` : ''}Save DC{' '}
                    {detail.spellSaveDC ?? '—'} · Spell attack{' '}
                    {detail.spellAttackBonus == null
                      ? '—'
                      : formatModifier(detail.spellAttackBonus)}
                    {detail.preparedSpellLimit != null
                      ? ` · Prepared limit ${detail.preparedSpellLimit}`
                      : ''}
                  </p>
                </div>
              ))}
              {spellcasting.slots.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Spell slots
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {spellcasting.slots.map((slot) => (
                      <Badge
                        key={`${slot.isPactMagic ? 'pact' : 'shared'}-${slot.level}`}
                        variant="outline"
                      >
                        {slot.isPactMagic ? 'Pact ' : ''}Level {slot.level}: {slot.available}/
                        {slot.max}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {spells.length ? (
                <ul className="space-y-2">
                  {spells.map((spell) => (
                    <DetailEntry
                      key={spell.key}
                      name={spell.name}
                      source={`${spell.profile}${spell.source ? ` · ${spell.source}` : ''}`}
                      status={
                        spell.unresolved
                          ? 'Unresolved source'
                          : spell.sourceUnavailable
                            ? `${spell.status} · Source unavailable`
                            : spell.status
                      }
                    >
                      <p>
                        {spell.level === 0
                          ? 'Cantrip'
                          : spell.level != null
                            ? `Level ${spell.level}`
                            : 'Level unknown'}
                      </p>
                      {spell.mechanics && <p>{spell.mechanics}</p>}
                      {spell.entries && <GameContent entry={spell.entries} />}
                    </DetailEntry>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No spells selected.</p>
              )}
            </div>
          </OverviewSection>

          <OverviewSection title="Equipment" count={calculation.equipment.all.length}>
            {calculation.equipment.all.length ? (
              <ul className="space-y-2">
                {calculation.equipment.all.map((item) => {
                  const resolved = resolveItemReference(item, itemLookup)
                  return (
                    <DetailEntry
                      key={item.id}
                      name={`${item.name} ×${item.quantity}`}
                      source={item.source}
                      status={
                        [
                          item._unresolved
                            ? 'Unresolved source'
                            : resolved &&
                                !availableItemKeys.has(
                                  getEntityLookupKey(resolved.name, resolved.source),
                                )
                              ? 'Source unavailable'
                              : undefined,
                          item.equipped ? 'Equipped' : undefined,
                          item.attuned ? 'Attuned' : undefined,
                        ]
                          .filter(Boolean)
                          .join(' · ') || undefined
                      }
                    >
                      <div className="space-y-1">
                        {item.rarity && <p>{item.rarity}</p>}
                        {resolved?.entries?.length ? (
                          <GameContent entry={resolved.entries} />
                        ) : (
                          item.description && <GameContent entry={item.description} />
                        )}
                      </div>
                    </DetailEntry>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No equipment carried.</p>
            )}
            {character.currency && (
              <p className="mt-3 text-sm">
                Currency:{' '}
                {Object.entries(character.currency)
                  .map(([coin, amount]) => `${amount} ${coin}`)
                  .join(' · ')}
              </p>
            )}
          </OverviewSection>

          <OverviewSection title="Resources & conditions">
            <div className="space-y-4 text-sm">
              {hitDicePools.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Hit dice
                  </h3>
                  <p className="mt-1">
                    {hitDicePools
                      .map(
                        (pool) => `${pool.label}: ${pool.max - pool.used}/${pool.max} d${pool.die}`,
                      )
                      .join(' · ')}
                  </p>
                </div>
              )}
              {resources.length > 0 && (
                <ul className="space-y-2">
                  {resources.map((resource) => (
                    <DetailEntry
                      key={resource.id}
                      name={resource.label}
                      source={resource.className}
                    >
                      <p>
                        {resource.current}/{resource.max} available · {resource.recoveryText}
                      </p>
                    </DetailEntry>
                  ))}
                </ul>
              )}
              {spellcasting.slots.length > 0 && (
                <p>
                  Spell slots:{' '}
                  {spellcasting.slots
                    .map(
                      (slot) =>
                        `${slot.isPactMagic ? 'Pact ' : ''}${slot.level}: ${slot.available}/${slot.max}`,
                    )
                    .join(' · ')}
                </p>
              )}
              <ProficiencyList label="Conditions" values={character.conditions ?? []} />
              {(character.exhaustion ?? 0) > 0 && <p>Exhaustion {character.exhaustion}</p>}
              {character.inspiration && <p>Inspiration available</p>}
              {character.deathSaves &&
                (character.deathSaves.successes > 0 || character.deathSaves.failures > 0) && (
                  <p>
                    Death saves: {character.deathSaves.successes} successes ·{' '}
                    {character.deathSaves.failures} failures
                  </p>
                )}
              {(character.damageResistances?.length ?? 0) > 0 && (
                <ProficiencyList
                  label="Damage resistances"
                  values={character.damageResistances ?? []}
                />
              )}
              {(character.damageImmunities?.length ?? 0) > 0 && (
                <ProficiencyList
                  label="Damage immunities"
                  values={character.damageImmunities ?? []}
                />
              )}
              {(character.conditionImmunities?.length ?? 0) > 0 && (
                <ProficiencyList
                  label="Condition immunities"
                  values={character.conditionImmunities ?? []}
                />
              )}
            </div>
          </OverviewSection>

          {organizationName && (
            <OverviewSection title="Organization">
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-raised">
                  {organizationImage && failedOrganizationImage !== organizationImage ? (
                    <img
                      src={resolveOrganizationImageSrc(organizationImage)}
                      alt={`${organizationName} emblem`}
                      className="size-full object-contain"
                      onError={() => setFailedOrganizationImage(organizationImage)}
                    />
                  ) : (
                    <Buildings
                      className="size-6 text-primary"
                      weight="duotone"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold">{organizationName}</h3>
                  {organizationDescription && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {organizationDescription}
                    </p>
                  )}
                </div>
              </div>
            </OverviewSection>
          )}

          <OverviewSection
            title="Rules & reminders"
            count={unresolvedAutomation.length + conditionalNotes.length}
          >
            {unresolvedAutomation.length === 0 && conditionalNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No special rules or reminders to show.
              </p>
            ) : (
              <ul className="space-y-2">
                {unresolvedAutomation.map((action) => (
                  <DetailEntry
                    key={action.id}
                    name={action.name}
                    status={!action.active ? 'Inactive' : 'Rules text'}
                  >
                    <p>
                      {action.inactiveReason ??
                        'Review the rules text for this action’s timing and effects.'}
                    </p>
                  </DetailEntry>
                ))}
                {conditionalNotes.map((effect) => (
                  <DetailEntry key={effect.id} name={effect.label}>
                    {effect.operation.kind === 'conditional-note' && <p>{effect.operation.note}</p>}
                  </DetailEntry>
                ))}
              </ul>
            )}
          </OverviewSection>

          <OverviewSection title="Content sources">
            {sourceNames.length ? (
              <ul className="space-y-1 text-sm">
                {sourceNames.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                All sources in the configured data set are enabled.
              </p>
            )}
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => navigate('/sources')}
            >
              Review sources <ArrowRight />
            </Button>
          </OverviewSection>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2">
              <FilePdf className="size-5 text-primary" weight="fill" />
              <h2 className="font-semibold">Character sheet</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {ready
                ? 'You can export or print this character sheet.'
                : 'Some character details are unfinished. You can still export or print this sheet and return to them later.'}
            </p>
            <Button
              size="sm"
              variant={ready ? 'default' : 'outline'}
              onClick={() => navigate(`/character-sheet/${character.originSystem}`)}
            >
              Open character sheet <ArrowRight />
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
