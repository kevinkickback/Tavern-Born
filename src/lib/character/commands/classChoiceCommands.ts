import { ARMOR_MODEL_GROUP } from '@/lib/5etools/artificerArmorModels'
import {
  getBarbarianPathChoice,
  getBarbarianPathChoiceGroup,
} from '@/lib/5etools/barbarianPathChoiceIdentity'
import {
  BLESSED_STRIKES_ID,
  getSavedBlessedStrikes,
  isBlessedStrikesOption,
} from '@/lib/5etools/blessedStrikesSource'
import { LAND_GROUP } from '@/lib/5etools/circleOfTheLand'
import { getNormalizedClassChoiceId } from '@/lib/5etools/classChoiceId'
import {
  getClassChoiceSlotLevels,
  getProgressiveChoiceGainCount,
  getProgressiveChoiceReviewLevel,
  getRequiredChoiceSelectionCount,
} from '@/lib/5etools/classChoiceNormalization'
import { getSelectedSubclassData, resolveClassProgressionRules } from '@/lib/5etools/classData'
import {
  getClassOrderBranch,
  getClassOrderById,
  getSavedClassOrder,
} from '@/lib/5etools/classOrderIdentity'
import { getCurrentClassOrderOption } from '@/lib/5etools/classOrderSource'
import {
  decodeClassProficiencyChoiceId,
  getProficiencyOption,
  isClassProficiencyChoiceId,
} from '@/lib/5etools/classProficiencyIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { isDivineSoulConfigurationGroup } from '@/lib/5etools/divineSoulConfiguration'
import {
  ELEMENTAL_FURY_ID,
  getCurrentElementalFury,
  getSavedElementalFury,
} from '@/lib/5etools/elementalFurySource'
import { decodeFavoredEnemyChoiceId } from '@/lib/5etools/favoredEnemyIdentity'
import {
  decodeFeatureOptionReference,
  isFeatureLiteralChoiceId,
} from '@/lib/5etools/featureOptionIdentity'
import { getFixedProficiencyId } from '@/lib/5etools/fixedProficiencyIdentity'
import {
  decodeLegacySubclassChoice,
  isKenseiChoiceId,
} from '@/lib/5etools/legacySubclassChoiceIdentity'
import { getLegacySubclassFamily } from '@/lib/5etools/legacySubclassChoices'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { psionicSlotIsCurrent } from '@/lib/5etools/psionicChoices'
import { decodePsionicChoiceId, getPsionicChoiceId } from '@/lib/5etools/psionicIdentity'
import { resolvePsionic } from '@/lib/5etools/psionics'
import {
  isRevisedAffinityOption,
  isRevisedAffinitySourceEnabled,
  REVISED_AFFINITY_ID,
} from '@/lib/5etools/revisedElementalAffinity'
import { getRevisedHunterRule, REVISED_HUNTER_GROUP } from '@/lib/5etools/revisedHunterIdentity'
import { SCION_GROUP } from '@/lib/5etools/rogueScion'
import { isStormAuraChoiceId } from '@/lib/5etools/stormAuraIdentity'
import { getSubclassFeatureConfigurationRule } from '@/lib/5etools/subclassFeatureConfiguration'
import {
  isCurrentRevisedInvocationCantripPool,
  isRevisedTargetedInvocation,
  REVISED_INVOCATION_POOL,
} from '@/lib/5etools/warlockInvocationCantripSource'
import { isWarlockPatronConfigurationGroup } from '@/lib/5etools/warlockPatronConfigurations'
import { buildPrerequisiteSnapshot, checkAllPrerequisites } from '@/lib/calculations/prerequisites'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import {
  getClassChoiceCatalogOptionKey,
  getClassChoiceDeclaration,
  getClassChoiceFeatureId,
  getClassChoiceGrantedFeature,
  getClassChoiceOptionKey,
  getFeatureOwnerKey,
} from '@/lib/character/classChoiceIdentity'
import {
  type ClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  isClassChoiceOptionEligible,
  resolveClassChoiceFeatureEntity,
  resolveClassChoiceOptions,
  retainsBladeInvocationWithoutPact,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceOptions'
import { getEffectiveOwnerProficiencyChoices } from '@/lib/character/classProficiencyAuthority'
import {
  reconcileClassProficiencyGrants,
  retainClassProficiencyGrants,
} from '@/lib/character/classProficiencyOwnership'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { hasProficiencyCatalogTarget } from '@/lib/character/classProficiencyVocabulary'
import {
  getCompanionSelectionStates,
  isRegisteredCompanionSelection,
} from '@/lib/character/companionSelections'
import {
  type ClassChoicePrerequisiteContext,
  getEffectiveClassChoiceFeatureRoutes,
} from '@/lib/character/effectiveClassChoiceFeatures'
import { isRetiredEpicBoonChoice } from '@/lib/character/epicBoonSlots'
import { getFighterStylePair } from '@/lib/character/fighterStyleChoices'
import { stripFixedProficiencyGrants } from '@/lib/character/fixedProficiencyOwnership'
import {
  getHistoricalProficiencyRule,
  resolveHistoricalProficiencyChoice,
} from '@/lib/character/historicalProficiencyChoices'
import { isPlainSpellIdentityPart } from '@/lib/character/managedClassSpellIdentity'
import {
  type ManagedClassSpellContext,
  projectManagedClassSpellState,
} from '@/lib/character/managedClassSpells'
import {
  getOptionalClassPoolSection,
  getOptionalClassPoolSelectionSection,
} from '@/lib/character/optionalClassAdoptionRules'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { optionalClassOwner } from '@/lib/character/optionalClassFeatureIdentity'
import {
  getOptionalPoolSelectionHandle,
  getRegisteredOptionalPoolSelection,
} from '@/lib/character/optionalClassPoolSelections'
import {
  getInvocationRepeatKey,
  getRevisedInvocationSlotPrior,
  getSavedRevisedInvocationOwner,
  hasEarnedRevisedInvocationSlots,
} from '@/lib/character/warlockInvocationChoices'
import {
  CLASSIC_PACT_BOON_POOL,
  getBladeInvocationSource,
  getCurrentPactBladeState,
  isBladeDependentInvocation,
  isExactBladeInvocationOption,
  isPactBladeOption,
  PACT_BLADE_NAME,
} from '@/lib/character/warlockInvocationSource'
import { addGrant } from '@/lib/provenance/ledger'
import { normalizeKey, normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import {
  getInvalidClassProficiencySelectionIds,
  isValidClassProficiencySelection,
} from '@/lib/schema/classProficiencyValidation'
import { getInvalidFeatureLiteralSelectionIds } from '@/lib/schema/featureLiteralValidation'
import {
  getInvalidKenseiSelectionIds,
  isValidKenseiSelection,
  isValidLegacyStyleSelection,
} from '@/lib/schema/legacySubclassChoiceValidation'
import {
  getInvalidPsionicSelectionIds,
  isValidPsionicSelection,
} from '@/lib/schema/psionicValidation'
import { isValidStormAuraSelection } from '@/lib/schema/stormAuraValidation'
import type { Class5e, Feat5e } from '@/types/5etools'
import type {
  Character,
  CharacterClassChoiceOption,
  CharacterClassChoiceSelection,
  CharacterClassEntry,
  FavoredEnemySetup,
  Feature,
} from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import type { CharacterCommandResult } from './commandResult'
import { replaceClassFeatSelectionsCommand } from './featCommands'
import { projectProficiencyCommandResult } from './proficiencyProjection'
import { assignProgressionSlotLevels } from './progressionSlotOwnership'

export interface ClassChoiceAuthority {
  classes: readonly Class5e[]
  catalogs?: ClassChoiceFeatureCatalogs
  feats?: readonly Feat5e[]
  spellContext?: ManagedClassSpellContext
  prerequisites?: ClassChoicePrerequisiteContext
}

function currentLiteralChoice(
  character: Character,
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
  authority: ClassChoiceAuthority | undefined,
): NormalizedCharacterChoice {
  const order = getClassOrderById(choice.id)
  const fury = choice.id === ELEMENTAL_FURY_ID
  if (order?.owner === 'druid' || fury) {
    const owner = findOwner(character, choice)
    const cls = authority && findClassReference(choice.owner, authority.classes)
    const catalogs = authority?.catalogs
    const current =
      cls &&
      owner &&
      catalogs &&
      getCharacterClassChoices(
        cls,
        getSelectedSubclassData(cls, owner),
        createOptionalClassFeatureActivity(character, catalogs),
        catalogs,
      ).find((row) => row.id === choice.id)
    const furyRules = fury ? getCurrentElementalFury(catalogs) : undefined
    if (
      !current ||
      JSON.stringify(current) !== JSON.stringify(choice) ||
      selected.some((option) => {
        if (fury) return !furyRules?.option(option)
        const branch = order && getClassOrderBranch(option, order)
        return !order || !branch || !getCurrentClassOrderOption(catalogs, order, branch)
      })
    )
      throw new RangeError(
        `${current?.label ?? choice.label} source rules changed. Review the current choices.`,
      )
    return current
  }
  if (choice.id === BLESSED_STRIKES_ID) {
    const owner = findOwner(character, choice)
    const catalogs = authority?.catalogs
    const cls = authority && findClassReference(choice.owner, authority.classes)
    const current =
      cls &&
      owner &&
      catalogs &&
      getCharacterClassChoices(
        cls,
        getSelectedSubclassData(cls, owner),
        createOptionalClassFeatureActivity(character, catalogs),
        catalogs,
      ).find((row) => row.id === choice.id)
    if (
      !current ||
      JSON.stringify(current) !== JSON.stringify(choice) ||
      selected.some((option) => !isBlessedStrikesOption(option))
    )
      throw new RangeError('Blessed Strikes source rules changed. Review the current choices.')
    return current
  }
  const legacyFamily = getLegacySubclassFamily(
    choice.owner,
    choice.owner.subclassName && choice.owner.subclassSource
      ? { name: choice.owner.subclassName, source: choice.owner.subclassSource }
      : undefined,
  )
  if (
    decodeLegacySubclassChoice(choice.id) ||
    (legacyFamily === 'kensei' && choice.kind === 'item') ||
    (legacyFamily === 'swords' && choice.kind === 'optional-feature')
  ) {
    if (!decodeLegacySubclassChoice(choice.id))
      throw new RangeError('Invalid subclass choice identity.')
    if (!selected.length) return choice
    const owner = findOwner(character, choice),
      cls = authority && findClassReference(choice.owner, authority.classes)
    const current =
      cls &&
      owner &&
      authority?.catalogs &&
      getCharacterClassChoices(
        cls,
        getSelectedSubclassData(cls, owner),
        createOptionalClassFeatureActivity(character, authority.catalogs),
        authority.catalogs,
      ).find((row) => row.id === choice.id)
    if (!current || !authority?.catalogs || JSON.stringify(current) !== JSON.stringify(choice))
      throw new RangeError('Subclass source rules changed. Review the current choices.')
    const eligible = new Set(
      resolveClassChoiceOptions(
        current,
        createClassChoiceCatalogs(authority.catalogs),
        [],
        owner!.levels,
        character,
      )
        .filter((v) => v.availability === 'eligible')
        .map((v) => getClassChoiceOptionKey(v.reference)),
    )
    if (
      selected.some(
        (v) =>
          v.ref !== undefined || !v.source?.trim() || !eligible.has(getClassChoiceOptionKey(v)),
      )
    )
      throw new RangeError('Choose available, distinct subclass options.')
    return current
  }
  if (choice.kind === 'psionic' || choice.id.startsWith('psionic-choice:')) {
    if (!decodePsionicChoiceId(choice.id)) throw new RangeError('Invalid psionic choice identity.')
    if (!selected.length) return choice
    const owner = findOwner(character, choice)
    const cls = authority && findClassReference(choice.owner, authority.classes)
    const current =
      cls &&
      owner &&
      authority?.catalogs &&
      getCharacterClassChoices(
        cls,
        getSelectedSubclassData(cls, owner),
        createOptionalClassFeatureActivity(character, authority.catalogs),
        authority.catalogs,
      ).find((row) => row.id === choice.id)
    if (!current || !authority?.catalogs || JSON.stringify(current) !== JSON.stringify(choice))
      throw new RangeError('Psionic source rules changed. Review the current choices.')
    const prior =
      character.classChoiceSelections?.find((row) => row.choiceId === choice.id)?.selected ?? []
    const eligible = new Set(
      resolveClassChoiceOptions(
        current,
        createClassChoiceCatalogs(authority.catalogs),
        prior,
        owner?.levels ?? 0,
        character,
      )
        .filter((row) => row.availability === 'eligible')
        .map((row) => getClassChoiceOptionKey(row.reference)),
    )
    if (
      selected.some(
        (row) =>
          row.entityType !== 'psionic' ||
          !row.source?.trim() ||
          row.ref !== undefined ||
          !eligible.has(getClassChoiceOptionKey(row)),
      )
    )
      throw new RangeError('Choose available, distinct psionics for this pool.')
    return current
  }
  if (choice.kind === 'proficiency' || isClassProficiencyChoiceId(choice.id)) {
    const relation = decodeClassProficiencyChoiceId(choice.id)
    const owner = findOwner(character, choice)
    const eligibilityCharacter =
      authority?.catalogs &&
      refreshClassProficiencyState(character, authority.classes, {
        ...authority.catalogs,
        featExpertiseFeats: authority.feats ?? authority.catalogs.featExpertiseFeats,
      })
    const current =
      owner &&
      authority &&
      eligibilityCharacter &&
      getEffectiveOwnerProficiencyChoices(eligibilityCharacter, owner, authority.catalogs).find(
        (row) => row.id === choice.id,
      )
    if (!relation || !current || !authority?.catalogs || !eligibilityCharacter)
      throw new RangeError('Current source rules cannot verify this proficiency choice.')
    if (
      getHistoricalProficiencyRule(choice.id) &&
      !character.classChoiceSelections?.find((row) => row.choiceId === choice.id)?.proficiencyAtGain
    )
      throw new RangeError('Confirm the proficiency setup before choosing a fallback proficiency.')
    const prior =
      character.classChoiceSelections?.find((row) => row.choiceId === choice.id)?.selected ?? []
    const eligible = new Set(
      resolveClassChoiceOptions(
        current,
        createClassChoiceCatalogs({
          ...authority.catalogs,
          featExpertiseFeats: authority.feats ?? authority.catalogs.featExpertiseFeats,
        }),
        prior,
        findOwner(character, current)?.levels ?? 0,
        eligibilityCharacter,
      )
        .filter((option) => option.availability === 'eligible')
        .map((option) => getClassChoiceOptionKey(option.reference)),
    )
    if (selected.some((option) => !eligible.has(getClassChoiceOptionKey(option))))
      throw new RangeError(
        'Proficiency eligibility changed. Review the available choices before confirming.',
      )
    return resolveHistoricalProficiencyChoice(character, current)
  }
  if (!isFeatureLiteralChoiceId(choice.id)) {
    const fighterStyle = getFighterStylePair(choice.id)
    const optionalPool = getOptionalClassPoolSection(choice)
    const mastery =
      choice.optionFilter?.requiresMastery ||
      choice.id === getNormalizedClassChoiceId(choice.owner, 'Weapon Mastery', choice.level)
    if (
      (mastery ||
        (fighterStyle && !optionalPool) ||
        choice.source.field.endsWith(':entries.filter-alternative-v1')) &&
      selected.length
    ) {
      const owner = findOwner(character, choice)
      const cls = authority && findClassReference(choice.owner, authority.classes)
      const current =
        cls &&
        owner &&
        authority?.catalogs &&
        getCharacterClassChoices(
          cls,
          getSelectedSubclassData(cls, owner),
          createOptionalClassFeatureActivity(character, authority.catalogs),
          authority.catalogs,
        ).find((row) => row.id === choice.id)
      if (
        !current ||
        !authority?.catalogs ||
        (mastery && (cls?.sourceIdentityConflict || !current.optionFilter?.requiresMastery)) ||
        (fighterStyle && cls?.sourceIdentityConflict)
      )
        throw new RangeError('Restore the current source for this class choice.')
      const eligibilityCharacter = mastery
        ? refreshClassProficiencyState(character, authority.classes, authority.catalogs)
        : character
      const options = resolveClassChoiceOptions(
        current,
        {
          ...createClassChoiceCatalogs(authority.catalogs),
          classes: authority.catalogs.classes ?? authority.classes,
          feats: authority.feats ?? authority.catalogs.featExpertiseFeats ?? [],
        },
        [],
        owner?.levels ?? 0,
        eligibilityCharacter,
      )
      const eligible = new Set(
        options
          .filter((row) => row.availability === 'eligible')
          .map((row) => getClassChoiceOptionKey(row.reference)),
      )
      const prior = new Set(
        (
          character.classChoiceSelections?.find((row) => row.choiceId === current.id)?.selected ??
          []
        ).map(getClassChoiceOptionKey),
      )
      if (
        selected.some(
          (option) =>
            (mastery &&
              (option.entityType !== 'item' ||
                !option.source?.trim() ||
                option.ref !== undefined)) ||
            (!eligible.has(getClassChoiceOptionKey(option)) &&
              !prior.has(getClassChoiceOptionKey(option))),
        )
      )
        throw new RangeError('This class choice changed. Review its current alternatives.')
      return current
    }
    if (optionalPool) {
      const owner = findOwner(character, choice)
      const cls = authority && findClassReference(choice.owner, authority.classes)
      const current =
        cls &&
        owner &&
        authority?.catalogs &&
        getCharacterClassChoices(
          cls,
          getSelectedSubclassData(cls, owner),
          createOptionalClassFeatureActivity(character, authority.catalogs),
          authority.catalogs,
        ).find((row) => row.id === choice.id)
      if (!current || !authority?.catalogs)
        throw new RangeError('Current source rules cannot verify this optional feature pool.')
      const eligible = new Set(
        resolveClassChoiceOptions(
          current,
          {
            ...createClassChoiceCatalogs(authority.catalogs),
            classes: authority.catalogs.classes ?? authority.classes,
          },
          [],
          owner?.levels ?? 0,
          character,
        )
          .filter((row) => row.availability === 'eligible')
          .map((row) => getClassChoiceOptionKey(row.reference)),
      )
      const prior = new Set(
        (
          character.classChoiceSelections?.find((row) => row.choiceId === current.id)?.selected ??
          []
        ).map(getClassChoiceOptionKey),
      )
      if (
        selected.some(
          (row) =>
            !eligible.has(getClassChoiceOptionKey(row)) && !prior.has(getClassChoiceOptionKey(row)),
        )
      )
        throw new RangeError(
          'Optional feature availability changed. Review the current choices before confirming.',
        )
      return current
    }
    if (!createOptionalClassFeatureActivity(character, authority?.catalogs).choice(choice))
      throw new RangeError('This class feature choice is not active for this character.')
    return choice
  }
  const classData = authority && findClassReference(choice.owner, authority.classes)
  const affinity = choice.id === REVISED_AFFINITY_ID
  const subclassLiteral =
    affinity ||
    getBarbarianPathChoice(choice.id) ||
    getRevisedHunterRule(choice.id) ||
    getSubclassFeatureConfigurationRule(choice.id)
  const owner = subclassLiteral && findOwner(character, choice)
  if (getSubclassFeatureConfigurationRule(choice.id) && !selected.length) return choice
  const current =
    classData &&
    getCharacterClassChoices(
      classData,
      owner ? getSelectedSubclassData(classData, owner) : undefined,
      createOptionalClassFeatureActivity(character, authority?.catalogs),
      authority?.catalogs,
    ).find((candidate) => candidate.id === choice.id)
  if (!current || !authority?.catalogs || (affinity && !isRevisedAffinitySourceEnabled(character)))
    throw new RangeError(
      'Current source rules cannot verify this feature choice. Restore the source or review the saved choice.',
    )
  const eligible = new Set(
    resolveClassChoiceOptions(
      current,
      createClassChoiceCatalogs(authority.catalogs),
      decodeFavoredEnemyChoiceId(choice.id)
        ? selected.map((o) => ({ ...o, slotLevel: choice.level }))
        : [],
      findOwner(character, current)?.levels ?? 0,
    )
      .filter((option) => option.availability === 'eligible')
      .map((option) => getClassChoiceOptionKey(option.reference)),
  )
  if (selected.some((option) => !eligible.has(getClassChoiceOptionKey(option))))
    throw new RangeError(
      'Source rules changed. Review the available feature choices before confirming.',
    )
  return current
}

const CLASS_CHOICE_FEATURE_ID_PREFIX = 'class-choice:'

function sameSelectionKeys(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((key, index) => key === sortedRight[index])
  )
}

function verifyRevisedPactWithdrawal(
  character: Character,
  selection: CharacterClassChoiceSelection | undefined,
  options: readonly NormalizedChoiceOptionReference[],
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  if (selection?.choiceId !== REVISED_INVOCATION_POOL) return
  if (
    !selection.selected.some((row) => isPactBladeOption(row, 'xphb')) ||
    options.some((row) => isPactBladeOption(row, 'xphb'))
  )
    return
  const next = new Set(options.map(getClassChoiceOptionKey))
  if (
    !selection.selected.some(
      (row) =>
        isExactBladeInvocationOption(selection.choiceId, row) &&
        next.has(getClassChoiceOptionKey(row)),
    )
  )
    return
  if (!catalogs)
    throw new RangeError(
      'Restore the current Invocation source before replacing Pact of the Blade.',
    )
  const pact = getCurrentPactBladeState(character, catalogs, 'xphb')
  if (!pact?.option) return
  const views = resolveClassChoiceOptions(
    pact.choice,
    createClassChoiceCatalogs(catalogs),
    selection.selected,
    pact.owner.levels,
    character,
  )
  if (
    retainsBladeInvocationWithoutPact(
      views,
      new Set(selection.selected.map(getClassChoiceOptionKey)),
      next,
    )
  )
    throw new RangeError('Remove the dependent Invocations before replacing Pact of the Blade.')
}

/** Keeps or removes established source-backed intent without reconstructing missing rules. */
export function retainSavedFeatureOptionsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  choiceId: string,
  remainingKeys: readonly string[],
  authority?: ClassChoiceAuthority,
  expectedSelectionHandle?: string,
): CharacterCommandResult {
  const selection = character.classChoiceSelections?.find((row) => row.choiceId === choiceId)
  if (!selection) {
    if (expectedSelectionHandle !== undefined)
      throw new RangeError('The saved choice changed. Review it before confirming.')
    return { characterPatch: {}, provenanceUpdate: ledger }
  }
  const registeredPool = getRegisteredOptionalPoolSelection(character, selection)
  const registeredInvocations = getSavedRevisedInvocationOwner(character, selection)
  const registeredCompanion = isRegisteredCompanionSelection(selection)
  const order = getClassOrderById(choiceId)
  const registeredOrder =
    order && getSavedClassOrder(character, order)?.selection === selection ? order : undefined
  const registeredBranch =
    getSavedBlessedStrikes(character.classChoiceSelections ?? []) === selection ||
    getSavedElementalFury(character.classChoiceSelections ?? []) === selection
  if (getOptionalClassPoolSelectionSection(selection) && !registeredPool)
    throw new RangeError('The saved pool owner or slot cannot be verified for removal.')
  if (
    ((registeredPool ||
      registeredInvocations ||
      registeredCompanion ||
      registeredOrder ||
      registeredBranch ||
      choiceId === REVISED_AFFINITY_ID) &&
      expectedSelectionHandle === undefined) ||
    (registeredCompanion &&
      character.classChoiceSelections?.filter((row) => row.choiceId === choiceId).length !== 1) ||
    (expectedSelectionHandle !== undefined &&
      getOptionalPoolSelectionHandle(selection) !== expectedSelectionHandle)
  )
    throw new RangeError('The saved choice changed. Review it before confirming.')
  if (
    !registeredPool &&
    !registeredInvocations &&
    !registeredCompanion &&
    !registeredOrder &&
    !registeredBranch &&
    !isValidStormAuraSelection(selection) &&
    !isValidClassProficiencySelection(selection) &&
    !isValidPsionicSelection(selection) &&
    !isValidKenseiSelection(selection) &&
    !isValidLegacyStyleSelection(selection) &&
    (selection.kind !== 'feature-option' ||
      selection.selected.some((option) => option.entityType !== 'featureOption'))
  ) {
    throw new RangeError(
      'Only a saved source-backed feature choice supports this recovery operation.',
    )
  }
  if (decodeFavoredEnemyChoiceId(choiceId)) {
    if (remainingKeys.length)
      throw new RangeError(
        'Clear the whole saved enemy allocation, or restore its source to edit it.',
      )
    const next = (character.classChoiceSelections ?? []).filter((s) => s.choiceId !== choiceId)
    const grants = reconcileClassChoiceSelectionGrants(
      character,
      ledger,
      next,
      authority?.catalogs,
      authority?.spellContext,
    )
    return projectProficiencyCommandResult(
      character,
      {
        characterPatch: {
          classChoiceSelections: next,
          features: grants.features,
          proficiencies: grants.proficiencies,
        },
        provenanceUpdate: grants.provenanceUpdate,
      },
      authority?.catalogs,
    )
  }
  const originalKeys = selection.selected.map(getClassChoiceOptionKey)
  const remaining = new Set(remainingKeys)
  if (
    remaining.size !== remainingKeys.length ||
    remainingKeys.some((key) => !originalKeys.includes(key))
  ) {
    throw new RangeError(
      'Unavailable feature options can only retain or remove existing selections.',
    )
  }
  if (sameSelectionKeys(originalKeys, remainingKeys))
    return { characterPatch: {}, provenanceUpdate: ledger }
  const selected = selection.selected.filter((option) =>
    remaining.has(getClassChoiceOptionKey(option)),
  )
  verifyRevisedPactWithdrawal(character, selection, selected, authority?.catalogs)
  const next = (character.classChoiceSelections ?? []).flatMap((row) =>
    row.choiceId !== choiceId
      ? [row]
      : selected.length || row.proficiencyAtGain
        ? [{ ...row, selected }]
        : [],
  )
  const ownedProficiencies = isClassProficiencyChoiceId(selection.choiceId)
    ? retainClassProficiencyGrants(character, ledger, selection, selected)
    : undefined
  const featureGrants = ownedProficiencies
    ? undefined
    : reconcileChoiceMutationGrants(
        character,
        ledger,
        next,
        selection,
        authority?.catalogs ??
          (registeredPool ? { classes: [], classFeatures: [], subclassFeatures: [] } : undefined),
        authority?.spellContext,
      )
  const trainingId =
    registeredOrder && !selected.length
      ? getFixedProficiencyId({
          owner: [registeredOrder.owner, 'xphb'],
          target: registeredOrder.training.target,
          level: 1,
        })
      : undefined
  const afterOrderClear = trainingId
    ? stripFixedProficiencyGrants(
        { ...character, provenance: ledger },
        (tag) => tag.grantVariant === trainingId,
      )
    : undefined
  const grants = {
    features: featureGrants?.features ?? character.features,
    proficiencies:
      ownedProficiencies?.proficiencies ??
      afterOrderClear?.proficiencies ??
      character.proficiencies,
    provenanceUpdate: ownedProficiencies?.provenance ?? {
      ...featureGrants!.provenanceUpdate,
      proficiencies: afterOrderClear?.provenance.proficiencies ?? ledger.proficiencies,
    },
  }
  const projected = authority?.catalogs
    ? refreshClassProficiencyState(
        {
          ...character,
          classChoiceSelections: next,
          proficiencies: grants.proficiencies,
          provenance: grants.provenanceUpdate,
        },
        authority.classes,
        {
          ...authority.catalogs,
          featExpertiseFeats: authority.feats ?? authority.catalogs.featExpertiseFeats,
        },
      )
    : undefined
  return projectProficiencyCommandResult(
    character,
    {
      characterPatch: {
        classChoiceSelections: next,
        features: grants.features,
        proficiencies: projected?.proficiencies ?? grants.proficiencies,
      },
      provenanceUpdate: projected?.provenance ?? grants.provenanceUpdate,
    },
    authority?.catalogs,
  )
}

