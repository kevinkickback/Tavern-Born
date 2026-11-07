import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import { getFeatureSourceDigest, hasFeatureSourceShape } from '@/lib/5etools/featureSourceAudit'
import {
  findNativeSubclass,
  getDirectSubclassFeatureReference,
} from '@/lib/5etools/nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from '@/lib/5etools/nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from '@/lib/5etools/optionalClassDeclarationStructure'
import {
  NATIVE_WARLOCK_PATRONS,
  type NativeWarlockSource,
} from '@/lib/5etools/warlockPatronFeatureSource'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

const classFields = new Set([
  'name',
  'source',
  'className',
  'classSource',
  'level',
  'entries',
  'header',
  'page',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
])
const subclassFields = new Set([...classFields, 'subclassShortName', 'subclassSource'])

const bodies = {
  phb: {
    slots: 'd06984eb9b6ee8302795f1a877907924ae5110bafffa72f9373eaab0ce2ac2c9',
    master: 'e3ad0e24f13b0f61477ee996f610664862911f55b48f5db4cc01b52a6fdc9f6a',
  },
  xphb: {
    slots: '8de3c894d62282c3c105337397d772d848ad342ade5b121599ab1321593c00cc',
    master: 'bd031c844820e27534ce76879534055783eb5dd6cdeefcbf8b8dfce4a9eea6b3',
  },
} as const

// Body certificates follow the native owner's ordered intro leaves and direct gains.
const patronBodies: Record<
  NativeWarlockSource,
  Record<string, { nested: readonly string[]; direct: readonly string[] }>
> = {
  phb: {
    fiend: {
      nested: ['d5cbc74201c40ba0ff5b7a42ed827636c95a492fe107d2f6e47b7bc6c94af6b2'],
      direct: [
        'd749dbcbedb6db0fb16f1847d102640b4ae8e4a71120a36e1739d72f8aa85e9d',
        'd4168859e0403c840648a12339562d4995a80dea91ad8650dd6daa130d71a79d',
        'e1073cd89a7faebf5974baba65e386d2c1a7592535844324e2f173d40cf7b7af',
      ],
    },
    archfey: {
      nested: ['ccd036ebbdeb8df5f5e554ec69b8df42b21ac898f6a1765a11f039e30763a622'],
      direct: [
        '35cf84b63ad61916c3fb21fe313abad26867ade080423c35d3c631fa6b9b33d7',
        '6bbc0f2e562e09d3c635ebe9fa8ece6bf5efc924f2d0772289445e665a1bbdbc',
        '786a18e4bc14fdb470c56aba48dd0c47a0f9b19cd86d7ca731c71f86b2dc6100',
      ],
    },
    'great old one': {
      nested: ['6baa9ba3794ee96e0e84d1606c3e9febd1c287e25d42e269645d5ab3e9fb8c1c'],
      direct: [
        'b5216435f99bceb4c94b8a255ab54723720515ddfcdf4d21c7d2f04b2a7152b2',
        'fac71448ddc6d402d2af9e57f8c056dc9168e721b5f6429f899b87fce6b76e33',
        'fedcaa2e6e1837e656a3921f5aec564d63d455aa20cf6724f989e42f75640b71',
      ],
    },
  },
  xphb: {
    fiend: {
      nested: ['37301e69ce3cd1a6b0bbded4802542a7dc67db168ac98822d73d9c966a388cf0'],
      direct: [
        '2df6ea140b5055d7815d832babae93e762a0e44517a549f2f394c4d88d8e4b13',
        '69d64957a15fbeb4fa38cb4a312cf8917ff82410203deb164ff714d14494c147',
        'bbe95a484e7ea1a40d6b22aa979eb36c1bc1edffc3cf3bc3723da8963faa8517',
      ],
    },
    archfey: {
      nested: [
        '8942e7ca8647b16aa0e5747cbaa0687a5d569a10a862149c94c6a17dc49e24b4',
        '6907f2a31f211aa5e72589666590d2a9b418b4a4ad626d4cf67182755d5d49b3',
      ],
      direct: [
        '46375a20be407be4a08e30ec0baaad560ec8c52cc86b33e33620e97e74746c4a',
        '6a6d95390977305e8bfcd1371cc75d827e8e23a5d3b6eb717a138a9e6206051e',
        '5bba13c2f80f268f69d0630daadd4f21748bd0e3fa40391c980f41ca457f7b89',
      ],
    },
    celestial: {
      nested: [
        '2160f9f3dbdebf26d249fbf843867b9fcd809c6e6fc56373b7f98b0a94564aee',
        'd5a4c9796760112c562e3f83a828feab91911c9e04b9429f189a97fc5f5b67cb',
      ],
      direct: [
        '282ec83ac98fd67c72b1c497e692bc90da5890b9ced77678fa4d277ac90213cb',
        '6a5cbac8ff7778fc218380b7c13f590fb2f62be1d060be9514bfe05d90b942e2',
        '3ea879a467db8ff2022cda1223125078edbd92e17f35eb1078f5d59fbcc6f490',
      ],
    },
    'great old one': {
      nested: [
        'b9a0adbd88387ce6694fea6b2afc72576f72fe4cdf9e347b2795e6813f89f0e6',
        '8405ec37e58911b51f4c78220a660f13ee040b0da00c9a5ed183069f8704ba87',
        'e5373bad66eadfdb934f58d54514fc5cd3ab0a573fd092b3d6c0b8736c08ddd0',
      ],
      direct: [
        'ab740c85d92c69644af88522f6ab3adc9a49a260a1d03b069f4040cbcee7b08f',
        'f7a602c8f69854dc475e8a5fe9ffb1f3a75f441c76990fd058bc094e16c2b780',
        '52f7a50660a4cccf9e94b8e3680e2d85af29714c0ae7ed7e132ccdbf7e1412a9',
        'f06375baa348d3831fce6876ccf034fbbb9b490c8402c8cc22a438a896744c07',
      ],
    },
  },
}

