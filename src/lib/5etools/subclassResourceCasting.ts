import { toAbilityName } from '@/lib/calculations/abilityNames'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { SubclassFeature } from '@/types/5etools'
import type { AbilityScores, Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import { getClassCastingCopyParent } from './classCastingRules'
import { getCurrentClassCastingParent } from './classCastingSource'
import { findClassReference } from './classReference'
import { getCurrentSelectedClass, permitsClassRuleSource } from './earnedClassFeatureSource'
import { getNamedSubclassSpellSource } from './namedSubclassSpells'
import {
  decodeOptionalDeclaration,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import { getCurrentSubclassMenuReference, getOwnedSubclassFeature } from './ownedSubclassFeature'
import type { SubclassSpellGrant } from './subclassSpells'
import { collectUnconditionalFeatureReferences } from './unconditionalFeatureReferences'

const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const amount = (word: string) => words.indexOf(word)
const title = (word: string) => word[0].toUpperCase() + word.slice(1)
const onlyKeys = (row: Record<string, unknown>, keys: string[]) =>
  Object.keys(row).every((key) => keys.includes(key))

function spendMenu(value: unknown) {
  const menu = record(value)
  return menu.type === 'options' &&
    menu.style === 'list-hang-notitle' &&
    onlyKeys(menu, ['type', 'style', 'entries']) &&
    Array.isArray(menu.entries) &&
    menu.entries.length &&
    menu.entries.every((row) => record(row).type === 'refSubclassFeature')
    ? (menu.entries as unknown[])
    : undefined
}

function readPool(feature: SubclassFeature) {
  const entries = feature.entries
  if (
    !feature.level ||
    !Array.isArray(entries) ||
    entries.length !== 5 ||
    typeof entries[0] !== 'string' ||
    typeof entries[1] !== 'string' ||
    typeof entries[2] !== 'string'
  )
    return undefined
  const base =
    /(?:^|\. )Whenever you finish a \{@variantrule Long Rest\|XPHB\}, you gain a number of ([a-z ]+s) equal to your ([A-Z][a-z]+) modifier \(minimum of ([a-z]+) ([a-z ]+)\)[.;]/.exec(
      entries[0],
    )
  if (!base || base[1] !== norm(feature.name) || amount(base[3]) < 1) return undefined
  const [, plural, abilityText, minimum, shortUnit] = base
  const unit = plural.slice(0, -1)
  if (unit !== shortUnit && !unit.endsWith(` ${shortUnit}`)) return undefined
  const ability = toAbilityName(abilityText)
  const save =
    /^If a ([a-z ]+) effect requires a saving throw, the DC equals your ([\p{L} -]+) spell save DC\.$/u.exec(
      entries[1],
    )
  const growth =
    /^The number of ([a-z ]+) you gain when you finish a \{@variantrule Long Rest\|XPHB\} increases when you reach ([\p{L} -]+) levels ([1-9]\d*) \(([A-Z][a-z]+) modifier plus ([a-z]+) ([a-z ]+)\) and ([1-9]\d*) \(([A-Z][a-z]+) modifier plus ([a-z]+) ([a-z ]+)\)\.$/u.exec(
      entries[2],
    )
  if (
    !ability ||
    !save ||
    save[1] !== unit ||
    !growth ||
    growth[1] !== plural ||
    norm(growth[2]) !== norm(save[2]) ||
    growth[4] !== abilityText ||
    growth[8] !== abilityText ||
    growth[6] !== unit ||
    growth[10] !== plural
  )
    return undefined
  const gains = [
    [Number(growth[3]), amount(growth[5])],
    [Number(growth[7]), amount(growth[9])],
  ]
  if (
    gains[0][0] <= feature.level ||
    gains[1][0] <= gains[0][0] ||
    gains[1][0] > 20 ||
    gains[0][1] < 1 ||
    gains[1][1] <= gains[0][1]
  )
    return undefined

  const uses = record(entries[3])
  const recovery = record(entries[4])
  const usesEntries = uses.entries
  const recoveryEntries = recovery.entries
  if (
    uses.type !== 'entries' ||
    !onlyKeys(uses, ['type', 'name', 'entries']) ||
    uses.name !== `Using ${feature.name}` ||
    !Array.isArray(usesEntries) ||
    usesEntries.length !== 2 ||
    usesEntries[0] !== `You can use ${plural} in the following ways:` ||
    recovery.type !== 'entries' ||
    !onlyKeys(recovery, ['type', 'name', 'entries']) ||
    recovery.name !== `Regaining ${feature.name}` ||
    !Array.isArray(recoveryEntries) ||
    recoveryEntries.length !== 1 ||
    typeof recoveryEntries[0] !== 'string'
  )
    return undefined
  const menu = spendMenu(usesEntries[1])
  const regain =
    /^When an enemy you can see within ([1-9]\d*) feet of you dies, you can take a \{@variantrule Reaction\|XPHB\} to regain one expended ([a-z ]+)\.$/.exec(
      recoveryEntries[0],
    )
  if (!regain || regain[2] !== unit) return undefined
  return {
    ability,
    progressionClass: norm(growth[2]),
    minimum: amount(minimum),
    unit,
    plural,
    gains,
    menu,
    usage: `Use a Reaction to regain one when an enemy you can see within ${regain[1]} feet dies.`,
  }
}

function activeSource(character: Character, feature: SubclassFeature) {
  return [feature.source, feature.classSource, feature.subclassSource].every((source) =>
    permitsClassRuleSource(character, source),
  )
}

function getResourceContext(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  requireCastSchedule = false,
) {
  if (
    !catalogs ||
    !entry.subclass ||
    !permitsClassRuleSource(character, entry.subclassSource) ||
    !permitsClassRuleSource(character, 'XPHB')
  )
    return undefined
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  const matches = cls?.subclasses?.filter((row) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [row]),
  )
  if (!cls || matches?.length !== 1) return undefined
  const [subclass] = matches
  if (
    requireCastSchedule &&
    (!Array.isArray(subclass.additionalSpells) ||
      !subclass.additionalSpells.some((block) => 'resourceName' in record(block)))
  )
    return undefined
  const scoped = scopeClassChoiceFeatureCatalogs(
    catalogs,
    getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource),
  )
  const refs = collectUnconditionalFeatureReferences(
    subclass.subclassFeatureRefs ?? [],
    'subclassFeature',
  )
  const pools = refs.flatMap(({ target, level, reference }) => {
    if (
      level > entry.levels ||
      !reference.feature ||
      !readPool(reference.feature as SubclassFeature)
    )
      return []
    const source = getOwnedSubclassFeature(cls, subclass, target, scoped)
    const pool = source && activeSource(character, source.feature) && readPool(source.feature)
    if (!source || !pool) return []
    if (pool.progressionClass !== norm(cls.name)) {
      const copyParent = getClassCastingCopyParent(
        ['class', norm(cls.name), norm(cls.source)],
        catalogs.classCastingSources ?? [],
      )
      if (
        copyParent?.[0] !== 'class' ||
        pool.progressionClass !== copyParent[1] ||
        !permitsClassRuleSource(character, copyParent[2]) ||
        !getCurrentClassCastingParent(catalogs, copyParent)
      )
        return []
    }
    return [{ ...source, ...pool }]
  })
  return pools.length === 1 ? { cls, subclass, scoped, refs, pool: pools[0] } : undefined
}