function findOwner(
  character: Character,
  choice: NormalizedCharacterChoice,
): CharacterClassEntry | undefined {
  return findClassReference(choice.owner, character.classProgression)
}

function validateSelectedOptions(
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
  previouslySelected: readonly CharacterClassChoiceOption[] = [],
): void {
  const keys = selected.map(getClassChoiceOptionKey)
  if (!choice.repeatable && new Set(keys).size !== keys.length) {
    throw new RangeError(`${choice.label} does not allow duplicate selections.`)
  }
  if (choice.options.length === 0 || choice.optionFilter) return
  const allowed = new Set([...choice.options, ...previouslySelected].map(getClassChoiceOptionKey))
  if (keys.some((key) => !allowed.has(key))) {
    throw new RangeError(`A selected option is not available for ${choice.label}.`)
  }
}

function verifyInvocationCantripEdit(
  character: Character,
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
  previous: CharacterClassChoiceSelection | undefined,
  authority: ClassChoiceAuthority | undefined,
  expectedHandle: string | undefined,
) {
  if (
    expectedHandle === undefined ||
    (previous ? getOptionalPoolSelectionHandle(previous) : '') !== expectedHandle
  )
    throw new RangeError('The saved Invocation choices changed. Review them before confirming.')
  const catalogs = authority?.catalogs
  const owner = findOwner(character, choice)
  const classes = catalogs?.classes?.filter((row) => findClassReference(choice.owner, [row]))
  const cls = classes?.length === 1 ? classes[0] : undefined
  const current =
    cls && !cls.sourceIdentityConflict && !('_copy' in cls) && owner && catalogs
      ? getCharacterClassChoices(
          cls,
          getSelectedSubclassData(cls, owner),
          createOptionalClassFeatureActivity(character, catalogs),
          catalogs,
        ).filter((row) => row.id === choice.id)
      : []
  if (
    !isCurrentRevisedInvocationCantripPool(choice, catalogs) ||
    current.length !== 1 ||
    !owner ||
    !catalogs ||
    (previous &&
      (!getSavedRevisedInvocationOwner(character, previous) ||
        !hasEarnedRevisedInvocationSlots(current[0], previous.selected, owner.levels)))
  )
    throw new RangeError(
      'Restore the exact Eldritch Invocations pool before editing its cantrip targets.',
    )

  const repeats = new Set<string>()
  const oldKeys = new Set((previous?.selected ?? []).map(getClassChoiceOptionKey))
  for (const option of selected) {
    const spell = option.invocationCantrip
    const repeat = getInvocationRepeatKey(option)
    if (
      spell &&
      (!isRevisedTargetedInvocation(option) ||
        option.ref ||
        Object.keys(spell).length !== 2 ||
        !isPlainSpellIdentityPart(spell.name) ||
        !isPlainSpellIdentityPart(spell.source) ||
        (repeat && repeats.has(repeat)))
    )
      throw new RangeError('Choose a different eligible cantrip for each repeat of an Invocation.')
    if (repeat) repeats.add(repeat)
  }
  const newTargets = selected.filter(
    (option) =>
      isRevisedTargetedInvocation(option) && !oldKeys.has(getClassChoiceOptionKey(option)),
  )
  if (newTargets.length) {
    const { knownWarlockCantrips } = projectManagedClassSpellState(character, {
      ...authority?.spellContext,
      catalogs,
    })
    const eligible = new Set(
      resolveClassChoiceOptions(
        current[0],
        createClassChoiceCatalogs(catalogs),
        [],
        owner.levels,
        character,
        knownWarlockCantrips,
      )
        .filter((row) => row.availability === 'eligible')
        .map((row) => getClassChoiceOptionKey(row.reference)),
    )
    if (
      newTargets.some(
        (option) => !option.invocationCantrip || !eligible.has(getClassChoiceOptionKey(option)),
      )
    )
      throw new RangeError('Choose a current eligible known Warlock cantrip for this Invocation.')
  }
  return current[0]
}