const magicalCunning = '83b8faed320d8d149abdbfc634697272164384d7bb9f3be075a88c1aac890146'
const classTarget = (name: string, source: NativeWarlockSource, level: number) =>
  `class-feature|${name}|warlock|${source}|${level}|${source}`

function getPactRecovery(feature: ClassFeature, source: NativeWarlockSource) {
  if (!hasFeatureSourceShape(feature, classFields) || !Array.isArray(feature.entries))
    return undefined
  const groups =
    source === 'phb'
      ? feature.entries
      : feature.entries.flatMap((entry) => {
          const group = record(entry)
          return group.type === 'entries' && Array.isArray(group.entries) ? group.entries : []
        })
  const slots = groups
    .map(record)
    .filter(({ type, name }) => type === 'entries' && name === 'Spell Slots')
  const body = slots[0]?.entries
  return slots.length === 1 &&
    Array.isArray(body) &&
    getFeatureSourceDigest(body, false) === bodies[source].slots
    ? body.slice(0, 1)
    : undefined
}

function getPatronStaticFeatures(
  cls: Class5e,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
  source: NativeWarlockSource,
): SubclassFeature[] {
  const owner = NATIVE_WARLOCK_PATRONS[source].find((patron) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [patron]),
  )
  if (
    !owner ||
    entry.levels < owner.level ||
    !matchesNativeSubclassGain(
      cls,
      classTarget(
        source === 'phb' ? 'otherworldly patron' : 'warlock subclass',
        source,
        owner.level,
      ),
      owner.level,
    )
  )
    return []
  const subclass = findNativeSubclass(cls, owner)
  const rules = patronBodies[source][owner.shortName]
  if (!subclass || !rules) return []

  const ownerKey = getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source)
  const byTarget = catalogs.subclassTargets
    ? catalogs.subclassTargets.candidatesByOwner.get(ownerKey)
    : catalogs.subclassFeatureCandidates
  const candidates = (target: string) =>
    catalogs.subclassTargets || byTarget
      ? (byTarget?.get(target) ?? [])
      : catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === target)
  const exactBody = (feature: SubclassFeature | undefined, target: string, digest: string) =>
    !!digest &&
    !!feature &&
    getSubclassFeatureIdentity(feature) === target &&
    hasFeatureSourceShape(feature, subclassFields) &&
    Array.isArray(feature.entries) &&
    getFeatureSourceDigest(feature.entries, false) === digest
  const verified = (attached: SubclassFeature | undefined, target: string, digest: string) => {
    const mirrors = candidates(target)
    return attached &&
      exactBody(attached, target, digest) &&
      mirrors.length &&
      mirrors.every((row) => exactBody(row, target, digest))
      ? attached
      : undefined
  }

  // Intro prose may vary. Verify each unconditional nested declaration and its own body.
  const targetOf = (uid: unknown) =>
    typeof uid === 'string' ? decodeOptionalDeclaration(uid, 'subclassFeature')?.target : undefined
  const nestedFrom = (intro: SubclassFeature | undefined, target: string) => {
    if (
      !intro ||
      !hasFeatureSourceShape(intro, subclassFields) ||
      getSubclassFeatureIdentity(intro) !== owner.intro ||
      !Array.isArray(intro.entries)
    )
      return undefined
    const refs = intro.entries.map(record).filter((row) => targetOf(row.subclassFeature) === target)
    const ref = refs[0]
    const uid = ref?.subclassFeature
    return refs.length === 1 &&
      ref.type === 'refSubclassFeature' &&
      typeof uid === 'string' &&
      exactOptionalDeclarationReference(ref, uid, 'subclassFeature') &&
      Object.keys(ref).every(
        (key) => key === 'type' || key === 'subclassFeature' || key === 'feature',
      )
      ? (ref.feature as SubclassFeature | undefined)
      : undefined
  }
  const intro =
    targetOf(subclass.introFeatureRef) === owner.intro
      ? getDirectSubclassFeatureReference(subclass, owner.intro)?.feature
      : undefined
  const mirrors = candidates(owner.intro)
  const nested = owner.nested.flatMap((target, index) => {
    const digest = rules.nested[index]
    const feature =
      mirrors.length && mirrors.every((row) => exactBody(nestedFrom(row, target), target, digest))
        ? verified(nestedFrom(intro, target), target, digest)
        : undefined
    return feature ? [feature] : []
  })

  const direct = owner.direct.flatMap(({ target, level }, index) => {
    const gain = classTarget(
      source === 'phb' ? 'otherworldly patron feature' : 'subclass feature',
      source,
      level,
    )
    if (entry.levels < level || !matchesNativeSubclassGain(cls, gain, level, 'at-level')) return []
    const feature = verified(
      getDirectSubclassFeatureReference(subclass, target)?.feature,
      target,
      rules.direct[index],
    )
    return feature ? [feature] : []
  })
  return [...nested, ...direct]
}

