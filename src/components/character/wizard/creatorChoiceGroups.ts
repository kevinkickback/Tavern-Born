import { getFeatureTypes } from '@/lib/5etools/classData'
import { isKnownFeatExpertiseTarget } from '@/lib/5etools/featExpertiseRules'
import { isSkilledFeatTarget } from '@/lib/5etools/featSkillRules'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import {
  deriveFeatOptionSteps,
  deriveSpellStepsForClass,
  type FeatOptionStep,
  hasFeatOptions,
} from '@/lib/5etools/parsers/featOptions'
import { resolveFeatChoicePool } from '@/lib/calculations/featChoices'
import { is2024OriginLanguageChoice, isCommonLanguage } from '@/lib/calculations/languageOrigin'
import { ALL_SKILLS } from '@/lib/calculations/skillNames'
import {
  formatSpellReference,
  getSpellNameKey,
  getSpellReferenceKey,
} from '@/lib/calculations/spellIdentity'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import { hasClassFeatSpellSetup } from '@/lib/character/classFeatChoices'
import type { FeatOptionTarget } from '@/lib/character/commands/featCommandIdentity'
import { getFeatChoiceSelectedRefs } from '@/lib/character/commands/featCommandSupport'
import { getFeatExpertiseSkillPool } from '@/lib/character/featExpertiseSelections'
import { getFeatSetupOwners } from '@/lib/character/featSetupOwners'
import { getFeatSetupStatus } from '@/lib/character/featSetupProgress'
import { getSkilledSkillPool } from '@/lib/character/featSkillSelections'
import { assignSavedFeatSpells, createFeatSpellMatcher } from '@/lib/character/featSpellChoices'
import type { ProficiencyBlockDomain } from '@/lib/provenance/applyProficiencyBlocks'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import { normalizeKey, normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import { isSelectedRaceOwner } from '@/lib/provenance/raceOwnership'
import type { SourceTag } from '@/lib/provenance/types'
import {
  buildToolChoiceSlots,
  buildToolSubtypeOptionsByKind,
} from '@/pages/build/proficiencies/model/data'
import type { Feat5e, GameData, OptionalFeatureLike, Spell5e } from '@/types/5etools'
import type { Character, RaceSpellChoice, SpellProfile } from '@/types/character'

export type CreatorChoiceCatalog = Pick<
  GameData,
  'feats' | 'items' | 'itemsBase' | 'languages' | 'optionalfeatures' | 'spells'
>
export type CreatorChoiceScope = 'race' | 'class' | 'background'

function isCreatorChoiceOwner(tag: SourceTag, character: Character, scope: CreatorChoiceScope) {
  if (scope === 'race') return isSelectedRaceOwner(tag, character)
  const matches = (name?: string, source?: string) =>
    !!name &&
    normalizeOwnerIdentity(tag.sourceName) === normalizeOwnerIdentity(name) &&
    normalizeOwnerIdentity(tag.sourceRef) === normalizeOwnerIdentity(source)
  if (scope === 'background')
    return (
      tag.sourceType === 'background' && matches(character.background, character.backgroundSource)
    )
  const entry = character.classProgression[0]
  return (
    !!entry &&
    ((tag.sourceType === 'class' && matches(entry.name, entry.source)) ||
      (tag.sourceType === 'subclass' && matches(entry.subclass, entry.subclassSource)))
  )
}

function canChooseFeatSpells(
  steps: readonly Extract<FeatOptionStep, { kind: 'spells' }>[],
  spells: readonly Spell5e[],
) {
  if (!steps.length) return true
  const matches = steps.map((step) => createFeatSpellMatcher(step.chooseFilter))
  const candidates = spells.filter((spell) => matches.some((match) => match(spell)))
  const { selections } = assignSavedFeatSpells(
    steps,
    candidates.map(({ name, source }) => formatSpellReference(name, source)),
    buildSpellLookup(candidates),
  )
  return steps.every((step, index) => (selections[index]?.length ?? 0) >= step.count)
}

export function getCreatorFeatSetupStatus(
  character: Character,
  effective: Character,
  target: FeatOptionTarget,
  feat: Feat5e,
  feats: readonly Feat5e[],
) {
  const setup = getFeatSetupStatus(character, effective, target, feats)
  if (
    !setup.complete ||
    !setup.options ||
    (target.classFeatChoiceId &&
      hasClassFeatSpellSetup(character, target.classFeatChoiceId, target.name, target.source))
  )
    return setup

  const steps = deriveFeatOptionSteps(feat)
  const spellSteps =
    setup.options.spellcastingClass && steps.some((step) => step.kind === 'spellcastingClass')
      ? deriveSpellStepsForClass(feat, setup.options.spellcastingClass)
      : steps.filter((step) => step.kind === 'spells')
  const count = spellSteps.reduce((total, step) => total + step.count, 0)
  return { ...setup, complete: (setup.options.spells?.length ?? 0) >= count }
}

export function hasReachableFeatSetup(
  character: Character,
  effective: Character,
  target: FeatOptionTarget,
  feat: Feat5e,
  rules: CreatorChoiceCatalog,
) {
  const setup = getCreatorFeatSetupStatus(character, effective, target, feat, rules.feats)
  if (!setup.sourceAvailable || setup.complete) return false
  const steps = deriveFeatOptionSteps(feat)
  const skillPool = isSkilledFeatTarget(target)
    ? getSkilledSkillPool(character, effective, target, rules.feats)
    : ALL_SKILLS
  const expertiseSkills = isKnownFeatExpertiseTarget(target)
    ? getFeatExpertiseSkillPool(character, effective, target, setup.options ?? {}, rules.feats)
    : effective.proficiencies.skills
  const canGainExpertiseSkill = steps.some(
    (step) => step.kind === 'proficiency' && step.domain === 'skills' && step.count > 0,
  )
  return (
    canChooseFeatSpells(
      steps.filter((step) => step.kind === 'spells'),
      rules.spells,
    ) &&
    steps.every((step) => {
      switch (step.kind) {
        case 'spellcastingClass':
          return step.classOptions.some(({ name }) =>
            canChooseFeatSpells(
              deriveSpellStepsForClass(feat, name).map((pick) => ({ ...pick, kind: 'spells' })),
              rules.spells,
            ),
          )
        case 'proficiency': {
          const pool =
            step.optionPool ??
            (step.domain === 'languages'
              ? rules.languages.map(({ name }) => name)
              : step.domain === 'skills'
                ? skillPool
                : [])
          return (
            new Set(
              pool
                .map(normalizeKey)
                .filter(
                  (name) =>
                    (step.domain !== 'languages' || !isCommonLanguage(name)) &&
                    (step.domain !== 'skills' || skillPool.includes(name)),
                ),
            ).size >= step.count
          )
        }
        case 'optionalFeature':
          return (rules.optionalfeatures as OptionalFeatureLike[]).some((feature) =>
            getFeatureTypes(feature).includes(step.featureType),
          )
        case 'expertise':
          return expertiseSkills.length > 0 || canGainExpertiseSkill
        default:
          return true
      }
    })
  )
}

export function getCreatorRacialSpellOptions(choice: RaceSpellChoice, spells: Spell5e[]): string[] {
  if (choice.pool) {
    const available = new Set(spells.map((spell) => getSpellReferenceKey(spell.name, spell.source)))
    return choice.pool.filter((reference) => available.has(getSpellReferenceKey(reference)))
  }
  return spells
    .filter(
      (spell) =>
        !choice.filter ||
        (spell.level === choice.filter.level &&
          (!choice.filter.classes.length ||
            choice.filter.classes.some((name) => isSpellOnClassList(spell, name)))),
    )
    .map((spell) => formatSpellReference(spell.name, spell.source))
}

export function getCreatorRacialSpellPending(profile: SpellProfile, spells: Spell5e[]) {
  const suite = profile.racial?.mode === 'alternative' && !profile.racial.suite
  const ability =
    !!profile.racial?.suite &&
    !!profile.castingAbilityOptions?.length &&
    !profile.castingAbilityOptions.includes(profile.castingAbility ?? '')
  const picks = new Set(
    (profile.choices ?? [])
      .filter((choice) => {
        if (choice.selected.length >= choice.count) return false
        const selected = new Set(choice.selected.map(getSpellNameKey))
        return getCreatorRacialSpellOptions(choice, spells).some(
          (reference) => !selected.has(getSpellNameKey(reference)),
        )
      })
      .map((choice) => choice.id),
  )
  return { suite, ability, picks }
}

export function getCreatorChoiceGroups(
  character: Character,
  rules: CreatorChoiceCatalog,
  scope: CreatorChoiceScope,
  effective = character,
) {
  const isRace = scope === 'race'
  const scopedChoices = character.provenance.choices.filter(
    (choice) =>
      (isCreatorChoiceOwner(choice.sourceTag, character, scope) ||
        (scope === 'background' && is2024OriginLanguageChoice(choice))) &&
      choice.chooseCount > 0 &&
      ['feats', 'skills', 'languages', 'tools', 'armor', 'weapons'].includes(choice.domain),
  )
  const toolPools = buildToolSubtypeOptionsByKind(rules)
  const currentProficiencies = (domain: ProficiencyBlockDomain) => {
    if (!isRace || effective === character) return effective.proficiencies[domain]
    const otherGrants = effective.proficiencies[domain].filter((name) => {
      const owners = effective.provenance.proficiencies[domain]?.[normalizeKey(name)]
      return !owners?.length || owners.some((tag) => !isSelectedRaceOwner(tag, character))
    })
    return [...character.proficiencies[domain], ...otherGrants]
  }
  const tools = buildToolChoiceSlots({
    choices: scopedChoices,
    selectedTools: currentProficiencies('tools'),
    toolSubtypeOptionsByKind: toolPools,
  })
  const proficiencyOptions = new Map<string, string[]>()
  const conflictingProficiencies = new Map<string, Set<string>>()
  const choices = scopedChoices.filter((choice) => {
    const { id, domain } = choice
    if (domain === 'feats') {
      return (
        choice.selected.length > 0 ||
        resolveFeatChoicePool(rules.feats, choice.optionPool).eligibleFeats.length > 0
      )
    }
    if (
      domain !== 'skills' &&
      domain !== 'languages' &&
      domain !== 'tools' &&
      domain !== 'armor' &&
      domain !== 'weapons'
    )
      return false
    const pool =
      domain === 'tools'
        ? (tools.find((slot) => slot.id === id)?.options ?? [])
        : choice.optionPool.length
          ? choice.optionPool
          : domain === 'skills'
            ? ALL_SKILLS
            : domain === 'languages'
              ? rules.languages.map(({ name }) => name)
              : []
    const owned = new Set([...currentProficiencies(domain), ...choice.selected].map(normalizeKey))
    const options = [...new Set(pool)].filter(
      (name) =>
        !owned.has(normalizeKey(name)) && (domain !== 'languages' || !isCommonLanguage(name)),
    )
    proficiencyOptions.set(id, options)
    if (options.length) {
      const conflicts = choice.selected.filter((name) =>
        effective.provenance.proficiencies[domain]?.[normalizeKey(name)]?.some(
          (tag) =>
            tag.grantType === 'fixed' &&
            (tag.sourceType !== choice.sourceTag.sourceType ||
              normalizeOwnerIdentity(tag.sourceName) !==
                normalizeOwnerIdentity(choice.sourceTag.sourceName) ||
              normalizeOwnerIdentity(tag.sourceRef) !==
                normalizeOwnerIdentity(choice.sourceTag.sourceRef)),
        ),
      )
      if (conflicts.length) conflictingProficiencies.set(id, new Set(conflicts))
    }
    return choice.selected.length > 0 || options.length > 0
  })
  const racialProfiles = isRace
    ? character.spells.spellProfiles.filter(
        (profile) =>
          profile.type === 'racial' &&
          (profile.racial?.mode === 'alternative' ||
            profile.choices?.some(
              (choice) =>
                choice.selected.length > 0 ||
                getCreatorRacialSpellOptions(choice, rules.spells).length > 0,
            ) ||
            (!!profile.racial?.suite && !!profile.castingAbilityOptions?.length)),
      )
    : []
  const fixedFeatOwners = getFeatSetupOwners(character, rules.feats).filter(
    ({ target, data, provider }) =>
      target.fixedGrant &&
      data &&
      hasFeatOptions(data) &&
      !!provider &&
      isCreatorChoiceOwner(provider, character, scope),
  )
  const pendingChoices = new Set<string>()
  const pendingFixedFeats = new Set<string>()
  for (const choice of choices) {
    if (choice.domain !== 'feats') {
      if (
        conflictingProficiencies.has(choice.id) ||
        (choice.selected.length < choice.chooseCount && proficiencyOptions.get(choice.id)?.length)
      )
        pendingChoices.add(choice.id)
      continue
    }
    const selected = getFeatChoiceSelectedRefs(choice)
    if (selected.length === 0) {
      pendingChoices.add(choice.id)
      continue
    }
    if (
      selected.some((feat) => {
        const data = rules.feats.find(
          (row) => getFeatSelectionKey(row) === getFeatSelectionKey(feat),
        )
        if (!data || !hasFeatOptions(data)) return false
        return hasReachableFeatSetup(
          character,
          isRace ? character : effective,
          { ...feat, provenanceChoiceId: choice.id },
          data,
          rules,
        )
      })
    )
      pendingChoices.add(choice.id)
  }
  for (const owner of fixedFeatOwners) {
    if (
      owner.data &&
      hasReachableFeatSetup(
        character,
        isRace ? character : effective,
        owner.target,
        owner.data,
        rules,
      )
    )
      pendingFixedFeats.add(owner.focusKey)
  }
  const pendingSpells = new Map(
    racialProfiles.map((profile) => [
      profile.id,
      getCreatorRacialSpellPending(profile, rules.spells),
    ]),
  )
  const hasPending =
    pendingChoices.size > 0 ||
    pendingFixedFeats.size > 0 ||
    [...pendingSpells.values()].some(
      ({ suite, ability, picks }) => suite || ability || picks.size > 0,
    )
  return {
    choices,
    racialProfiles,
    fixedFeatOwners,
    proficiencyOptions,
    conflictingProficiencies,
    toolPools,
    pendingChoices,
    pendingFixedFeats,
    pendingSpells,
    hasPending,
  }
}
