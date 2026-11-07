import type { Class5e, SubclassFeature } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import { type ClassFeatureSourceCatalog, getFeatureSourceDigest } from './featureSourceAudit'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

const bodies = {
  'unarmored defense': {
    level: 1,
    phb: 'd0c8eef1dff22c23454626445a4e6132ddd47b9fbcca29ff67cc42ad68bd2ef7',
    xphb: 'febdc9af966cedb32391ce0821b3255a924ec358b9804def38fe226a1314de23',
  },
  'fast movement': {
    level: 5,
    phb: '63d434d23d878cb5229a377c5629eec8b22b8597901ea726ea75e390d5da0787',
    xphb: 'd2e75ec75537bf0b443cc1c2c3935ba1bf27f382a4c6c714e81ec2341013e21a',
  },
  'primal champion': {
    level: 20,
    phb: 'd07c51465cc211e3f1452fbf2b1e789d936572e9877f79a99ae469931d9d5d00',
    xphb: '9e9394ba9dbc70c594f0f20f7a5f3a0400a93b850060ddf314add7e7f41616ef',
  },
}

const zealotIntro = 'subclass-feature|path of the zealot|barbarian|xphb|zealot|xphb|3|xphb'
const warriorOfTheGods = 'subclass-feature|warrior of the gods|barbarian|xphb|zealot|xphb|3|xphb'
export const isRevisedZealotResourceSource = (target?: string) =>
  target === zealotIntro || target === warriorOfTheGods

export const BEAR_ASPECT_TARGET = 'subclass-feature|bear|barbarian|phb|totem warrior|phb|6|phb'
export const CLASSIC_ASPECT_TARGET =
  'subclass-feature|aspect of the beast|barbarian|phb|totem warrior|phb|6|phb'

export function hasCurrentBearAspect(
  candidates: ReadonlyMap<string, readonly SubclassFeature[]> | undefined,
) {
  const matches = (target: string, digest: string) => {
    const rows = candidates?.get(target)
    return (
      !!rows?.length &&
      rows.every(
        (row) =>
          !('_copy' in row) &&
          !row.sourceIdentityConflict &&
          !row.featureOptionSourceConflict &&
          !row.isClassFeatureVariant &&
          getSubclassFeatureIdentity(row) === target &&
          getFeatureSourceDigest(row.entries ?? []) === digest,
      )
    )
  }
  return (
    matches(
      BEAR_ASPECT_TARGET,
      '04ae4aade57a61887e9a3a8838da9dc5dd43cc174360fdf39f9feb11b315eca0',
    ) &&
    candidates
      ?.get(CLASSIC_ASPECT_TARGET)
      ?.every(
        (row) =>
          !row.sourceIdentityConflict &&
          !row.featureOptionSourceConflict &&
          !('_copy' in row) &&
          row.entries?.[0] ===
            'At 6th level, you gain a magical benefit based on the totem animal of your choice. You can choose the same animal you selected at 3rd level or a different one.',
      ) === true
  )
}

export function hasCurrentWarriorOfTheGods(cls: Class5e | undefined, entry: CharacterClassEntry) {
  if (
    !cls ||
    !findClassReference({ name: 'Barbarian', source: 'XPHB' }, [entry]) ||
    cls.name !== 'Barbarian' ||
    cls.source !== 'XPHB' ||
    entry.levels < 3 ||
    !findClassReference({ name: 'Path of the Zealot', source: 'XPHB' }, [
      { name: entry.subclass, source: entry.subclassSource },
    ]) ||
    !matchesNativeSubclassGain(cls, 'class-feature|barbarian subclass|barbarian|xphb|3|xphb', 3)
  )
    return false
  const paths = cls.subclasses?.filter((row) =>
    findClassReference({ name: 'Path of the Zealot', source: 'XPHB' }, [row]),
  )
  const path = paths?.[0]
  if (
    paths?.length !== 1 ||
    !path ||
    path._copy ||
    path.sourceIdentityConflict ||
    path.className !== 'Barbarian' ||
    path.classSource !== 'XPHB' ||
    path.shortName !== 'Zealot'
  )
    return false
  const exact = (feature: SubclassFeature | undefined, target: string, body: string) =>
    !!feature &&
    !('_copy' in feature) &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === target &&
    getFeatureSourceDigest(feature.entries ?? []) === body
  const intro = getDirectSubclassFeatureReference(path, zealotIntro)
  if (
    !intro ||
    intro.ref !== path.introFeatureRef ||
    !exact(
      intro.feature,
      zealotIntro,
      '02d022b05f0d99d119d8ebf74173481e595c35f99661001f3843a04fa35d018d',
    )
  )
    return false
  const refs = (intro.feature?.entries ?? [])
    .map(record)
    .filter(
      (row) =>
        row.type === 'refSubclassFeature' &&
        getSubclassFeatureIdentity(record(row.feature)) === warriorOfTheGods,
    )
  const ref = refs[0]
  return (
    refs.length === 1 &&
    typeof ref.subclassFeature === 'string' &&
    exactOptionalDeclarationReference(ref, ref.subclassFeature, 'subclassFeature') &&
    exact(
      ref.feature as SubclassFeature | undefined,
      warriorOfTheGods,
      'bec17aa3da085d7904fc57443ea7df57ab3aa9c0b0559d79ea6b9bac53b97181',
    )
  )
}

export function getCurrentBarbarianJourneyFeature(
  character: Character,
  catalogs: (ClassFeatureSourceCatalog & { classes?: readonly Class5e[] }) | undefined,
  name: keyof typeof bodies,
) {
  const owners = character.classProgression.filter(
    (row) => row.name.trim().toLowerCase() === 'barbarian',
  )
  if (!catalogs || owners.length !== 1 || owners[0].levels < bodies[name].level) return undefined
  const classes = catalogs.classes?.filter((row) => findClassReference(owners[0], [row]))
  if (classes?.length !== 1) return undefined
  const cls = classes[0]
  const source = cls.source.trim().toLowerCase()
  if (source !== 'phb' && source !== 'xphb') return undefined
  if (
    source === 'phb' &&
    name === 'unarmored defense' &&
    character.classProgression
      .slice(0, character.classProgression.indexOf(owners[0]))
      .some((entry) => {
        if (!findClassReference({ name: 'Monk', source: 'PHB' }, [entry]) || entry.levels < 1)
          return false
        const monk = catalogs.classes?.filter((row) => findClassReference(entry, [row]))
        return (
          monk?.length === 1 &&
          !!getCurrentDirectClassFeature(
            monk[0],
            catalogs,
            'class-feature|unarmored defense|monk|phb|1|phb',
          )
        )
      })
  )
    return undefined
  const spec = bodies[name]
  const target = `class-feature|${name}|barbarian|${source}|${spec.level}|${source}`
  const feature = getCurrentDirectClassFeature(
    cls,
    catalogs,
    target,
    (row) => !('_copy' in row) && getFeatureSourceDigest(row.entries ?? []) === spec[source],
  )
  return feature ? { feature, target, source } : undefined
}
