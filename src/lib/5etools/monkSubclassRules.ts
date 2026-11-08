import {
  formatSpellReference,
  getSpellReferenceKey,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { getEffectiveSources, getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e, OptionalFeatureLike, Subclass5e, SubclassFeature } from '@/types/5etools'
import type { AdditionalSpellBlock, AdditionalSpellItem } from '@/types/additionalSpells'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef, NormalizedCharacterChoice } from '@/types/classRules'
import type { CharacterEffect } from '@/types/effects'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import {
  getDirectSubclassFeatureReference,
  getNativeSubclassIntroFeature,
  isInheritedClassicSubclass,
} from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import type { SubclassSpellGrant } from './subclassSpells'

const spellReference = (reference: string, defaultPrinting: string) =>
  formatSpellReference(reference, parseSpellReference(reference).source ?? defaultPrinting)

type MonkResourceSpell = SubclassSpellGrant & { resourceCost: number }

export function getElementalDisciplineSpells(
  feature: OptionalFeatureLike,
  gain: number,
  choice: NormalizedCharacterChoice,
  classes: readonly Class5e[] | undefined,
) {
  if (
    !feature.source ||
    !feature.featureType?.includes('ED') ||
    ('sourceIdentityConflict' in feature && feature.sourceIdentityConflict)
  )
    return undefined
  const block = record(feature.additionalSpells?.[0])
  if ('known' in block || !('_' in record(block.innate))) return undefined
  const matchingClasses = classes?.filter((row) => findClassReference(choice.owner, [row]))
  const cls = matchingClasses?.[0]
  const matchingSubclasses = cls?.subclasses?.filter((row) =>
    findClassReference({ name: choice.owner.subclassName, source: choice.owner.subclassSource }, [
      row,
    ]),
  )
  const subclass = matchingSubclasses?.[0]
  if (
    matchingClasses?.length !== 1 ||
    !cls ||
    cls.sourceIdentityConflict ||
    matchingSubclasses?.length !== 1 ||
    !subclass ||
    subclass.sourceIdentityConflict
  )
    return undefined
  const training = getNativeSubclassIntroFeature(
    cls,
    subclass,
    choice.level,
    'Disciple of the Elements',
  )
  const sections = training?.entries
    ?.map(record)
    .filter((row) => row.name === 'Casting Elemental Spells')
  const casting =
    sections?.length === 1 && Array.isArray(sections[0].entries) ? sections[0].entries : []
  const ignoresMaterial = casting.some(
    (row) =>
      typeof row === 'string' &&
      row.includes("you don't need to provide material components for it"),
  )
  const spells = parseMonkResourceSpells(
    feature.additionalSpells,
    feature.source,
    gain,
    'Ki',
    {
      name: feature.name,
      target: JSON.stringify(['elemental-discipline', feature.name, feature.source]),
      ...(ignoresMaterial && { castingNote: 'This discipline requires no material components.' }),
    },
    ignoresMaterial ? { ignoresMaterial: true } : {},
  )
  const text =
    feature.entries?.filter((row): row is string => typeof row === 'string').join(' ') ?? ''
  const clause =
    /spend ([1-9]\d*) ki points to cast (?:the )?\{@spell ([^{}]+)\}(, targeting yourself)?\./i.exec(
      text,
    )
  if (!clause || !spells) return undefined
  const declared = getSpellReferenceKey(spellReference(clause[2], feature.source))
  if (
    !spells.every(
      (spell) =>
        spell.resourceCost === Number(clause[1]) &&
        getSpellReferenceKey(spell.spellName) === declared,
    )
  )
    return undefined
  return clause[3]
    ? spells.map((spell) => ({
        ...spell,
        feature: {
          ...spell.feature!,
          castingNote: `${spell.feature!.castingNote} This cast targets yourself.`,
        },
      }))
    : spells
}