export function getAuthoredSubclassResource(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  modifiers: AbilityScores | undefined,
): ClassResourceDef | undefined {
  if (!modifiers) return undefined
  const current = getResourceContext(character, entry, catalogs)
  if (!current) return undefined
  const { cls, subclass, scoped, refs, pool } = current
  const base = Math.max(pool.minimum, modifiers[pool.ability])
  const initiative = refs.some(({ target, level, reference }) => {
    if (level > entry.levels) return false
    const text = reference.feature?.entries
    const rule =
      typeof text?.[0] === 'string' && /option of \{@subclassFeature ([^{}]+)\}/.exec(text[0])?.[1]
    if (
      !rule ||
      decodeOptionalDeclaration(rule, 'subclassFeature')?.target !== pool.target ||
      text?.length !== 2 ||
      text[1] !==
        `In addition, when you roll {@variantrule Initiative|XPHB}, you regain one ${pool.unit} if you have none.`
    )
      return false
    const earned = getOwnedSubclassFeature(cls, subclass, target, scoped)
    return !!earned && activeSource(character, earned.feature)
  })
  return {
    id: `subclass-feature-resource:${JSON.stringify([norm(entry.name), norm(entry.source), norm(entry.subclass), norm(entry.subclassSource), pool.target])}`,
    label: pool.feature.name,
    maxPerLevel: Array.from({ length: 20 }, (_, index) =>
      index + 1 < pool.level
        ? 0
        : base + (pool.gains.filter(([gain]) => gain <= index + 1).pop()?.[1] ?? 0),
    ),
    restType: 'long',
    inheritedFeature: true,
    usageText: initiative
      ? `${pool.usage} Regain one when you roll Initiative with none.`
      : pool.usage,
  }
}

