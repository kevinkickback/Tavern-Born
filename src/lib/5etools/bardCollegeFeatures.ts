import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
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

const classicGlamour = ['phb', 'glamour', 'xge'] as const
const revisedGlamour = ['xphb', 'glamour', 'xphb'] as const
const classicSpirits = ['phb', 'spirits', 'vrgr'] as const
const revisedSpirits = ['xphb', 'spirits', 'rhw'] as const
const moon = ['xphb', 'moon', 'frhof'] as const
const dance = ['xphb', 'dance', 'xphb'] as const
type College = readonly [classSource: string, shortName: string, subclassSource: string]

const target = ([classSource, shortName, source]: College, level: number, name: string) =>
  `subclass-feature|${norm(name)}|bard|${classSource}|${shortName}|${source}|${level}|${source}`

const glamourIntro = [
  'College of Glamour',
  '81729c380ec2a38053a013dd4af7826307ecd6cc288298713897714f76000b76',
] as const
const classicSpiritsIntro = [
  'College of Spirits',
  'ac90e88b7eafecedfb8caf6b7152b52b1468a9fdcbb3c919c2a7abb2e019f742',
] as const
const revisedSpiritsIntro = [
  'College of Spirits',
  '11db11ef29587384fe4587af6dbe2bb9f01923f4ba4cf288fbcb37bc4cc52c32',
] as const
const moonIntro = [
  'College of the Moon',
  'fd1c63759161905e06abdb148d93b9968641295c6ee9c1e6f40f8068d8bcc998',
] as const
const danceIntro = [
  'College of Dance',
  'd89dacf0c55e6f999811e45623b5fa426530825c217bab01e94f1023cff0eac2',
] as const
const footwork = [
  'Dazzling Footwork',
  '556dda5474b2ff21a5ae37f18a9bc2208ee355c15cbabaff6bf0d942bf44e490',
] as const
const primalLore = [
  'Primal Lore',
  '3785fca05cb215e85fbe0a900ab78a57e8e34297bbf8a705c5bb199d977acc32',
] as const
const unarmored = [
  'Unarmored Defense',
  '24e351ab98dff3768f37204969e6b48c4f940ca678cc5298e9a41ff55264b0a1',
] as const
const beguiling = [
  'Beguiling Magic',
  '38f91ff80b236136c51ece751a32964eafbce6a4f0931d2022603f7dbcdffa01',
] as const
const guiding = [
  'Guiding Whispers',
  '04198cc57a4cabacba292d5465482b7b50ff16526cd5477ec473d20df66382b7',
] as const
const channeler = [
  'Channeler',
  '81538ebca283008bf3911485a1a198c11931bf08bdf480a81ae20ea3cd06e7ed',
] as const
const empowerment = [
  'Empowered Channeling',
  'b1e1fe633f1da4531b7185a72e5a2b3df9b20990915b7fbd40c898c5ee1c0eb5',
] as const
const moonlight = [
  'Blessing of Moonlight',
  '8263427f8a7e094f265b55fe8d5048348fc3991caf5f23c3db9b2437ce185a49',
] as const
const classicMantle = [
  'Mantle of Majesty',
  'ff09733e5823ef97e9f7b59d12847e2cc78ca83feabd002cb520f931c8f76062',
] as const
const revisedMantle = [
  'Mantle of Majesty',
  '29cd98789a3139009c519ee49c76687cc0d9cfdeef3a5b9018db703c265c4dbb',
] as const

const nativeBardCollegeTargets = new Set([
  target(classicGlamour, 6, classicMantle[0]),
  target(revisedGlamour, 3, glamourIntro[0]),
  target(revisedGlamour, 3, beguiling[0]),
  target(revisedGlamour, 6, revisedMantle[0]),
  target(classicSpirits, 3, classicSpiritsIntro[0]),
  target(classicSpirits, 3, guiding[0]),
  target(revisedSpirits, 3, revisedSpiritsIntro[0]),
  target(revisedSpirits, 3, channeler[0]),
  target(revisedSpirits, 6, empowerment[0]),
  target(moon, 3, moonIntro[0]),
  target(moon, 3, primalLore[0]),
  target(moon, 6, moonlight[0]),
  target(dance, 3, danceIntro[0]),
  target(dance, 3, footwork[0]),
  target(dance, 3, unarmored[0]),
])