function parseMonkResourceSpells(
  schedule: unknown,
  printing: string,
  gain: number,
  resource: 'Ki' | 'Focus Point',
  feature: NonNullable<SubclassSpellGrant['feature']>,
  castOnly: NonNullable<SubclassSpellGrant['castOnly']> = {},
): MonkResourceSpell[] | undefined {
  if (!Array.isArray(schedule) || schedule.length !== 1) return undefined
  const block = record(schedule[0])
  if (
    block.resourceName !== resource ||
    block.ability !== 'wis' ||
    Object.keys(block).some(
      (field) => !['innate', 'known', 'resourceName', 'ability'].includes(field),
    )
  )
    return undefined
  const innate = Object.entries(record(block.innate))
  if (innate.length !== 1 || !['_', String(gain)].includes(innate[0][0])) return undefined
  const usage = record(innate[0][1])
  if (Object.keys(usage).length !== 1) return undefined
  const costs = Object.entries(record(usage.resource))
  if (!costs.length) return undefined
  const grants: MonkResourceSpell[] = []
  const seen = new Set<string>()
  for (const [cost, values] of costs) {
    if (!/^[1-9]\d?$/.test(cost) || !Array.isArray(values) || !values.length) return undefined
    let parsed: ReturnType<typeof parseAdditionalSpellBlocks>[number]
    try {
      parsed = parseAdditionalSpellBlocks([
        { ability: 'wis', innate: { _: values as AdditionalSpellItem[] } },
      ])[0]
    } catch {
      return undefined
    }
    if (parsed.choices.length || parsed.grants.length !== values.length) return undefined
    for (const spell of parsed.grants) {
      const spellName = spellReference(spell.spellName, printing)
      const key = getSpellReferenceKey(spellName)
      if (spell.isCantrip || seen.has(key)) return undefined
      seen.add(key)
      grants.push({
        spellName,
        level: gain,
        isCantrip: false,
        resourceCost: Number(cost),
        mode: 'cast-only',
        castOnly,
        feature: {
          ...feature,
          castingNote: [
            `${feature.name}: Spend ${cost} ${resource === 'Ki' ? 'Ki' : Number(cost) === 1 ? resource : `${resource}s`} to cast using Wisdom without a spell slot.`,
            feature.castingNote,
          ]
            .filter(Boolean)
            .join(' '),
        },
      })
    }
  }
  return grants
}

const monksWithNativeSpells = new Map([
  ['PHB|Shadow', 'Shadow Arts'],
  ['XPHB|Shadow', 'Shadow Arts'],
  ['XGE|Sun Soul', 'Searing Arc Strike'],
  ['PHB|Open Hand', 'Tranquility'],
  ['XPHB|Elements', 'Manipulate Elements'],
])

function getMonkNativeFeature(
  cls: Class5e,
  subclass: Subclass5e,
  name: string,
  level: number,
  origin: string,
) {
  const target = getSubclassFeatureIdentity({
    name,
    level,
    className: cls.name,
    classSource: origin,
    subclassShortName: subclass.shortName,
    subclassSource: subclass.source,
    source: subclass.source,
  })
  const feature =
    target &&
    (getDirectSubclassFeatureReference(subclass, target)?.feature ??
      getNativeSubclassIntroFeature(cls, subclass, level, name, origin)?.feature)
  return target &&
    feature &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === target
    ? { feature, target }
    : undefined
}

function childText(parent: SubclassFeature, name: string) {
  const candidates = parent.entries
    ?.map(record)
    .filter(
      (row) =>
        row.type === 'refSubclassFeature' &&
        typeof row.subclassFeature === 'string' &&
        decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')?.decoded.name === name,
    )
  const child = candidates?.[0]
  if (
    candidates?.length !== 1 ||
    !child ||
    typeof child.subclassFeature !== 'string' ||
    !exactOptionalDeclarationReference(child, child.subclassFeature, 'subclassFeature')
  )
    return ''
  const feature = child.feature as SubclassFeature | undefined
  const target = getSubclassFeatureIdentity({ ...parent, name })
  return !child.sourceIdentityConflict &&
    feature &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === target
    ? directText(feature)
    : ''
}

function directText(feature: SubclassFeature) {
  return (
    feature.entries?.filter((entry): entry is string => typeof entry === 'string').join(' ') ?? ''
  )
}