const isQualifiedSpell = (spell: unknown): spell is string =>
  typeof spell === 'string' &&
  /^[^|#{}]+\|[^|#{}]+$/.test(spell) &&
  spell.split('|').every((part) => part.trim())
const spellKeys = (spells: string[]) => spells.map((spell) => getSpellReferenceKey(spell))

function getCastOptions(feature: SubclassFeature, unit: string, plural: string) {
  const consumes = record(feature.consumes)
  if (
    !onlyKeys(consumes, ['name', 'amount']) ||
    typeof consumes.name !== 'string' ||
    norm(consumes.name) !== unit ||
    feature.entries?.length !== 1 ||
    typeof feature.entries[0] !== 'string'
  )
    return undefined
  const clause = feature.entries[0]
  const free =
    /^(As a \{@variantrule Bonus Action\|XPHB\}, you|You) can expend ([a-z]+) ([a-z ]+) to cast (.+) without expending a spell slot\.$/.exec(
      clause,
    )
  const reaction =
    /^You can expend ([a-z]+) ([a-z ]+) to cast (\{@spell [^{}]+\}) in response to that spell's trigger, using your spellcasting ability\.$/.exec(
      clause,
    )
  if (!free && !reaction) return undefined
  const cost = amount(free?.[2] ?? reaction?.[1] ?? '')
  if (
    cost < 1 ||
    cost !== (consumes.amount ?? 1) ||
    (free?.[3] ?? reaction?.[2]) !== (cost === 1 ? unit : plural)
  )
    return undefined
  const spellText = free?.[4] ?? reaction?.[3] ?? ''
  const parts = [...spellText.matchAll(/\{@spell ([^{}]+)\}/g)]
  const tags = parts.map(([tag]) => tag)
  const authored =
    tags.length < 3
      ? tags.join(' or ')
      : `${tags.slice(0, -1).join(', ')}, or ${tags[tags.length - 1]}`
  const spells = parts.map(([, spell]) => spell)
  if (
    !spells.length ||
    authored !== spellText ||
    !spells.every(isQualifiedSpell) ||
    new Set(spellKeys(spells)).size !== spells.length
  )
    return undefined
  const bonus = !!free?.[1].startsWith('As a')
  return { cost, spells, castingTime: reaction ? 'Reaction' : bonus ? 'Bonus Action' : undefined }
}

function resourceGroups(value: unknown) {
  const row = record(value)
  if (Object.keys(row).length !== 1) return undefined
  const groups = Object.entries(record(row.resource)).flatMap(([cost, spells]) =>
    /^[1-9]$/.test(cost) &&
    Array.isArray(spells) &&
    spells.length &&
    spells.every(isQualifiedSpell) &&
    new Set(spells.map((spell) => getSpellReferenceKey(spell))).size === spells.length
      ? [{ cost: Number(cost), spells, keys: spellKeys(spells).sort() }]
      : [],
  )
  const keys = groups.flatMap(({ spells }) => spells.map((spell) => getSpellReferenceKey(spell)))
  return groups.length &&
    groups.length === Object.keys(record(row.resource)).length &&
    new Set(keys).size === keys.length
    ? groups
    : undefined
}

