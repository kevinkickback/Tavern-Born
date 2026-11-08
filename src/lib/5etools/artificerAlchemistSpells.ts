import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { DAMAGE_TYPE_LABELS } from './constants'
import { getCurrentDirectSubclassSource } from './directSubclassSource'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import type { SubclassSpellGrant } from './subclassSpells'

function directFeature(cls: Class5e, subclass: Subclass5e, name: string, level: number) {
  const refs = subclass.subclassFeatureRefs?.filter((row) => row.name === name)
  const [ref] = refs ?? []
  if (
    refs?.length !== 1 ||
    !ref.level ||
    ref.level > level ||
    !getCurrentNativeSubclassGain(cls, ref.level)
  )
    return undefined
  const target = getSubclassFeatureIdentity({
    name,
    level: ref.level,
    className: cls.name,
    classSource: cls.source,
    subclassShortName: subclass.shortName,
    subclassSource: subclass.source,
    source: subclass.source,
  })
  const feature = target && getDirectSubclassFeatureReference(subclass, target)?.feature
  return target &&
    feature &&
    !feature.sourceIdentityConflict &&
    !feature.isClassFeatureVariant &&
    !feature.featureOptionSourceConflict &&
    !('_copy' in feature) &&
    getSubclassFeatureIdentity(feature) === target
    ? { name, target, level: ref.level, entries: feature.entries ?? [] }
    : undefined
}

const spellTag = /\{@spell ([^{}|]+)(?:\|([^{}|]+))?\}/g
const focusTag = /\{@item ([^{}|]+)\|([^{}|]+)\}/
const normalProse = (line: string) =>
  line
    .replace('{@variantrule Spellcasting Focus|XPHB}', 'spellcasting focus')
    .replace('{@variantrule Long Rest|XPHB}', 'long rest')
    .replace('Material components', 'material components')

function linesIn(entries: readonly unknown[], section?: string) {
  return entries.flatMap((entry) => {
    if (typeof entry === 'string') return section ? [] : [entry]
    const row = record(entry)
    if (row.type === 'list' && !section && Array.isArray(row.items))
      return row.items.filter((value): value is string => typeof value === 'string')
    return row.type === 'entries' && row.name === section && Array.isArray(row.entries)
      ? row.entries.filter((value): value is string => typeof value === 'string')
      : []
  })
}