function getSelectedMonkRules(character: Character, classes: readonly Class5e[] | undefined) {
  const matches = character.classProgression.filter((row) => row.name.toLowerCase() === 'monk')
  const owner = matches[0]
  if (
    matches.length !== 1 ||
    !owner.subclass ||
    !owner.subclassSource ||
    !getSourceCompatibility(owner.source, character.originSystem).compatible ||
    (character.allowedSources?.length &&
      !getEffectiveSources(character.allowedSources, character.originSystem).some(
        (source) => source.toLowerCase() === owner.subclassSource!.toLowerCase(),
      ))
  )
    return undefined
  const parents = classes?.filter((row) => findClassReference(owner, [row]))
  const cls = parents?.[0]
  const roots = cls?.subclasses?.filter(
    (row) =>
      findClassReference({ name: owner.subclass, source: owner.subclassSource }, [row]) &&
      findClassReference(cls, [{ name: row.className, source: row.classSource }]),
  )
  const subclass = roots?.[0]
  if (
    parents?.length !== 1 ||
    !cls ||
    cls.sourceIdentityConflict ||
    roots?.length !== 1 ||
    !subclass ||
    subclass.sourceIdentityConflict
  )
    return undefined
  const inherited = isInheritedClassicSubclass(subclass)
  if ('_copy' in subclass && !inherited) return undefined
  return { owner, cls, subclass, origin: inherited ? 'PHB' : cls.source }
}

const monkResourceFeatures = new Map([
  ['Ascendant Dragon', ['Breath of the Dragon', 'Wings Unfurled', 'Aspect of the Wyrm']],
  ['Open Hand', ['Wholeness of Body']],
  ['Mercy', ['Flurry of Healing and Harm', 'Hand of Ultimate Mercy']],
])

export function getMonkSubclassResources(
  character: Character,
  entry: CharacterClassEntry,
  classes: readonly Class5e[] | undefined,
  wisdomModifier: number | undefined,
  proficiencyBonus: number,
): ClassResourceDef[] {
  if (entry.name.toLowerCase() !== 'monk') return []
  const current = getSelectedMonkRules(character, classes)
  if (!current || current.owner !== entry) return []
  const { cls, subclass, origin } = current
  return (monkResourceFeatures.get(subclass.shortName) ?? []).flatMap((name) => {
    const refs = subclass.subclassFeatureRefs?.filter((row) => row.name === name) ?? []
    if (refs.length > 1) return []
    const level = refs[0]?.level ?? getCurrentNativeSubclassGain(cls)?.level
    if (!level || level > entry.levels || !getCurrentNativeSubclassGain(cls, level)) return []
    const rule = getMonkNativeFeature(cls, subclass, name, level, origin)
    if (!rule) return []
    const text = directText(rule.feature).replace(/\{@variantrule Long Rest\|XPHB\}/g, 'long rest')
    const byProficiency =
      /You can use this feature a number of times equal to your proficiency bonus, and you regain all expended uses when you finish a long rest\./.test(
        text,
      )
    const byWisdom =
      /You can use (?:this feature a|these benefits a total) number of times equal to your Wisdom modifier \(minimum of once\)(?:, and you regain|\. You regain) all expended uses when you finish a long rest\./.test(
        text,
      )
    const once =
      /(?:Once you use this feature, you can't use it again until you finish a long rest|You must finish a long rest before you can use this feature again)\./.test(
        text,
      )
    const auraReuse =
      /Once you create this aura, you can't create it again until you finish a long rest, unless you expend ([1-9]\d*) ki points to create it again\./.exec(
        text,
      )
    const max = byProficiency
      ? proficiencyBonus
      : byWisdom
        ? Math.max(1, wisdomModifier ?? 0)
        : once || auraReuse
          ? 1
          : 0
    if (!max) return []
    const extraUse = auraReuse
      ? `You can expend ${auraReuse[1]} Ki to create this aura again.`
      : /While you have no uses available, you can spend [1-9]\d* ki points to use this feature again\./.exec(
          text,
        )?.[0]
    return [
      {
        id: `monk-${subclass.source.toLowerCase()}-${name.toLowerCase().replace(/ /g, '-')}`,
        label: name,
        maxPerLevel: Array.from({ length: 20 }, (_, index) => (index + 1 < level ? 0 : max)),
        restType: 'long' as const,
        ...(extraUse && { usageText: extraUse }),
      },
    ]
  })
}