function resolveProgressiveChoiceGainEdit(
  character: Character,
  requested: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
  level: number,
  authority: ClassChoiceAuthority | undefined,
  expectedSelectionHandle: string | undefined,
) {
  const catalogs = authority?.catalogs
  const owners = character.classProgression.filter((entry) =>
    findClassReference(requested.owner, [entry]),
  )
  const owner = owners.length === 1 ? owners[0] : undefined
  const classes = authority?.classes.filter((entry) => findClassReference(requested.owner, [entry]))
  const cls = classes?.length === 1 ? classes[0] : undefined
  if (!catalogs || !owner || !cls || cls.sourceIdentityConflict || level > owner.levels)
    throw new RangeError('This choice gain is unavailable. Review the current class rules.')

  const subclasses =
    cls.subclasses?.filter(
      (row) => row.name === owner.subclass && row.source === owner.subclassSource,
    ) ?? []
  const subclass =
    subclasses.length === 1 && !subclasses[0].sourceIdentityConflict ? subclasses[0] : undefined
  const candidates = getCharacterClassChoices(
    cls,
    subclass,
    createOptionalClassFeatureActivity(character, catalogs),
    catalogs,
  ).filter((candidate) => candidate.id === requested.id)
  const choice = candidates.length === 1 ? candidates[0] : undefined
  const capacity = choice && getProgressiveChoiceGainCount(choice, level)
  if (
    !choice ||
    requested.kind !== choice.kind ||
    requested.level !== choice.level ||
    JSON.stringify(optionalClassOwner(requested.owner)) !==
      JSON.stringify(optionalClassOwner(choice.owner)) ||
    !capacity ||
    selected.length > capacity
  )
    throw new RangeError('This choice gain does not have enough earned slots.')

  const saved = (character.classChoiceSelections ?? []).filter((row) => row.choiceId === choice.id)
  const previous = saved[0]
  if (
    saved.length > 1 ||
    expectedSelectionHandle === undefined ||
    (previous ? getOptionalPoolSelectionHandle(previous) : '') !== expectedSelectionHandle ||
    (previous &&
      (previous.kind !== choice.kind ||
        previous.classLevel !== choice.level ||
        !findClassReference({ name: previous.className, source: previous.classSource }, [owner]) ||
        previous.subclassName !== choice.owner.subclassName ||
        previous.subclassSource !== choice.owner.subclassSource))
  )
    throw new RangeError('The saved choices changed. Review them before confirming.')

  const priorOptions = previous?.selected ?? []
  const priorByKey = new Map(
    priorOptions.map((option) => [getClassChoiceOptionKey(option), option]),
  )
  const availableSlots = getClassChoiceSlotLevels(choice).filter((slot) => slot <= owner.levels)
  const hasInvalidAllocation = priorOptions.some((option) => {
    const index = availableSlots.indexOf(option.slotLevel)
    if (index < 0) return true
    availableSlots.splice(index, 1)
    return false
  })
  const eligible = new Map(
    resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      priorOptions,
      owner.levels,
      character,
    )
      .filter(isClassChoiceOptionEligible)
      .map((option) => [getClassChoiceOptionKey(option.reference), option]),
  )
  let prerequisiteSnapshot: ReturnType<typeof buildPrerequisiteSnapshot> | undefined
  const updates = selected.map((option) => {
    const key = getClassChoiceOptionKey(option)
    const prior = priorByKey.get(key)
    if (prior?.slotLevel === level) return prior
    if (prior)
      throw new RangeError('Remove a choice without an earned slot before picking it again.')
    if (hasInvalidAllocation)
      throw new RangeError('Remove choices in invalid or overfilled slots before making new picks.')
    const current = eligible.get(key)
    if (!current) throw new RangeError('Choose an option from the current source.')
    if ((current.minimumClassLevel ?? 1) > level)
      throw new RangeError('Choose an option whose prerequisites were met at this gain.')
    if (current.prerequisite) {
      prerequisiteSnapshot ??= buildPrerequisiteSnapshot({
        character,
        classLookup: buildClassLookup([...(authority?.classes ?? [])]),
        classChoiceFeatureCatalogs: catalogs,
        classChoicePrerequisites: authority?.prerequisites,
        effectiveAbilityScores: authority?.prerequisites?.effectiveAbilityScores,
        effectiveSpellProfiles: authority?.prerequisites?.effectiveSpellProfiles,
      })
      if (
        !checkAllPrerequisites(current, prerequisiteSnapshot, {
          className: owner.name,
          classSource: owner.source,
        }).met
      )
        throw new RangeError('Choose an option whose prerequisites are met.')
    }
    return { ...current.reference, slotLevel: level }
  })
  return {
    choice,
    options: [
      ...priorOptions.filter(
        (option) =>
          getProgressiveChoiceReviewLevel(choice, option.slotLevel, owner.levels) !== level,
      ),
      ...updates,
    ],
  }
}

