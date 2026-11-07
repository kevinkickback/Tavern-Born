import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Spell5e, Subclass5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import includedProofs from './clericDomainIncludedSrdSpells.json' with { type: 'json' }
import { getFeatureSourceDigest } from './featureSourceAudit'
import { getIncludedSrdSpellDigest } from './includedSrdSpellProof'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain, matchesNativeSubclassGain } from './nativeSubclassGain'
import { decodeOptionalDeclaration } from './optionalClassDeclarationStructure'

// The configured revised domains inherit the classic spell table through an authored copy.
const domains = [
  [
    'Arcana Domain',
    'Arcana',
    'SCAG',
    '3a7f7e658e77094dd3815e4ab63c942e26b1aeba096edf7150c32253a0429e30',
    '58f55716eec8ee6f65523cd8039f3a787f7783c370374c9d02da172cc07271a2',
    '16c0e61929e6eb52542f8c9ee13f141b446360ed956d32e563fd416a0b024e24',
    'fafa83863ab2822f1821dc1f6e3c3140e2b68450ffef470cdd7874de9e019e1d',
  ],
  [
    'Knowledge Domain',
    'Knowledge',
    'PHB',
    '470d0f4648ad721b6cf2d2e745b4d578f1192eb1598a2b044db6a13dfc51a02b',
    '1d7045059bbf0bf0e59a12c9059110f668ac6c713b8e94cf3b773159f5550ed5',
    '5b5f3b7459ca1505b80301ca924bffbce7ae014edc48cd21856ef1155e1cbc62',
    '44caba490a65232e344b16f23e7493a61f3640d89028af1413176cb387dd677a',
  ],
  [
    'Grave Domain',
    'Grave',
    'XGE',
    '39b66c5644225bc0aa9b77e646bed2f167c3970389f468c614debe8f503a7a04',
    '103fa8bb83e2799e6943b766a0a9e99965aa0f8262926039f8cd514349da20ff',
    '521fd3bdc0c34e1eca6e4e35f00226f80a57f0450b5ad3d51c03e272efe97626',
    '44f980655d9a55479beb390969f3e96f1f0abb7c56346679c960d5adbb2c70ae',
  ],
  [
    'Nature Domain',
    'Nature',
    'PHB',
    '84820f90edbb30f109918466ca957a09a7f352431e80685d24da033f1fbdfc4f',
    'a13029ba8f1aa44abc0c408161e4c8fd186875f116fa8970c65fea8b1784cbc5',
    '9636595bc21bc50addb97811bf96056cef85b1b475f878fa5391fc9523a62e26',
    'fb7c5aae883d83c63c260889e951ee41d523f2a4ac9cbac439fa0d1c36661730',
  ],
  [
    'Tempest Domain',
    'Tempest',
    'PHB',
    'f5b9a1c45cf82a4d7307b81bdd090250d5649d4a9a08f44e4d012bf85e939018',
    'f36109bb6f1cefd67eda2d03313ba48b7e6e53d450f7a7da067aad65886879a6',
    '819d57f2220a076eb893250916e2040d8b8fd2cba92b9ef1f525c080ada5c2f0',
    '718a3e6749f538d48c5f543a13127a29ff2c2fa134ce65f570371ebb820b5f16',
  ],
  [
    'Ambition Domain (PSA)',
    'Ambition (PSA)',
    'PSA',
    'd2120120d5564203fb9ab5a51ec85fb7fc5543759381cf3aefc1998c9818a5b4',
    '6b29b7ef161e72ac2ae194d9c349bb75aeb97508cb4e170a48635c3162b94b01',
    'e2d0048057c1110100b099615fa023f8ff0bec80a1a21a9f139bc607f91241c9',
    'ba5ec8797723fe29eb0a33bea3b3aafb7f601b2b971daaf72f138958777b6886',
  ],
  [
    'Knowledge Domain (PSA)',
    'Knowledge (PSA)',
    'PSA',
    '470d0f4648ad721b6cf2d2e745b4d578f1192eb1598a2b044db6a13dfc51a02b',
    '6ae0e622b6e249a1681ae2f67f4939871f14ae106c0805d66e4a39d186a5a1f8',
    '398c42be1e4e662fa042c7e52ffefdfbf182a6da17fbdf39e16d7a800d1b4f4b',
    'b59d7341d0044e96be6fb44c47b1bfb62a56720d818626970a836a287ed55910',
  ],
  [
    'Solidarity Domain (PSA)',
    'Solidarity (PSA)',
    'PSA',
    '4fe6f223146e19533d4ade5c3f3142513874f635af2c1205cf777516332151c6',
    '8d88b3dbdcc2c8ef1fe191e02e46b7bacda9eee37e203d2b92022906c64a6fa5',
    '312f235dad6233322cc8cb16a66090cdbfc1d6ee7a8d8379cad31aa32f8ba686',
    '20950645bf9b6b8d5869f9961e07ab2ea0580f89921104630dc6d71767b8d14a',
  ],
  [
    'Strength Domain (PSA)',
    'Strength (PSA)',
    'PSA',
    '8048c3a0f4f2c464059c76e6a802b237aeb0d4dd7527b25690b0748994cabd81',
    '28dac83f6ac1c0f44cf5e4c861e5f375da79279842bef3f3c71c6bc53110f0e6',
    '7a262d5e7f221c2abb11f93a277bc498acc15bc4bd2f23d419237d881a565a5f',
    'f4f33e1dde537d0f830c66affa033934d8d40f49f3b870383b111ea9c7e77d2f',
  ],
  [
    'Zeal Domain (PSA)',
    'Zeal (PSA)',
    'PSA',
    '7e2639ffef5a97e932fc68b3cab21ed7a46d6ad5041ae8e464cacdd21b64b64d',
    '52d3ddbf97242295be94eed2cad7d0ff94d22dcbee5d758ec183819dae1a73ef',
    '480ceaebec0056857937b1066c50498b3d0033d98e2f02eee3f84de891c5d548',
    'f899a521908ba4635747ed1ba13a1251fcf2a76560a704db658a4b90d872497e',
  ],
  [
    'Forge Domain',
    'Forge',
    'XGE',
    'aeb10ac19cd572ab0397947e21afedee9aa057095cb4c26d36e25bffdb18ca3a',
    '933917076e840efd5d2ad33676012b2a79ccfc826af3c1e46c702aa4f109e2b7',
    '17c24675ffbda9ddb4967cd026479529c98c5f34a0cce2a5222092028e370308',
    'a6ee0d2ba548914b4f3b44c4e6612624c664f05ee8f63e197367cec82d21de3d',
  ],
  [
    'Order Domain',
    'Order',
    'TCE',
    '1fe9117837c60113f63507ae181ca292a663012968248bbf5e868d95253ea3e4',
    '85ac2ee5eacc95cf259eb68d5dcf9e9e33daf5af02c7de1a8b7fd7fd4a0302fb',
    '6b30c213993bfcd43da38297ac012c8e0fd85e5b08763a2ff91d4d46f754d8dd',
    '6698b379a3a2d44b4c1d36b7150f8decdc9b767a1487b459147d2fc9b423c3a4',
  ],
  [
    'Peace Domain',
    'Peace',
    'TCE',
    'c254e958e0159ccfec5fb8df8a33c9c8e67bfa3adda8baf117746b05a54d1ace',
    'ccaf6d4d982400f42d168f02df21ec7b0155e0808ccac43d1046ef84eac11d56',
    '2f1bc5631b2dfb7b8740073a864665811b415dc9d8d336363184aba98bf9ff08',
    'bb6649e7c42a962ec9c12371aa4a0123459073ccd85742a5582ef3e3e562a1a2',
  ],
  [
    'Twilight Domain',
    'Twilight',
    'TCE',
    'ddfc0162007ef51b6ac85e49510332513cf3efadb24090fd47955b92a5dd79f0',
    'd05b3cb5419005f56077d90c9cf97bba707cd37208b2981a1e052439fd8bc27d',
    'fcaec9f7309076e37f72ad46470b31e64a4ee06c974708e249c4be8a6311db7a',
    '9a418c05d23287f06d0ba45226793fed9747cc8e2cde47a73a47f5c0bfde2e51',
  ],
].map(([name, shortName, source, schedule, body, revisedRoot, revisedIntro]) => ({
  name,
  shortName,
  source,
  schedule,
  body,
  revisedRoot,
  revisedIntro,
}))