/** The same paid routes in every alternative are independent of its prepared spell column. */
export function getSharedSubclassResourceCasts(
  character: Character | undefined,
  entry: CharacterClassEntry,
  level: number,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): SubclassSpellGrant[] {
  if (!character) return []
  const current = getResourceContext(character, entry, catalogs, true)
  if (!current) return []
  const { cls, subclass, scoped, refs, pool } = current
  const blocks = subclass.additionalSpells ?? []
  if (
    !blocks.length ||
    toAbilityName(cls.spellcastingAbility ?? '') !== pool.ability ||
    blocks.some((block) => {
      const resource = record(block).resourceName
      return (
        typeof resource !== 'string' ||
        norm(resource) !== pool.unit ||
        typeof block.ability !== 'string' ||
        toAbilityName(block.ability) !== pool.ability
      )
    })
  )
    return []
  if (blocks.some((block) => !!block.name)) {
    const named = getNamedSubclassSpellSource(cls, subclass, scoped)
    if (!named || named.level > level || !activeSource(character, named.feature)) return []
  }
  const menus = refs.flatMap(({ target, level: gain, reference }) => {
    if (gain > Math.min(level, entry.levels) || gain <= pool.level) return []
    const entries = reference.feature?.entries
    const line =
      typeof entries?.[0] === 'string' &&
      /^You gain new mastery over [a-z ]+, granting you new ways to use ([a-z ]+):$/.exec(
        entries[0],
      )
    const menu = line && line[1] === pool.plural && entries?.length === 2 && spendMenu(entries[1])
    const source = menu && getOwnedSubclassFeature(cls, subclass, target, scoped)
    return menu && source && activeSource(character, source.feature) ? [{ gain, menu }] : []
  })
  const candidates = [{ gain: pool.level, menu: pool.menu }, ...menus].flatMap(({ gain, menu }) =>
    (menu ?? []).flatMap((row) => {
      const source = getCurrentSubclassMenuReference(row, scoped)
      const cast =
        source &&
        activeSource(character, source.feature) &&
        getCastOptions(source.feature, pool.unit, pool.plural)
      return source && cast && source.feature.level
        ? [
            {
              ...source,
              ...cast,
              keys: spellKeys(cast.spells),
              gain: Math.max(gain, source.feature.level),
            },
          ]
        : []
    }),
  )
  const schedules = blocks.map((block) => record(block.innate))
  return Object.entries(schedules[0]).flatMap(([rawGain, row]) => {
    if (!/^(?:[1-9]|1[0-9]|20)$/.test(rawGain) || Number(rawGain) > Math.min(level, entry.levels))
      return []
    const groups = resourceGroups(row)
    if (
      !groups ||
      !schedules.every((schedule) => {
        if (Object.keys(schedule).filter((key) => Number(key) === Number(rawGain)).length !== 1)
          return false
        const other = resourceGroups(schedule[rawGain])
        return (
          other?.length === groups.length &&
          groups.every(({ cost, keys }) =>
            other.some(
              (group) =>
                group.cost === cost &&
                group.keys.length === keys.length &&
                group.keys.every((key, index) => key === keys[index]),
            ),
          )
        )
      })
    )
      return []
    return groups.flatMap(({ cost, spells, keys }) =>
      spells.flatMap((spellName) => {
        const key = getSpellReferenceKey(spellName)
        const matches = candidates.filter(
          (candidate) => candidate.gain === Number(rawGain) && candidate.keys.includes(key),
        )
        if (matches.length !== 1) return []
        const [match] = matches
        if (match.cost !== cost || !match.keys.every((candidate) => keys.includes(candidate)))
          return []
        const { feature, target, castingTime, gain } = match
        const timing =
          castingTime === 'Reaction'
            ? ' in response to the spell’s normal trigger'
            : castingTime
              ? ` as a ${castingTime}`
              : ''
        return [
          {
            spellName,
            level: gain,
            isCantrip: false,
            mode: 'cast-only',
            requiresVisibleSpellRank: true,
            ...(castingTime === 'Reaction' && { requiresSpellTrigger: true as const }),
            castOnly: castingTime ? { castingTime } : {},
            feature: {
              name: feature.name,
              target,
              castingNote: `${feature.name} (${entry.name} · ${entry.source}) — Spend ${cost} ${cost === 1 ? pool.unit : pool.plural} to cast${timing} without expending a spell slot. Uses ${title(pool.ability)}.`,
            },
          } satisfies SubclassSpellGrant,
        ]
      }),
    )
  })
}