/** Persists a complete or partial source-qualified class choice without applying future effects. */
export function applyClassChoiceSelectionCommand(
  character: Character,
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
  authority?: ClassChoiceAuthority,
  favoredEnemy?: FavoredEnemySetup,
  expectedSelectionHandle?: string,
  progressionGainLevel?: number,
): Pick<Character, 'classChoiceSelections'> {
  if (
    progressionGainLevel === undefined &&
    selected.length &&
    (choice.kind === 'item' || choice.optionFilter?.featureTypes?.includes('AI')) &&
    getProgressiveChoiceGainCount(choice, choice.level) !== undefined
  )
    throw new RangeError('Choose this option through its earned level.')
  const gain =
    progressionGainLevel === undefined
      ? undefined
      : resolveProgressiveChoiceGainEdit(
          character,
          choice,
          selected,
          progressionGainLevel,
          authority,
          expectedSelectionHandle,
        )
  if (gain) {
    choice = gain.choice
    selected = gain.options
  }
  if (choice.id !== REVISED_INVOCATION_POOL && selected.some((option) => option.invocationCantrip))
    throw new RangeError(
      'Choose a cantrip target through the exact revised Eldritch Invocations pool.',
    )
  const previousInvocations =
    choice.id === REVISED_INVOCATION_POOL
      ? character.classChoiceSelections?.find((row) => row.choiceId === choice.id)
      : undefined
  const editsInvocationCantrips =
    choice.id === REVISED_INVOCATION_POOL &&
    [...(previousInvocations?.selected ?? []), ...selected].some(
      (option) => option.invocationCantrip || isRevisedTargetedInvocation(option),
    )
  if (
    !editsInvocationCantrips &&
    choice.id === REVISED_INVOCATION_POOL &&
    expectedSelectionHandle !== undefined &&
    (previousInvocations ? getOptionalPoolSelectionHandle(previousInvocations) : '') !==
      expectedSelectionHandle &&
    [...(previousInvocations?.selected ?? []), ...selected].some((option) =>
      isBladeDependentInvocation(choice.id, option),
    )
  )
    throw new RangeError('The saved Invocation choices changed. Review them before confirming.')
  if (editsInvocationCantrips)
    choice = verifyInvocationCantripEdit(
      character,
      choice,
      selected,
      previousInvocations,
      authority,
      expectedSelectionHandle,
    )
  if (isRetiredEpicBoonChoice(choice, authority?.catalogs))
    throw new RangeError('Choose or remove this feat through the Epic Boon advancement slot.')
  if (choice.id !== REVISED_AFFINITY_ID && selected.some(isRevisedAffinityOption))
    throw new RangeError('Choose a damage type through the exact Elemental Affinity feature.')
  if (
    selected.some((option) => {
      const target = decodeFeatureOptionReference(option)
      const rule = target?.format === 'source-group' && getBarbarianPathChoiceGroup(target.group)
      return rule && choice.id !== rule.id
    })
  )
    throw new RangeError('Choose through the exact Barbarian path feature.')
  if (
    !getRevisedHunterRule(choice.id) &&
    selected.some((option) => {
      const target = decodeFeatureOptionReference(option)
      return target?.format === 'source-group' && target.group === REVISED_HUNTER_GROUP
    })
  )
    throw new RangeError('Choose a Hunter option through its exact subclass feature.')
  if (
    !getSubclassFeatureConfigurationRule(choice.id) &&
    selected.some((option) => {
      const target = decodeFeatureOptionReference(option)
      return (
        target?.format === 'source-group' &&
        (target.group === LAND_GROUP ||
          target.group === SCION_GROUP ||
          target.group === ARMOR_MODEL_GROUP ||
          isWarlockPatronConfigurationGroup(target.group) ||
          isDivineSoulConfigurationGroup(target.group))
      )
    })
  )
    throw new RangeError('Choose an option through its exact subclass feature.')
  if (choice.id.startsWith('psionic-choice:')) {
    const relation = decodePsionicChoiceId(choice.id)
    if (
      !relation ||
      choice.kind !== 'psionic' ||
      choice.level !== 1 ||
      getClassChoiceDeclaration(choice)?.target !== relation.target ||
      getPsionicChoiceId(choice.owner, relation.pool) !== choice.id
    )
      throw new RangeError('Invalid psionic choice identity.')
    const prior = character.classChoiceSelections?.find((row) => row.choiceId === choice.id)
    if (!selected.length)
      return {
        classChoiceSelections: (character.classChoiceSelections ?? []).filter(
          (row) => row.choiceId !== choice.id,
        ),
      }
    if (
      prior &&
      isValidPsionicSelection(prior) &&
      sameSelectionKeys(
        prior.selected.map(getClassChoiceOptionKey),
        selected.map(getClassChoiceOptionKey),
      )
    )
      return { classChoiceSelections: character.classChoiceSelections }
  }
  if (
    (choice.id === BLESSED_STRIKES_ID ||
      choice.id === ELEMENTAL_FURY_ID ||
      choice.id === REVISED_AFFINITY_ID ||
      getClassOrderById(choice.id) ||
      getSubclassFeatureConfigurationRule(choice.id) ||
      decodeFavoredEnemyChoiceId(choice.id) ||
      decodeLegacySubclassChoice(choice.id)) &&
    expectedSelectionHandle !== undefined
  ) {
    const latest = character.classChoiceSelections?.find((s) => s.choiceId === choice.id)
    if ((latest ? getOptionalPoolSelectionHandle(latest) : '') !== expectedSelectionHandle)
      throw new RangeError('The saved allocation changed. Review it before confirming.')
  }
  choice = currentLiteralChoice(character, choice, selected, authority)
  const owner = findOwner(character, choice)
  const classLevel = owner?.levels ?? 0
  if (!owner || classLevel < choice.level) {
    throw new RangeError(`${choice.label} is not available at the character's current class level.`)
  }
  if (
    choice.owner.type === 'subclass' &&
    (!choice.owner.subclassName ||
      owner?.subclass !== choice.owner.subclassName ||
      (owner.subclassSource ?? '') !== (choice.owner.subclassSource ?? ''))
  ) {
    throw new RangeError(`${choice.label} is not available for the character's current subclass.`)
  }
  const requiredCount = getRequiredChoiceSelectionCount(choice, classLevel)
  if (
    !gain &&
    selected.length >
      (decodeFavoredEnemyChoiceId(choice.id)
        ? favoredEnemy?.mode === 'humanoid-races'
          ? 2
          : 1
        : requiredCount)
  ) {
    throw new RangeError(`${choice.label} allows ${requiredCount} selections at this class level.`)
  }
  const existingSelection = character.classChoiceSelections?.find(
    (existing) => existing.choiceId === choice.id,
  )
  const bladeInvocationSource = getBladeInvocationSource(choice.id)
  const pactSource =
    choice.id === CLASSIC_PACT_BOON_POOL
      ? 'phb'
      : choice.id === REVISED_INVOCATION_POOL
        ? 'xphb'
        : undefined
  const nativeBladeSource = bladeInvocationSource ?? pactSource
  if (
    nativeBladeSource &&
    (choice.kind !== 'optional-feature' ||
      choice.owner.type !== 'class' ||
      normalizeOwnerIdentity(owner.name) !== 'warlock' ||
      normalizeOwnerIdentity(owner.source) !== nativeBladeSource ||
      choice.owner.subclassName ||
      choice.owner.subclassSource)
  )
    throw new RangeError('Choose these options through their exact Warlock owner.')
  const previousBladeOptions =
    nativeBladeSource &&
    existingSelection?.kind === choice.kind &&
    existingSelection.classLevel === choice.level &&
    normalizeOwnerIdentity(existingSelection.className) === 'warlock' &&
    normalizeOwnerIdentity(existingSelection.classSource) === nativeBladeSource &&
    !existingSelection.subclassName &&
    !existingSelection.subclassSource &&
    character.classChoiceSelections?.filter((row) => row.choiceId === choice.id).length === 1
      ? existingSelection.selected
      : []
  if (nativeBladeSource) {
    for (const option of selected) {
      const isPact =
        pactSource &&
        normalizeOwnerIdentity(option.name) === normalizeOwnerIdentity(PACT_BLADE_NAME)
      const isDependent = isBladeDependentInvocation(choice.id, option)
      if (!isPact && !isDependent) continue
      if (
        isPact
          ? isPactBladeOption(option, pactSource)
          : isExactBladeInvocationOption(choice.id, option)
      )
        continue
      if (
        !previousBladeOptions.some(
          (prior) =>
            prior.ref === option.ref &&
            typeof prior.invocationCantrip === typeof option.invocationCantrip &&
            getClassChoiceOptionKey(prior) === getClassChoiceOptionKey(option),
        )
      )
        throw new RangeError('Choose the exact native Blade Invocation or Pact printing.')
    }
  }
  if (!decodeFavoredEnemyChoiceId(choice.id))
    validateSelectedOptions(choice, selected, existingSelection?.selected)
  if (favoredEnemy && !decodeFavoredEnemyChoiceId(choice.id))
    throw new RangeError('Campaign enemy setup requires its exact choice family.')
  if (decodeFavoredEnemyChoiceId(choice.id) && !favoredEnemy && selected.length)
    throw new RangeError('Confirm the enemy setup mode.')
  if (
    favoredEnemy?.language?.kind === 'spoken' &&
    !hasProficiencyCatalogTarget(
      getProficiencyOption('languages', favoredEnemy.language.name),
      authority?.catalogs,
    )
  )
    throw new RangeError('Restore this language before confirming its association.')
  if (isFeatureLiteralChoiceId(choice.id) && (selected.length || favoredEnemy)) {
    const proposed = {
      ...existingSelection,
      favoredEnemy,
      choiceId: choice.id,
      label: choice.label,
      kind: choice.kind,
      className: owner.name,
      classSource: owner.source,
      ...(choice.owner.subclassName ? { subclassName: choice.owner.subclassName } : {}),
      ...(choice.owner.subclassSource ? { subclassSource: choice.owner.subclassSource } : {}),
      classLevel: choice.level,
      selected: selected.map((option) => ({ ...option, slotLevel: choice.level })),
    } as CharacterClassChoiceSelection
    const next = [
      ...(character.classChoiceSelections ?? []).filter((row) => row.choiceId !== choice.id),
      proposed,
    ]
    if (getInvalidFeatureLiteralSelectionIds(next, character.classProgression).has(choice.id))
      throw new RangeError(
        decodeFavoredEnemyChoiceId(choice.id)
          ? 'Use distinct enemies for each earned choice and confirm the complete setup.'
          : getSubclassFeatureConfigurationRule(choice.id)
            ? 'Choose one current option for the exact subclass feature.'
            : getBarbarianPathChoice(choice.id)
              ? 'Choose one current option for the exact Barbarian path feature.'
              : choice.id === REVISED_AFFINITY_ID
                ? 'Choose one current damage type for Elemental Affinity.'
                : getRevisedHunterRule(choice.id)
                  ? 'Choose one current option for the exact Hunter feature.'
                  : 'Choose a different favored terrain for each earned Natural Explorer choice.',
      )
  }
  if (
    (choice.kind === 'feature-option' ||
      choice.kind === 'proficiency' ||
      isStormAuraChoiceId(choice.id)) &&
    JSON.stringify(existingSelection?.favoredEnemy) === JSON.stringify(favoredEnemy) &&
    sameSelectionKeys(
      (existingSelection?.selected ?? []).map(getClassChoiceOptionKey),
      selected.map(getClassChoiceOptionKey),
    )
  ) {
    return { classChoiceSelections: character.classChoiceSelections }
  }
  const minimumLevelByKey =
    !gain && choice.fixedOptions?.length
      ? new Map(
          resolveClassChoiceOptions(
            choice,
            createClassChoiceCatalogs(authority?.catalogs),
            existingSelection?.selected,
            owner.levels,
            character,
          ).flatMap((option) =>
            isClassChoiceOptionEligible(option) && option.minimumClassLevel !== undefined
              ? [[getClassChoiceOptionKey(option.reference), option.minimumClassLevel] as const]
              : [],
          ),
        )
      : undefined
  let slotLevels = gain
    ? []
    : assignProgressionSlotLevels(
        editsInvocationCantrips
          ? getRevisedInvocationSlotPrior(existingSelection?.selected ?? [], selected)
          : (existingSelection?.selected ?? []).map((option) => ({
              key: getClassChoiceOptionKey(option),
              slotLevel: option.slotLevel,
            })),
        selected.map(getClassChoiceOptionKey),
        getClassChoiceSlotLevels(choice).slice(0, requiredCount),
        choice.level,
        minimumLevelByKey,
      )
  if (choice.kind === 'psionic') {
    const prior = existingSelection?.selected ?? []
    const available = getClassChoiceSlotLevels(choice).slice(0, requiredCount)
    for (const row of prior.filter((row) =>
      selected.some((option) => getClassChoiceOptionKey(option) === getClassChoiceOptionKey(row)),
    )) {
      const i = available.indexOf(row.slotLevel)
      if (i >= 0) available.splice(i, 1)
    }
    const fresh = selected.filter(
      (row) => !prior.some((old) => getClassChoiceOptionKey(old) === getClassChoiceOptionKey(row)),
    )
    if (fresh.length > available.length)
      throw new RangeError('No current earned psionic slots remain.')
    const assigned = assignProgressionSlotLevels(
      [],
      fresh.map(getClassChoiceOptionKey),
      available,
      choice.level,
    )
    const levels = new Map(fresh.map((row, i) => [getClassChoiceOptionKey(row), assigned[i]]))
    slotLevels = selected.map(
      (row) =>
        prior.find((old) => getClassChoiceOptionKey(old) === getClassChoiceOptionKey(row))
          ?.slotLevel ?? levels.get(getClassChoiceOptionKey(row))!,
    )
  }
  const selection: CharacterClassChoiceSelection = {
    choiceId: choice.id,
    label: choice.label,
    kind: choice.kind,
    className: owner.name,
    classSource: owner.source,
    ...(choice.owner.subclassName ? { subclassName: choice.owner.subclassName } : {}),
    ...(choice.owner.subclassSource ? { subclassSource: choice.owner.subclassSource } : {}),
    classLevel: choice.level,
    ...(favoredEnemy ? { favoredEnemy } : {}),
    ...(existingSelection?.proficiencyAtGain
      ? { proficiencyAtGain: existingSelection.proficiencyAtGain }
      : {}),
    selected:
      gain?.options ??
      selected.map<CharacterClassChoiceOption>((option, index) => ({
        ...option,
        name: option.name.trim(),
        ...(option.source?.trim() ? { source: option.source.trim() } : {}),
        slotLevel: slotLevels[index] ?? choice.level,
      })),
  }
  const retained = (character.classChoiceSelections ?? []).filter(
    (existing) => existing.choiceId !== choice.id,
  )
  const next =
    selection.selected.length > 0 || selection.proficiencyAtGain || selection.favoredEnemy
      ? [...retained, selection]
      : retained
  if (
    authority?.catalogs?.creatures &&
    isRegisteredCompanionSelection(selection) &&
    !getCompanionSelectionStates(
      { ...character, classChoiceSelections: next },
      authority.classes,
      authority.catalogs,
    ).some((state) => state.selection.choiceId === choice.id && state.creature)
  )
    throw new RangeError('The companion source changed. Review the available creatures.')
  if (isKenseiChoiceId(choice.id) && getInvalidKenseiSelectionIds(next).size)
    throw new RangeError('Choose distinct Kensei weapon types in their earned slots.')
  if (choice.kind === 'psionic') {
    if (getInvalidPsionicSelectionIds(next).size)
      throw new RangeError('Choose distinct psionics across the Mystic pools.')
    for (const row of selection.selected.filter(
      (row) =>
        !existingSelection?.selected.some(
          (old) => getClassChoiceOptionKey(old) === getClassChoiceOptionKey(row),
        ),
    ))
      if (!psionicSlotIsCurrent(choice, selection.selected, row.slotLevel, classLevel))
        throw new RangeError('The psionic gain slot is no longer available.')
  }
  if (
    isClassProficiencyChoiceId(choice.id) &&
    getInvalidClassProficiencySelectionIds(next).has(choice.id)
  )
    throw new RangeError('Choose different skills for each earned proficiency choice.')
  if (bladeInvocationSource) {
    verifyRevisedPactWithdrawal(
      character,
      existingSelection,
      selection.selected,
      authority?.catalogs,
    )
    const priorKeys = new Set(previousBladeOptions.map(getClassChoiceOptionKey))
    const newBladeInvocations = selection.selected.filter(
      (option) =>
        isBladeDependentInvocation(choice.id, option) &&
        !priorKeys.has(getClassChoiceOptionKey(option)),
    )
    if (newBladeInvocations.length) {
      const catalogs = authority?.catalogs
      const eligible = catalogs
        ? resolveClassChoiceOptions(
            choice,
            createClassChoiceCatalogs(catalogs),
            selection.selected,
            classLevel,
            { ...character, classChoiceSelections: next },
          )
            .filter(isClassChoiceOptionEligible)
            .map((view) => getClassChoiceOptionKey(view.reference))
        : []
      if (newBladeInvocations.some((row) => !eligible.includes(getClassChoiceOptionKey(row))))
        throw new RangeError(
          'Choose an earned Blade Invocation with its current Pact of the Blade.',
        )
    }
  }
  if (getOptionalClassPoolSection(choice)) {
    const active = getEffectiveClassChoiceFeatureRoutes(
      { ...character, classChoiceSelections: next },
      authority?.catalogs,
      {
        effectiveAbilityScores: authority?.spellContext?.abilityScores,
        effectiveSpellProfiles: projectManagedClassSpellState(
          { ...character, classChoiceSelections: next },
          { ...authority?.spellContext, catalogs: authority?.catalogs },
        ).independentSpellProfiles,
      },
    )
    const prior = new Set((existingSelection?.selected ?? []).map(getClassChoiceOptionKey))
    if (
      selection.selected.some(
        (option) =>
          !prior.has(getClassChoiceOptionKey(option)) &&
          !active.featureIds.has(getClassChoiceFeatureId(selection, option)),
      )
    )
      throw new RangeError('This option does not meet its current prerequisites.')
  }
  return { classChoiceSelections: next }
}