function findDomain(name: unknown, source: unknown) {
  if (typeof name !== 'string' || typeof source !== 'string') return undefined
  return domains.find(
    (rule) => norm(rule.name) === norm(name) && norm(rule.source) === norm(source),
  )
}

function introTarget(rule: (typeof domains)[number], revised: boolean, level = revised ? 3 : 1) {
  const source = norm(rule.source)
  return `subclass-feature|${norm(rule.name)}|cleric|${revised ? 'xphb' : 'phb'}|${norm(rule.shortName)}|${source}|${level}|${source}`
}

export const isRevisedInheritedDomainOwner = (entry: CharacterClassEntry) =>
  norm(entry.name) === 'cleric' &&
  norm(entry.source) === 'xphb' &&
  !!findDomain(entry.subclass, entry.subclassSource)

export const INHERITED_DOMAIN_SPELLS = 'inherited-domain-spells'
const includedClassicRecords = new Map(Object.entries(includedProofs))

/** These exact Included SRD records omit the configured source's editorial reprint field. */
export function getIncludedDomainSpellReprints(
  spells: Readonly<Record<string, Spell5e>> | undefined,
) {
  const proofs = new Map<string, number | undefined>()
  for (const spell of Object.values(spells ?? {})) {
    if (norm(spell.source) !== 'phb') continue
    const expected = includedClassicRecords.get(norm(spell.name))
    if (!expected) continue
    const key = getSpellReferenceKey(spell.name, 'XPHB')
    const valid = !proofs.has(key) && getIncludedSrdSpellDigest(spell) === expected
    proofs.set(key, valid ? spell.level : undefined)
  }
  return proofs
}