export function isDirectBardCollegeFeature(key: string | undefined) {
  return key !== undefined && nativeBardCollegeTargets.has(key)
}

function matchesCollege(
  cls: Class5e,
  subclass: Subclass5e,
  [classSource, shortName, source]: College,
) {
  return (
    norm(cls.name) === 'bard' &&
    norm(cls.source) === classSource &&
    norm(subclass.className) === 'bard' &&
    norm(subclass.classSource) === classSource &&
    norm(subclass.name) === `college of ${shortName === 'moon' ? 'the moon' : shortName}` &&
    norm(subclass.source) === source
  )
}

function currentFeature(
  cls: Class5e,
  subclass: Subclass5e,
  college: College,
  level: number,
  path: ReadonlyArray<readonly [name: string, digest: string]>,
) {
  const classic = college[0] === 'phb'
  if (
    !matchesCollege(cls, subclass, college) ||
    norm(subclass.shortName) !== college[1] ||
    subclass._copy ||
    subclass.sourceIdentityConflict ||
    !matchesNativeSubclassGain(
      cls,
      classic
        ? 'class-feature|bard college|bard|phb|3|phb'
        : 'class-feature|bard subclass|bard|xphb|3|xphb',
      3,
    ) ||
    (level !== 3 &&
      !matchesNativeSubclassGain(
        cls,
        classic
          ? `class-feature|bard college feature|bard|phb|${level}|phb`
          : `class-feature|subclass feature|bard|xphb|${level}|xphb`,
        level,
        'at-level',
      ))
  )
    return undefined

  let feature: SubclassFeature | undefined
  for (const [name, digest] of path) {
    const key = target(college, level, name)
    if (feature) {
      const parents = (feature.entries ?? []).map(record).filter((row) => {
        const uid = row.subclassFeature
        return (
          row.type === 'refSubclassFeature' &&
          typeof uid === 'string' &&
          decodeOptionalDeclaration(uid, 'subclassFeature')?.target === key
        )
      })
      const ref = parents[0]
      if (
        parents.length !== 1 ||
        !exactOptionalDeclarationReference(ref, ref.subclassFeature as string, 'subclassFeature')
      )
        return undefined
      feature = ref.feature as SubclassFeature | undefined
    } else {
      const ref = getDirectSubclassFeatureReference(subclass, key)
      if (level === 3 && ref?.ref !== subclass.introFeatureRef) return undefined
      feature = ref?.feature
    }
    if (
      !feature ||
      '_copy' in feature ||
      feature.featureOptionSourceConflict ||
      feature.sourceIdentityConflict ||
      feature.isClassFeatureVariant ||
      getSubclassFeatureIdentity(feature) !== key ||
      getFeatureSourceDigest(feature.entries ?? []) !== digest
    )
      return undefined
  }
  return feature
}

export const BARD_PRIMAL_LORE_TARGET = target(moon, 3, primalLore[0])

export function getCurrentBardPrimalLore(cls: Class5e, subclass: Subclass5e) {
  return getFeatureSourceDigest(subclass.additionalSpells ?? []) ===
    '2739baf3fa05718398491e8cfb6f9b4df015120f6942f89ad5c961b0186ae03d'
    ? currentFeature(cls, subclass, moon, 3, [moonIntro, primalLore])
    : undefined
}

export function hasCurrentBardDanceDefense(cls: Class5e, subclass: Subclass5e) {
  return !!currentFeature(cls, subclass, dance, 3, [danceIntro, footwork, unarmored])
}

