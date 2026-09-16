import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import { CORE_RULES_METADATA } from '@/lib/5etools/rulesetMetadata'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import {
  equipmentUnresolvedReadinessId,
  featSetupReadinessId,
  provenanceChoiceReadinessId,
} from '@/lib/navigation/readinessFocus'
import type { Feat5e } from '@/types/5etools'
import type { Character, Feat } from '@/types/character'
import { readinessIssue } from './readinessIssue'
import type { CharacterReadinessIssue } from './types'

export function validateIdentity(character: Character): CharacterReadinessIssue[] {
  const issues: CharacterReadinessIssue[] = []
  if (!character.name.trim()) {
    issues.push(
      readinessIssue(
        'identity:name',
        'blocking',
        'identity',
        'Name the character',
        'A character name is required for a complete sheet.',
      ),
    )
  }
  if (!character.race.trim()) {
    issues.push(
      readinessIssue(
        'identity:race',
        'blocking',
        'race',
        'Choose a race or species',
        'No origin race or species is selected.',
      ),
    )
  }
  if (getCharacterClassEntries(character).length === 0) {
    issues.push(
      readinessIssue(
        'identity:class',
        'blocking',
        'class',
        'Choose a class',
        'No class is selected.',
      ),
    )
  }
  if (!character.background.trim()) {
    issues.push(
      readinessIssue(
        'identity:background',
        'blocking',
        'background',
        'Choose a background',
        'No background is selected.',
      ),
    )
  }
  return issues
}

export function validateBaseScores(character: Character): CharacterReadinessIssue[] {
  const method = character.variantRules?.abilityScoreMethod
  if (!method) {
    return [
      readinessIssue(
        'rules:ability-score-method',
        'blocking',
        'ability-scores',
        'Choose an ability score method',
        'Select Point Buy, Standard Array, or Custom before treating the character as complete.',
      ),
    ]
  }

  const rules = CORE_RULES_METADATA[character.originSystem]
  const scores = Object.values(character.abilityScores)
  if (scores.some((score) => !Number.isInteger(score) || score < rules.abilityScoreMinimum)) {
    return [
      readinessIssue(
        'ability-scores:invalid-base',
        'blocking',
        'ability-scores',
        'Correct invalid base ability scores',
        `Every base score must be a whole number of at least ${rules.abilityScoreMinimum}.`,
      ),
    ]
  }
  if (method === 'standard-array') {
    const actual = [...scores].sort((left, right) => right - left)
    const expected = [...rules.standardArray].sort((left, right) => right - left)
    if (actual.some((score, index) => score !== expected[index])) {
      return [
        readinessIssue(
          'ability-scores:standard-array',
          'blocking',
          'ability-scores',
          'Finish assigning the standard array',
          'The six base scores do not contain the complete standard array for this ruleset.',
        ),
      ]
    }
  }
  if (method === 'point-buy') {
    const inRange = scores.every(
      (score) => score >= rules.pointBuyMin && score <= rules.pointBuyMax,
    )
    const pointBuyCosts = rules.pointBuyCosts as Readonly<Record<number, number>>
    const spent = scores.reduce((total, score) => total + (pointBuyCosts[score] ?? 0), 0)
    if (!inRange || spent !== rules.pointBuyBudget) {
      return [
        readinessIssue(
          'ability-scores:point-buy',
          'blocking',
          'ability-scores',
          'Finish spending point-buy points',
          `Base scores must spend exactly ${rules.pointBuyBudget} points within the ruleset range.`,
        ),
      ]
    }
  }
  return []
}

export function validateProvenanceChoices(character: Character): CharacterReadinessIssue[] {
  const sectionByDomain = {
    skills: 'proficiencies',
    languages: 'proficiencies',
    tools: 'proficiencies',
    armor: 'proficiencies',
    weapons: 'proficiencies',
    spells: 'spells',
    features: 'class',
    feats: 'feats',
    abilityBonuses: 'ability-scores',
    equipment: 'equipment',
    featOptions: 'feats',
  } as const
  const targetForChoice = (choice: NonNullable<Character['provenance']>['choices'][number]) => {
    if (choice.domain === 'feats') {
      if (choice.sourceTag.sourceType === 'race' || choice.sourceTag.sourceType === 'subrace') {
        return '/build/race'
      }
      if (choice.sourceTag.sourceType === 'background') return '/build/background'
      if (choice.sourceTag.sourceType === 'class') return '/build/class'
    }
    if (choice.domain === 'equipment') {
      if (choice.sourceTag.sourceType === 'background') return '/build/background'
      if (choice.sourceTag.sourceType === 'class') {
        const entry = getCharacterClassEntries(character).find(
          (candidate) =>
            candidate.name === choice.sourceTag.sourceName &&
            (!choice.sourceTag.sourceRef || candidate.source === choice.sourceTag.sourceRef),
        )
        if (entry) {
          const params = new URLSearchParams({
            class: `${entry.name}|${entry.source ?? ''}`,
            level: '1',
          })
          return `/build/class?${params.toString()}`
        }
      }
    }
    return undefined
  }
  return (character.provenance?.choices ?? [])
    .filter(
      (choice) =>
        choice.status !== 'resolved' ||
        choice.selected.length < choice.chooseCount ||
        choice.selected.length > choice.chooseCount,
    )
    .map((choice) =>
      readinessIssue(
        provenanceChoiceReadinessId(choice.id),
        'blocking',
        sectionByDomain[choice.domain],
        `Finish ${choice.sourceTag.label}`,
        `${choice.sourceTag.sourceName} requires ${choice.chooseCount} ${choice.domain} ${choice.chooseCount === 1 ? 'selection' : 'selections'}; ${choice.selected.length} are stored.`,
        targetForChoice(choice),
      ),
    )
}

export function validateFeatSetup(
  character: Character,
  featsByKey: Readonly<Record<string, Feat5e>> | undefined,
): CharacterReadinessIssue[] {
  if (!featsByKey) return []
  const feats: Feat[] = [...(character.feats ?? []), ...(character.specialFeats ?? [])]
  return feats.flatMap((feat) => {
    const data = featsByKey[getEntityLookupKey(feat.name, feat.source)]
    if (!data || !hasFeatOptions(data) || feat.options) return []
    return [
      readinessIssue(
        featSetupReadinessId(
          getEntityLookupKey(feat.name, feat.source),
          feat.className,
          feat.classLevel,
        ),
        'blocking',
        'feats',
        `Finish setting up ${feat.name}`,
        'This feat has required follow-up choices that have not been stored.',
      ),
    ]
  })
}

export function validateEquipment(character: Character): CharacterReadinessIssue[] {
  return character.equipment.flatMap((item) =>
    item._unresolved
      ? [
          readinessIssue(
            equipmentUnresolvedReadinessId(item.id),
            'blocking',
            'equipment',
            `Resolve ${item.name}`,
            'This equipment choice could not be matched to a content record.',
          ),
        ]
      : [],
  )
}
