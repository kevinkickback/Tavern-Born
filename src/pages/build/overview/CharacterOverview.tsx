import {
  ArrowRight,
  Backpack,
  Books,
  CaretRight,
  Certificate,
  Coin,
  Heartbeat,
  type Icon,
  MagicWand,
  Sparkle,
  Star,
  Sword,
} from '@phosphor-icons/react'
import { type ReactNode, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameContent } from '@/components/editor/GameContent'
import { RulesPreviewButton } from '@/components/editor/RulesPreviewButton'
import { getSpellPreviewDescriptor } from '@/components/editor/rulesPreviewReferences'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useClassResources } from '@/hooks/character/useClassResources'
import { useSavingThrows } from '@/hooks/character/useSavingThrows'
import { useSkills } from '@/hooks/character/useSkills'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  useItemLookup,
  useRetainedCharacterDetails,
  useSpellLookup,
} from '@/hooks/data/useGameData'
import { useRecursiveLookup } from '@/hooks/data/useRecursiveLookup'
import { resolveItemReferences } from '@/lib/5etools/itemResolvers'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  formatModifier,
} from '@/lib/calculations/abilityScores'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getEffectiveDefensiveTraits } from '@/lib/calculations/defensiveTraits'
import { isCharacterEffectActive } from '@/lib/calculations/effects'
import { getProficiencyBonus } from '@/lib/calculations/gameRules'
import {
  getRaceDisplayName,
  getRacialSourceDisplayName,
  getSpellProfileDisplayLabel,
} from '@/lib/calculations/raceDisplay'
import { getRaceTraits } from '@/lib/calculations/raceUtils'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { getInvocationCantripLabel } from '@/lib/character/classChoiceIdentity'
import { effectiveDeclaredEntries } from '@/lib/character/classFeatureActivityView'
import {
  createOptionalClassFeatureActivity,
  getActiveOptionalClassFeatureDeclarations,
} from '@/lib/character/optionalClassFeatureActivity'
import { getCharacterClassEntries, getTotalCharacterLevel } from '@/lib/characterUtils'
import { capitalizeLabel, formatProficiencyLabel } from '@/lib/displayLabels'
import { resolvePortraitSrc } from '@/lib/portraitConstants'
import { normalizeKey } from '@/lib/provenance/normalization'
import {
  getEntryWithHoverTitles,
  getItemPreviewEntries,
  type RecursiveLookup,
} from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'
import type { CharacterAction } from '@/types/actions'
import type { Feat, Feature } from '@/types/character'

const ACTION_GROUPS: Array<{ kind: CharacterAction['kind']; label: string }> = [
  { kind: 'attack', label: 'Attacks' },
  { kind: 'action', label: 'Actions' },
  { kind: 'bonus-action', label: 'Bonus Actions' },
  { kind: 'reaction', label: 'Reactions' },
  { kind: 'passive', label: 'Passive' },
  { kind: 'special', label: 'Rules & Special' },
]

const PRIMARY_MOVEMENT = ['walk', 'swim', 'fly', 'climb']
const DETAIL_GRID = 'overview-detail-grid'

const CURRENCY = [
  ['cp', 'Copper pieces', 'text-orange-600 dark:text-orange-400'],
  ['sp', 'Silver pieces', 'text-slate-700 dark:text-slate-400'],
  ['ep', 'Electrum pieces', 'text-emerald-600 dark:text-emerald-400'],
  ['gp', 'Gold pieces', 'text-amber-800 dark:text-amber-400'],
  ['pp', 'Platinum pieces', 'text-violet-800 dark:text-violet-400'],
] as const

function duplicateNames(entries: readonly { name: string }[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const { name } of entries) {
    const key = normalizeKey(name)
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  }
  return duplicates
}

