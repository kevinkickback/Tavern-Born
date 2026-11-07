import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { ancestralPath, matchesBarbarianPath } from './barbarianGiantPower'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import type { SubclassSpellGrant } from './subclassSpells'

const owners = {
  phb: {
    name: 'Path of the Totem Warrior',
    shortName: 'totem warrior',
    intro: '163527619179cf1a56609c4095b3a645fcca9dbf3ba32ee634ebb3e774f2f0ff',
    schedule: 'd8937b458e3dc435bc9679a30ae6289cd4ea218bebd10da0b16f6309dc2ffd76',
    first: ['Spirit Seeker', '6074da98d7a396cd8992ff4a9423037974354b735d18cfdc3dbbeffa6e459c7d'],
    later: ['Spirit Walker', 'bc7eac144c3e5c74ac4cbff774209808a1bdddc5fc57c1a15bf1866e918101c0'],
  },
  xphb: {
    name: 'Path of the Wild Heart',
    shortName: 'wild heart',
    intro: '8ccfa975f71fccae089ecec3f425f1c30ff57d8c514fafbd69faddc88e243793',
    schedule: '10d188e4cf5ea4785728aa40a568d1d7448bf93bc6c2db350660e347c8226bb2',
    first: ['Animal Speaker', '7a55b7854837bc9bcc99a77de43439ace5fd677e4207350978236bbb3917d9d2'],
    later: ['Nature Speaker', 'aeb2cb35d3130b121383271a9611dfa119e52b07db0cd253a5b83ca1ffbb1274'],
  },
} as const

const consultTarget =
  'subclass-feature|consult the spirits|barbarian|phb|ancestral guardian|xge|10|xge'
export const isRevisedAncestralGuardian = (entry: CharacterClassEntry) =>
  norm(entry.name) === 'barbarian' &&
  norm(entry.source) === 'xphb' &&
  norm(entry.subclass) === norm(ancestralPath.name) &&
  norm(entry.subclassSource) === 'xge'

const target = (source: keyof typeof owners, level: number, name: string) =>
  `subclass-feature|${norm(name)}|barbarian|${source}|${owners[source].shortName}|${source}|${level}|${source}`
const targets = new Set(
  (['phb', 'xphb'] as const).flatMap((source) => {
    const spec = owners[source]
    return [
      target(source, 3, spec.name),
      target(source, 3, spec.first[0]),
      target(source, 10, spec.later[0]),
    ]
  }),
)
export const isDirectBarbarianRitualTarget = (key?: string) =>
  key !== undefined && (targets.has(key) || key === consultTarget)

function exact(feature: SubclassFeature | undefined, target: string, digest: string) {
  return (
    !!feature &&
    !('_copy' in feature) &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === target &&
    getFeatureSourceDigest(feature.entries ?? []) === digest
  )
}

function getConsultTheSpirits(
  cls: Class5e,
  subclass: Subclass5e,
  level: number,
): SubclassSpellGrant[] {
  const revised = norm(cls.source) === 'xphb'
  if (
    level < 10 ||
    subclass.sourceIdentityConflict ||
    typeof subclass.spellcastingAbility !== 'string' ||
    norm(subclass.spellcastingAbility) !== 'wis' ||
    (revised
      ? !matchesBarbarianPath(record(subclass._copy), ancestralPath, 'PHB')
      : !!subclass._copy) ||
    getFeatureSourceDigest(subclass.additionalSpells ?? []) !==
      '464141be0787e291fc066c54d46a2fc0a9b1b5c9d91010119c5dbb08605b9d1c' ||
    !matchesNativeSubclassGain(
      cls,
      revised
        ? 'class-feature|barbarian subclass|barbarian|xphb|3|xphb'
        : 'class-feature|primal path|barbarian|phb|3|phb',
      3,
    ) ||
    !matchesNativeSubclassGain(
      cls,
      revised
        ? 'class-feature|subclass feature|barbarian|xphb|10|xphb'
        : 'class-feature|path feature|barbarian|phb|10|phb',
      10,
      'at-level',
    ) ||
    !exact(
      getDirectSubclassFeatureReference(subclass, consultTarget)?.feature,
      consultTarget,
      '5dddea9a44da34e7f5c2f13b5e75999dcd6ed389e9f9a66705c237c99b00cdcd',
    )
  )
    return []
  return (
    [
      ['Augury', 2],
      ['Clairvoyance', 3],
    ] as const
  ).map(([name, expectedSpellLevel]) => ({
    spellName: `${name}|${cls.source}`,
    level: 10,
    isCantrip: false,
    expectedSpellLevel,
    mode: 'cast-only',
    ...(revised && { requiresClassicReprint: true }),
    castOnly: { ignoresMaterial: true },
    feature: {
      name: 'Consult the Spirits',
      target: consultTarget,
      castingNote:
        'Consult the Spirits: Cast either spell once, without a spell slot or Material components. Wisdom is your spellcasting ability. Regain the shared use on a Short or Long Rest.' +
        (name === 'Clairvoyance' ? ' An invisible ancestor appears instead of a sensor.' : ''),
    },
  }))
}

