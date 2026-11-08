import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import type { CharacterEffect } from '@/types/effects'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import { DAMAGE_TYPE_LABELS } from './constants'
import {
  decodeFeatureLiteralChoiceId,
  decodeFeatureOptionReference,
  encodeSourceGroupOptionReference,
  getFeatureLiteralChoiceId,
} from './featureOptionIdentity'
import { getNativeSubclassIntroFeature } from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

export const SCION_GROUP = 'rogue-dread-allegiance'
const featureName = 'Dread Allegiance'
const owner = {
  type: 'subclass',
  name: 'Rogue',
  source: 'XPHB',
  subclassName: 'Scion of the Three',
  subclassSource: 'FRHoF',
} as const
const ownerKey = [owner.name, owner.source, owner.subclassName, owner.subclassSource].map(norm)
const damageTypes = new Set(Object.values(DAMAGE_TYPE_LABELS).map(norm))
const deityTag = /^\{@deity ([^{}|]+)\|[^{}|]+\|FRHoF\}$/
const spellTag = /^\{@spell ([^{}|]+\|XPHB)\}$/

export function isScionOwner(
  cls: { name?: string; source?: string },
  subclass?: { name?: string; source?: string },
) {
  return [cls.name, cls.source, subclass?.name, subclass?.source]
    .map(norm)
    .every((value, index) => value === ownerKey[index])
}

function choiceRule(level: number) {
  const ref = `${featureName}|${owner.name}|${owner.source}|${owner.subclassName}|${owner.subclassSource}|${level}|${owner.subclassSource}`
  const target = `subclass-feature|${norm(ref)}`
  return {
    owner,
    ref,
    target,
    level,
    id: getFeatureLiteralChoiceId(owner, target, SCION_GROUP, target, level),
  }
}

export function getScionConfigurationRule(id: string) {
  const decoded = decodeFeatureLiteralChoiceId(id)
  if (decoded?.group !== SCION_GROUP) return undefined
  const rule = choiceRule(decoded.level)
  return rule.id === id ? rule : undefined
}

function matchesOption(
  option: NormalizedChoiceOptionReference,
  rule: ReturnType<typeof choiceRule>,
) {
  const target = decodeFeatureOptionReference(option)
  return (
    option.entityType === 'featureOption' &&
    option.minimumClassLevel === undefined &&
    option.invocationCantrip === undefined &&
    norm(option.source) === norm(owner.subclassSource) &&
    target?.format === 'source-group' &&
    target.group === SCION_GROUP &&
    target.parentIdentity === rule.target &&
    !!norm(option.name) &&
    target.literal === norm(option.name)
  )
}

export function isValidScionSelection(selection: CharacterClassChoiceSelection) {
  const rule = getScionConfigurationRule(selection.choiceId)
  const [option] = selection.selected
  return (
    !!rule &&
    selection.kind === 'feature-option' &&
    !selection.favoredEnemy &&
    !selection.proficiencyAtGain &&
    selection.classLevel === rule.level &&
    selection.selected.length === 1 &&
    option.slotLevel === rule.level &&
    matchesOption(option, rule) &&
    [selection.className, selection.classSource, selection.subclassName, selection.subclassSource]
      .map(norm)
      .every((value, index) => value === ownerKey[index])
  )
}

function readScionSetup(cls: Class5e, subclass: Subclass5e) {
  if (
    !isScionOwner(cls, subclass) ||
    cls.sourceIdentityConflict ||
    subclass.sourceIdentityConflict ||
    '_copy' in subclass ||
    norm(subclass.shortName) !== ownerKey[2]
  )
    return undefined
  const level = getCurrentNativeSubclassGain(cls)?.level
  if (!level) return undefined
  const rule = choiceRule(level)
  const feature = getNativeSubclassIntroFeature(cls, subclass, level, featureName)
  if (!feature?.entries || feature.target !== rule.target) return undefined
  const [clause, rawTable] = feature.entries
  const text =
    typeof clause === 'string' &&
    /^Choose one of (?:the Dead Three|the following deities): (.+)\. You gain \{@variantrule Resistance\|XPHB\} to one type of damage and the ability to cast a cantrip, as detailed in the table below; Intelligence is your spellcasting ability for this cantrip\. When you finish a \{@variantrule Long Rest\|XPHB\}, you can change your choice\.$/.exec(
      clause,
    )
  const names = text ? [...text[1].matchAll(/\{@deity [^{}]+\}/g)].map((match) => match[0]) : []
  const table = record(rawTable)
  if (
    !names.length ||
    new Set(names).size !== names.length ||
    feature.entries.length !== 2 ||
    table.type !== 'table' ||
    JSON.stringify(table.colLabels) !== '["God","Damage Resistance","Cantrip"]' ||
    !Array.isArray(table.rows) ||
    table.rows.length !== names.length
  )
    return undefined
  const seen = new Set<string>()
  const rows = []
  for (const row of table.rows) {
    if (
      !Array.isArray(row) ||
      row.length !== 3 ||
      typeof row[0] !== 'string' ||
      typeof row[1] !== 'string' ||
      typeof row[2] !== 'string'
    )
      return undefined
    const deity = deityTag.exec(row[0])?.[1]
    const spell = spellTag.exec(row[2])?.[1]
    if (
      !deity ||
      !spell ||
      !names.includes(row[0]) ||
      seen.has(norm(deity)) ||
      !damageTypes.has(norm(row[1]))
    )
      return undefined
    seen.add(norm(deity))
    rows.push({ name: deity, damageType: row[1], spell })
  }
  try {
    const [block, ...others] = parseAdditionalSpellBlocks(
      subclass.additionalSpells as AdditionalSpellBlock[],
    )
    const pool = block?.choices[0]
    const expected = new Set(rows.map((row) => getSpellReferenceKey(row.spell)))
    if (
      !block ||
      others.length ||
      block.ability !== 'int' ||
      block.grants.length ||
      block.expanded?.length ||
      block.choices.length !== 1 ||
      pool?.source !== 'innate' ||
      pool.level !== level ||
      pool.count !== 1 ||
      !pool.isCantrip ||
      pool.usage !== 'direct' ||
      !pool.pool ||
      pool.pool.length !== expected.size ||
      expected.size !== rows.length ||
      pool.pool.some((spell) => !expected.has(getSpellReferenceKey(spell)))
    )
      return undefined
    return { rule, rows }
  } catch {
    return undefined
  }
}

