import { useCharacterReadiness } from '@/hooks/character/useCharacterReadiness'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import {
  getSelectedSubclassData,
  getSubclassSelectionInfo,
  resolveClassProgressionRules,
} from '@/lib/5etools/classData'
import {
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getEarnedSubclassFeatureSource } from '@/lib/5etools/ownedSubclassFeature'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import { ABILITY_NAMES } from '@/lib/calculations/abilityScores'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getASILevelsFromClass, getProficiencyBonus } from '@/lib/calculations/gameRules'
import { getSpellProfileDisplayLabel } from '@/lib/calculations/raceDisplay'
import { getSpellReferenceKey, parseSpellReference } from '@/lib/calculations/spellIdentity'
import { buildSpellSelectionSourceMap } from '@/lib/calculations/spellProfiles.attribution'
import { getCharacterClassChoices } from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { EPIC_BOON_LEVEL } from '@/lib/character/epicBoonSlots'
import { resolveAvailableHistoricalChoices } from '@/lib/character/historicalProficiencyChoices'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { optionalClassOwner } from '@/lib/character/optionalClassFeatureIdentity'
import { getEffectiveMaxHP, getTotalCharacterLevel } from '@/lib/characterUtils'
import { getInheritedSubclassStaticFeatures } from '@/lib/pdf/declaredSubclassStaticFeatures'
import { normalizeKey, normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import { getClassSpellGainsByLevel } from '@/pages/build/class/hooks/useClassSpellChoiceController'
import { getLevelUpProgressionChanges } from '@/pages/build/class/model/levelUpProgression'
import {
  getClassChoiceGainCount,
  getDisplayedClassFeatures,
} from '@/pages/build/class/model/pageUtils'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character } from '@/types/character'

function spellsByOwner(context: CharacterCalculationContext) {
  const { character } = context
  const spells = new Map<string, { reference: string; detail: string }>()
  const sources = buildSpellSelectionSourceMap({
    spellProfiles: character.spells.spellProfiles,
    ledger: character.provenance,
    choices: character.managedClassSpellChoices,
    classProgression: character.classProgression,
  })
  for (const profile of character.spells.spellProfiles) {
    const entry = findClassReference(
      { name: profile.className, source: profile.classSource },
      character.classProgression,
    )
    const profileLabel = `${profile.className ?? getSpellProfileDisplayLabel(profile)}${profile.classSource ? ` (${profile.classSource})` : ''}`
    for (const [status, references] of [
      ['Cantrip', profile.cantrips],
      ['Known', profile.spellsKnown],
      ['Prepared', profile.preparedSpells],
      ['Fixed grant', profile.fixedSpells ?? []],
      ['Always prepared', profile.alwaysPreparedSpells ?? []],
    ] as const) {
      for (const reference of references) {
        const referenceKey = getSpellReferenceKey(reference)
        const owner = sources.get(`${profile.id}|${reference}`) ?? profileLabel
        spells.set(JSON.stringify([profile.id, referenceKey, status]), {
          reference,
          detail: `${status} · ${owner}`,
        })
        if (!entry || profile.type !== 'class') continue
        const tags = character.provenance.spells[normalizeKey(reference)] ?? []
        for (const tag of tags) {
          const printedOwner =
            tag.sourceType === 'class'
              ? { name: entry.name, source: entry.source }
              : tag.sourceType === 'subclass'
                ? { name: entry.subclass, source: entry.subclassSource }
                : undefined
          if (
            !printedOwner?.name ||
            tag.grantType !== 'fixed' ||
            normalizeOwnerIdentity(tag.sourceName) !== normalizeOwnerIdentity(printedOwner.name) ||
            normalizeOwnerIdentity(tag.sourceRef) !== normalizeOwnerIdentity(printedOwner.source) ||
            getSpellReferenceKey(reference, tag.grantSource ?? '') !== referenceKey
          ) {
            continue
          }
          const ownerSource = tag.sourceRef ? ` (${tag.sourceRef})` : ''
          spells.set(
            JSON.stringify([
              profile.id,
              referenceKey,
              tag.sourceType,
              normalizeOwnerIdentity(tag.sourceName),
              normalizeOwnerIdentity(tag.sourceRef),
              tag.grantVariant,
            ]),
            { reference, detail: `Grant from ${tag.sourceName}${ownerSource}` },
          )
        }
      }
    }
  }
  for (const cast of context.fixedClassSpellStatuses) {
    if (!cast.active || !cast.castOnly) continue
    spells.set(
      JSON.stringify([cast.owner, cast.target, cast.level, getSpellReferenceKey(cast.reference)]),
      { reference: cast.reference, detail: `Cast only · ${cast.featureName}` },
    )
  }
  return spells
}

