import {
  GIANT_POWER_TARGET,
  getBarbarianPathChoice,
} from '@/lib/5etools/barbarianPathChoiceIdentity'
import {
  BLESSED_STRIKES_TARGET,
  getCurrentBlessedStrikes,
  getSavedBlessedStrikes,
  IMPROVED_BLESSED_STRIKES_TARGET,
  isBlessedStrikesOptionTarget,
} from '@/lib/5etools/blessedStrikesSource'
import { normalizeSubclassRules } from '@/lib/5etools/classChoiceNormalization'
import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import {
  classProficiencyRule,
  REVISED_PRIMAL_KNOWLEDGE_TARGET,
} from '@/lib/5etools/classProficiencyRules'
import { normalizeClassRules } from '@/lib/5etools/classRuleNormalization'
import {
  ELEMENTAL_FURY_ID,
  ELEMENTAL_FURY_LEVEL,
  ELEMENTAL_FURY_TARGET,
  getCurrentElementalFury,
  getSavedElementalFury,
  IMPROVED_ELEMENTAL_FURY_LEVEL,
  IMPROVED_ELEMENTAL_FURY_TARGET,
  isElementalFuryOptionTarget,
} from '@/lib/5etools/elementalFurySource'
import {
  decodeFavoredEnemyChoiceId,
  FAVORED_ENEMY_GRANTS,
} from '@/lib/5etools/favoredEnemyIdentity'
import { featureOptionRulesSignature } from '@/lib/5etools/featureRulesSignature'
import { getFixedProficiencyId } from '@/lib/5etools/fixedProficiencyAddress'
import {
  decodeNaturalExplorerChoiceId,
  NATURAL_EXPLORER_GRANTS,
} from '@/lib/5etools/naturalExplorerIdentity'
import {
  getCurrentOptionalDeclaration,
  OPTIONAL_CLASS_DECLARATIONS,
} from '@/lib/5etools/optionalClassDeclarationSource'
import { OPTIONAL_CLASS_FEATURE_RULES } from '@/lib/5etools/optionalClassFeatureRules'
import { getCurrentOptionalClassDeclaration } from '@/lib/5etools/optionalClassFeatureSource'
import { getCurrentOptionalClassSection } from '@/lib/5etools/optionalClassSectionSource'
import { resolveRevisedHunterOption } from '@/lib/5etools/revisedHunterChoices'
import {
  getRevisedHunterRule,
  isValidRevisedHunterSelection,
  revisedHunterRules,
} from '@/lib/5etools/revisedHunterIdentity'
import { getEffectiveSources, getSourceCompatibility } from '@/lib/sourceCompatibility'
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
  Partial<
    Pick<
      Character,
      'allowedSources' | 'originSystem' | 'classChoiceSelections' | 'proficiencies' | 'provenance'
    >
  >
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
    // The selected branch appears through the class-choice route, never as a passive grant.
    if (isBlessedStrikesOptionTarget(target) || isElementalFuryOptionTarget(target)) return false
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
  const checkChoice = (
    row: NormalizedCharacterChoice,
    checkLanguageFoundation: boolean,
  ): boolean => {
    if (
      (row.id === ELEMENTAL_FURY_ID || getRevisedHunterRule(row.id)) &&
      allowed &&
      !allowed.has('xphb')
    )
      return false
    const owner = optionalClassOwner(row.owner)
    const pathChoice = getBarbarianPathChoice(row.id)
    const proficiency = decodeClassProficiencyChoiceId(row.id)
    if (
      character.originSystem &&
      (pathChoice ||
        proficiency?.target === GIANT_POWER_TARGET ||
        proficiency?.target === REVISED_PRIMAL_KNOWLEDGE_TARGET) &&
      !getSourceCompatibility(owner[2], character.originSystem).compatible
    )
      return false
    if (
      pathChoice &&
      allowed &&
      (owner[0] !== 'subclass' || !allowed.has(owner[2]) || !allowed.has(owner[4]))
    )
      return false
    if (proficiency) {
      const needed = classProficiencyRule(proficiency.target)?.domains.find(
        (domain) => domain.domain === proficiency.domain,
      )?.requiresKnownLanguage
      if (needed) {
        if (
          allowed &&
          (!allowed.has(owner[2]) || (owner[0] === 'subclass' && !allowed.has(owner[4])))
        )
          return false
        const tags = character.provenance?.proficiencies.languages[needed] ?? []
        const ownFixed = getFixedProficiencyId(proficiency)
        if (
          checkLanguageFoundation &&
          (!character.proficiencies?.languages.some((name) => norm(name) === needed) ||
            (tags.length && tags.every((tag) => tag.grantVariant === ownFixed)))
        )
          return false
      }
      return declared(owner, proficiency.target, row.level)
    }
    const enemy = decodeFavoredEnemyChoiceId(row.id)
    if (enemy) return declared(owner, enemy.grant, row.level, 'favored-enemy-language')
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
  const clericOwner: OptionalClassFeatureOwner = ['class', 'cleric', 'xphb']
  const blessedStrikes =
    earned(clericOwner, 7) && (!allowed || allowed.has('xphb'))
      ? getCurrentBlessedStrikes(catalogs)
      : undefined
  const blessedSelection = getSavedBlessedStrikes(character.classChoiceSelections ?? [])
  const druidOwner: OptionalClassFeatureOwner = ['class', 'druid', 'xphb']
  const fury =
    earned(druidOwner, ELEMENTAL_FURY_LEVEL) && (!allowed || allowed.has('xphb'))
      ? getCurrentElementalFury(catalogs)
      : undefined
  const furySelection = getSavedElementalFury(character.classChoiceSelections ?? [])
  const diagnostic = (row: ClassChoiceDiagnostic): boolean => {
    const owner = optionalClassOwner({
      name: row.className,
      source: row.classSource,
      subclassName: row.subclassName,
      subclassSource: row.subclassSource,
    })
    const target = row.requiredChoice && getClassChoiceFeatureTarget(row.requiredChoice.target)
    if (
      target &&
      row.featureName === 'Favored Enemy' &&
      FAVORED_ENEMY_GRANTS.some((g) => g.target === target)
    )
      return declared(owner, target, row.level ?? 1, 'favored-enemy-language')
    if (
      target &&
      row.featureName === 'Natural Explorer' &&
      NATURAL_EXPLORER_GRANTS.some((g) => g.target === target)
    )
      return declared(owner, target, row.level ?? 1, 'favored-terrain')
    if (target) return declared(owner, target, row.level ?? 1, undefined, !!row.featureVariant)
    return earned(owner, row.level ?? 1) && !row.featureVariant
  }
  const entries = (owner: OptionalClassFeatureOwner, target: string, values: unknown[]) => {
    if (equal(owner, clericOwner)) {
      if (target === BLESSED_STRIKES_TARGET) return blessedStrikes ? [blessedStrikes.rootIntro] : []
      if (target === IMPROVED_BLESSED_STRIKES_TARGET)
        return blessedSelection && !blessedSelection.inactive && earned(owner, 14)
          ? (blessedStrikes?.improvementFor(blessedSelection.selected[0]) ?? [])
          : []
    }
    if (equal(owner, druidOwner)) {
      if (target === ELEMENTAL_FURY_TARGET) return fury ? [fury.rootIntro] : []
      if (target === IMPROVED_ELEMENTAL_FURY_TARGET) {
        const selected = furySelection && !furySelection.inactive && furySelection.selected[0]
        return selected && earned(owner, IMPROVED_ELEMENTAL_FURY_LEVEL) && fury?.option(selected)
          ? fury.improvementFor(selected)
          : []
      }
    }
    const hunter = revisedHunterRules.find((row) => row.target === target)
    if (hunter && equal(owner, ['subclass', 'ranger', 'xphb', 'hunter', 'xphb'])) {
      const selections = character.classChoiceSelections?.filter(
        (row) => row.choiceId === hunter.id,
      )
      const saved = selections?.length === 1 ? selections[0] : undefined
      const selected =
        saved &&
        !saved.inactive &&
        isValidRevisedHunterSelection(saved) &&
        earned(owner, hunter.level) &&
        (!allowed || allowed.has('xphb')) &&
        catalogs &&
        resolveRevisedHunterOption(
          saved.selected[0],
          scopeClassChoiceFeatureCatalogs(
            catalogs,
            getFeatureOwnerKey(owner[1], owner[2], owner[3], owner[4]),
          ),
        )
      const intro = typeof values[0] === 'string' ? [values[0]] : []
      return selected
        ? [...intro, { type: 'entries', name: selected.name, entries: selected.entries }]
        : intro
    }
    return values.filter(
      (_, index) =>
        !reserved.some(
          ({ root }) =>
            equal(root.owner, owner) &&
            root.replaces.some((row) => row.target === target && row.entryIndexes?.includes(index)),
        ),
    )
  }
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
    choice: (row: NormalizedCharacterChoice) => checkChoice(row, true),
    choiceSource: (row: NormalizedCharacterChoice) => checkChoice(row, false),
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
