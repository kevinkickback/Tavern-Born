import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { CONDITIONAL_PROFICIENCY_RULES } from './conditionalProficiencyRules'
import type { SubclassProficiencyCheckpoint } from './subclassProficiencyCertificates'
import generated from './subclassProficiencyCertificates.generated'
// The generator validates four-part owners. Inferred arrays do not preserve those tuples.
export const SUBCLASS_PROFICIENCY_CHECKPOINT = generated as unknown as SubclassProficiencyCheckpoint
export const SUBCLASS_PROFICIENCY_PACKAGES = SUBCLASS_PROFICIENCY_CHECKPOINT.packages ?? []
export const SUBCLASS_PROFICIENCY_ROOTS = [
  ...SUBCLASS_PROFICIENCY_CHECKPOINT.roots,
  ...SUBCLASS_PROFICIENCY_PACKAGES.flatMap((source) => source.roots),
]
const roots = new Map(SUBCLASS_PROFICIENCY_ROOTS.map((root) => [JSON.stringify(root.owner), root]))
export const getSubclassProficiencyRootCertificate = (owner: readonly string[]) =>
  roots.get(JSON.stringify(owner))

const conditionalTargets = new Set(CONDITIONAL_PROFICIENCY_RULES.map((rule) => rule.target))
const consumedTargets = (conditional: boolean) =>
  new Set(
    SUBCLASS_PROFICIENCY_ROOTS.flatMap((root) => {
      const paths = root.paths.filter((path) => conditionalTargets.has(path.target) === conditional)
      return paths.length ? [root.intro, ...paths.flatMap((path) => path.refs)] : []
    }).map((uid) => getSubclassFeatureIdentity(decodeSubclassFeatureReference(uid))),
  )
const nonconditionalConsumed = consumedTargets(false)
const conditionalOnlyConsumed = new Set(
  [...consumedTargets(true)].filter((target) => target && !nonconditionalConsumed.has(target)),
)
/** Conditional uncertainty cannot invalidate an independently audited ancestry-table choice. */
export const isConditionalOnlySubclassProficiencyTarget = (target: string) =>
  conditionalOnlyConsumed.has(target)
