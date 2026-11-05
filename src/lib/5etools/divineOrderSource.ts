import type { Class5e, ClassFeature } from '@/types/5etools'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import {
  DIVINE_ORDER_ID,
  DIVINE_ORDER_OPTIONS,
  DIVINE_ORDER_TARGET,
  type DivineOrderOption,
  divineOrderKey,
} from './divineOrderIdentity'
import { featureOptionRulesSignature } from './featureRulesSignature'
import { type ClassFeatureSourceCatalog, hasFeatureSourceShape } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject,
} from './optionalClassDeclarationStructure'

// These clauses have no structured grant values in either supported 5etools document.
// Exact whole-body comparison prevents silently applying them after the source adds conditions.
const bodies = {
  protector:
    'Trained for battle, you gain proficiency with {@filter Martial weapons|items|type=martial weapon} and training with {@filter Heavy armor|items|type=Heavy Armor}.',
  thaumaturge:
    'You know one extra cantrip from the {@filter Cleric spell list|spells|class=Cleric}. In addition, your mystical connection to the divine gives you a bonus to your Intelligence ({@skill Arcana|XPHB} or {@skill Religion|XPHB}) checks. The bonus equals your Wisdom modifier (minimum of +1).',
} as const
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
const orderSignature = featureOptionRulesSignature([
  'You have dedicated yourself to one of the following sacred roles of your choice.',
  {
    type: 'entries',
    entries: [
      {
        type: 'options',
        count: 1,
        entries: ['Protector', 'Thaumaturge'].map((name) => ({
          type: 'refClassFeature',
          classFeature: `${name}|Cleric|XPHB|1|XPHB`,
        })),
      },
    ],
  },
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

export function hasCurrentDivineOrderBenefit(
  catalogs: ClassFeatureSourceCatalog & { classes?: readonly Class5e[] },
  branch: DivineOrderOption,
) {
  const classes = catalogs.classes?.filter(
    (row) => divineOrderKey(row.name) === 'cleric' && divineOrderKey(row.source) === 'xphb',
  )
  const owner = classes?.length === 1 ? classes[0] : undefined
  if (!owner || owner.sourceIdentityConflict || owner._copy) return false
  const orderUid = (uid: unknown) =>
    typeof uid === 'string' &&
    decodeOptionalDeclaration(uid, 'classFeature')?.target === DIVINE_ORDER_TARGET
  const choices = owner.normalizedRules?.choices.filter((row) => row.id === DIVINE_ORDER_ID)
  const choice = choices?.length === 1 ? choices[0] : undefined
  if (
    !choice ||
    choice.kind !== 'class-feature' ||
    choice.level !== 1 ||
    choice.owner.type !== 'class' ||
    divineOrderKey(choice.owner.name) !== 'cleric' ||
    divineOrderKey(choice.owner.source) !== 'xphb' ||
    !orderUid(/^classFeatureRefs:(.+):entries$/.exec(choice.source.field)?.[1])
  )
    return false
  const raw = owner.classFeatures?.filter(
    (row) => orderUid(row) || orderUid(optionalDeclarationObject(row).classFeature),
  )
  if (raw?.length !== 1 || !orderUid(raw[0])) return false
  const gains = owner.classFeatureRefs?.filter(
    (row) => orderUid(row.ref) || getClassFeatureIdentity(row) === DIVINE_ORDER_TARGET,
  )
  const gain = gains?.length === 1 ? gains[0] : undefined
  const order = current(catalogs, DIVINE_ORDER_TARGET)
  const leaf = current(catalogs, DIVINE_ORDER_OPTIONS[branch])
  return !!(
    gain?.feature &&
    orderUid(gain.ref) &&
    !gain.gainSubclassFeature &&
    exactOptionalDeclarationReference(optionalDeclarationObject(gain), gain.ref, 'classFeature') &&
    matches(gain.feature, DIVINE_ORDER_TARGET) &&
    featureOptionRulesSignature(gain.feature.entries ?? []) === orderSignature &&
    order &&
    featureOptionRulesSignature(order.entries ?? []) === orderSignature &&
    leaf?.entries?.length === 1 &&
    leaf.entries[0] === bodies[branch]
  )
}
