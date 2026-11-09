import { getNormalizedClassChoiceId } from '@/lib/5etools/classChoiceId'
import { isNormallySelectableFeat } from '@/lib/5etools/classData'
import { getClassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import {
  EPIC_BOON_LEVEL,
  getEpicBoonAdvancementReference,
  hasEpicBoonAdvancementReference,
  isEpicBoonAdvancement,
  isRevisedEpicBoonOwner,
} from '@/lib/5etools/epicBoonAdvancement'
import { deriveFeatOptionSteps } from '@/lib/5etools/parsers/featOptions'
import { ABILITY_NAMES, type AbilityName } from '@/lib/calculations/abilityScores'
import { ABILITY_SCORE_MAX, getASILevelsFromClass } from '@/lib/calculations/gameRules'
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisiteRules'
import { applyAsiChoices } from '@/lib/provenance/applyAsiChoices'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Class5e, Feat5e } from '@/types/5etools'
import type { AsiChoice, Character, Feat } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { getClassChoiceDeclaration } from './classChoiceIdentity'
import { applyCharacterCommandResult } from './commands/featCommandSupport'
import { replaceFeatSelectionsCommand } from './commands/featCommands'
import { getFeatSetupOwners } from './featSetupOwners'
import { getRevisedClassFeatSlot } from './revisedClassFeatSlot'

export { EPIC_BOON_LEVEL } from '@/lib/5etools/epicBoonAdvancement'

const LABEL = 'Epic Boon'
const SOURCE = 'XPHB'

type Owner = { name: string; source: string }
type Target = Pick<Feat, 'name' | 'source'>
type Claims = {
  ordinary: Feat[]
  increases: AsiChoice[]
}

export interface EpicBoonSlot {
  owner: Owner
  choiceId: string
  claimSnapshot: string
  state: 'empty' | 'selected' | 'unavailable' | 'conflict'
  current: boolean
  hasClaims: boolean
  allowsAsi: boolean
  feat?: Feat
  asi?: AsiChoice
}

function choiceId(owner: Owner): string {
  return getNormalizedClassChoiceId({ type: 'class', ...owner }, LABEL, EPIC_BOON_LEVEL)
}

function owns(owner: Owner, row: { className?: string; classSource?: string }): boolean {
  return !!findClassReference(owner, [{ name: row.className, source: row.classSource }])
}

function getClaims(character: Character, owner: Owner): Claims {
  return {
    ordinary: character.feats.filter(
      (feat) => owns(owner, feat) && feat.classLevel === EPIC_BOON_LEVEL,
    ),
    increases: (character.asiChoices ?? []).filter(
      (asi) => owns(owner, asi) && asi.level === EPIC_BOON_LEVEL,
    ),
  }
}

function claimSnapshot(character: Character, claims: Claims): string {
  return JSON.stringify([character.id, claims])
}

function currentDeclaration(
  owner: Owner,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): string | undefined {
  const matches = catalogs?.classes?.filter((row) => findClassReference(owner, [row])) ?? []
  const cls = matches[0]
  if (!catalogs || matches.length !== 1 || cls.sourceIdentityConflict) return undefined
  const ref = getEpicBoonAdvancementReference(cls.classFeatureRefs ?? [], cls)
  const id = ref && getClassFeatureIdentity(ref)
  if (!id || catalogs.ambiguousClassFeatureTargets?.has(id)) return undefined
  if (ref && !findClassReference({ name: ref.className, source: ref.classSource }, [cls])) {
    return getCurrentDirectClassFeature(cls, catalogs, id, isEpicBoonAdvancement) ? id : undefined
  }
  const candidates = catalogs.classFeatureCandidates
    ? (catalogs.classFeatureCandidates.get(id) ?? [])
    : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === id)
  return candidates.length === 1 &&
    getClassFeatureIdentity(candidates[0]) === id &&
    isEpicBoonAdvancement(candidates[0])
    ? id
    : undefined
}

export function isEpicBoonAdvancementChoice(
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): boolean {
  if (choice.owner.type !== 'class') return false
  if (choice.id === choiceId(choice.owner) && currentDeclaration(choice.owner, catalogs))
    return true
  if (normalizeKey(choice.owner.source) !== 'xphb') return false

  const target = getClassChoiceDeclaration(choice)?.target
  return (
    choice.kind === 'feat' &&
    choice.optionFilter?.categories?.length === 1 &&
    choice.optionFilter.categories[0] === 'EB' &&
    choice.id === getNormalizedClassChoiceId(choice.owner, LABEL, choice.level) &&
    normalizeKey(choice.label) === 'epic boon' &&
    !!target?.startsWith('class-feature|epic boon|')
  )
}

function uniqueFeat(target: Target, feats: readonly Feat5e[]): Feat5e | undefined {
  const matching = feats.filter((feat) => getFeatSelectionKey(feat) === getFeatSelectionKey(target))
  return matching.length === 1 && !matching[0].sourceIdentityConflict ? matching[0] : undefined
}