export function getWarlockStaticFeatures(
  cls: Class5e,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const source = cls.source.trim().toLowerCase()
  if (
    (source !== 'phb' && source !== 'xphb') ||
    !Number.isInteger(entry.levels) ||
    entry.levels < 1 ||
    entry.levels > 20 ||
    cls.sourceIdentityConflict ||
    '_copy' in cls
  )
    return []

  const pact = getCurrentDirectClassFeature(
    cls,
    catalogs,
    classTarget('pact magic', source, 1),
    (feature) => !!getPactRecovery(feature, source),
  )
  const fixedClassFeatures = [
    ...(source === 'xphb' ? [['magical cunning', 2, magicalCunning] as const] : []),
    ['eldritch master', 20, bodies[source].master] as const,
  ].flatMap(([name, gain, digest]) => {
    if (entry.levels < gain) return []
    const feature = getCurrentDirectClassFeature(
      cls,
      catalogs,
      classTarget(name, source, gain),
      (row) =>
        hasFeatureSourceShape(row, classFields) &&
        Array.isArray(row.entries) &&
        getFeatureSourceDigest(row.entries, false) === digest,
    )
    return feature ? [feature] : []
  })
  return [
    ...(pact ? [{ ...pact, entries: getPactRecovery(pact, source) }] : []),
    ...fixedClassFeatures,
    ...getPatronStaticFeatures(cls, entry, catalogs, source),
  ]
}
