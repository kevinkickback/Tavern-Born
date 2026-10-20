import { normalizeSubclassRules } from '@/lib/5etools/classChoiceNormalization'
import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { normalizeClassRules } from '@/lib/5etools/classRuleNormalization'
import { featureOptionRulesSignature } from '@/lib/5etools/featureRulesSignature'
import { decodeNaturalExplorerChoiceId } from '@/lib/5etools/naturalExplorerIdentity'
import {
  getCurrentOptionalDeclaration,
  OPTIONAL_CLASS_DECLARATIONS,
} from '@/lib/5etools/optionalClassDeclarationSource'
import { OPTIONAL_CLASS_FEATURE_RULES } from '@/lib/5etools/optionalClassFeatureRules'
import { getCurrentOptionalClassDeclaration } from '@/lib/5etools/optionalClassFeatureSource'
import { getCurrentOptionalClassSection } from '@/lib/5etools/optionalClassSectionSource'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import type { Subclass5e } from '@/types/5etools'
import type {
  Character,
  OptionalClassFeatureAdoption,
  OptionalClassFeatureOwner,
} from '@/types/character'
import type {
  ClassChoiceDiagnostic,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import {
  getClassChoiceDeclaration,
  getClassChoiceFeatureTarget,
  getFeatureOwnerKey,
} from './classChoiceIdentity'
import {
  getOptionalClassPoolSection,
  OPTIONAL_CLASS_ADOPTION_ROOTS,
} from './optionalClassAdoptionRules'
import {
  getInvalidOptionalClassAdoptionIndexes,
  getOptionalClassAdoptionKey,
  optionalClassOwner,
} from './optionalClassFeatureIdentity'

type Actor = Pick<
  Character,
  'classProgression' | 'variantRules' | 'optionalClassFeatureAdoptions'
> &
  Partial<Pick<Character, 'allowedSources' | 'originSystem'>>
const norm = (value: string | undefined) => value?.trim().toLowerCase() ?? ''
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const knownOptional = new Set([
  ...OPTIONAL_CLASS_FEATURE_RULES.knownOptionalTargets.map((row) => row.target),
  ...OPTIONAL_CLASS_ADOPTION_ROOTS.map((row) => row.target),
])
const nativeDeclarations = new Map(
  OPTIONAL_CLASS_DECLARATIONS.map((row) => [JSON.stringify([row.owner, row.target]), row]),
)
const nativePoolChoices = new WeakMap<object, readonly NormalizedCharacterChoice[]>()
type OptionalAdoptionState =
  | 'active'
  | 'dormant-permission'
  | 'unavailable'
  | 'unearned'
  | 'unselected'

/** Source relations -> activity -> grants. Never calls choices, proficiency projection or calculations. */
function buildOptionalClassFeatureActivity(
  character: Actor,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  const enabled = character.variantRules?.optionalClassFeatures === true
  const allowed = character.allowedSources?.length
    ? new Set(
        getEffectiveSources(character.allowedSources, character.originSystem ?? '2014').map(norm),
      )
    : undefined
  const invalid = new Set(
    getInvalidOptionalClassAdoptionIndexes(character.optionalClassFeatureAdoptions ?? []),
  )
  const adopted = (character.optionalClassFeatureAdoptions ?? []).filter(
    (_, index) => !invalid.has(index),
  )
  const earned = (owner: OptionalClassFeatureOwner, level: number) => {
    const entries = character.classProgression.filter(
      (entry) => norm(entry.name) === owner[1] && norm(entry.source) === owner[2],
    )
    return (
      entries.length === 1 &&
      entries[0].levels >= level &&
      (owner[0] === 'class' ||
        (norm(entries[0].subclass) === owner[3] && norm(entries[0].subclassSource) === owner[4]))
    )
  }
  const currentFeature = (owner: OptionalClassFeatureOwner, target: string) => {
    if (!target.startsWith('book-section|')) {
      if (
        owner[0] === 'class' &&
        OPTIONAL_CLASS_FEATURE_RULES.parents.some(
          (parent) =>
            equal(parent.owner, owner) && parent.declarations.some((row) => row.target === target),
        )
      )
        return getCurrentOptionalClassDeclaration(catalogs, owner, target)?.feature
      const declaration = nativeDeclarations.get(JSON.stringify([owner, target]))
      if (!declaration || !catalogs) return undefined
      const scoped = scopeClassChoiceFeatureCatalogs(
        catalogs,
        owner[0] === 'subclass'
          ? getFeatureOwnerKey(owner[1], owner[2], owner[3], owner[4])
          : undefined,
      )
      return getCurrentOptionalDeclaration(scoped, owner, target, declaration.level)?.feature
    }
    if (owner[0] !== 'class') return undefined
    const section = getCurrentOptionalClassSection(catalogs, target)
    if (!section || !equal(section.descriptor.owner, owner)) return undefined
    const leaf = section.source.input!.leaf as { entries: unknown[]; page?: number }
    return {
      name: section.descriptor.name,
      source: section.descriptor.source,
      level: section.descriptor.level,
      entries: leaf.entries,
      page: leaf.page,
    }
  }
  const states = OPTIONAL_CLASS_ADOPTION_ROOTS.map((root) => {
    const adoption: OptionalClassFeatureAdoption = {
      owner: root.owner,
      target: root.target,
      earnedLevel: root.level,
    }
    const selected = adopted.some(
      (row) => getOptionalClassAdoptionKey(row) === getOptionalClassAdoptionKey(adoption),
    )
    const isEarned = earned(root.owner, root.level)
    const current =
      isEarned &&
      (!allowed || (allowed.has(root.source.toLowerCase()) && allowed.has(root.owner[2])))
        ? currentFeature(root.owner, root.target)
        : undefined
    const state: OptionalAdoptionState = !selected
      ? 'unselected'
      : !isEarned
        ? 'unearned'
        : !enabled
          ? 'dormant-permission'
          : current
            ? 'active'
            : 'unavailable'
    return { root, adoption, state, offered: enabled && isEarned && !!current, current }
  })
  const reserved = states.filter((row) => row.state === 'active' || row.state === 'unavailable')
  const suppressed = (owner: OptionalClassFeatureOwner, target: string, facet?: string) =>
    reserved.some(
      ({ root }) =>
        equal(root.owner, owner) &&
        root.replaces.some((row) => row.target === target && (!row.facet || row.facet === facet)),
    )
  const declared = (
    owner: OptionalClassFeatureOwner,
    target: string,
    level: number,
    facet?: string,
    variant = false,
  ): boolean => {
    if (!earned(owner, level) || suppressed(owner, target, facet)) return false
    const relation = states.find(
      ({ root }) =>
        equal(root.owner, owner) && (root.target === target || root.children.includes(target)),
    )
    if (relation)
      return relation.state === 'active' && !!currentFeature(relation.root.owner, target)
    if (knownOptional.has(target) || variant) return false
    // Combined source nodes are active only while at least one independently governed facet remains.
    const facets = OPTIONAL_CLASS_FEATURE_RULES.roots.flatMap((root) =>
      equal(root.owner, owner)
        ? root.replaces
            .filter((row) => row.target === target)
            .flatMap((row) => row.facet ?? root.family ?? [])
        : [],
    )
    return facet
      ? !facets.length || facets.includes(facet)
      : !facets.length || facets.some((value) => !suppressed(owner, target, value))
  }
  const choice = (row: NormalizedCharacterChoice): boolean => {
    const owner = optionalClassOwner(row.owner)
    const proficiency = decodeClassProficiencyChoiceId(row.id)
    if (proficiency) return declared(owner, proficiency.target, row.level)
    const terrain = decodeNaturalExplorerChoiceId(row.id)
    if (terrain) return declared(owner, terrain.grant, row.level, 'favored-terrain')
    const declaration = getClassChoiceDeclaration(row)
    if (declaration)
      return (
        !!declaration.target &&
        declared(owner, declaration.target, row.level, undefined, !!row.featureVariant)
      )
    return earned(owner, row.level) && !row.featureVariant
  }
  const diagnostic = (row: ClassChoiceDiagnostic): boolean => {
    const owner = optionalClassOwner({
      name: row.className,
      source: row.classSource,
      subclassName: row.subclassName,
      subclassSource: row.subclassSource,
    })
    const target = row.requiredChoice && getClassChoiceFeatureTarget(row.requiredChoice.target)
    if (target) return declared(owner, target, row.level ?? 1, undefined, !!row.featureVariant)
    return earned(owner, row.level ?? 1) && !row.featureVariant
  }
  const entries = (owner: OptionalClassFeatureOwner, target: string, values: unknown[]) =>
    values.filter(
      (_, index) =>
        !reserved.some(
          ({ root }) =>
            equal(root.owner, owner) &&
            root.replaces.some((row) => row.target === target && row.entryIndexes?.includes(index)),
        ),
    )
  const dormant = (owner: OptionalClassFeatureOwner, target: string) => {
    if (!knownOptional.has(target)) return false
    const state = states.find(
      ({ root }) =>
        equal(root.owner, owner) && (root.target === target || root.children.includes(target)),
    )?.state
    return state !== 'active' && state !== 'unavailable'
  }
  const currentOptionalFeature = (owner: OptionalClassFeatureOwner, target: string) => {
    const relation = states.find(
      ({ root }) =>
        equal(root.owner, owner) && (root.target === target || root.children.includes(target)),
    )
    return relation?.state === 'active' ? currentFeature(relation.root.owner, target) : undefined
  }
  const poolChoiceAuthority = new WeakMap<NormalizedCharacterChoice, boolean>()
  const option = (
    choice: NormalizedCharacterChoice,
    reference: NormalizedChoiceOptionReference,
  ) => {
    const section = getOptionalClassPoolSection(choice)
    if (
      !section ||
      reference.entityType !== 'optionalFeature' ||
      norm(reference.source) !== norm(section.source)
    )
      return true
    const state = states.find(
      (row) => row.root.target === section.target && equal(row.root.owner, section.owner),
    )
    if (state?.state !== 'active') return false
    let verified = poolChoiceAuthority.get(choice)
    if (verified === undefined) {
      let canonicalChoices: readonly NormalizedCharacterChoice[] = []
      if (section.target.startsWith('book-section|'))
        canonicalChoices =
          getCurrentOptionalClassSection(catalogs, section.target)?.grant.classData.normalizedRules
            ?.choices ?? []
      else if (catalogs && 'dependency' in section) {
        const owner = section.owner
        const scoped = scopeClassChoiceFeatureCatalogs(
          catalogs,
          owner[0] === 'subclass'
            ? getFeatureOwnerKey(owner[1], owner[2], owner[3], owner[4])
            : undefined,
        )
        const dependency = section.dependency
        const current = equal(dependency.owner, owner)
          ? getCurrentOptionalDeclaration(
              scoped,
              dependency.owner,
              dependency.target,
              dependency.level,
            )
          : undefined
        const progressionIndex = section.progressionField.match(
          /^optionalfeatureProgression\[(\d+)\]$/,
        )?.[1]
        const progression =
          progressionIndex === undefined
            ? undefined
            : (current?.parent.optionalfeatureProgression as unknown[] | undefined)?.[
                Number(progressionIndex)
              ]
        if (
          current &&
          equal(progression, section.progression) &&
          choice.source.field === section.progressionField
        ) {
          const parent = current.parent
          let cached = nativePoolChoices.get(parent)
          if (!cached) {
            cached =
              owner[0] === 'class'
                ? normalizeClassRules(current.classData, current.classData.classFeatureRefs ?? [])
                    .choices
                : normalizeSubclassRules(
                    current.classData,
                    parent as unknown as Subclass5e,
                    (parent as unknown as Subclass5e).subclassFeatureRefs ?? [],
                  ).choices
            nativePoolChoices.set(parent, cached)
          }
          canonicalChoices = cached
        }
      }
      const candidates = canonicalChoices.filter((row) => row.id === choice.id)
      verified =
        candidates.length === 1 &&
        choice.source.kind === 'optional-feature-progression' &&
        featureOptionRulesSignature([candidates[0]], false) ===
          featureOptionRulesSignature([choice], false)
      poolChoiceAuthority.set(choice, verified)
    }
    return (
      verified &&
      !reference.ref &&
      section.members.some(
        ([kind, name, source]) =>
          kind === reference.entityType &&
          norm(name) === norm(reference.name) &&
          norm(source) === norm(reference.source),
      )
    )
  }
  return {
    character,
    catalogs,
    states,
    declared,
    choice,
    diagnostic,
    entries,
    suppressed,
    dormant,
    currentOptionalFeature,
    option,
  }
}

export type OptionalClassFeatureActivity = ReturnType<typeof buildOptionalClassFeatureActivity>

/** Source-owned adopted declarations are derived output, never persisted Feature rows or grants. */
export function getActiveOptionalClassFeatureDeclarations(activity: OptionalClassFeatureActivity) {
  return activity.states.flatMap(({ root, state }) =>
    state === 'active'
      ? [root.target, ...root.children].flatMap((target) => {
          const feature = activity.currentOptionalFeature(root.owner, target)
          return feature &&
            typeof feature.level === 'number' &&
            activity.declared(root.owner, target, feature.level)
            ? [{ owner: root.owner, target, level: feature.level, feature }]
            : []
        })
      : [],
  )
}
const absentCatalog = {}
const cache = new WeakMap<Actor, WeakMap<object, OptionalClassFeatureActivity>>()

/** Immutable character and catalog identities jointly scope activity; source catalogs never hold it. */
export function createOptionalClassFeatureActivity(
  character: Actor,
  catalogs?: ClassChoiceFeatureCatalogs,
): OptionalClassFeatureActivity {
  let byCatalog = cache.get(character)
  if (!byCatalog) {
    byCatalog = new WeakMap()
    cache.set(character, byCatalog)
  }
  const key = catalogs ?? absentCatalog
  const prior = byCatalog.get(key)
  if (prior) return prior
  const result = buildOptionalClassFeatureActivity(character, catalogs)
  byCatalog.set(key, result)
  return result
}