export function isEpicBoonAsiFeat(feat: Target): boolean {
  return (
    getFeatSelectionKey(feat) ===
    getFeatSelectionKey({
      name: 'Ability Score Improvement',
      source: SOURCE,
    })
  )
}

function hasAsiFeat(feats: readonly Feat5e[]): boolean {
  const feat = uniqueFeat({ name: 'Ability Score Improvement', source: SOURCE }, feats)
  if (
    feat?.category !== 'G' ||
    feat.repeatable !== true ||
    feat.ability?.length !== 2 ||
    feat.ability.some((row) =>
      Object.keys(row).some((key) => key !== 'choose' && key !== 'hidden'),
    ) ||
    feat.prerequisite?.length !== 1 ||
    feat.prerequisite[0].level !== 4 ||
    Object.keys(feat.prerequisite[0]).length !== 1 ||
    feat.entries?.[0] !==
      "Increase one ability score of your choice by 2, or increase two ability scores of your choice by 1. This feat can't increase an ability score above 20."
  )
    return false
  const [one, two] = feat.ability.map((row) => row.choose)
  const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha']
  return (
    one?.amount === 2 &&
    one.count === undefined &&
    two?.count === 2 &&
    two.amount === undefined &&
    [one, two].every(
      (choice) =>
        choice.from?.length === abilities.length &&
        abilities.every((ability) => choice.from?.includes(ability)),
    )
  )
}

function validIncrease(changes: Record<string, 1 | 2>): boolean {
  const entries = Object.entries(changes)
  return (
    entries.every(
      ([name, value]) =>
        ABILITY_NAMES.includes(name as AbilityName) && (value === 1 || value === 2),
    ) && entries.reduce((sum, [, value]) => sum + value, 0) === 2
  )
}

export function isEpicBoonIncreaseWithinCap(
  changes: Record<string, 1 | 2>,
  before: Readonly<Record<AbilityName, number>>,
): boolean {
  return (
    validIncrease(changes) &&
    Object.entries(changes).every(
      ([ability, value]) => before[ability as AbilityName] + value <= ABILITY_SCORE_MAX,
    )
  )
}

export function getEpicBoonSlots(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  feats: readonly Feat5e[],
  rawClasses: Readonly<Record<string, Class5e>> = {},
): EpicBoonSlot[] {
  return character.classProgression.flatMap((entry): EpicBoonSlot[] => {
    if (entry.levels < EPIC_BOON_LEVEL || !entry.source) return []
    const owner = { name: entry.name, source: entry.source ?? '' }
    const currentClasses =
      catalogs?.classes?.filter((cls) => findClassReference(owner, [cls])) ?? []
    const rawClass = findClassReference(owner, Object.values(rawClasses))
    const claims = getClaims(character, owner)
    const stored = [...claims.ordinary, ...claims.increases]
    const hasTarget = stored.some((row) => !!row.epicBoonTarget)
    if (
      !isRevisedEpicBoonOwner(owner) &&
      !currentClasses.some(isRevisedEpicBoonOwner) &&
      !(rawClass && isRevisedEpicBoonOwner(rawClass)) &&
      !hasTarget
    )
      return []
    const declarationTarget = currentDeclaration(owner, catalogs)
    const current =
      !!declarationTarget &&
      stored.every((row) => !row.epicBoonTarget || row.epicBoonTarget === declarationTarget)
    const count = stored.length
    if (!current) {
      const knownGain =
        currentClasses.some(hasEpicBoonAdvancementReference) ||
        !!(rawClass && hasEpicBoonAdvancementReference(rawClass))
      const lostSavedGain =
        !!catalogs?.classes &&
        count > 0 &&
        !currentClasses.some((cls) => getASILevelsFromClass(cls).includes(EPIC_BOON_LEVEL))
      if (!knownGain && !lostSavedGain && !hasTarget) return []
    }
    const allowsAsi = current && hasAsiFeat(feats)
    const base = {
      owner,
      choiceId: choiceId(owner),
      claimSnapshot: claimSnapshot(character, claims),
      current,
      allowsAsi,
      hasClaims: count > 0,
    }
    if (count > 1) return [{ ...base, state: 'conflict' }]
    if (!current) return [{ ...base, state: 'unavailable' }]
    if (count === 0) return [{ ...base, state: 'empty' }]
    const [asi] = claims.increases
    if (asi && allowsAsi && validIncrease(asi.abilityChanges)) {
      return [{ ...base, state: 'selected', asi }]
    }
    const [feat] = claims.ordinary
    const target = feat?.source?.trim() && uniqueFeat(feat, feats)
    if (
      feat &&
      target &&
      !isEpicBoonAsiFeat(target) &&
      (isNormallySelectableFeat(target) || target.category === 'O' || target.category === 'EB')
    ) {
      return [{ ...base, state: 'selected', feat }]
    }
    return [{ ...base, state: 'unavailable' }]
  })
}

