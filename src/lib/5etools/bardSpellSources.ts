import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import { type ClassFeatureSourceCatalog, getFeatureSourceDigest } from './featureSourceAudit'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

const classicSecrets = new Map([
  [
    10,
    [
      '4ccb4bd371ec121ff8de4ef3f148fe2634161324346c19f02daba7becdb826ef',
      '46192100631d666b67c8c71fa59feadbfac826b2b85bd0a729ec46519ec16a02',
    ],
  ],
  [
    14,
    [
      'd05eb03fd4c387c8a857b9379f1e9ab3f96bcb18d25b1dba1703d5c18729e5b7',
      'f8237ced682bb874e8017c12c452101b5cd2909e48e8ff8d9663a76eafe47adb',
    ],
  ],
  [18, ['cfddd9a2d1b9c66e19a5b69e792e83190c15b8e6990aada14658a0e6e31fa91f']],
])
const classicSchedule = 'f308c7c34969d496bf541221166639d4ffb46e9bc659788fb052ba51ea83d2a1'
const revisedSchedule = 'ea73941af0fc2cd784f4fb34c15ec9afb6c6fe0b3354e0d1b0e0ffe7aaaf8969'
const revisedSecrets = '1ee7726ea64d5d7f54db1e8529be864fba3f5f6a4f29de6ef0932ba996ab1700'
export const WORDS_OF_CREATION_TARGET = 'class-feature|words of creation|bard|xphb|20|xphb'

const jackOfAllTradesBodies = {
  phb: ['e1e56b53a2045f4b5b75124719d05eced320d2ee892c5b3627eef68aac2826a3'],
  xphb: [
    'fe53778c1bd19acb64d8900df38260244d0e9c5c04047f8be50fb47c06df3c79',
    '2a5a01be5356d0d1362d9a9d98673b2ee1d69c2a31d00f30b6f6dc7ffa56fea8',
  ],
}

function hasDirectBardBody(feature: ClassFeature, digests: readonly string[]) {
  if ('_copy' in feature) return false
  const digest = getFeatureSourceDigest(feature.entries ?? [])
  return digest !== undefined && digests.includes(digest)
}

export function getCurrentBardJackOfAllTrades(cls: Class5e, catalogs: ClassFeatureSourceCatalog) {
  const source = norm(cls.source)
  if (norm(cls.name) !== 'bard' || (source !== 'phb' && source !== 'xphb')) return undefined
  return getCurrentDirectClassFeature(
    cls,
    catalogs,
    `class-feature|jack of all trades|bard|${source}|2|${source}`,
    (feature) => hasDirectBardBody(feature, jackOfAllTradesBodies[source]),
  )
}

export function hasCurrentBardWordsOfCreation(cls: Class5e, catalogs: ClassFeatureSourceCatalog) {
  const schedule = record(cls).additionalSpells
  return (
    norm(cls.name) === 'bard' &&
    norm(cls.source) === 'xphb' &&
    Array.isArray(schedule) &&
    getFeatureSourceDigest(schedule) === revisedSchedule &&
    !!getCurrentDirectClassFeature(cls, catalogs, WORDS_OF_CREATION_TARGET, (feature) =>
      hasDirectBardBody(feature, [
        '7add86300d70dcc5cbc28dae74029431368e9d590f13083d2e7b0a79358602b9',
      ]),
    )
  )
}

const loreRules = [
  {
    source: 'phb',
    name: 'Additional Magical Secrets',
    target: 'subclass-feature|additional magical secrets|bard|phb|lore|phb|6|phb',
    intro: 'class-feature|bard college|bard|phb|3|phb',
    gain: 'class-feature|bard college feature|bard|phb|6|phb',
    body: '81405dc794c839da8b74d758cdc179acbd17ea8915269a84d5b5de7cbb850a4e',
    schedule: '0ea94d269b7123e73869c170b60ce3ba293b806dc5478bace5f4c98f4a2c10db',
  },
  {
    source: 'xphb',
    name: 'Magical Discoveries',
    target: 'subclass-feature|magical discoveries|bard|xphb|lore|xphb|6|xphb',
    intro: 'class-feature|bard subclass|bard|xphb|3|xphb',
    gain: 'class-feature|subclass feature|bard|xphb|6|xphb',
    body: '377e36f8eeba2c0239362152fbacca008f1f77d210169a66b43d722aaa3690a5',
    schedule: 'd42f1c7c6fd7b519ee62f6cc463e2b0e72f685025b2e6fbf49893f529bcd06f8',
  },
] as const