export function auditInheritedDomainSpellRoots(
  raw: readonly Record<string, unknown>[],
  materialized: readonly Record<string, unknown>[],
  features: readonly Record<string, unknown>[],
) {
  return materialized.map((row, index) => {
    const rule =
      row.className === 'Cleric' && row.classSource === 'XPHB' && findDomain(row.name, row.source)
    if (!rule) return row
    const classicRoots = raw.filter(
      (base) =>
        base.name === rule.name &&
        base.shortName === rule.shortName &&
        base.source === rule.source &&
        base.className === 'Cleric' &&
        base.classSource === 'PHB',
    )
    const classic = features.filter(
      (feature) => getSubclassFeatureIdentity(feature) === introTarget(rule, false),
    )
    const authored = raw[index]
    const declared = Array.isArray(authored.subclassFeatures) ? authored.subclassFeatures : []
    const introductions = declared.flatMap((uid) => {
      if (typeof uid !== 'string') return []
      const ref = decodeOptionalDeclaration(uid, 'subclassFeature')
      const gain = ref?.decoded.level
      return gain && ref.target === introTarget(rule, true, gain)
        ? [{ uid, gain, target: ref.target }]
        : []
    })
    const [intro] = introductions
    if (introductions.length !== 1) return { ...row, sourceIdentityConflict: true }
    const revised = features.filter(
      (feature) => getSubclassFeatureIdentity(feature) === intro.target,
    )
    const proofLevel = 3
    const parts = intro.uid.split('|')
    parts[5] = String(proofLevel)
    // Retain exact copy proof while allowing the authored intro UID and record to move together.
    const rootProof = {
      ...authored,
      subclassFeatures: declared.map((uid) => (uid === intro.uid ? parts.join('|') : uid)),
    }
    const valid =
      classicRoots.length === 1 &&
      !('_copy' in classicRoots[0]) &&
      classic.length === 1 &&
      !('_copy' in classic[0]) &&
      Array.isArray(classic[0].entries) &&
      getFeatureSourceDigest(classic[0].entries) === rule.body &&
      revised.length === 1 &&
      getFeatureSourceDigest([{ ...revised[0], level: proofLevel }], false) === rule.revisedIntro &&
      getFeatureSourceDigest([rootProof], false) === rule.revisedRoot
    return valid ? row : { ...row, sourceIdentityConflict: true }
  })
}

