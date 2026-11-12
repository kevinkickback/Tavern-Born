import {
  getProgressiveChoiceGainCount,
  getRequiredChoiceSelectionCount,
} from '@/lib/5etools/classChoiceNormalization'
import { decodeFavoredEnemyChoiceId, ENEMY_TYPE_GROUP } from '@/lib/5etools/favoredEnemyIdentity'
import { decodeNaturalExplorerChoiceId } from '@/lib/5etools/naturalExplorerIdentity'
import { isRevisedInvocationPoolId } from '@/lib/5etools/revisedInvocationPoolIdentity'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildPrerequisiteSnapshot, checkAllPrerequisites } from '@/lib/calculations/prerequisites'
import {
  formatSpellReference,
  getSpellNameKey,
  getSpellReferenceKey,
} from '@/lib/calculations/spellIdentity'
import {
  getCharacterClassChoices,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { hasCurrentClassSpellListRoute } from '@/lib/character/classSpellAuthority'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { setHistoricalProficiencySetupCommand } from '@/lib/character/commands/historicalProficiencyCommands'
import {
  type ManagedClassSpellRequest,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import { getDailyClassSpellAccess } from '@/lib/character/dailyClassSpells'
import { EPIC_BOON_LEVEL, replaceEpicBoonSelection } from '@/lib/character/epicBoonSlots'
import {
  getHistoricalProficiencyRule,
  resolveHistoricalProficiencyChoice,
} from '@/lib/character/historicalProficiencyChoices'
import {
  managedClassSpellId,
  managedClassSpellUniquenessGroup,
} from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { applyClassAsiChoice } from '@/pages/build/class/model/asi'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { StandardJourneyCatalog } from './standardJourneyCatalog'

// One legal Warlock build per printing, including at-will spells and a revised Blade chain.
const invocationOrder = [
  'Pact of the Blade',
  'Beast Speech',
  'Armor of Shadows',
  'Beguiling Influence',
  "Devil's Sight",
  'Eldritch Sight',
  'Fiendish Vigor',
  'Ascendant Step',
  'Gaze of Two Minds',
  'Mask of Many Faces',
  'Misty Visions',
  'Eldritch Mind',
  'Thirsting Blade',
  'Witch Sight',
]

type Calculate = (character: Character) => CharacterCalculationContext

export function chooseJourneyAdvancement(
  character: Character,
  cls: Class5e,
  data: StandardJourneyCatalog,
  calculate: Calculate,
) {
  const level = character.classProgression[0].levels
  const calculation = calculate(character)
  const scores = calculation.abilityScores.total
  const ability = (Object.keys(scores) as (keyof typeof scores)[]).find((key) => scores[key] <= 18)!
  const epicBoon = calculation.classChoices.epicBoonSlots[0]
  if (level === EPIC_BOON_LEVEL && epicBoon) {
    return replaceEpicBoonSelection(
      character,
      epicBoon,
      {
        abilityChanges: { [ability]: 2 },
        before: scores,
      },
      {
        catalogs: data.catalogs,
        rawClasses: data.raw.classesByKey,
        feats: data.catalogs.feats,
        prerequisites: buildPrerequisiteSnapshot({
          character: calculation.character,
          effectiveAbilityScores: scores,
          effectiveSpellProfiles: calculation.character.spells.spellProfiles,
          classChoiceFeatureCatalogs: data.catalogs,
          classChoicePrerequisites: calculation.classChoices.prerequisites,
        }),
      },
    )
  }
  return cls.normalizedRules?.asiLevels.includes(level)
    ? {
        ...character,
        asiChoices: applyClassAsiChoice({
          currentAsiChoices: character.asiChoices ?? [],
          className: cls.name,
          classSource: cls.source,
          level,
          abilityChanges: { [ability]: 2 },
        }),
      }
    : character
}

export function chooseJourneyFeatures(
  character: Character,
  cls: Class5e,
  subclass: Subclass5e | undefined,
  data: StandardJourneyCatalog,
  calculate: Calculate,
) {
  const level = character.classProgression[0].levels
  const choices = getCharacterClassChoices(
    cls,
    subclass,
    createOptionalClassFeatureActivity(character, data.catalogs),
    data.catalogs,
  )
  for (const original of choices) {
    if (original.level > level) continue
    let saved = character.classChoiceSelections?.find((row) => row.choiceId === original.id)
    if (getHistoricalProficiencyRule(original.id) && !saved?.proficiencyAtGain) {
      character = applyCharacterCommandResult(
        character,
        setHistoricalProficiencySetupCommand(
          character,
          character.provenance,
          original,
          false,
          data.catalogs,
        ),
      )
      saved = character.classChoiceSelections?.find((row) => row.choiceId === original.id)
    }
    const choice = resolveHistoricalProficiencyChoice(character, original)
    const previous = saved?.selected ?? []
    const gain = getProgressiveChoiceGainCount(choice, level)
    const missing =
      gain === undefined
        ? getRequiredChoiceSelectionCount(choice, level) - previous.length
        : gain - previous.filter((option) => option.slotLevel === level).length
    if (missing <= 0) continue

    const current = calculate(character)
    const favoredEnemy = decodeFavoredEnemyChoiceId(choice.id)
    const naturalExplorer = decodeNaturalExplorerChoiceId(choice.id)
    const related = (character.classChoiceSelections ?? []).filter(
      (row) =>
        (favoredEnemy && decodeFavoredEnemyChoiceId(row.choiceId)) ||
        (naturalExplorer && decodeNaturalExplorerChoiceId(row.choiceId)),
    )
    const reserved = new Set(
      [...previous, ...related.flatMap((row) => row.selected)].map(getClassChoiceOptionKey),
    )
    const snapshot = buildPrerequisiteSnapshot({
      character: current.character,
      effectiveAbilityScores: current.abilityScores.total,
      effectiveSpellProfiles: current.character.spells.spellProfiles,
      classChoiceFeatureCatalogs: data.catalogs,
      classChoicePrerequisites: current.classChoices.prerequisites,
    })
    const candidates = resolveClassChoiceOptions(
      choice,
      data.catalogs,
      previous,
      level,
      current.character,
      current.classChoices.prerequisites.knownWarlockCantrips,
    ).filter(
      (option) =>
        isClassChoiceOptionEligible(option) &&
        checkAllPrerequisites(option, snapshot, { className: cls.name, classSource: cls.source })
          .met &&
        !reserved.has(getClassChoiceOptionKey(option.reference)) &&
        (!favoredEnemy || option.sourceGroup?.group === ENEMY_TYPE_GROUP),
    )
    if (choice.label === 'Eldritch Invocations') {
      candidates.sort((a, b) => {
        const rank = (name: string) => {
          const index = invocationOrder.indexOf(name)
          return index < 0 ? invocationOrder.length : index
        }
        return rank(a.reference.name) - rank(b.reference.name)
      })
    }
    const selected = candidates.slice(0, missing).map((option) => option.reference)
    if (selected.length < missing)
      throw new Error(
        `${choice.label} has ${selected.length} available choices for ${missing} unfilled slots`,
      )
    try {
      character = applyCharacterCommandResult(
        character,
        applyClassChoiceSelectionWithGrantsCommand(
          character,
          character.provenance,
          choice,
          gain === undefined ? [...previous, ...selected] : selected,
          {
            classes: data.primary.classChoiceClasses,
            catalogs: data.catalogs,
            feats: data.catalogs.feats,
            spellContext: current.classChoices.spellContext,
            prerequisites: current.classChoices.prerequisites,
          },
          favoredEnemy ? { mode: 'type', language: { kind: 'none' } } : undefined,
          gain !== undefined || isRevisedInvocationPoolId(choice.id)
            ? saved
              ? getOptionalPoolSelectionHandle(saved)
              : ''
            : undefined,
          gain !== undefined ? level : undefined,
        ),
      )
    } catch (cause) {
      throw new Error(
        choice.label +
          ' (' +
          selected.map((option) => option.name).join(', ') +
          '): ' +
          String(cause),
      )
    }
  }
  return character
}

export function chooseJourneySpells(character: Character, calculate: Calculate) {
  for (const specialties of [false, true]) {
    const current = calculate(character)
    const context = current.classChoices.spellContext
    const saved = character.managedClassSpellChoices ?? []
    const filled = new Set(saved.map((choice) => managedClassSpellId(choice.slot)))
    const requests: ManagedClassSpellRequest[] = []
    let prepareFirstBookSpell = !saved.some((choice) => choice.slot[1] === 'class-spellbook')
    for (const slot of getManagedClassSpellSlots(
      character.classProgression[0],
      character,
      current.classChoices.catalogs,
      current.classChoices.prerequisites,
    )) {
      if (
        slot[1] === 'subclass-spell-replacement' ||
        (slot[1] === 'class-spellbook-specialty') !== specialties ||
        filled.has(managedClassSpellId(slot))
      )
        continue
      const group = managedClassSpellUniquenessGroup(slot)
      const taken = new Set(
        [...saved, ...requests].flatMap((choice) =>
          choice.target && managedClassSpellUniquenessGroup(choice.slot) === group
            ? [getSpellNameKey(choice.target.name)]
            : [],
        ),
      )
      const pool = getManagedClassSpellPool(
        character,
        slot,
        context,
        current.managedClassSpellStatuses,
      )
      const spell = pool.spells
        .filter(
          (candidate) =>
            pool.defaultReferences.has(getSpellReferenceKey(candidate.name, candidate.source)) &&
            !taken.has(getSpellNameKey(candidate.name)),
        )
        .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))[0]
      if (!spell)
        throw new Error(
          `${slot[1]} at level ${slot[3]} has no legal spell for choice ${slot[4] + 1}${pool.reason ? `: ${pool.reason}` : ''}`,
        )
      const prepare = prepareFirstBookSpell && slot[1] === 'class-spellbook'
      if (prepare) prepareFirstBookSpell = false
      requests.push({
        slot,
        expected: null,
        expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
        target: { name: spell.name, source: spell.source },
        policy: 'default',
        ...(prepare && { prepare }),
      })
    }
    if (requests.length)
      character = applyCharacterCommandResult(
        character,
        setManagedClassSpellChoicesCommand(character, character.provenance, requests, context),
      )
  }
  return character
}

export function chooseJourneyDailyPreparation(character: Character, calculate: Calculate) {
  const current = calculate(character)
  if (current.dailyClassSpellStatuses.length) return character
  const context = current.classChoices.spellContext
  for (const profile of current.character.spells.spellProfiles) {
    const access = getDailyClassSpellAccess(character, profile, context)
    if (!access?.maxSpellLevel || !context) continue
    const prepared = new Set(
      [...profile.preparedSpells, ...(profile.alwaysPreparedSpells ?? [])].map((reference) =>
        getSpellReferenceKey(reference),
      ),
    )
    const spell = Object.values(context.spellsByKey ?? {}).find(
      (candidate) =>
        candidate.level === 1 &&
        !prepared.has(getSpellReferenceKey(candidate.name, candidate.source)) &&
        hasCurrentClassSpellListRoute(character, access.entry, candidate, context),
    )
    if (!spell) throw new Error(`No legal first-rank daily spell for ${profile.id}`)
    return applyCharacterCommandResult(
      character,
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        profile.id,
        formatSpellReference(spell.name, spell.source),
        true,
        context,
      ),
    )
  }
  return character
}