function currentSetup(classes: readonly Class5e[] | undefined) {
  const parents = classes?.filter(
    (cls) => norm(cls.name) === ownerKey[0] && norm(cls.source) === ownerKey[1],
  )
  if (parents?.length !== 1) return undefined
  const [cls] = parents
  const subclasses = cls.subclasses?.filter((row) => isScionOwner(cls, row))
  return subclasses?.length === 1 ? readScionSetup(cls, subclasses[0]) : undefined
}

export function getScionConfiguration(
  cls: { name?: string; source?: string },
  subclass: { name?: string; source?: string } | undefined,
  classes: readonly Class5e[] | undefined,
): NormalizedCharacterChoice | undefined {
  const setup = isScionOwner(cls, subclass) && currentSetup(classes)
  if (!setup) return undefined
  const { rule, rows } = setup
  return {
    id: rule.id,
    kind: 'feature-option',
    label: featureName,
    owner: { ...owner, featureName, featureSource: owner.subclassSource },
    level: rule.level,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
      Number(index + 1 >= rule.level),
    ),
    options: rows.map(({ name }) => ({
      entityType: 'featureOption',
      name,
      source: owner.subclassSource,
      ref: encodeSourceGroupOptionReference(
        { kind: 'subclassFeature', ref: rule.ref },
        SCION_GROUP,
        name,
      ),
    })),
    repeatable: false,
    replacement: { cadence: 'long-rest', maximumPerEvent: 1 },
    source: { kind: 'class-feature-options', field: `subclassFeatureRefs:${rule.ref}:entries` },
  }
}

export function resolveScionOption(
  option: NormalizedChoiceOptionReference,
  classes: readonly Class5e[] | undefined,
) {
  if (!option.ref) return undefined
  const setup = currentSetup(classes)
  const row = setup?.rows.find(({ name }) => norm(name) === norm(option.name))
  return setup && row && matchesOption(option, setup.rule)
    ? {
        ...row,
        ref: option.ref,
        source: owner.subclassSource,
        group: SCION_GROUP,
        entries: [
          `Damage resistance: ${row.damageType}. Cantrip: {@spell ${row.spell}}. Use Intelligence.`,
        ],
      }
    : undefined
}

export function getChosenScionAllegiance(
  cls: Class5e,
  subclass: Subclass5e,
  level: number,
  selections: readonly CharacterClassChoiceSelection[] = [],
) {
  const setup = readScionSetup(cls, subclass)
  if (!setup || level < setup.rule.level) return undefined
  const matching = selections.filter((row) => row.choiceId === setup.rule.id)
  const [selected] = matching
  if (matching.length !== 1 || selected.inactive || !isValidScionSelection(selected))
    return undefined
  const row = setup.rows.find(({ name }) => norm(name) === norm(selected.selected[0].name))
  return row && { ...row, level: setup.rule.level, target: setup.rule.target }
}

export function getScionResistance(
  character: Character,
  classes: readonly Class5e[] | undefined,
): CharacterEffect[] {
  const entries = character.classProgression.filter((entry) => norm(entry.name) === ownerKey[0])
  const [entry] = entries
  if (
    character.originSystem !== '2024' ||
    entries.length !== 1 ||
    !isScionOwner(entry, { name: entry.subclass, source: entry.subclassSource }) ||
    (character.allowedSources?.length &&
      !getEffectiveSources(character.allowedSources, character.originSystem).some(
        (source) => norm(source) === ownerKey[3],
      ))
  )
    return []
  const setup = currentSetup(classes)
  if (!setup || entry.levels < setup.rule.level) return []
  const saved = character.classChoiceSelections?.filter((row) => row.choiceId === setup.rule.id)
  if (saved?.length !== 1 || saved[0].inactive || !isValidScionSelection(saved[0])) return []
  const row = setup.rows.find(
    (candidate) => norm(candidate.name) === norm(saved[0].selected[0].name),
  )
  return row
    ? [
        {
          id: setup.rule.id,
          label: featureName,
          source: {
            kind: 'subclass',
            name: featureName,
            source: owner.subclassSource,
            entityId: setup.rule.target,
          },
          target: { kind: 'damage-resistance', damageType: norm(row.damageType) },
          operation: { kind: 'grant' },
        },
      ]
    : []
}
