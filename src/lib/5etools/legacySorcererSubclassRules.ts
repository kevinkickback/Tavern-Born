import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

export const divineSoul = {
  name: 'Divine Soul',
  shortName: 'Divine Soul',
  source: 'XGE',
  schedule: '9a2c5a6998420ced7876b7aeffc299d26bddf32c59489dcbadd0e13af50bac7b',
} as const
const lunarSorcery = {
  name: 'Lunar Sorcery',
  shortName: 'Lunar',
  source: 'DSotDQ',
  schedule: 'c9c6f66fea05d8635f9244f20f4396db8a3a30a090ab52049a58033738bb9386',
} as const

type LegacySorcererSpec = typeof divineSoul | typeof lunarSorcery

export function getLegacySorcererSpec(entry: CharacterClassEntry) {
  if (norm(entry.name) !== 'sorcerer' || !['phb', 'xphb'].includes(norm(entry.source)))
    return undefined
  return [divineSoul, lunarSorcery].find(
    (spec) =>
      norm(entry.subclass) === norm(spec.name) && norm(entry.subclassSource) === norm(spec.source),
  )
}

function featureTarget(spec: LegacySorcererSpec, name: string, classSource: string, level: number) {
  return `subclass-feature|${norm(name)}|sorcerer|${norm(classSource)}|${norm(spec.shortName)}|${norm(spec.source)}|${level}|${norm(spec.source)}`
}

function exactBody(feature: SubclassFeature | undefined, target: string, digest: string) {
  return feature &&
    getSubclassFeatureIdentity(feature) === target &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    Array.isArray(feature.entries) &&
    getFeatureSourceDigest(feature.entries) === digest
    ? feature
    : undefined
}

function getCurrentLegacySorcererRules(cls: Class5e, subclass: Subclass5e) {
  const spec = getLegacySorcererSpec({
    name: cls.name,
    source: cls.source,
    subclass: subclass.name,
    subclassSource: subclass.source,
    levels: 1,
  })
  if (
    !spec ||
    subclass.sourceIdentityConflict ||
    typeof subclass.shortName !== 'string' ||
    norm(subclass.shortName) !== norm(spec.shortName) ||
    norm(subclass.className) !== 'sorcerer' ||
    norm(subclass.classSource) !== norm(cls.source)
  )
    return undefined
  const classic = norm(cls.source) === 'phb'
  const level = classic ? 1 : 3
  const gain = classic
    ? 'sorcerous origin|sorcerer|phb|1|phb'
    : 'sorcerer subclass|sorcerer|xphb|3|xphb'
  if (!matchesNativeSubclassGain(cls, `class-feature|${gain}`, level)) return undefined
  const copy = record(record(subclass)._copy)
  if (
    classic
      ? '_copy' in subclass
      : copy.name !== spec.name ||
        copy.shortName !== spec.shortName ||
        copy.source !== spec.source ||
        copy.className !== 'Sorcerer' ||
        copy.classSource !== 'PHB' ||
        copy._mod
  )
    return undefined
  const introTarget = featureTarget(spec, spec.name, cls.source, level)
  const intro = getDirectSubclassFeatureReference(subclass, introTarget)?.feature
  if (
    !intro ||
    getSubclassFeatureIdentity(intro) !== introTarget ||
    intro.sourceIdentityConflict ||
    intro.featureOptionSourceConflict ||
    intro.isClassFeatureVariant ||
    !Array.isArray(intro.entries)
  )
    return undefined
  const entries = intro.entries
  const getIntroFeature = (name: string, digest: string) => {
    const target = featureTarget(spec, name, 'PHB', 1)
    const matches = entries
      .map(record)
      .filter(
        (row) =>
          (typeof row.subclassFeature === 'string' &&
            decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')?.target === target) ||
          getSubclassFeatureIdentity(record(row.feature)) === target,
      )
    const ref = matches[0]
    if (
      matches.length !== 1 ||
      ref.type !== 'refSubclassFeature' ||
      typeof ref.subclassFeature !== 'string' ||
      decodeOptionalDeclaration(ref.subclassFeature, 'subclassFeature')?.target !== target ||
      !exactOptionalDeclarationReference(ref, ref.subclassFeature, 'subclassFeature') ||
      Object.keys(ref).some(
        (key) => key !== 'type' && key !== 'subclassFeature' && key !== 'feature',
      )
    )
      return undefined
    return exactBody(ref.feature as SubclassFeature | undefined, target, digest)
  }
  const getLaterFeature = (name: string, gainLevel: number, digest: string) => {
    const classGain = classic ? 'sorcerous origin feature' : 'subclass feature'
    const source = norm(cls.source)
    if (
      !matchesNativeSubclassGain(
        cls,
        `class-feature|${classGain}|sorcerer|${source}|${gainLevel}|${source}`,
        gainLevel,
        'at-level',
      )
    )
      return undefined
    const target = featureTarget(spec, name, 'PHB', gainLevel)
    return exactBody(getDirectSubclassFeatureReference(subclass, target)?.feature, target, digest)
  }
  const schedule = subclass.additionalSpells
  return {
    spec,
    level,
    introTarget,
    getIntroFeature,
    getLaterFeature,
    get blocks() {
      if (!Array.isArray(schedule)) return undefined
      if (getFeatureSourceDigest(schedule) === spec.schedule) return schedule
      if (spec !== lunarSorcery || schedule.length !== 1) return undefined
      // The catalog may list the separately verified Moon Fire cantrip in the schedule too.
      const [block] = schedule
      if (!block || typeof block !== 'object' || Array.isArray(block)) return undefined
      const known = block.known
      if (!known || typeof known !== 'object' || Array.isArray(known)) return undefined
      const first = known?.['1']
      if (!Array.isArray(first) || first[0] !== 'sacred flame#c') return undefined
      const phaseSpells = [{ ...block, known: { ...known, '1': first.slice(1) } }]
      return getFeatureSourceDigest(phaseSpells) === spec.schedule ? phaseSpells : undefined
    },
  }
}

export function getCurrentDivineMagic(cls: Class5e, subclass: Subclass5e) {
  const rules = getCurrentLegacySorcererRules(cls, subclass)
  if (rules?.spec !== divineSoul) return undefined
  const feature = rules.getIntroFeature(
    'Divine Magic',
    'b6eddb1ccf54188812393e9260484b39c0f747c2dba72919b175c8bc8ff56d13',
  )
  return feature ? { rules, feature } : undefined
}

export function getCurrentLunarSorcery(cls: Class5e, subclass: Subclass5e) {
  const rules = getCurrentLegacySorcererRules(cls, subclass)
  if (rules?.spec !== lunarSorcery) return undefined
  return {
    level: rules.level,
    schedule: rules.getIntroFeature(
      'Lunar Embodiment',
      '2f580d4834b7a556d90d93a0c68fbedf3e7ef664ab06207510ec02acc61bbff1',
    )
      ? rules.blocks
      : undefined,
    moonFire: rules.getIntroFeature(
      'Moon Fire',
      '1a23cc5c8046de591f3e421a199573654a5eda9f766a6f85cb3ca8e4771cb634',
    ),
    waxing: rules.getLaterFeature(
      'Waxing and Waning',
      6,
      '49730861cd19c34c934bfbb045c9b155ac73b49c3d2c1803f6fcba926e5b88c8',
    ),
  }
}