export function GuidedLevelUpReview({
  character,
  projected,
  before,
  after,
  rules,
  classLevel,
  subclass,
  subclassAvailable,
  levelPreview = false,
  showHitPoints = true,
}: {
  character: Character
  projected: Character
  before: CharacterCalculationContext
  after: CharacterCalculationContext
  rules: Class5e
  classLevel: number
  subclass?: Subclass5e
  subclassAvailable?: boolean
  levelPreview?: boolean
  showHitPoints?: boolean
}) {
  const beforeReadiness = useCharacterReadiness(levelPreview ? null : character)
  const afterReadiness = useCharacterReadiness(levelPreview ? null : projected)
  const previousIssues = new Map(beforeReadiness?.blockingIssues.map((issue) => [issue.id, issue]))
  const newIssues =
    afterReadiness?.blockingIssues.filter((issue) => {
      const previous = previousIssues.get(issue.id)
      return (
        !previous || previous.title !== issue.title || previous.explanation !== issue.explanation
      )
    }) ?? []
  const stillOpen = (afterReadiness?.blockingIssues.length ?? 0) - newIssues.length
  const previousHP = getEffectiveMaxHP(
    character,
    before.classes,
    before.abilityScores.total,
    before.effects.sourceDeclarations,
  )
  const projectedHP = getEffectiveMaxHP(
    projected,
    after.classes,
    after.abilityScores.total,
    after.effects.sourceDeclarations,
  )
  const oldLevel = getTotalCharacterLevel(character)
  const newLevel = getTotalCharacterLevel(projected)
  const changes: { key?: string; label: string; from: string | number; to: string | number }[] = []
  if (!levelPreview) {
    changes.push(
      { label: 'Character level', from: oldLevel, to: newLevel },
      { label: `${rules.name} class level`, from: classLevel - 1, to: classLevel },
    )
    if (showHitPoints) changes.push({ label: 'Maximum HP', from: previousHP, to: projectedHP })
  }
  const oldProficiency = getProficiencyBonus(oldLevel)
  const newProficiency = getProficiencyBonus(newLevel)
  if (oldProficiency !== newProficiency) {
    changes.push({
      label: 'Proficiency bonus',
      from: `+${oldProficiency}`,
      to: `+${newProficiency}`,
    })
  }
  for (const ability of ABILITY_NAMES) {
    const from = before.abilityScores.total[ability]
    const to = after.abilityScores.total[ability]
    if (from !== to) changes.push({ label: ability[0].toUpperCase() + ability.slice(1), from, to })
  }
  for (const [label, pool] of [
    ['Spell slots', 'mergedSharedWithUsage'],
    ['Pact slots', 'mergedPactWithUsage'],
  ] as const) {
    for (let level = 1; level <= 9; level += 1) {
      const from = before.classCasting.slots[pool][level]?.max ?? 0
      const to = after.classCasting.slots[pool][level]?.max ?? 0
      if (from !== to) changes.push({ label: `${label} · level ${level}`, from, to })
    }
  }

  const entry = findClassReference(rules, projected.classProgression)
  const currentRules = entry
    ? resolveClassProgressionRules(
        { name: entry.name, source: entry.source },
        after.lookups.primary.classChoiceClasses ?? [],
      )
    : undefined
  const catalogs = after.classChoices.catalogs
  const currentSubclass = entry ? getSelectedSubclassData(currentRules, entry) : undefined
  const classFeatures =
    currentRules && catalogs
      ? getDisplayedClassFeatures(currentRules, catalogs).filter(
          (feature) => feature.level === classLevel,
        )
      : []
  const activity = currentRules && createOptionalClassFeatureActivity(after.character, catalogs)
  const activeClassFeatures =
    currentRules && activity
      ? classFeatures.filter((feature) => {
          const target = getClassFeatureIdentity(feature)
          return (
            !!target &&
            activity.declared(
              optionalClassOwner(currentRules),
              target,
              classLevel,
              undefined,
              feature.isClassFeatureVariant === true,
            )
          )
        })
      : []
  const subclassFeatures = entry && getEarnedSubclassFeatureSource(projected, entry, catalogs)
  const intro = subclass?.introFeatureRef
    ? getSubclassFeatureIdentity(decodeSubclassFeatureReference(subclass.introFeatureRef))
    : undefined
  const earnedSubclassFeatures = (subclassFeatures ? subclassFeatures.features : [])
    .filter(({ level, target }) => level === classLevel && target !== intro)
    .map(({ feature }) => feature)
  const inheritedSubclassFeatures =
    entry && currentRules && catalogs
      ? getInheritedSubclassStaticFeatures(projected, currentRules, entry, catalogs).filter(
          (feature) =>
            feature.level === classLevel && getSubclassFeatureIdentity(feature) !== intro,
        )
      : []
  const gainedFeatures = [
    ...activeClassFeatures,
    ...earnedSubclassFeatures,
    ...inheritedSubclassFeatures,
  ]
  const features = gainedFeatures.map((feature) => `${feature.name} (${feature.source})`)
  const levelChoices: {
    key?: string
    label: string
    related?: string[]
    detail?: string
    count?: number
    feature?: { name?: string; source?: string }
  }[] = []
  const proficiencies: { label: string; values: string[] }[] = []
  if (levelPreview) {
    const tables = [
      ...(currentRules?.classTableGroups ?? []),
      ...(Array.isArray(currentSubclass?.subclassTableGroups)
        ? currentSubclass.subclassTableGroups
        : []),
    ]
    changes.push(...getLevelUpProgressionChanges(before, after, rules, tables, classLevel))
    if (subclassAvailable) {
      const { subclassFeatureName } = getSubclassSelectionInfo(currentRules)
      levelChoices.push({
        label: subclassFeatureName ?? 'Subclass',
        detail: subclass ? `${subclass.name} (${subclass.source})` : 'Choose a subclass',
      })
    }
    const boon =
      classLevel === EPIC_BOON_LEVEL && entry
        ? after.classChoices.epicBoonSlots.find((slot) => findClassReference(entry, [slot.owner]))
        : undefined
    if (boon) levelChoices.push({ label: 'Epic Boon', detail: 'Choose a boon' })
    else if (getASILevelsFromClass(currentRules).includes(classLevel)) {
      levelChoices.push({ label: 'Ability Score Improvement', detail: 'Ability scores or feat' })
    }
    if (currentRules) {
      const choiceActor = catalogs
        ? refreshClassProficiencyState(after.character, catalogs.classes ?? [], {
            ...catalogs,
            featExpertiseFeats: after.classChoices.feats,
          })
        : after.character
      const activity = createOptionalClassFeatureActivity(choiceActor, catalogs)
      const available = resolveAvailableHistoricalChoices(
        choiceActor,
        getCharacterClassChoices(currentRules, currentSubclass, activity, catalogs),
      )
      for (const choice of available) {
        if (choice.id === boon?.choiceId) continue
        const gains = getClassChoiceGainCount(choice, classLevel)
        if (choice.level !== classLevel && !gains) continue
        const count = gains ?? getRequiredChoiceSelectionCount(choice, classLevel)
        const invocations =
          choice.source.kind === 'optional-feature-progression' &&
          choice.optionFilter?.featureTypes?.join() === 'EI'
        levelChoices.push({
          key: choice.id,
          label: choice.label,
          detail: count > 1 ? `${count} choices` : 'Choose an option',
          related: invocations ? ['Invocations', 'Invocations Known'] : undefined,
          count,
          feature: { name: choice.owner.featureName, source: choice.owner.featureSource },
        })
      }
      const spells = getClassSpellGainsByLevel(
        after.character,
        after,
        currentRules,
        currentSubclass,
      ).get(classLevel)
      const cantrips = spells?.picksByDomain?.['class-cantrip'] ?? 0
      const featureCantrips = (spells?.cantrips ?? 0) - cantrips
      const spellbook = spells?.picksByDomain?.['class-spellbook'] ?? 0
      const known = spells?.picksByDomain?.['class-known'] ?? 0
      const otherSpells = (spells?.spells ?? 0) - spellbook - known
      if (cantrips)
        levelChoices.push({
          label: 'Cantrips',
          related: ['Cantrips Known'],
          count: cantrips,
          detail: `Choose ${cantrips}`,
        })
      if (featureCantrips)
        levelChoices.push({ label: 'Feature cantrips', detail: `Choose ${featureCantrips}` })
      if (known)
        levelChoices.push({
          label: 'Spells',
          related: ['Prepared Spells', 'Spells Known'],
          count: known,
          detail: `Choose ${known}`,
        })
      if (spellbook)
        levelChoices.push({
          label: 'Spellbook',
          detail: `Choose ${spellbook} ${spellbook === 1 ? 'spell' : 'spells'}`,
        })
      if (otherSpells)
        levelChoices.push({ label: 'Feature spells', detail: `Choose ${otherSpells}` })
      if (spells?.savantSpellbook)
        levelChoices.push({
          label: spells.savantSpellbook.name,
          detail: `${spells.savantSpellbook.count} spellbook choices`,
        })
      if (spells?.spellbookSpecialty)
        levelChoices.push({
          label: spells.spellbookSpecialty.name,
          detail: `${spells.spellbookSpecialty.count} spellbook choices`,
        })
      if (spells?.canSwap) levelChoices.push({ label: 'Replace a spell' })
      if (spells?.canTranscribeRituals) levelChoices.push({ label: 'Transcribe rituals' })
    }
    for (const [key, label] of [
      ['armor', 'Armor'],
      ['weapons', 'Weapons'],
      ['tools', 'Tools'],
      ['skills', 'Skills'],
      ['expertise', 'Expertise'],
      ['languages', 'Languages'],
      ['savingThrows', 'Saving throws'],
    ] as const) {
      const previous = new Set(before.character.proficiencies[key].map(normalizeKey))
      const values = after.character.proficiencies[key].filter(
        (value) => !previous.has(normalizeKey(value)),
      )
      if (values.length) proficiencies.push({ label, values })
    }
  }
  const priorFeatKeys = new Set(
    character.feats.map(({ name, source }) => JSON.stringify([name, source])),
  )
  const newFeats = projected.feats.filter(
    ({ name, source }) => !priorFeatKeys.has(JSON.stringify([name, source])),
  )
  const priorChoices = new Map(
    character.classChoiceSelections?.map((choice) => [choice.choiceId, choice.selected]),
  )
  const chosenOptions = (projected.classChoiceSelections ?? []).filter(
    (choice) =>
      choice.selected.length > 0 &&
      JSON.stringify(choice.selected) !== JSON.stringify(priorChoices.get(choice.choiceId)),
  )
  const disciplineChanges = (projected.mysticDisciplineReplacements ?? []).filter(
    (replacement) =>
      !character.mysticDisciplineReplacements?.some(
        (prior) => prior.classLevel === replacement.classLevel,
      ),
  )
  const oldSpells = spellsByOwner(before)
  const newSpells = spellsByOwner(after)
  const spellChanges = new Map<string, { label: string; details: Set<string> }>()
  for (const [action, current, other, context] of [
    ['Added', newSpells, oldSpells, after],
    ['Removed', oldSpells, newSpells, before],
  ] as const) {
    for (const [key, { reference, detail }] of current) {
      if (other.has(key)) continue
      const printing = getSpellReferenceKey(reference)
      const groupKey = `${action}|${printing}`
      const existing = spellChanges.get(groupKey)
      if (existing) {
        existing.details.add(detail)
      } else {
        const { name, source } = parseSpellReference(reference)
        const spellName =
          resolveSpellReference(reference, context.lookups.primary.spellsByKey ?? {})?.name ?? name
        spellChanges.set(groupKey, {
          label: `${action} ${spellName}${source ? ` (${source.toUpperCase()})` : ''}`,
          details: new Set([detail]),
        })
      }
    }
  }

  if (levelPreview) {
    const repeatedFeatures = new Set<string>()
    for (const { key, label } of changes) {
      if (!key?.startsWith('table:')) continue
      const column = normalizeKey(label)
      if (normalizeKey(rules.name) === 'rogue' && column === 'sneak attack')
        repeatedFeatures.add('sneak attack')
      if (
        normalizeKey(rules.name) === 'warlock' &&
        ['invocations', 'invocations known'].includes(column)
      )
        repeatedFeatures.add('eldritch invocations')
    }
    const rows: {
      key: string
      label: string
      matchLabel: string
      value?: string
      delta?: number
      featureSource?: string
    }[] = [
      ...changes.map(({ key, label, from, to }) => ({
        key: key ?? JSON.stringify([label, from, to]),
        label,
        matchLabel: normalizeKey(label),
        value: from === '—' ? String(to) : `${from} → ${to}`,
        delta: Number(to) - Number(from === '—' ? 0 : from),
      })),
      ...[
        ...activeClassFeatures.filter(
          (feature) =>
            normalizeKey(feature.source) !== normalizeKey(rules.source) ||
            !repeatedFeatures.has(normalizeKey(feature.name)),
        ),
        ...earnedSubclassFeatures,
        ...inheritedSubclassFeatures,
      ].map(({ name, source }) => ({
        key: JSON.stringify([name, source]),
        label: `${name} (${source})`,
        matchLabel: normalizeKey(name),
        featureSource: normalizeKey(source),
      })),
    ]
    for (const { key, label, related, detail, count, feature } of levelChoices) {
      const names = [label, ...(related ?? [])].map(normalizeKey)
      const counted = rows.some(
        (row) =>
          row.delta !== undefined &&
          names.includes(row.matchLabel) &&
          count !== undefined &&
          count === row.delta,
      )
      const matchingFeature = rows.find((row) => {
        if (row.featureSource === undefined) return false
        return feature?.name && feature.source
          ? row.matchLabel === normalizeKey(feature.name) &&
              row.featureSource === normalizeKey(feature.source)
          : names.includes(row.matchLabel)
      })
      if (counted) {
        if (matchingFeature && !matchingFeature.value) rows.splice(rows.indexOf(matchingFeature), 1)
        continue
      }
      if (matchingFeature && !matchingFeature.value && detail) {
        const extra = label.toLowerCase().startsWith(`${matchingFeature.matchLabel} `)
          ? label.slice(matchingFeature.matchLabel.length + 1)
          : label
        matchingFeature.value =
          normalizeKey(label) === matchingFeature.matchLabel ? detail : `${extra} · ${detail}`
      } else {
        rows.push({
          key: `choice:${key ?? label}`,
          label,
          matchLabel: normalizeKey(label),
          value: detail,
        })
      }
    }
    for (const { label, values } of proficiencies) {
      rows.push({
        key: `proficiency:${label}`,
        label,
        matchLabel: normalizeKey(label),
        value: values.join(', '),
      })
    }
    for (const [key, { label }] of spellChanges) {
      rows.push({ key: `spell:${key}`, label, matchLabel: normalizeKey(label) })
    }
    return rows.length ? (
      <dl className="divide-y divide-border rounded-lg border border-border bg-workspace-pane px-3 text-sm">
        {[...new Map(rows.map((row) => [row.key, row])).values()].map(({ key, label, value }) => (
          <div
            key={key}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
          >
            <dt>{label}</dt>
            <dd className={value ? 'text-right font-medium tabular-nums text-primary' : 'sr-only'}>
              {value ?? 'Gained'}
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <p className="text-sm text-muted-foreground">
        This level has no additional features or choices.
      </p>
    )
  }

  return (
    <div className="space-y-4 text-sm">
      {changes.length > 0 && (
        <dl className="divide-y divide-border rounded-lg border border-border bg-workspace-pane px-3">
          {[...new Map(changes.map((change) => [JSON.stringify(change), change]))].map(
            ([key, { label, from, to }]) => (
              <div key={key} className="flex items-center justify-between gap-3 py-2">
                <dt>{label}</dt>
                <dd className="font-semibold tabular-nums text-primary">
                  {from} → {to}
                </dd>
              </div>
            ),
          )}
        </dl>
      )}
      {(subclass || features.length > 0) && (
        <section>
          <h3 className="font-semibold">Gained features</h3>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {subclass && (
              <li>
                {subclass.name} ({subclass.source})
              </li>
            )}
            {[...new Set(features)].map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>
      )}
      {(chosenOptions.length > 0 || newFeats.length > 0 || disciplineChanges.length > 0) && (
        <section>
          <h3 className="font-semibold">Selected options</h3>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {disciplineChanges.map(({ classLevel, from, to }) => (
              <li key={classLevel}>
                Discipline · {from.name} ({from.source}) → {to.name} ({to.source})
              </li>
            ))}
            {newFeats.map(({ name, source }) => (
              <li key={`${name}|${source}`}>
                {name} ({source})
              </li>
            ))}
            {chosenOptions.map((choice) => (
              <li key={choice.choiceId}>
                {choice.label} ·{' '}
                {choice.selected
                  .map((option) =>
                    option.source ? `${option.name} (${option.source})` : option.name,
                  )
                  .join(', ')}
              </li>
            ))}
          </ul>
        </section>
      )}
      {spellChanges.size > 0 && (
        <section>
          <h3 className="font-semibold">Spell changes</h3>
          <ul className="mt-1 divide-y divide-border rounded-md border border-border bg-workspace-pane px-3">
            {[...spellChanges].map(([key, { label, details }]) => (
              <li key={key} className="py-2">
                <div className="font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{[...details].join(' / ')}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {newIssues.length > 0 && (
        <section className="rounded-md border border-warning/35 bg-warning/5 p-3">
          <h3 className="font-semibold">New or changed choices</h3>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {newIssues.map((issue) => (
              <li key={issue.id}>
                <span className="font-medium">{issue.title}</span> · {issue.explanation}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            These choices can be completed in Builder after applying.
          </p>
        </section>
      )}
      {stillOpen > 0 && (
        <p className="text-xs text-muted-foreground">
          {stillOpen} {stillOpen === 1 ? 'item was' : 'items were'} already pending before this
          level.
        </p>
      )}
    </div>
  )
}