export function deriveMonkSubclassSenses(
  character: Character,
  classes: readonly Class5e[] | undefined,
): CharacterEffect[] {
  const current = getSelectedMonkRules(character, classes)
  if (!current) return []
  const { owner, cls, subclass, origin } = current
  if (subclass.shortName === 'Shadow' && subclass.source === 'XPHB') {
    const level = getCurrentNativeSubclassGain(cls)?.level
    const rule =
      level &&
      level <= owner.levels &&
      getMonkNativeFeature(cls, subclass, 'Shadow Arts', level, origin)
    if (!rule) return []
    const clause = childText(rule.feature, 'Darkvision')
    const distances =
      /^You gain \{@sense Darkvision\|XPHB\} with a range of ([1-9]\d*) feet\. If you already have \{@sense Darkvision\|XPHB\}, its range increases by ([1-9]\d*) feet\.$/.exec(
        clause,
      )
    if (!distances || distances[1] !== distances[2]) return []
    return [
      {
        id: rule.target + ':darkvision',
        label: 'Shadow Arts',
        source: {
          kind: 'subclass',
          name: 'Shadow Arts',
          source: subclass.source,
          entityId: rule.target,
        },
        target: { kind: 'sense', sense: 'darkvision' },
        operation: { kind: 'add', value: Number(distances[1]) },
      },
    ]
  }
  if (subclass.shortName !== 'Ascendant Dragon' || subclass.source !== 'FTD') return []
  const refs = subclass.subclassFeatureRefs?.filter((row) => row.name === 'Ascendant Aspect')
  const level = refs?.length === 1 ? refs[0].level : undefined
  if (!level || level > owner.levels || !getCurrentNativeSubclassGain(cls, level)) return []
  const rule = getMonkNativeFeature(cls, subclass, 'Ascendant Aspect', level, origin)
  const sections = rule?.feature.entries
    ?.map(record)
    .flatMap((row) =>
      row.type === 'list' && Array.isArray(row.items)
        ? row.items.map(record).filter((item) => item.type === 'item' && item.name === 'Blindsight')
        : [],
    )
  const clause = sections?.length === 1 ? sections[0].entry : undefined
  const match =
    typeof clause === 'string' &&
    /^You gain \{@sense blindsight\} out to ([1-9]\d*) feet\./.exec(clause)
  return rule && match
    ? [
        {
          id: rule.target + ':blindsight',
          label: 'Ascendant Aspect',
          source: {
            kind: 'subclass',
            name: 'Ascendant Aspect',
            source: subclass.source,
            entityId: rule.target,
          },
          target: { kind: 'sense', sense: 'blindsight' },
          operation: { kind: 'minimum', value: Number(match[1]) },
        },
      ]
    : []
}