function isFeatureOption(
  option: CharacterClassChoiceOption,
): option is CharacterClassChoiceOption & {
  entityType: 'classFeature' | 'subclassFeature' | 'optionalFeature' | 'psionic'
} {
  return (
    option.entityType === 'classFeature' ||
    option.entityType === 'subclassFeature' ||
    option.entityType === 'optionalFeature' ||
    option.entityType === 'psionic'
  )
}

export function reconcileClassChoiceFeatMirror(
  character: Character,
  ledger: ProvenanceLedger,
  choice: NormalizedCharacterChoice,
  selection: CharacterClassChoiceSelection | undefined,
): CharacterCommandResult {
  if (choice.kind !== 'feat' || isClassProficiencyChoiceId(choice.id))
    return { characterPatch: {}, provenanceUpdate: ledger }
  const owner = findOwner(character, choice)
  const categories = choice.optionFilter?.categories ?? []
  return replaceClassFeatSelectionsCommand(
    character,
    ledger,
    {
      choiceId: choice.id,
      className: selection?.className ?? owner?.name ?? choice.owner.name,
      classSource: selection?.classSource ?? owner?.source ?? choice.owner.source,
      ...(choice.owner.subclassName ? { subclassName: choice.owner.subclassName } : {}),
      ...(choice.owner.subclassSource ? { subclassSource: choice.owner.subclassSource } : {}),
      progressionName: choice.label,
      categories,
      slotLevels: selection?.selected.map((option) => option.slotLevel) ?? [],
    },
    selection?.selected.map((option) => ({ name: option.name, source: option.source })) ?? [],
  )
}

