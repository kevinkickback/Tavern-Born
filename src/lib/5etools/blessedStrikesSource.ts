import type { Class5e, ClassFeature, ClassFeatureReference } from '@/types/5etools'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'
import { getNormalizedClassChoiceId } from './classChoiceId'
import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'
import { featureOptionRulesSignature } from './featureRulesSignature'
import {
  type ClassFeatureSourceCatalog,
  getFeatureSourceDigest,
  hasFeatureSourceShape,
} from './featureSourceAudit'

const owner = { type: 'class' as const, name: 'Cleric', source: 'XPHB' }
const level = 7
const name = 'Blessed Strikes'
const improvedName = 'Improved Blessed Strikes'
const target = (name: string, gain: number) =>
  `class-feature|${name.toLowerCase()}|cleric|xphb|${gain}|xphb`

export const BLESSED_STRIKES_ID = getNormalizedClassChoiceId(owner, name, level)
export const BLESSED_STRIKES_TARGET = target(name, level)
export const IMPROVED_BLESSED_STRIKES_TARGET = target(improvedName, 14)

// Both source documents agree on these bodies. Presentation reads the live
// source entries after verifying their meaning and ownership.
const introDigest = 'c42025301f0c0a406eb719229dba77bb3616cb0e6f8f6eed0f69d95e1afc2fc6'
const upgradeDigest = 'd84daa5e58aabe1e48fad2cd59bcaeeb6283ba27875f0b1dfe334a93134f30c8'
const optionDigests = new Map([
  [
    target('Divine Strike', level),
    'd0d77f40c929406b35055b19075a9a3af96506aeee4a5bcba9cab3b051d7d039',
  ],
  [
    target('Potent Spellcasting', level),
    'f23e0eb12eafd21c13f4c135b0419fbe40522535a65e594f76a0ffa943412a3e',
  ],
])
const featureFields = new Set([
  'name',
  'className',
  'classSource',
  'source',
  'level',
  'entries',
  'page',
  'header',
  'srd52',
  'basicRules2024',
])
const norm = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
const signature = (entries: unknown[]) => featureOptionRulesSignature(entries, false)
const asRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

function uidTarget(uid: unknown) {
  return typeof uid === 'string' && [4, 5].includes(uid.split('|').length)
    ? getClassFeatureIdentity(decodeClassFeatureReference(uid))
    : undefined
}

function rawGainTarget(row: unknown) {
  return uidTarget(row) ?? uidTarget(asRecord(row)?.classFeature)
}

function isOptionTarget(identity: string | undefined) {
  return identity !== undefined && optionDigests.has(identity)
}

function matchesFeature(feature: ClassFeature, identity: string) {
  return (
    getClassFeatureIdentity(feature) === identity && hasFeatureSourceShape(feature, featureFields)
  )
}

export function isBlessedStrikesOptionTarget(identity: string) {
  return optionDigests.has(identity)
}

/** The pinned sources use a plain reference list; only this exact clause makes it a choice. */
export function getBlessedStrikesOptionBlock(feature: ClassFeature | undefined) {
  if (!feature || !matchesFeature(feature, BLESSED_STRIKES_TARGET)) return undefined
  const entries = feature.entries
  const group = asRecord(entries?.[1])
  if (
    entries?.length !== 2 ||
    getFeatureSourceDigest([entries[0]]) !== introDigest ||
    group?.type !== 'entries' ||
    Object.keys(group).length !== 2 ||
    !Array.isArray(group.entries) ||
    group.entries.length !== optionDigests.size
  )
    return undefined
  const options = group.entries.map(asRecord)
  const identities = options.map((row) =>
    row?.type === 'refClassFeature' && Object.keys(row).length === 2
      ? uidTarget(row.classFeature)
      : undefined,
  )
  if (
    new Set(identities).size !== optionDigests.size ||
    !identities.every((identity) => identity && optionDigests.has(identity))
  )
    return undefined
  return { type: 'options', count: 1, entries: group.entries }
}

export function isBlessedStrikesOption(option: NormalizedChoiceOptionReference) {
  const identity = uidTarget(option.ref)
  return !!(
    identity &&
    optionDigests.has(identity) &&
    option.entityType === 'classFeature' &&
    getClassFeatureIdentity({
      name: option.name,
      source: option.source,
      className: owner.name,
      classSource: owner.source,
      level,
    }) === identity &&
    norm(option.source) === 'xphb'
  )
}