export function getMonkSubclassSpellGrants(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
): SubclassSpellGrant[] | undefined {
  if (cls.name !== 'Monk') return undefined
  const name = monksWithNativeSpells.get(`${subclass.source}|${subclass.shortName}`)
  if (!name) return undefined
  const inherited = cls.source === 'XPHB' && subclass.source !== 'XPHB'
  if (
    cls.sourceIdentityConflict ||
    subclass.sourceIdentityConflict ||
    (inherited ? !isInheritedClassicSubclass(subclass) : '_copy' in subclass)
  )
    return []
  const origin = inherited ? 'PHB' : cls.source
  const blocks = subclass.additionalSpells
  if (!Array.isArray(blocks) || blocks.length !== 1) return []
  const block = record(blocks[0])
  const gains = [
    ...new Set([...Object.keys(record(block.known)), ...Object.keys(record(block.innate))]),
  ]
  if (gains.length !== 1 || !/^(?:[1-9]|1\d|20)$/.test(gains[0])) return []
  const level = Number(gains[0])
  if (classLevel < level || !getCurrentNativeSubclassGain(cls, level)) return []
  const rule = getMonkNativeFeature(cls, subclass, name, level, origin)
  if (!rule) return []
  const { feature, target } = rule
  const qualification = { name, target }
  const text = directText(feature)
  const referencedSpells = (sourceText: string) =>
    new Set(
      [...sourceText.matchAll(/\{@spell ([^{}]+)\}/g)].map((match) =>
        getSpellReferenceKey(spellReference(match[1], origin)),
      ),
    )
  const castOnlyGrants = (grants: SubclassSpellGrant[] | undefined, sourceText: string) => {
    const references = referencedSpells(sourceText)
    return (grants ?? []).filter((grant) => references.has(getSpellReferenceKey(grant.spellName)))
  }
  const reprint = (grant: SubclassSpellGrant): SubclassSpellGrant =>
    inherited && parseSpellReference(grant.spellName).source?.toUpperCase() === 'PHB'
      ? {
          ...grant,
          spellName: formatSpellReference(parseSpellReference(grant.spellName).name, 'XPHB'),
          requiresClassicReprint: true,
        }
      : grant
  const result: SubclassSpellGrant[] = []
  try {
    const [known] = parseAdditionalSpellBlocks([
      { ability: block.ability, known: block.known } as AdditionalSpellBlock,
    ])
    const references = referencedSpells(
      subclass.source === 'XPHB' && subclass.shortName === 'Shadow'
        ? childText(feature, 'Shadowy Figments')
        : text,
    )
    if (known.ability === 'wis' && !known.choices.length)
      for (const grant of known.grants) {
        const spellName = spellReference(grant.spellName, origin)
        if (
          grant.isCantrip &&
          grant.level === level &&
          references.has(getSpellReferenceKey(spellName))
        )
          result.push(
            reprint({
              spellName,
              level,
              isCantrip: true,
              expectedSpellLevel: 0,
              mode: 'known',
              feature: qualification,
            }),
          )
      }
  } catch {
    return []
  }
  if (subclass.shortName === 'Shadow') {
    const revised = subclass.source === 'XPHB'
    const clause = revised ? childText(feature, 'Darkness') : text
    const ignoresMaterial = /without providing material components/.test(clause)
    const ignoresComponents = /without spell components/.test(clause)
    const castOnly = {
      ...(ignoresMaterial && { ignoresMaterial: true as const }),
      ...(ignoresComponents && { ignoresComponents: true as const }),
    }
    const cost = parseMonkResourceSpells(
      blocks,
      origin,
      level,
      revised ? 'Focus Point' : 'Ki',
      qualification,
      castOnly,
    )
    const declared = revised
      ? /expend ([1-9]\d*) Focus Points? to cast/.exec(clause)
      : /spend ([1-9]\d*) ki points to cast/.exec(clause)
    if (declared && cost?.every((spell) => spell.resourceCost === Number(declared[1])))
      result.push(...castOnlyGrants(cost, clause).map(reprint))
  }
  if (subclass.shortName === 'Sun Soul') {
    const castingNote =
      'Cast as a Bonus Action immediately after the Attack action. See the feature for higher-rank casting and its Ki cap.'
    const cost = parseMonkResourceSpells(
      blocks,
      origin,
      level,
      'Ki',
      { ...qualification, castingNote },
      { castingTime: 'Bonus Action' },
    )
    const declared = /spend ([1-9]\d*) ki points to cast/.exec(text)
    if (declared && cost?.every((spell) => spell.resourceCost === Number(declared[1])))
      result.push(...castOnlyGrants(cost, text).map(reprint))
  }
  if (subclass.shortName === 'Open Hand') {
    try {
      const [parsed] = parseAdditionalSpellBlocks(blocks as AdditionalSpellBlock[])
      const [grant] = parsed.grants
      if (
        parsed.ability === 'wis' &&
        parsed.grants.length === 1 &&
        !parsed.choices.length &&
        grant.source === 'innate' &&
        grant.dailyUses === 1 &&
        grant.level === level &&
        !grant.isCantrip &&
        /At the end of a long rest, you gain the effect of a /.test(text)
      ) {
        result.push(
          ...castOnlyGrants(
            [
              {
                spellName: spellReference(grant.spellName, origin),
                level,
                isCantrip: false,
                mode: 'cast-only',
                castOnly: { castingTime: 'End of Long Rest', ignoresComponents: true },
                feature: {
                  ...qualification,
                  castingNote:
                    'Gain the spell effect at the end of a Long Rest without casting it. Use Wisdom for its saving throw DC.',
                },
              },
            ],
            text,
          ).map(reprint),
        )
      }
    } catch {
      return []
    }
  }
  return result
}