/** The authored prose distinguishes preparation, limited casting and a modifier to a normal cast. */
export function getBardCollegeSpellGrants(
  cls: Class5e,
  subclass: Subclass5e,
  level: number,
): SubclassSpellGrant[] | undefined {
  const college = [classicGlamour, revisedGlamour, classicSpirits, revisedSpirits, moon].find(
    (row) => matchesCollege(cls, subclass, row),
  )
  if (!college) return undefined
  const schedule = getFeatureSourceDigest(subclass.additionalSpells ?? [])
  const grants: SubclassSpellGrant[] = []
  const add = (
    gain: number,
    path: Parameters<typeof currentFeature>[4],
    name: string,
    rank: number,
    mode: SubclassSpellGrant['mode'],
    castingNote?: string,
  ) => {
    if (level < gain) return
    const feature = currentFeature(cls, subclass, college, gain, path)
    if (!feature) return
    grants.push({
      spellName: `${name}|${college[0].toUpperCase()}`,
      level: gain,
      expectedSpellLevel: rank,
      isCantrip: rank === 0,
      mode,
      feature: { name: feature.name, target: target(college, gain, feature.name), castingNote },
      ...(mode === 'cast-only' && { castOnly: { castingTime: 'Bonus Action' } }),
    })
  }
  if (
    (college === classicGlamour &&
      schedule === '3655eba49f60ea9aaa72011ae6ed675dbc3ceef59644b8d505654aabe02f1f63') ||
    (college === revisedGlamour &&
      schedule === 'f0ebedc8735b9f360bdad13aaf301f33caa2c174bc98ff91ead3555c6325f37b')
  ) {
    const classic = college === classicGlamour
    if (!classic) {
      add(3, [glamourIntro, beguiling], 'Charm Person', 1, 'prepared')
      add(3, [glamourIntro, beguiling], 'Mirror Image', 2, 'prepared')
    }
    add(
      6,
      [classic ? classicMantle : revisedMantle],
      'Command',
      1,
      classic ? 'cast-only' : 'prepared',
      `Mantle of Majesty: Cast as a Bonus Action without a spell slot when activating the mantle and on each of your turns while it lasts. It ends after 1 minute or when your Concentration ends. Creatures Charmed by you automatically fail their saves. Regain the mantle after a Long Rest${classic ? '.' : ' or by spending a level 3+ spell slot.'}`,
    )
  } else if (
    college === classicSpirits &&
    schedule === 'c7c3fc13dabd7caf57b2ea7526090afa000b166461c3b01f6abcda41b1814f03'
  ) {
    add(
      3,
      [classicSpiritsIntro, guiding],
      'Guidance',
      0,
      'known',
      'Guiding Whispers: Guidance has a range of 60 feet when you cast it.',
    )
  } else if (
    college === revisedSpirits &&
    schedule === 'd38f3735eecf3b61d3e6be4575f78a9e4ad8186649218b4b7f4941ccd743a581'
  ) {
    add(
      3,
      [revisedSpiritsIntro, channeler],
      'Guidance',
      0,
      'known',
      'Guiding Whispers: Guidance has a range of 60 feet when you cast it.',
    )
    add(
      6,
      [empowerment],
      'Spirit Guardians',
      3,
      'prepared',
      'Spiritual Manifestation: Cast once without a spell slot per Long Rest. Separately, give yourself and allies in the Emanation Half Cover when you cast it, once per Short or Long Rest.',
    )
  } else if (
    college === moon &&
    schedule === '2739baf3fa05718398491e8cfb6f9b4df015120f6942f89ad5c961b0186ae03d'
  ) {
    add(
      6,
      [moonlight],
      'Moonbeam',
      2,
      'prepared',
      'Blessing of Moonlight: Once per Long Rest, modify a casting to shed Dim Light for 5 feet. When a creature fails the save, another creature you can see within 60 feet regains 2d4 Hit Points.',
    )
  }
  return grants
}