export function getSavedBlessedStrikes(selections: readonly CharacterClassChoiceSelection[]) {
  const rows = selections.filter((row) => row.choiceId === BLESSED_STRIKES_ID)
  if (rows.length !== 1) return undefined
  const selection = rows[0]
  const [option] = selection.selected
  return selection.kind === 'class-feature' &&
    selection.classLevel === level &&
    norm(selection.className) === 'cleric' &&
    norm(selection.classSource) === 'xphb' &&
    selection.subclassName === undefined &&
    selection.subclassSource === undefined &&
    selection.selected.length === 1 &&
    option.slotLevel === level &&
    isBlessedStrikesOption(option)
    ? selection
    : undefined
}

function getCurrentFeature(catalogs: ClassFeatureSourceCatalog, identity: string) {
  const rows = catalogs.classFeatureCandidates
    ? catalogs.classFeatureCandidates.get(identity)
    : catalogs.classFeatures.filter((feature) => getClassFeatureIdentity(feature) === identity)
  const feature = rows?.length === 1 ? rows[0] : undefined
  return feature && matchesFeature(feature, identity) ? feature : undefined
}

function getGain(
  cleric: Class5e,
  identity: string,
  catalogs: ClassFeatureSourceCatalog,
): ClassFeature | undefined {
  const raw = cleric.classFeatures?.filter((row) => rawGainTarget(row) === identity)
  if (raw?.length !== 1 || uidTarget(raw[0]) !== identity) return undefined
  const refs = cleric.classFeatureRefs?.filter(
    (row) => uidTarget(row.ref) === identity || getClassFeatureIdentity(row) === identity,
  )
  const ref: ClassFeatureReference | undefined = refs?.length === 1 ? refs[0] : undefined
  const feature = getCurrentFeature(catalogs, identity)
  if (
    !ref?.feature ||
    !feature ||
    ref.gainSubclassFeature ||
    uidTarget(ref.ref) !== identity ||
    getClassFeatureIdentity(ref) !== identity ||
    !matchesFeature(ref.feature, identity) ||
    signature(ref.feature.entries ?? []) !== signature(feature.entries ?? [])
  )
    return undefined
  return feature
}

export function getCurrentBlessedStrikes(
  catalogs: (ClassFeatureSourceCatalog & { classes?: readonly Class5e[] }) | undefined,
) {
  const classes = catalogs?.classes?.filter(
    (row) => norm(row.name) === 'cleric' && norm(row.source) === 'xphb',
  )
  const cleric = classes?.length === 1 ? classes[0] : undefined
  if (!catalogs || !cleric || cleric.sourceIdentityConflict || cleric._copy) return undefined
  if (
    cleric.classFeatures?.some((row) => isOptionTarget(rawGainTarget(row))) ||
    cleric.classFeatureRefs?.some(
      (row) => isOptionTarget(uidTarget(row.ref)) || isOptionTarget(getClassFeatureIdentity(row)),
    )
  )
    return undefined
  const root = getGain(cleric, BLESSED_STRIKES_TARGET, catalogs)
  if (!root || !getBlessedStrikesOptionBlock(root)) return undefined
  for (const [optionTarget, digest] of optionDigests) {
    const feature = getCurrentFeature(catalogs, optionTarget)
    if (!feature?.entries || getFeatureSourceDigest(feature.entries) !== digest) return undefined
  }
  const upgrade = getGain(cleric, IMPROVED_BLESSED_STRIKES_TARGET, catalogs)?.entries
  const children = asRecord(upgrade?.[1])?.entries
  const upgradeAvailable =
    !!upgrade && Array.isArray(children) && getFeatureSourceDigest(upgrade, false) === upgradeDigest
  return {
    rootIntro: root.entries?.[0],
    upgradeAvailable,
    improvementFor(option: NormalizedChoiceOptionReference) {
      if (!upgradeAvailable || !isBlessedStrikesOption(option)) return []
      const selected = children.find(
        (entry: unknown) => norm(asRecord(entry)?.name) === norm(option.name),
      )
      return selected ? [upgrade[0], selected] : []
    },
  }
}