export function isDirectBardLoreSpellSource(target: string | undefined) {
  return loreRules.some((rule) => rule.target === target)
}

export function getBardLoreSpellRule(slot: ManagedClassSpellSlot) {
  if (!Array.isArray(slot) || slot.length !== 5) return undefined
  const [owner, domain, target, gain, ordinal] = slot
  if (
    !Array.isArray(owner) ||
    owner.length !== 5 ||
    owner[0] !== 'subclass' ||
    owner[1] !== 'bard' ||
    owner[3] !== 'college of lore' ||
    domain !== 'class-known' ||
    gain !== 6 ||
    (ordinal !== 0 && ordinal !== 1)
  )
    return undefined
  return loreRules.find(
    (rule) => rule.source === owner[2] && rule.source === owner[4] && rule.target === target,
  )
}

export function getBardLoreSpellSlots(entry: CharacterClassEntry): ManagedClassSpellSlot[] {
  if (entry.levels < 6 || norm(entry.name) !== 'bard' || norm(entry.subclass) !== 'college of lore')
    return []
  const rule = loreRules.find(
    (row) => row.source === norm(entry.source) && row.source === norm(entry.subclassSource),
  )
  return rule
    ? [0, 1].map<ManagedClassSpellSlot>((ordinal) => [
        ['subclass', 'bard', rule.source, 'college of lore', rule.source],
        'class-known',
        rule.target,
        6,
        ordinal,
      ])
    : []
}

export function hasCurrentBardLoreSpellSource(
  cls: Class5e,
  rule: (typeof loreRules)[number],
  candidates: ReadonlyMap<string, readonly SubclassFeature[]> | undefined,
) {
  if (
    norm(cls.name) !== 'bard' ||
    norm(cls.source) !== rule.source ||
    !matchesNativeSubclassGain(cls, rule.intro, 3) ||
    !matchesNativeSubclassGain(cls, rule.gain, 6, 'at-level')
  )
    return false
  const rows = cls.subclasses?.filter(
    (row) => norm(row.name) === 'college of lore' && norm(row.source) === rule.source,
  )
  const lore = rows?.[0]
  if (
    rows?.length !== 1 ||
    !lore ||
    lore._copy ||
    lore.sourceIdentityConflict ||
    norm(lore.className) !== 'bard' ||
    norm(lore.classSource) !== rule.source ||
    norm(lore.shortName) !== 'lore' ||
    !Array.isArray(lore.additionalSpells) ||
    getFeatureSourceDigest(lore.additionalSpells) !== rule.schedule
  )
    return false
  const exact = (feature: SubclassFeature) =>
    !('_copy' in feature) &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === rule.target &&
    getFeatureSourceDigest(feature.entries ?? []) === rule.body
  const attached = getDirectSubclassFeatureReference(lore, rule.target)?.feature
  const current = candidates?.get(rule.target)
  return !!attached && exact(attached) && !!current?.length && current.every(exact)
}

export function isClassicMagicalSecretsSlot(slot: ManagedClassSpellSlot) {
  const [owner, domain, target, level, ordinal] = slot
  return (
    owner[0] === 'class' &&
    owner[1] === 'bard' &&
    owner[2] === 'phb' &&
    domain === 'class-known' &&
    target === 'class-feature|spellcasting|bard|phb|1|phb' &&
    classicSecrets.has(level) &&
    (ordinal === 0 || ordinal === 1)
  )
}

/** The schedule and the current feature must agree. Two classic bodies vary by catalog. */
export function getCurrentBardMagicalSecrets(
  classes: readonly Class5e[],
  catalogs: ClassFeatureSourceCatalog | undefined,
  source: string,
  level: number,
) {
  if (!catalogs || (source !== 'phb' && source !== 'xphb')) return undefined
  const eligible = classes.filter((row) => norm(row.name) === 'bard' && norm(row.source) === source)
  if (eligible.length !== 1) return undefined
  const cls = eligible[0]
  const schedule = record(cls).additionalSpells
  const classic = source === 'phb'
  if (
    !Array.isArray(schedule) ||
    getFeatureSourceDigest(schedule) !== (classic ? classicSchedule : revisedSchedule)
  )
    return undefined
  const gain = classic ? level : 10
  const accepted = classic ? classicSecrets.get(gain) : level >= gain ? [revisedSecrets] : undefined
  if (!accepted) return undefined
  return getCurrentDirectClassFeature(
    cls,
    catalogs,
    `class-feature|magical secrets|bard|${source}|${gain}|${source}`,
    (feature) => hasDirectBardBody(feature, accepted),
  )
}