function rebuildClassChoiceFeatures(
  existing: readonly Feature[],
  selections: readonly CharacterClassChoiceSelection[],
  preservedIds: ReadonlySet<string>,
): Feature[] {
  const retained = existing.filter(
    (feature) =>
      !feature.id.startsWith(CLASS_CHOICE_FEATURE_ID_PREFIX) || preservedIds.has(feature.id),
  )
  const existingIdentities = new Set(retained.map((feature) => feature.id))

  for (const selection of selections) {
    for (const option of selection.selected) {
      if (!isFeatureOption(option)) continue
      const identity = getClassChoiceFeatureId(selection, option)
      if (existingIdentities.has(identity)) continue
      retained.push(getClassChoiceGrantedFeature(selection, option))
      existingIdentities.add(identity)
    }
  }

  return retained
}

function isSavedFeatureSourceMissing(
  selection: CharacterClassChoiceSelection,
  option: CharacterClassChoiceOption,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  if (option.entityType === 'optionalFeature' && option.source?.trim()) {
    const key = getClassChoiceCatalogOptionKey(option)
    const matches = catalogs.optionalFeatureCandidates
      ? (catalogs.optionalFeatureCandidates.get(key) ?? [])
      : catalogs.optionalFeatures?.filter(
          (feature) =>
            getClassChoiceCatalogOptionKey({ ...feature, entityType: 'optionalFeature' }) === key,
        )
    return (
      matches !== undefined &&
      (matches.length !== 1 ||
        ('sourceIdentityConflict' in matches[0] && matches[0].sourceIdentityConflict === true))
    )
  }
  if (option.entityType === 'psionic')
    return catalogs.psionics !== undefined && !resolvePsionic(option, catalogs.psionics)
  if (option.entityType === 'classFeature')
    return !resolveClassChoiceFeatureEntity(option, catalogs)
  if (option.entityType !== 'subclassFeature') return false
  const owner = selection.subclassName
    ? getFeatureOwnerKey(
        selection.className,
        selection.classSource,
        selection.subclassName,
        selection.subclassSource,
      )
    : undefined
  return !resolveClassChoiceFeatureEntity(option, scopeClassChoiceFeatureCatalogs(catalogs, owner))
}

