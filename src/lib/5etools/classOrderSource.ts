import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import type { ClassOrder, ClassOrderBranch } from './classOrderIdentity'
import { featureOptionRulesSignature } from './featureRulesSignature'
import { type ClassFeatureSourceCatalog, hasFeatureSourceShape } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject,
} from './optionalClassDeclarationStructure'

// The choose-one block is structured. The benefits are authored in prose in both catalogs.
const bodies: Record<string, string> = {
  Protector:
    'Trained for battle, you gain proficiency with {@filter Martial weapons|items|type=martial weapon} and training with {@filter Heavy armor|items|type=Heavy Armor}.',
  Thaumaturge:
    'You know one extra cantrip from the {@filter Cleric spell list|spells|class=Cleric}. In addition, your mystical connection to the divine gives you a bonus to your Intelligence ({@skill Arcana|XPHB} or {@skill Religion|XPHB}) checks. The bonus equals your Wisdom modifier (minimum of +1).',
  Warden:
    'Trained for battle, you gain proficiency with {@filter Martial weapons|items|type=martial weapon} and training with {@filter Medium armor|items|type=Medium Armor}.',
  Magician:
    'You know one extra cantrip from the {@filter Druid spell list|spells|class=Druid}. In addition, your mystical connection to nature gives you a bonus to your Intelligence ({@skill Arcana|XPHB} or {@skill Nature|XPHB}) checks. The bonus equals your Wisdom modifier (minimum bonus of +1).',
}
const fields = new Set([
  'name',
  'className',
  'classSource',
  'source',
  'level',
  'entries',
  'page',
  'srd52',
  'basicRules2024',
])

function matches(feature: ClassFeature, target: string) {
  return getClassFeatureIdentity(feature) === target && hasFeatureSourceShape(feature, fields)
}

function current(catalogs: ClassFeatureSourceCatalog, target: string) {
  const candidates = catalogs.classFeatureCandidates
    ? catalogs.classFeatureCandidates.get(target)
    : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
  return candidates?.length === 1 && matches(candidates[0], target) ? candidates[0] : undefined
}

const isUid = (uid: unknown, target: string): uid is string =>
  typeof uid === 'string' &&
  [4, 5].includes(uid.split('|').length) &&
  decodeOptionalDeclaration(uid, 'classFeature')?.target === target

function matchesOrder(feature: ClassFeature, order: ClassOrder) {
  const [intro, group] = feature.entries ?? []
  const children = optionalDeclarationObject(group).entries
  const options = Array.isArray(children) ? children[0] : undefined
  const block = optionalDeclarationObject(options)
  if (!Array.isArray(block.entries) || block.entries.length !== 2) return false
  const expected =
    order.owner === 'cleric' ? [order.training, order.caster] : [order.caster, order.training]
  const entries = expected.map((branch, index) => {
    const ref = optionalDeclarationObject((block.entries as unknown[])[index])
    const uid = ref.classFeature
    if (
      !isUid(uid, branch.target) ||
      ref.sourceIdentityConflict ||
      !exactOptionalDeclarationReference(ref, uid, 'classFeature')
    )
      return undefined
    return { type: 'refClassFeature', classFeature: uid }
  })
  return (
    entries.every(Boolean) &&
    intro === 'You have dedicated yourself to one of the following sacred roles of your choice.' &&
    featureOptionRulesSignature(feature.entries ?? []) ===
      featureOptionRulesSignature([
        intro,
        { type: 'entries', entries: [{ type: 'options', count: 1, entries }] },
      ])
  )
}

export function getCurrentClassOrderOption(
  catalogs: (ClassFeatureSourceCatalog & { classes?: readonly Class5e[] }) | undefined,
  order: ClassOrder,
  branch: ClassOrderBranch,
) {
  const classes = catalogs?.classes?.filter(
    (row) => norm(row.name) === order.owner && norm(row.source) === 'xphb',
  )
  const owner = classes?.length === 1 ? classes[0] : undefined
  if (!catalogs || !owner || owner.sourceIdentityConflict || owner._copy) return undefined
  const isBranchTarget = (target: string | undefined) =>
    target === order.training.target || target === order.caster.target
  const isBranchUid = (uid: unknown) =>
    typeof uid === 'string' &&
    isBranchTarget(decodeOptionalDeclaration(uid, 'classFeature')?.target)
  if (
    owner.classFeatures?.some(
      (row) => isBranchUid(row) || isBranchUid(optionalDeclarationObject(row).classFeature),
    ) ||
    owner.classFeatureRefs?.some(
      (row) => isBranchUid(row.ref) || isBranchTarget(getClassFeatureIdentity(row)),
    )
  )
    return undefined
  const isOrderUid = (uid: unknown): uid is string => isUid(uid, order.target)
  const choices = owner.normalizedRules?.choices.filter((row) => row.id === order.id)
  const choice = choices?.length === 1 ? choices[0] : undefined
  if (
    !choice ||
    choice.kind !== 'class-feature' ||
    choice.level !== 1 ||
    choice.owner.type !== 'class' ||
    norm(choice.owner.name) !== order.owner ||
    norm(choice.owner.source) !== 'xphb' ||
    !isOrderUid(/^classFeatureRefs:(.+):entries$/.exec(choice.source.field)?.[1])
  )
    return undefined
  const raw = owner.classFeatures?.filter(
    (row) => isOrderUid(row) || isOrderUid(optionalDeclarationObject(row).classFeature),
  )
  if (raw?.length !== 1 || !isOrderUid(raw[0])) return undefined
  const gains = owner.classFeatureRefs?.filter(
    (row) => isOrderUid(row.ref) || getClassFeatureIdentity(row) === order.target,
  )
  const gain = gains?.length === 1 ? gains[0] : undefined
  const root = current(catalogs, order.target)
  const leaf = current(catalogs, order[branch].target)
  return gain?.feature &&
    isOrderUid(gain.ref) &&
    !gain.gainSubclassFeature &&
    exactOptionalDeclarationReference(optionalDeclarationObject(gain), gain.ref, 'classFeature') &&
    matches(gain.feature, order.target) &&
    matchesOrder(gain.feature, order) &&
    root &&
    matchesOrder(root, order) &&
    leaf?.entries?.length === 1 &&
    leaf.entries[0] === bodies[order[branch].name]
    ? leaf
    : undefined
}