export function hasRevisedInheritedDomainSpells(cls: Class5e, subclass: Subclass5e) {
  const rule = findDomain(subclass.name, subclass.source)
  const blocks = subclass.additionalSpells ?? []
  if (!rule || !Array.isArray(blocks) || !hasRevisedInheritedDomainSpellRoot(cls, subclass))
    return false
  // The independently parsed choices do not authenticate fixed prepared grants.
  const fixed = ['Arcana', 'Nature', 'Strength (PSA)'].includes(rule.shortName)
    ? blocks.map((block) => ({
        prepared: Object.fromEntries(
          Object.entries(block?.prepared ?? {}).flatMap(([level, spells]) => {
            const grants = Array.isArray(spells)
              ? spells.filter((spell) => typeof spell === 'string')
              : []
            return grants.length ? [[level, grants]] : []
          }),
        ),
      }))
    : blocks
  return getFeatureSourceDigest(fixed) === rule.schedule
}

export function hasRevisedInheritedDomainSpellRoot(cls: Class5e, subclass: Subclass5e) {
  const rule = findDomain(subclass.name, subclass.source)
  const gain = getCurrentNativeSubclassGain(cls)?.level
  if (
    !rule ||
    cls.name !== 'Cleric' ||
    cls.source !== 'XPHB' ||
    subclass.className !== 'Cleric' ||
    subclass.classSource !== 'XPHB' ||
    subclass.shortName !== rule.shortName ||
    subclass.sourceIdentityConflict ||
    !subclass._copy ||
    !gain
  )
    return false
  const target = introTarget(rule, true, gain)
  return !!getExactClericDomainIntro(subclass, target, rule.body)
}

export function getExactClericDomainIntro(
  subclass: Subclass5e,
  target: string,
  body: string,
  normalize: (entries: unknown[]) => unknown[] = (entries) => entries,
) {
  const ref = getDirectSubclassFeatureReference(subclass, target)
  const feature = ref?.feature
  return feature &&
    ref.ref === subclass.introFeatureRef &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === target &&
    Array.isArray(feature.entries) &&
    getFeatureSourceDigest(normalize(feature.entries)) === body
    ? feature
    : undefined
}

export function hasClassicZealSpellRestriction(cls: Class5e, subclass: Subclass5e) {
  const rule = findDomain(subclass.name, subclass.source)
  return (
    rule?.shortName === 'Zeal (PSA)' &&
    cls.name === 'Cleric' &&
    cls.source === 'PHB' &&
    subclass.className === 'Cleric' &&
    subclass.classSource === 'PHB' &&
    subclass.shortName === rule.shortName &&
    !subclass._copy &&
    !subclass.sourceIdentityConflict &&
    getFeatureSourceDigest(subclass.additionalSpells ?? []) === rule.schedule &&
    matchesNativeSubclassGain(cls, 'class-feature|divine domain|cleric|phb|1|phb', 1) &&
    !!getExactClericDomainIntro(subclass, introTarget(rule, false), rule.body)
  )
}