export function getAlchemistFeatureCasts(cls: Class5e, subclass: Subclass5e, level: number) {
  if (
    cls.name !== 'Artificer' ||
    !['TCE', 'EFA'].includes(cls.source) ||
    subclass.name !== 'Alchemist' ||
    subclass.source !== cls.source
  )
    return undefined
  if (cls.sourceIdentityConflict || subclass.sourceIdentityConflict || '_copy' in subclass)
    return []
  const revised = cls.source === 'EFA'
  const rules = [
    { name: 'Restorative Reagents', section: undefined, uses: 'int' },
    { name: 'Chemical Mastery', section: revised ? 'Conjured Cauldron' : undefined, uses: '1' },
  ]
  return rules.flatMap(({ name, section, uses }): SubclassSpellGrant[] => {
    const feature = directFeature(cls, subclass, name, level)
    if (!feature) return []
    const lines = linesIn(feature.entries, section).map(normalProse)
    const cast = lines.filter((line) => /^You can cast \{@spell /.test(line))
    if (cast.length !== 1) return []
    const [clause] = cast
    const item = focusTag.exec(clause)
    const spells = [...clause.matchAll(spellTag)].map(
      ([, spell, printing]) => `${spell}|${printing ?? 'PHB'}`,
    )
    if (
      !item ||
      item[2] !== (revised ? 'XPHB' : 'PHB') ||
      spells.length !== (uses === 'int' || revised ? 1 : 2) ||
      !clause.includes('without expending a spell slot') ||
      !clause.includes('without preparing the spell') ||
      !clause.includes(`provided you use ${item[0]} as the spellcasting focus.`) ||
      !(uses === 'int'
        ? clause.endsWith(
            'You can do so a number of times equal to your Intelligence modifier (minimum of once), and you regain all expended uses when you finish a long rest.',
          )
        : revised
          ? clause.endsWith(
              "Once you use this feature, you can't use it again until you finish a long rest.",
            )
          : clause.endsWith(
              "Once you cast either spell with this feature, you can't cast that spell with it again until you finish a long rest.",
            ))
    )
      return []
    if (revised) {
      const blocks = subclass.additionalSpells?.filter((row) => row.innate?.[feature.level])
      const schedule = blocks?.length === 1 ? record(blocks[0].innate?.[feature.level]) : {}
      const daily = record(schedule.daily)
      const listed = daily[uses]
      if (
        Object.keys(schedule).length !== 1 ||
        Object.keys(daily).length !== 1 ||
        !Array.isArray(listed) ||
        listed.length !== 1 ||
        typeof listed[0] !== 'string' ||
        getSpellReferenceKey(listed[0]) !== getSpellReferenceKey(spells[0])
      )
        return []
    }
    const ignoresMaterial = clause.includes('without material components')
    return spells.map((spellName) => ({
      spellName,
      level: feature.level,
      isCantrip: false,
      mode: 'cast-only',
      castOnly: ignoresMaterial ? { ignoresMaterial: true } : {},
      feature: {
        name,
        target: feature.target,
        castingNote: `${name}: ${uses === 'int' ? 'Intelligence modifier casts (minimum one)' : 'One cast'} per Long Rest without a spell slot or preparation. Use ${item[1]} as your spellcasting focus.`,
      },
    }))
  })
}

export function getAlchemistChemicalDefenses(
  character: Character,
  classes: readonly Class5e[] | undefined,
): CharacterEffect[] {
  const owner = character.classProgression.find((entry) => entry.name === 'Artificer')
  const current = owner && getCurrentDirectSubclassSource(character, owner, classes, 'Artificer')
  if (
    !current ||
    current.subclass.name !== 'Alchemist' ||
    !['TCE', 'EFA'].includes(current.subclass.source) ||
    current.subclass.source !== owner.source
  )
    return []
  const name = 'Chemical Mastery'
  const feature = current.getFeature(name)
  if (!feature) return []
  const revised = current.subclass.source === 'EFA'
  const entries = linesIn(feature.entries, revised ? 'Chemical Resistance' : undefined)
  const clause = revised
    ? /^You gain \{@variantrule Resistance\|XPHB\} to (\w+) damage and (\w+) damage\. You also gain \{@variantrule Immunity\|XPHB\} to the \{@condition (\w+)\|XPHB\} condition\.$/i
    : /^You gain resistance to (\w+) damage and (\w+) damage, and you are immune to the \{@condition (\w+)\} condition\.$/i
  const matches = entries.map((line) => clause.exec(line)).filter((match) => match !== null)
  if (matches.length !== 1) return []
  const [, left, right, condition] = matches[0]
  const types = [left, right].map((type) => type.toLowerCase())
  const damageTypes = new Set(Object.values(DAMAGE_TYPE_LABELS).map((type) => type.toLowerCase()))
  if (
    condition.toLowerCase() !== 'poisoned' ||
    new Set(types).size !== 2 ||
    types.some((type) => !damageTypes.has(type))
  )
    return []
  const targets = [
    ...types.map((damageType) => ({ kind: 'damage-resistance' as const, damageType })),
    { kind: 'condition-immunity' as const, condition: condition.toLowerCase() },
  ]
  return targets.map((target, index) => ({
    id: `${feature.target}:${index}`,
    label: name,
    source: { kind: 'subclass', name, source: current.subclass.source, entityId: feature.target },
    target,
    operation: { kind: 'grant' },
  }))
}