/**
 * Rebuilds grants owned by normalized class choices from their persisted selections.
 *
 * Feature-shaped options can be materialized without interpreting rules prose. Feat choices are
 * reconciled separately through the established feat-option handler, while item choices remain
 * source-qualified selections until structured item effects can be applied safely.
 */
export function reconcileClassChoiceSelectionGrants(
  character: Character,
  ledger: ProvenanceLedger,
  selections: readonly CharacterClassChoiceSelection[],
  catalogs?: ClassChoiceFeatureCatalogs,
  spellContext?: ManagedClassSpellContext,
): Pick<CharacterCommandResult, 'provenanceUpdate'> & {
  features: Feature[]
  proficiencies: Character['proficiencies']
} {
  const draft = { ...character, classChoiceSelections: [...selections] }
  const managedSpells = projectManagedClassSpellState(
    { ...draft, provenance: ledger },
    { ...spellContext, catalogs },
  )
  const routes = getEffectiveClassChoiceFeatureRoutes(draft, catalogs, {
    effectiveAbilityScores: spellContext?.abilityScores,
    effectiveSpellProfiles: managedSpells.independentSpellProfiles,
    knownWarlockCantrips: managedSpells.knownWarlockCantrips,
  })
  const preservedFeatureIds = new Set<string>()
  const preservedGrants = new Map<string, Set<string>>()
  let spellReferences: Set<string> | undefined
  for (const selection of selections) {
    const isRevisedInvocation = selection.choiceId === REVISED_INVOCATION_POOL
    if (!catalogs && !isRevisedInvocation) continue
    const previous = character.classChoiceSelections?.find(
      (row) => row.choiceId === selection.choiceId,
    )
    if (
      !previous ||
      selection.inactive ||
      previous.inactive !== selection.inactive ||
      previous.className !== selection.className ||
      previous.classSource !== selection.classSource ||
      previous.subclassName !== selection.subclassName ||
      previous.subclassSource !== selection.subclassSource
    )
      continue
    const entry = findClassReference(
      { name: selection.className, source: selection.classSource },
      character.classProgression,
    )
    const missingOwner =
      entry && catalogs?.classes && !resolveClassProgressionRules(entry, catalogs.classes)
    const savedInvocationOwner =
      isRevisedInvocation && getSavedRevisedInvocationOwner(draft, selection)
    for (const option of selection.selected) {
      if (
        !isFeatureOption(option) ||
        !previous.selected.some(
          (prior) =>
            prior.slotLevel === option.slotLevel &&
            getClassChoiceOptionKey(prior) === getClassChoiceOptionKey(option),
        )
      )
        continue
      const target =
        savedInvocationOwner && isRevisedTargetedInvocation(option)
          ? option.invocationCantrip
          : undefined
      if (target && catalogs?.classes && spellContext?.spellsByKey) {
        spellReferences ??= new Set(
          Object.values(spellContext.spellsByKey).map((spell) =>
            getSpellReferenceKey(spell.name, spell.source),
          ),
        )
      }
      // Missing authority suspends the benefit without retracting the saved grant.
      const missingTarget =
        target && !spellReferences?.has(getSpellReferenceKey(target.name, target.source))
      if (
        !missingOwner &&
        !missingTarget &&
        !(catalogs && isSavedFeatureSourceMissing(selection, option, catalogs))
      )
        continue
      preservedFeatureIds.add(getClassChoiceFeatureId(selection, option))
      const names = preservedGrants.get(selection.choiceId) ?? new Set<string>()
      names.add(normalizeKey(option.name))
      preservedGrants.set(selection.choiceId, names)
    }
  }
  const activeSelections = selections
    .filter((selection) => !selection.inactive)
    .map((selection) => ({
      ...selection,
      selected: selection.selected.filter(
        (option) => !preservedFeatureIds.has(getClassChoiceFeatureId(selection, option)),
      ),
    }))
    .map((saved) => {
      const selection = getBladeInvocationSource(saved.choiceId)
        ? {
            ...saved,
            selected: saved.selected.filter((option) => {
              if (!isBladeDependentInvocation(saved.choiceId, option)) return true
              const featureId = getClassChoiceFeatureId(saved, option)
              return routes.contributions.some(
                ({ choiceId, id }) => choiceId === saved.choiceId && id === featureId,
              )
            }),
          }
        : saved
      if (selection.choiceId === REVISED_INVOCATION_POOL)
        return {
          ...selection,
          selected: selection.selected.filter(
            (option) =>
              !isRevisedTargetedInvocation(option) ||
              routes.featureIds.has(getClassChoiceFeatureId(selection, option)),
          ),
        }
      if (
        selection.kind === 'psionic' ||
        selection.choiceId === BLESSED_STRIKES_ID ||
        routes.progressiveChoiceIds.has(selection.choiceId) ||
        (catalogs &&
          selection.kind === 'optional-feature' &&
          getFighterStylePair(selection.choiceId))
      )
        return {
          ...selection,
          selected: selection.selected.filter((option) =>
            routes.featureIds.has(getClassChoiceFeatureId(selection, option)),
          ),
        }
      const section = getOptionalClassPoolSelectionSection(selection)
      return section
        ? {
            ...selection,
            selected: selection.selected.filter(
              (option) =>
                option.entityType !== 'optionalFeature' ||
                (!catalogs &&
                  option.source?.trim().toLowerCase() !== section.source.toLowerCase()) ||
                routes.featureIds.has(getClassChoiceFeatureId(selection, option)),
            ),
          }
        : selection
    })
  const ownedChoiceIds = new Set([
    ...(character.classChoiceSelections ?? []).map((selection) => selection.choiceId),
    ...selections.map((selection) => selection.choiceId),
  ])
  const features = Object.fromEntries(
    Object.entries(ledger.features).flatMap(([key, tags]) => {
      const retained = tags.filter(
        (tag) =>
          !(
            tag.sourceType === 'class' &&
            tag.grantVariant !== undefined &&
            ownedChoiceIds.has(tag.grantVariant) &&
            !preservedGrants.get(tag.grantVariant)?.has(key)
          ),
      )
      return retained.length > 0 ? [[key, retained]] : []
    }),
  )
  let provenanceUpdate: ProvenanceLedger = { ...ledger, features }

  for (const selection of activeSelections) {
    const tag = {
      ...makeSourceTag('class', selection.className, 'choice', selection.classSource),
      grantVariant: selection.choiceId,
    }
    for (const option of selection.selected) {
      if (!isFeatureOption(option)) continue
      provenanceUpdate = addGrant(provenanceUpdate, 'features', option.name, tag)
    }
  }

  const proficiencyGrants = reconcileClassProficiencyGrants(character, provenanceUpdate, selections)
  return {
    features: rebuildClassChoiceFeatures(character.features, activeSelections, preservedFeatureIds),
    proficiencies: proficiencyGrants.proficiencies,
    provenanceUpdate: proficiencyGrants.provenance!,
  }
}