export function getBarbarianRitualGrants(
  cls: Class5e,
  subclass: Subclass5e,
  level: number,
): SubclassSpellGrant[] | undefined {
  const source = norm(cls.source)
  if (norm(cls.name) !== 'barbarian' || (source !== 'phb' && source !== 'xphb')) return undefined
  if (matchesBarbarianPath(record(subclass), ancestralPath, cls.source))
    return getConsultTheSpirits(cls, subclass, level)
  const spec = owners[source]
  if (norm(subclass.name) !== norm(spec.name) || norm(subclass.source) !== source) return undefined
  const revised = source === 'xphb'
  const gains: SubclassSpellGrant[] = []
  const ability = subclass.spellcastingAbility
  if (
    subclass._copy ||
    subclass.sourceIdentityConflict ||
    (revised &&
      ability !== undefined &&
      (typeof ability !== 'string' || norm(ability) !== 'wis')) ||
    norm(subclass.shortName) !== spec.shortName ||
    getFeatureSourceDigest(subclass.additionalSpells ?? []) !== spec.schedule ||
    !matchesNativeSubclassGain(
      cls,
      revised
        ? 'class-feature|barbarian subclass|barbarian|xphb|3|xphb'
        : 'class-feature|primal path|barbarian|phb|3|phb',
      3,
    )
  )
    return gains

  const grant = (
    featureName: string,
    at: number,
    name: string,
    rank: number,
  ): SubclassSpellGrant => ({
    spellName: `${name}|${source.toUpperCase()}`,
    level: at,
    isCantrip: false,
    expectedSpellLevel: rank,
    mode: 'cast-only',
    castOnly: { castingTime: 'Ritual only' },
    feature: {
      name: featureName,
      target: target(source, at, featureName),
      castingNote: `${featureName}: Cast only as a ritual.${revised ? ' Wisdom is your spellcasting ability.' : ''}`,
    },
  })
  const introTarget = target(source, 3, spec.name)
  const intro = getDirectSubclassFeatureReference(subclass, introTarget)
  const firstTarget = target(source, 3, spec.first[0])
  if (
    level >= 3 &&
    intro &&
    intro.ref === subclass.introFeatureRef &&
    exact(intro.feature, introTarget, spec.intro)
  ) {
    const children = (intro.feature?.entries ?? [])
      .map(record)
      .filter(
        (row) =>
          row.type === 'refSubclassFeature' &&
          typeof row.subclassFeature === 'string' &&
          decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')?.target === firstTarget,
      )
    const child = children[0]
    if (
      children.length === 1 &&
      exactOptionalDeclarationReference(child, String(child.subclassFeature), 'subclassFeature') &&
      exact(child.feature as SubclassFeature | undefined, firstTarget, spec.first[1])
    )
      gains.push(
        grant(spec.first[0], 3, 'Beast Sense', 2),
        grant(spec.first[0], 3, 'Speak with Animals', 1),
      )
  }
  const laterTarget = target(source, 10, spec.later[0])
  if (
    level >= 10 &&
    matchesNativeSubclassGain(
      cls,
      revised
        ? 'class-feature|subclass feature|barbarian|xphb|10|xphb'
        : 'class-feature|path feature|barbarian|phb|10|phb',
      10,
      'at-level',
    ) &&
    exact(
      getDirectSubclassFeatureReference(subclass, laterTarget)?.feature,
      laterTarget,
      spec.later[1],
    )
  )
    gains.push(grant(spec.later[0], 10, 'Commune with Nature', 5))
  return gains
}
