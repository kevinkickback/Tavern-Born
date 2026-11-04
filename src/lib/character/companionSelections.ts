import { getNormalizedClassChoiceId } from '@/lib/5etools/classChoiceId'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import {
  decodeClassFeatureReference,
  getClassFeatureIdentity,
  getClassFeatureReferenceLevel,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { featureOptionRulesSignature } from '@/lib/5etools/featureRulesSignature'
import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import { collectUnconditionalFeatureReferences } from '@/lib/5etools/unconditionalFeatureReferences'
import type { Class5e, Creature5e, Subclass5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import {
  getClassChoiceDeclaration,
  getClassChoiceOptionKey,
  getFeatureOwnerKey,
} from './classChoiceIdentity'
import {
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from './classChoiceOptions'
import type { FeatureOptionSelectionState } from './featureOptionSelections'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import { optionalClassOwner } from './optionalClassFeatureIdentity'

const norm = (value?: string) => value?.trim().toLowerCase()
const gain = 3
// The original PHB feature expresses the scaling relationship as prose.
const classicCompanionBody = 'df55720dfd85174444d4e96621a23ffee39588c8a2aa98b5c0efa5243105839d'
const companionRules = (
  [
    ['PHB', 'PHB', "Ranger's Companion", 'PHB'],
    ['PHB', 'PHB', 'Primal Companion', 'TCE'],
    ['XPHB', 'XPHB', 'Primal Companion', 'XPHB'],
    ['XPHB', 'PHB', "Ranger's Companion", 'PHB'],
    ['XPHB', 'PHB', 'Primal Companion', 'TCE'],
  ] as const
).map(([source, subclassSource, label, featureSource]) => {
  const owner = {
    type: 'subclass',
    name: 'Ranger',
    source,
    subclassName: 'Beast Master',
    subclassSource,
  } as const
  return {
    id: getNormalizedClassChoiceId(owner, label, gain),
    owner,
    featureSource,
    target:
      `subclass-feature|${label}|${owner.name}|${subclassSource}|${owner.subclassName}|${subclassSource}|${gain}|${featureSource}`.toLowerCase(),
  }
})

type CompanionRule = (typeof companionRules)[number]
const ownerKey = (owner: CompanionRule['owner']) =>
  getFeatureOwnerKey(owner.name, owner.source, owner.subclassName, owner.subclassSource)
const selectionOwnerKey = (selection: CharacterClassChoiceSelection) =>
  getFeatureOwnerKey(
    selection.className,
    selection.classSource,
    selection.subclassName,
    selection.subclassSource,
  )

function savedCompanionRule(selection: CharacterClassChoiceSelection) {
  return companionRules.find(
    (rule) =>
      rule.id === selection.choiceId &&
      selectionOwnerKey(selection) === ownerKey(rule.owner) &&
      selection.classLevel === gain,
  )
}

export function isRegisteredCompanionSelection(selection: CharacterClassChoiceSelection): boolean {
  return (
    selection.kind === 'creature' &&
    !!savedCompanionRule(selection) &&
    selection.selected.length === 1 &&
    selection.selected[0].entityType === 'creature' &&
    selection.selected[0].slotLevel === gain
  )
}

function getCurrentDeclaration(
  choice: NormalizedCharacterChoice,
  rule: CompanionRule,
  cls: Class5e,
  subclass: Subclass5e,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  if (getClassChoiceDeclaration(choice)?.target !== rule.target) return undefined
  const gains = (cls.classFeatureRefs ?? []).filter((ref) => ref.gainSubclassFeature)
  const first = gains.filter((ref) => getClassFeatureReferenceLevel(ref) === gain)
  const gainFeature = first.length === 1 ? first[0].feature : undefined
  if (
    !gainFeature ||
    gainFeature.sourceIdentityConflict ||
    gainFeature.isClassFeatureVariant ||
    gains.some((ref) => (getClassFeatureReferenceLevel(ref) ?? 0) < gain)
  )
    return undefined
  const gainTarget = getClassFeatureIdentity(gainFeature)
  if (
    !gainTarget ||
    gainFeature.level !== gain ||
    getClassFeatureIdentity(decodeClassFeatureReference(first[0].ref)) !== gainTarget
  )
    return undefined
  const liveGains = catalogs.classFeatureCandidates
    ? catalogs.classFeatureCandidates.get(gainTarget)
    : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === gainTarget)
  if (
    liveGains?.length !== 1 ||
    liveGains[0].sourceIdentityConflict ||
    liveGains[0].isClassFeatureVariant ||
    getClassFeatureIdentity(liveGains[0]) !== gainTarget ||
    featureOptionRulesSignature(liveGains[0].entries ?? []) !==
      featureOptionRulesSignature(gainFeature.entries ?? [])
  )
    return undefined
  const refs = collectUnconditionalFeatureReferences(
    subclass.subclassFeatureRefs ?? [],
    'subclassFeature',
  ).filter((row) => row.target === rule.target)
  const attached =
    refs.length === 1 && refs[0].level === gain ? refs[0].reference.feature : undefined
  if (
    !attached?.entries ||
    getSubclassFeatureIdentity(attached) !== rule.target ||
    attached.sourceIdentityConflict ||
    attached.featureOptionSourceConflict ||
    (rule.featureSource !== 'TCE' && attached.isClassFeatureVariant)
  )
    return undefined
  const scoped = scopeClassChoiceFeatureCatalogs(catalogs, ownerKey(rule.owner))
  const candidates = scoped.subclassFeatureCandidates
    ? scoped.subclassFeatureCandidates.get(rule.target)
    : scoped.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === rule.target)
  if (!candidates?.length) return undefined
  const signature = featureOptionRulesSignature(attached.entries)
  return candidates.some(
    (row) =>
      row.sourceIdentityConflict ||
      row.featureOptionSourceConflict ||
      getSubclassFeatureIdentity(row) !== rule.target ||
      (rule.featureSource !== 'TCE' && row.isClassFeatureVariant) ||
      !row.entries ||
      featureOptionRulesSignature(row.entries) !== signature,
  )
    ? undefined
    : attached
}

export interface CompanionSelectionState extends FeatureOptionSelectionState {
  companion: true
  creature?: Creature5e
  classicRangerLevel?: number
}

/** Current stat blocks and recoverable intent share the same earned choice and option pool. */
export function getCompanionSelectionStates(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): CompanionSelectionState[] {
  const selections = character.classChoiceSelections ?? []
  const saved = selections.filter((row) => row.kind === 'creature')
  if (!saved.length) return []
  const creatures = catalogs?.creatures ?? []
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  return saved.flatMap((selection) => {
    const rule = savedCompanionRule(selection)
    if (rule && !isRegisteredCompanionSelection(selection)) return []
    if (
      selection.selected.length !== 1 ||
      selections.filter((row) => row.choiceId === selection.choiceId).length !== 1
    )
      return []
    const selected = selection.selected[0]
    if (selected.entityType !== 'creature' || selected.slotLevel !== selection.classLevel) return []
    const classReference = { name: selection.className, source: selection.classSource }
    const owners = character.classProgression.filter((row) =>
      findClassReference(classReference, [row]),
    )
    const owner = owners.length === 1 ? owners[0] : undefined
    if (
      !owner ||
      owner.levels < selection.classLevel ||
      (selection.subclassName &&
        getFeatureOwnerKey(owner.name, owner.source, owner.subclass, owner.subclassSource) !==
          selectionOwnerKey(selection))
    )
      return []
    if (rule) {
      const identity = optionalClassOwner(rule.owner)
      if (activity.suppressed(identity, rule.target)) return []
      if (
        rule.featureSource === 'TCE' &&
        !activity.states.some(
          (row) =>
            row.root.target === rule.target &&
            JSON.stringify(row.root.owner) === JSON.stringify(identity) &&
            row.state === 'active',
        )
      )
        return []
    }
    const current = classes.filter((row) => findClassReference(owner, [row]))
    const cls = current.length === 1 && !current[0].sourceIdentityConflict ? current[0] : undefined
    const subclasses = cls?.subclasses?.filter((row) =>
      findClassReference({ name: owner.subclass, source: owner.subclassSource }, [row]),
    )
    const subclass = subclasses?.length === 1 ? subclasses[0] : undefined
    const candidates = cls
      ? getCharacterClassChoices(cls, subclass, activity, catalogs).filter(
          (row) =>
            row.id === selection.choiceId &&
            row.kind === 'creature' &&
            row.level === selection.classLevel &&
            getRequiredChoiceSelectionCount(row, owner.levels) > 0 &&
            getFeatureOwnerKey(
              row.owner.name,
              row.owner.source,
              row.owner.subclassName,
              row.owner.subclassSource,
            ) === selectionOwnerKey(selection),
        )
      : []
    const candidate = candidates.length === 1 ? candidates[0] : undefined
    const declaration =
      candidate && rule && catalogs && cls && subclass && !subclass.sourceIdentityConflict
        ? getCurrentDeclaration(candidate, rule, cls, subclass, catalogs)
        : undefined
    const choice = !rule || declaration ? candidate : undefined
    if (!choice && !rule) return []
    const exact = selected.source?.trim()
      ? creatures.filter(
          (row) =>
            norm(row.name) === norm(selected.name) && norm(row.source) === norm(selected.source),
        )
      : []
    const option =
      choice && exact.length === 1
        ? resolveClassChoiceOptions(
            choice,
            { ...createClassChoiceCatalogs(catalogs), creatures: exact },
            [],
            owner.levels,
            character,
          ).find(
            (view) =>
              isClassChoiceOptionEligible(view) &&
              getClassChoiceOptionKey(view.reference) === getClassChoiceOptionKey(selected),
          )
        : undefined
    return [
      {
        selection,
        owner,
        classData: cls,
        subclass,
        choice,
        creature: option ? exact[0] : undefined,
        classicRangerLevel:
          option &&
          rule?.featureSource === 'PHB' &&
          declaration?.entries &&
          getFeatureSourceDigest(declaration.entries, false) === classicCompanionBody
            ? owner.levels
            : undefined,
        recovery: !option,
        companion: true,
        options: [],
        details: [
          {
            name: selected.name,
            entries: option?.entries ?? [
              'Restore the exact companion source or remove the saved choice.',
            ],
            available: !!option,
          },
        ],
      },
    ]
  })
}