/** A proficiency-only edit must preserve unrelated feature ownership, including supplied ledger work. */
function reconcileChoiceMutationGrants(
  character: Character,
  ledger: ProvenanceLedger,
  selections: readonly CharacterClassChoiceSelection[],
  choice:
    | Pick<NormalizedCharacterChoice, 'kind' | 'id' | 'owner'>
    | Pick<CharacterClassChoiceSelection, 'kind' | 'choiceId' | 'className' | 'classSource'>,
  catalogs?: ClassChoiceFeatureCatalogs,
  spellContext?: ManagedClassSpellContext,
) {
  const choiceId = 'id' in choice ? choice.id : choice.choiceId
  if (choice.kind !== 'proficiency' && !isClassProficiencyChoiceId(choiceId)) {
    return reconcileClassChoiceSelectionGrants(
      character,
      ledger,
      selections,
      catalogs,
      spellContext,
    )
  }
  const state = reconcileClassProficiencyGrants(character, ledger, selections)
  return {
    features: character.features,
    proficiencies: state.proficiencies,
    provenanceUpdate: state.provenance!,
  }
}

/** Persists a normalized class choice and atomically reconciles its safe mechanical grants. */
export function applyClassChoiceSelectionWithGrantsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
  authority?: ClassChoiceAuthority,
  favoredEnemy?: FavoredEnemySetup,
  expectedSelectionHandle?: string,
  progressionGainLevel?: number,
): CharacterCommandResult {
  if (authority?.catalogs && !authority.catalogs.classes && getFighterStylePair(choice.id)) {
    authority = { ...authority, catalogs: { ...authority.catalogs, classes: authority.classes } }
  }
  const selectionPatch = applyClassChoiceSelectionCommand(
    character,
    choice,
    selected,
    authority,
    favoredEnemy,
    expectedSelectionHandle,
    progressionGainLevel,
  )
  if (
    (choice.kind === 'psionic' ||
      choice.kind === 'feature-option' ||
      choice.kind === 'proficiency' ||
      isClassProficiencyChoiceId(choice.id) ||
      isStormAuraChoiceId(choice.id)) &&
    selectionPatch.classChoiceSelections === character.classChoiceSelections
  ) {
    return { characterPatch: {}, provenanceUpdate: ledger }
  }
  const classChoiceSelections = selectionPatch.classChoiceSelections ?? []
  const grants = reconcileChoiceMutationGrants(
    character,
    ledger,
    classChoiceSelections,
    choice,
    authority?.catalogs,
    authority?.spellContext,
  )
  const withSelections: Character = {
    ...character,
    classChoiceSelections,
    features: grants.features,
    proficiencies: grants.proficiencies,
    provenance: grants.provenanceUpdate,
  }
  const featMirror = reconcileClassChoiceFeatMirror(
    withSelections,
    grants.provenanceUpdate,
    choice,
    classChoiceSelections.find((selection) => selection.choiceId === choice.id),
  )
  const projected = authority?.catalogs
    ? refreshClassProficiencyState(
        {
          ...withSelections,
          ...featMirror.characterPatch,
          provenance: featMirror.provenanceUpdate,
        },
        authority.classes,
        {
          ...authority.catalogs,
          featExpertiseFeats: authority.feats ?? authority.catalogs.featExpertiseFeats,
        },
      )
    : undefined

  return projectProficiencyCommandResult(
    character,
    {
      characterPatch: {
        ...featMirror.characterPatch,
        classChoiceSelections,
        features: grants.features,
        proficiencies:
          projected?.proficiencies ??
          featMirror.characterPatch.proficiencies ??
          grants.proficiencies,
      },
      provenanceUpdate: projected?.provenance ?? featMirror.provenanceUpdate,
    },
    authority?.catalogs,
  )
}

/** Removes selections whose source-qualified class or earned choice slot no longer exists. */
export function reconcileClassChoiceSelections(
  selections: readonly CharacterClassChoiceSelection[] | undefined,
  progression: readonly CharacterClassEntry[],
): CharacterClassChoiceSelection[] {
  return (selections ?? []).flatMap((selection) => {
    const owner = progression.find(
      (entry) =>
        entry.name === selection.className &&
        (entry.source ?? '') === (selection.classSource ?? ''),
    )
    if (!owner || owner.levels < selection.classLevel) return []
    if (
      selection.subclassName &&
      (owner.subclass !== selection.subclassName ||
        (owner.subclassSource ?? '') !== (selection.subclassSource ?? ''))
    ) {
      return []
    }
    const selected = selection.selected.filter((option) => option.slotLevel <= owner.levels)
    return selected.length > 0 || selection.proficiencyAtGain || selection.favoredEnemy
      ? [{ ...selection, selected }]
      : []
  })
}