function OverviewStat({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: 'armor' | 'health'
}) {
  return (
    <div className="min-w-0 text-center">
      <div className="text-[0.6875rem] font-semibold uppercase leading-tight text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold leading-tight tabular-nums',
          accent === 'armor' && 'text-primary',
          accent === 'health' && 'text-red-800 dark:text-red-400',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function OverviewSection({
  title,
  icon: SectionIcon,
  count,
  children,
}: {
  title: string
  icon: Icon
  count?: number
  children: ReactNode
}) {
  return (
    <details className="group min-w-0 border-b border-border">
      <summary className="overview-detail-trigger">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center text-primary">
            <SectionIcon className="size-[18px]" weight="regular" aria-hidden="true" />
          </span>
          {title}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {count !== undefined && <span className="tabular-nums">{count}</span>}
          <CaretRight
            aria-hidden="true"
            className="size-3 transition-transform group-open:rotate-90"
          />
        </span>
      </summary>
      <div className="mx-4 border-t border-border pt-2.5 pb-3">{children}</div>
    </details>
  )
}

function OverviewRuleEntry({
  id,
  name,
  source,
  status,
  showSource,
  entry,
  spell,
  lookup,
}: {
  id: string
  name: string
  source?: string
  status?: string
  showSource?: boolean
  entry?: unknown
  spell?: Spell5e
  lookup: RecursiveLookup
}) {
  const subtitle = [source, status].filter(Boolean).join(' · ')
  const descriptor = useMemo(
    () =>
      spell
        ? { ...getSpellPreviewDescriptor(spell, lookup, subtitle), key: id }
        : {
            kind: 'generic' as const,
            key: id,
            title: name,
            subtitle,
            html: (Array.isArray(entry) ? entry : [entry])
              .filter((value) => value !== undefined && value !== null)
              .map(getEntryWithHoverTitles)
              .join(''),
            recursiveLookup: lookup,
          },
    [entry, id, lookup, name, spell, subtitle],
  )
  return (
    <li className="overview-detail-item">
      <RulesPreviewButton
        descriptor={descriptor}
        label={showSource && subtitle ? `${name}, ${subtitle}` : undefined}
        className="overview-rules-preview"
      >
        {name}
      </RulesPreviewButton>
      {showSource && subtitle && (
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      )}
    </li>
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
    <li className="rounded-lg border border-border/80 bg-surface-raised/35 p-3">
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
    <div className="min-w-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{label}</h3>
      <p className="mt-1 wrap-anywhere text-sm">
        {values.length ? values.map(formatProficiencyLabel).join(', ') : 'None'}
      </p>
    </div>
  )
}

function FeatureList({
  features,
  entriesByKey,
  repeatedNames,
  lookup,
}: {
  features: readonly Feature[]
  entriesByKey: ReadonlyMap<string, unknown[]>
  repeatedNames: ReadonlySet<string>
  lookup: RecursiveLookup
}) {
  return features.length ? (
    <ul className={DETAIL_GRID}>
      {features.map((feature) => (
        <OverviewRuleEntry
          id={feature.id}
          key={feature.id}
          name={feature.name}
          source={feature.source}
          showSource={repeatedNames.has(normalizeKey(feature.name))}
          lookup={lookup}
          entry={
            feature.description ||
            entriesByKey.get(getEntityLookupKey(feature.name, feature.source))
          }
        />
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">No features recorded.</p>
  )
}

export function CharacterOverview({
  calculation,
  actions,
  effectiveAC,
  effectiveMaxHP,
  hitDicePools,
  sources,
  attention,
  manualAdjustments,
}: {
  calculation: CharacterCalculationContext
  actions: CharacterAction[]
  effectiveAC: number
  effectiveMaxHP: number
  hitDicePools: Array<{ id: string; label: string; die: number; max: number; used: number }>
  sources: readonly { id: string; name: string; unavailable: boolean }[]
  attention: ReactNode
  manualAdjustments: ReactNode
}) {
  const { character } = calculation
  const navigate = useNavigate()
  const { skills, passivePerception, passiveInvestigation, passiveInsight } = useSkills()
  const { savingThrows } = useSavingThrows()
  const { resources, unlimitedWildShape } = useClassResources()
  const spellcasting = useSpellSlots()
  const spellLookup = useSpellLookup()
  const itemLookup = useItemLookup()
  const equipmentRules = resolveItemReferences(calculation.equipment.all, itemLookup)
  const nonSpellActions = actions.filter(({ source }) => source.kind !== 'spell')
  const filteredData = useFilteredGameData()
  const previewLookup = useRecursiveLookup()
  const { featureEntriesByKey, choiceDetailsById, effectiveClassChoiceSelections } =
    useRetainedCharacterDetails(character, calculation.raceResolution.mergedRace)
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
  const optionalActivity = createOptionalClassFeatureActivity(
    character,
    calculation.classChoices.catalogs,
  )
  const adoptedFeatures = getActiveOptionalClassFeatureDeclarations(optionalActivity)
  const raceTraits = resolvedRaceTraits.filter(
    (trait) => !racialFeatures.some((feature) => feature.name === trait.name),
  )
  const selectedFeats: Feat[] = [
    ...character.feats,
    ...(character.specialFeats ?? []),
    ...(character.classFeatChoices ?? []).flatMap((choice) => choice.feats),
  ]
  const conditionalNotes = calculation.effects.declarations.filter(
    (effect) =>
      effect.operation.kind === 'conditional-note' &&
      isCharacterEffectActive(effect, calculation.effects.resolutionContext),
  )
  const defenses = getEffectiveDefensiveTraits(
    calculation.effects.declarations,
    calculation.effects.resolutionContext,
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
            resolved,
            profile: getSpellProfileDisplayLabel(profile),
            castingSource: profile.classSource,
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

  const repeatedRaceFeatures = duplicateNames(racialFeatures)
  const repeatedClassFeatures = duplicateNames([
    ...otherFeatures,
    ...adoptedFeatures.map(({ feature }) => feature),
  ])
  const repeatedSpells = duplicateNames(spells)
  const repeatedItems = duplicateNames(calculation.equipment.all)
  const repeatedFeats = duplicateNames(selectedFeats)
  const repeatedChoices = duplicateNames(
    effectiveClassChoiceSelections.map(({ label }) => ({ name: label })),
  )

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-4">
      <Card
        role="region"
        aria-label="Character overview"
        className="overview-summary grid min-w-0 items-center gap-3 p-3 shadow-none"
      >
        <div className="overview-identity flex min-w-0 items-center gap-3">
          {character.portrait && (
            <div className="overview-portrait">
              <img
                src={resolvePortraitSrc(character.portrait)}
                alt={`${character.name || 'Character'} portrait`}
                className="block h-full w-full object-cover object-[50%_25%]"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-xl font-bold leading-tight">
              {character.name || 'Unnamed Character'}
            </h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              Level {level} ·{' '}
              {getRaceDisplayName(character.race, character.subrace) || 'Species undecided'}
            </p>
            <p className="mt-1 break-words text-sm">
              {classes
                .slice(0, 3)
                .map(({ name, subclass }) => (subclass ? `${name} (${subclass})` : name))
                .join(' / ') || 'Class undecided'}
              {classes.length > 3 && ` +${classes.length - 3} more`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {character.background || 'Background undecided'} · {character.originSystem} rules
            </p>
          </div>
        </div>
        <div data-slot="overview-combat-stats" className="overview-combat">
          <div className="overview-combat-values">
            <OverviewStat label="Armor Class" value={effectiveAC} accent="armor" />
            <OverviewStat label="Max HP" value={effectiveMaxHP} accent="health" />
            <OverviewStat label="Proficiency" value={formatModifier(getProficiencyBonus(level))} />
            <OverviewStat
              label="Initiative"
              value={formatModifier(calculation.initiativeModifier)}
            />
          </div>
          <div className="overview-movement">
            {PRIMARY_MOVEMENT.map((mode) => {
              const speed = calculation.movement.speeds[mode]
              return (
                <span
                  key={mode}
                  className={speed === undefined ? 'text-muted-foreground' : 'text-primary'}
                  data-testid={`overview-movement-${mode}`}
                >
                  {capitalizeLabel(mode)} {speed === undefined ? '—' : `${speed} ft.`}
                </span>
              )
            })}
            {Object.entries(calculation.movement.speeds)
              .filter(([mode]) => !PRIMARY_MOVEMENT.includes(mode))
              .map(([mode, speed]) => (
                <span key={mode} data-testid={`overview-movement-${mode}`}>
                  {capitalizeLabel(mode)} {speed} ft.
                </span>
              ))}
            {calculation.movement.hover && <span>Hover</span>}
            {calculation.senses.map((sense) => (
              <span key={sense.type}>
                {capitalizeLabel(sense.type)}
                {sense.range != null ? ` ${sense.range} ft.` : ''}
              </span>
            ))}
          </div>
        </div>
        <div data-slot="overview-ability-scores" className="overview-abilities">
          <div className="overview-ability-values">
            {ABILITY_NAMES.map((ability) => (
              <div
                key={ability}
                className="min-w-0 text-center"
                data-testid={`overview-ability-${ability}`}
              >
                <div className="text-[0.6875rem] font-semibold leading-tight text-muted-foreground">
                  {ABILITY_ABBREVIATIONS[ability]}
                </div>
                <div className="mt-1 text-2xl font-semibold leading-tight tabular-nums">
                  {calculation.abilityScores.total[ability]}
                </div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  ({formatModifier(calculation.abilityScores.modifiers[ability])})
                </div>
              </div>
            ))}
          </div>
          <section aria-label="Passive scores" className="overview-passives">
            <span>Passive Perception {passivePerception}</span>
            <span>Passive Investigation {passiveInvestigation}</span>
            <span>Passive Insight {passiveInsight}</span>
          </section>
        </div>
      </Card>
      <div className="overview-panels">
        {attention}
        {manualAdjustments}
      </div>
      <section aria-label="Character details" className="pt-3">
        <h2 className="mb-2 text-lg font-semibold">Character details</h2>
        <div className="overview-details">
          <div className="min-w-0">
            <OverviewSection title="Proficiencies & skills" icon={Certificate}>
              <div className="divide-y divide-border">
                <div className="overview-proficiencies">
                  <ProficiencyList label="Armor" values={character.proficiencies.armor} />
                  <ProficiencyList label="Weapons" values={character.proficiencies.weapons} />
                  <ProficiencyList label="Tools" values={character.proficiencies.tools} />
                  <ProficiencyList label="Languages" values={character.proficiencies.languages} />
                </div>
                <div className="py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Saving throws
                  </h3>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
                    {savingThrows.map((save) => (
                      <span key={save.ability} className={cn(save.proficient && 'font-medium')}>
                        <span
                          className={save.proficient ? 'text-primary' : 'text-muted-foreground'}
                        >
                          {save.proficient ? '●' : '○'}
                        </span>{' '}
                        {capitalizeLabel(save.ability)} {save.modifierString}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Skills
                  </h3>
                  <div className="overview-skills">
                    {skills.map((skill) => (
                      <span
                        key={skill.name}
                        className={cn((skill.expertise || skill.proficient) && 'font-medium')}
                      >
                        <span
                          className={
                            skill.expertise || skill.proficient
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }
                        >
                          {skill.expertise ? '◆' : skill.proficient ? '●' : '○'}
                        </span>{' '}
                        {formatProficiencyLabel(skill.name)} {skill.modifierString}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="pt-2 text-center text-xs text-muted-foreground">
                  ◆ Expertise · ● Proficient
                </p>
              </div>
            </OverviewSection>

            <OverviewSection title="Attacks & actions" icon={Sword} count={nonSpellActions.length}>
              {nonSpellActions.length ? (
                <div className="space-y-4">
                  {ACTION_GROUPS.map(({ kind, label }) => {
                    const grouped = nonSpellActions.filter((action) => action.kind === kind)
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
                              source={getRacialSourceDisplayName(character, action.source)}
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
              icon={Sparkle}
              count={
                racialFeatures.length +
                raceTraits.length +
                otherFeatures.length +
                adoptedFeatures.length +
                (character.classChoiceSelections?.length ?? 0) +
                conditionalNotes.length
              }
            >
              <div className="space-y-4">
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Species traits
                  </h3>
                  {racialFeatures.length > 0 && (
                    <FeatureList
                      features={racialFeatures}
                      entriesByKey={featureEntriesByKey}
                      lookup={previewLookup}
                      repeatedNames={repeatedRaceFeatures}
                    />
                  )}
                  {raceTraits.length > 0 && (
                    <ul className={DETAIL_GRID}>
                      {raceTraits.map((trait) => (
                        <OverviewRuleEntry
                          lookup={previewLookup}
                          key={trait.key}
                          id={trait.key}
                          name={trait.name}
                          source={calculation.raceResolution.mergedRace?.source}
                          entry={trait.entries}
                        />
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
                  <FeatureList
                    features={otherFeatures}
                    entriesByKey={featureEntriesByKey}
                    lookup={previewLookup}
                    repeatedNames={repeatedClassFeatures}
                  />
                  {adoptedFeatures.length > 0 && (
                    <ul className={DETAIL_GRID}>
                      {adoptedFeatures.map(({ owner, target, level: gain, feature }) => (
                        <OverviewRuleEntry
                          lookup={previewLookup}
                          key={JSON.stringify([owner, target, gain])}
                          id={JSON.stringify([owner, target, gain])}
                          name={feature.name}
                          source={`${feature.className} ${gain} · ${feature.source}`}
                          showSource={repeatedClassFeatures.has(normalizeKey(feature.name))}
                          entry={effectiveDeclaredEntries(
                            feature.entries ?? [],
                            optionalActivity,
                            owner,
                            target,
                          )}
                        />
                      ))}
                    </ul>
                  )}
                </section>
                {(character.classChoiceSelections?.length ?? 0) > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Feature choices
                    </h3>
                    <ul className={DETAIL_GRID}>
                      {effectiveClassChoiceSelections.map((choice) => (
                        <OverviewRuleEntry
                          lookup={previewLookup}
                          key={choice.choiceId}
                          id={choice.choiceId}
                          name={choice.label}
                          source={`${choice.className} ${choice.classLevel} · ${choice.classSource}`}
                          showSource={repeatedChoices.has(normalizeKey(choice.label))}
                          status={
                            choice.inactive
                              ? 'Inactive'
                              : choice.selected.length === 0
                                ? 'Unresolved'
                                : undefined
                          }
                          entry={
                            choice.selected.length
                              ? choice.selected.map((option, index) => {
                                  const details = choiceDetailsById.get(choice.choiceId)?.[index]
                                  const name =
                                    getInvocationCantripLabel(option) ??
                                    (option.source
                                      ? `${option.name} (${option.source})`
                                      : option.name)
                                  const availability = details?.availability
                                  const note =
                                    !details || availability === 'missing'
                                      ? 'Unresolved source'
                                      : availability === 'source-unavailable'
                                        ? 'Source unavailable'
                                        : availability === 'inactive'
                                          ? 'Inactive'
                                          : undefined
                                  return {
                                    type: 'entries',
                                    name,
                                    entries: [...(note ? [note] : []), ...(details?.entries ?? [])],
                                  }
                                })
                              : 'No option selected.'
                          }
                        />
                      ))}
                    </ul>
                  </section>
                )}
                {conditionalNotes.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Conditional notes
                    </h3>
                    <ul className={DETAIL_GRID}>
                      {conditionalNotes.map((effect) => (
                        <OverviewRuleEntry
                          key={effect.id}
                          id={effect.id}
                          name={effect.label}
                          lookup={previewLookup}
                          entry={
                            effect.operation.kind === 'conditional-note'
                              ? effect.operation.note
                              : undefined
                          }
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </OverviewSection>

            <OverviewSection title="Feats" icon={Star} count={selectedFeats.length}>
              {selectedFeats.length ? (
                <ul className={DETAIL_GRID}>
                  {selectedFeats.map((feat) => {
                    const resolved = calculation.feats.find(
                      (entry) =>
                        getEntityLookupKey(entry.name, entry.source) ===
                        getEntityLookupKey(feat.name, feat.source),
                    )
                    return (
                      <OverviewRuleEntry
                        lookup={previewLookup}
                        key={feat.id}
                        id={feat.id}
                        name={feat.name}
                        source={feat.source}
                        showSource={repeatedFeats.has(normalizeKey(feat.name))}
                        status={
                          !resolved
                            ? 'Unresolved source'
                            : !availableFeatKeys.has(getEntityLookupKey(feat.name, feat.source))
                              ? 'Source unavailable'
                              : undefined
                        }
                        entry={resolved?.entries?.length ? resolved.entries : feat.description}
                      />
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No feats selected.</p>
              )}
            </OverviewSection>
          </div>

          <div className="min-w-0">
            <OverviewSection title="Spells & spellcasting" icon={MagicWand} count={spells.length}>
              <div className="divide-y divide-border">
                {[
                  ...spellcasting.spellcastingDetails.map((detail) => ({
                    ...detail,
                    sourceName: detail.className,
                  })),
                  ...spellcasting.racialSpellcastingDetails,
                ].map((detail) => (
                  <div key={detail.profileId} className="py-2 text-sm first:pt-0">
                    <strong>{detail.sourceName}</strong>
                    <p className="text-muted-foreground">
                      {capitalizeLabel(detail.spellcastingAbility ?? 'Unselected ability')} · Save
                      DC {detail.spellSaveDC ?? '—'} · Spell attack{' '}
                      {detail.spellAttackBonus == null
                        ? '—'
                        : formatModifier(detail.spellAttackBonus)}
                      {'preparedSpellLimit' in detail && detail.preparedSpellLimit != null
                        ? ` · Prepared limit ${detail.preparedSpellLimit}`
                        : ''}
                    </p>
                  </div>
                ))}
                {spellcasting.slots.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Spell slots
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
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
                  <div className="pt-2 first:pt-0">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Spells
                    </h3>
                    <ul className={DETAIL_GRID}>
                      {spells.map((spell) => (
                        <OverviewRuleEntry
                          lookup={previewLookup}
                          key={spell.key}
                          id={spell.key}
                          name={spell.name}
                          source={[
                            spell.profile,
                            spell.castingSource && spell.castingSource !== spell.source
                              ? spell.castingSource
                              : undefined,
                            spell.source,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          showSource={repeatedSpells.has(normalizeKey(spell.name))}
                          status={
                            spell.unresolved
                              ? 'Unresolved source'
                              : spell.sourceUnavailable
                                ? `${spell.status} · Source unavailable`
                                : spell.status
                          }
                          spell={spell.resolved}
                        />
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="pt-2 text-sm text-muted-foreground first:pt-0">
                    No spells selected.
                  </p>
                )}
              </div>
            </OverviewSection>

            <OverviewSection
              title="Equipment"
              icon={Backpack}
              count={calculation.equipment.all.length}
            >
              {calculation.equipment.all.length ? (
                <ul className={DETAIL_GRID}>
                  {calculation.equipment.all.map((item, index) => {
                    const resolved = equipmentRules[index]
                    const previewEntries = resolved
                      ? getItemPreviewEntries(resolved, previewLookup, item.description)
                      : [item.description]
                    const rarity =
                      item.rarity && normalizeKey(item.rarity) !== 'none'
                        ? capitalizeLabel(item.rarity)
                        : undefined
                    return (
                      <OverviewRuleEntry
                        lookup={previewLookup}
                        key={item.id}
                        id={item.id}
                        name={`${item.name} ×${item.quantity}`}
                        source={item.source}
                        showSource={repeatedItems.has(normalizeKey(item.name))}
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
                        entry={rarity ? [rarity, ...previewEntries] : previewEntries}
                      />
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No equipment carried.</p>
              )}
              {character.currency && (
                <div className="mt-2 border-t border-border pt-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Currency
                  </h3>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {CURRENCY.map(([coin, label, color]) => (
                      <li key={coin}>
                        <Badge variant="outline" className={cn('tabular-nums', color)}>
                          <Coin weight="fill" aria-hidden />
                          {character.currency?.[coin] ?? 0}{' '}
                          <abbr title={label} className="no-underline">
                            {coin.toUpperCase()}
                          </abbr>
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </OverviewSection>

            <OverviewSection title="Resources & conditions" icon={Heartbeat}>
              <div className="space-y-4 text-sm">
                {hitDicePools.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
                      Hit dice
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {hitDicePools.map((pool) => (
                        <Badge key={pool.id} variant="outline" className="tabular-nums">
                          {pool.label}: {pool.max - pool.used}/{pool.max} d{pool.die}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(resources.length > 0 || unlimitedWildShape) && (
                  <ul className="space-y-2">
                    {unlimitedWildShape && (
                      <DetailEntry name="Wild Shape" source="Druid">
                        <p>Unlimited uses · Archdruid</p>
                      </DetailEntry>
                    )}
                    {resources.map((resource) => (
                      <DetailEntry
                        key={resource.id}
                        name={resource.label}
                        source={resource.className}
                      >
                        <p>
                          {resource.current}/{resource.max} available · {resource.recoveryText}
                          {resource.usageText && ` · ${resource.usageText}`}
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
                {defenses.damageResistances.length > 0 && (
                  <ProficiencyList label="Damage resistances" values={defenses.damageResistances} />
                )}
                {defenses.damageImmunities.length > 0 && (
                  <ProficiencyList label="Damage immunities" values={defenses.damageImmunities} />
                )}
                {defenses.conditionImmunities.length > 0 && (
                  <ProficiencyList
                    label="Condition immunities"
                    values={defenses.conditionImmunities}
                  />
                )}
              </div>
            </OverviewSection>

            <OverviewSection title="Content sources" icon={Books} count={sources.length}>
              <ul className="space-y-1.5 text-sm">
                {sources.map(({ id, name, unavailable }) => (
                  <li
                    key={id}
                    className="flex flex-wrap items-center gap-2 rounded-md bg-surface-raised/50 px-2.5 py-1.5"
                  >
                    <Badge variant="outline" className="text-primary">
                      {id}
                    </Badge>
                    {name !== id && <span>{name}</span>}
                    {unavailable && (
                      <span className="text-xs text-muted-foreground">Unavailable</span>
                    )}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() => navigate('/sources')}
              >
                Configure sources <ArrowRight />
              </Button>
            </OverviewSection>
          </div>
        </div>
      </section>
    </div>
  )
}