/** Clear this advancement's feat or ASI without touching other slots. */
export function withoutEpicBoonSelection(character: Character, owner: Owner): Character {
  const { ordinary, increases } = getClaims(character, owner)
  if (ordinary.length) {
    character = applyCharacterCommandResult(
      character,
      replaceFeatSelectionsCommand(
        character,
        character.provenance,
        character.feats.filter((row) => !ordinary.includes(row)),
      ),
    )
  }
  if (increases.length) {
    const asiChoices = (character.asiChoices ?? []).filter((row) => !increases.includes(row))
    character = {
      ...character,
      asiChoices,
      provenance: applyAsiChoices(character.provenance, asiChoices),
    }
  }
  return character
}

/** Projection never changes the saved actor. One unavailable or conflicting slot grants nothing. */
export function projectEpicBoonSlots(
  character: Character,
  slots: readonly EpicBoonSlot[],
): Character {
  for (const slot of slots) {
    if (slot.state === 'unavailable' || slot.state === 'conflict') {
      character = withoutEpicBoonSelection(character, slot.owner)
    }
  }
  return character
}

/** Claims absent from the active ordinary and ASI collections still reserve their slot. */
export function countReservedEpicBoonFeatSlots(slots: readonly EpicBoonSlot[] = []): number {
  return slots.filter((slot) => slot.hasClaims && slot.state !== 'selected').length
}

type Replacement =
  | { feat: Feat5e }
  | { abilityChanges: Record<string, 1 | 2>; before: Readonly<Record<AbilityName, number>> }
  | null

interface SelectionAuthority {
  catalogs: ClassChoiceFeatureCatalogs
  rawClasses?: Readonly<Record<string, Class5e>>
  feats: readonly Feat5e[]
  /** Calculated against the actor after removing the previous claim. */
  prerequisites: PrereqCharacterSnapshot
}

export function replaceEpicBoonSelection(
  character: Character,
  slot: EpicBoonSlot,
  replacement: Replacement,
  authority?: SelectionAuthority,
): Character {
  const { name: className, source: classSource } = slot.owner
  if (
    slot.choiceId !== choiceId(slot.owner) ||
    slot.claimSnapshot !== claimSnapshot(character, getClaims(character, slot.owner))
  )
    return character
  if (
    normalizeKey(classSource) !== 'xphb' &&
    !getEpicBoonSlots(
      character,
      authority?.catalogs,
      authority?.feats ?? [],
      authority?.rawClasses,
    ).some((current) => current.choiceId === slot.choiceId)
  )
    return character
  if (!replacement) return withoutEpicBoonSelection(character, slot.owner)
  const currentTarget = currentDeclaration(slot.owner, authority?.catalogs)
  if (!authority || !currentTarget) return character
  const epicBoonTarget = normalizeKey(classSource) === 'xphb' ? undefined : currentTarget
  const earned = getRevisedClassFeatSlot(
    character,
    { ...slot.owner, level: EPIC_BOON_LEVEL },
    authority.catalogs,
  )
  if (!earned?.openFeatCategories) return character

  const cleared = withoutEpicBoonSelection(character, slot.owner)
  if ('feat' in replacement) {
    const feat = uniqueFeat(replacement.feat, authority.feats)
    if (
      !feat ||
      isEpicBoonAsiFeat(feat) ||
      !(isNormallySelectableFeat(feat) || feat.category === 'O' || feat.category === 'EB') ||
      cleared.feats.some((row) => getFeatSelectionKey(row) === getFeatSelectionKey(feat)) ||
      ((!feat.repeatable ||
        deriveFeatOptionSteps(feat).some((step) => step.kind === 'spellcastingClass')) &&
        getFeatSetupOwners(cleared, authority.feats).some(
          (row) => getFeatSelectionKey(row.target) === getFeatSelectionKey(feat),
        )) ||
      !checkAllPrerequisites(feat, {
        ...authority.prerequisites,
        maximumCharacterLevel: earned.maximumCharacterLevel,
        hasSpellcastingFeature: earned.hasSpellcastingFeature,
      }).met
    )
      return character
    return applyCharacterCommandResult(
      cleared,
      replaceFeatSelectionsCommand(cleared, cleared.provenance, [
        ...cleared.feats,
        { ...feat, className, classSource, classLevel: EPIC_BOON_LEVEL, epicBoonTarget },
      ]),
    )
  }
  if (
    !hasAsiFeat(authority.feats) ||
    !isEpicBoonIncreaseWithinCap(replacement.abilityChanges, replacement.before)
  )
    return character
  const asiChoices = [
    ...(cleared.asiChoices ?? []),
    {
      id: `asi-${className}-${classSource}-${EPIC_BOON_LEVEL}`,
      className,
      classSource,
      epicBoonTarget,
      level: EPIC_BOON_LEVEL,
      abilityChanges: replacement.abilityChanges,
    },
  ]
  return { ...cleared, asiChoices, provenance: applyAsiChoices(cleared.provenance, asiChoices) }
}
