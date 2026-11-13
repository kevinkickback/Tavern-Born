import { decodePsionicChoiceId, getPsionicChoiceId } from '@/lib/5etools/psionicIdentity'
import {
  getClassChoiceFeatureId,
  getClassChoiceOptionKey,
} from '@/lib/character/classChoiceIdentity'
import { replayMysticDisciplines } from '@/lib/character/mysticDisciplineHistory'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'

const norm = (value: string | undefined) => value?.trim().toLowerCase() ?? ''
export function isValidPsionicSelection(row: CharacterClassChoiceSelection): boolean {
  try {
    const relation = decodePsionicChoiceId(row.choiceId)
    if (
      !relation ||
      row.kind !== 'psionic' ||
      row.classLevel !== 1 ||
      row.inactive !== undefined ||
      row.favoredEnemy ||
      row.proficiencyAtGain
    )
      return false
    const owner = {
      type: row.subclassName ? ('subclass' as const) : ('class' as const),
      name: row.className,
      source: row.classSource,
      ...(row.subclassName
        ? { subclassName: row.subclassName, subclassSource: row.subclassSource }
        : {}),
    }
    return (
      getPsionicChoiceId(owner, relation.pool) === row.choiceId &&
      (!row.subclassName ? !row.subclassSource : !!row.subclassSource) &&
      row.selected.every(
        (option) =>
          option.entityType === 'psionic' &&
          !!option.name.trim() &&
          !!option.source?.trim() &&
          option.ref === undefined &&
          option.invocationCantrip === undefined &&
          Number.isInteger(option.slotLevel) &&
          option.slotLevel >= 1 &&
          option.slotLevel <= 20,
      )
    )
  } catch {
    return false
  }
}
/** Admission proves the saved relation, not current catalog eligibility. */
export function getInvalidPsionicSelectionIds(
  rows: readonly CharacterClassChoiceSelection[],
  history?: ReturnType<typeof replayMysticDisciplines>,
): Set<string> {
  const invalid = new Set<string>(),
    seenIds = new Set<string>(),
    seenTargets = new Map<string, string>()
  for (const row of rows) {
    if (
      !row.choiceId.startsWith('psionic-choice:') &&
      row.kind !== 'psionic' &&
      !row.selected.some((option) => option.entityType === 'psionic')
    )
      continue
    if (!isValidPsionicSelection(row)) invalid.add(row.choiceId)
    if (seenIds.has(row.choiceId)) invalid.add(row.choiceId)
    seenIds.add(row.choiceId)
    if (history?.conflictingChoices.has(row.choiceId)) invalid.add(row.choiceId)
    const options =
      history && decodePsionicChoiceId(row.choiceId)?.pool !== 'talent' ? [] : row.selected
    for (const option of options) {
      const key = JSON.stringify([
        norm(row.className),
        norm(row.classSource),
        getClassChoiceOptionKey(option),
      ])
      const prior = seenTargets.get(key)
      if (prior) {
        invalid.add(prior)
        invalid.add(row.choiceId)
      }
      seenTargets.set(key, row.choiceId)
    }
  }
  return invalid
}
function isReservedPsionicFeature(id: string): boolean {
  if (!id.startsWith('class-choice:')) return false
  try {
    const row: unknown = JSON.parse(decodeURIComponent(id.slice('class-choice:'.length)))
    return Array.isArray(row) && typeof row[1] === 'string' && row[1].startsWith('psionic:')
  } catch {
    return false
  }
}
export function getInvalidPsionicPaths(character: Character): Array<Array<string | number>> {
  const history = character.mysticDisciplineReplacements?.length
    ? replayMysticDisciplines(character)
    : undefined
  const paths: Array<Array<string | number>> = [],
    rows = character.classChoiceSelections ?? [],
    invalid = getInvalidPsionicSelectionIds(rows, history)
  for (const index of history?.invalidEvents ?? [])
    paths.push(['mysticDisciplineReplacements', index])
  const intents = new Map<
    string,
    {
      row: CharacterClassChoiceSelection
      option: CharacterClassChoiceSelection['selected'][number]
    }
  >()
  rows.forEach((row, index) => {
    if (
      !row.choiceId.startsWith('psionic-choice:') &&
      row.kind !== 'psionic' &&
      !row.selected.some((option) => option.entityType === 'psionic')
    )
      return
    const owner = character.classProgression.find(
      (owner) =>
        norm(owner.name) === norm(row.className) && norm(owner.source) === norm(row.classSource),
    )
    if (
      invalid.has(row.choiceId) ||
      !owner ||
      row.selected.some((option) => option.slotLevel > owner.levels) ||
      (row.subclassName &&
        (norm(owner.subclass) !== norm(row.subclassName) ||
          norm(owner.subclassSource) !== norm(row.subclassSource)))
    )
      paths.push(['classChoiceSelections', index])
    const options =
      history && decodePsionicChoiceId(row.choiceId)?.pool !== 'talent'
        ? history.slots.filter((slot) => slot.selection === row).map((slot) => slot.current)
        : row.selected
    for (const option of options) intents.set(getClassChoiceFeatureId(row, option), { row, option })
  })
  const materialized = new Map<string, number>()
  character.features.forEach((feature, index) => {
    if (!isReservedPsionicFeature(feature.id)) return
    const intent = intents.get(feature.id)
    const hasTag =
      intent &&
      (character.provenance.features[normalizeKey(intent.option.name)] ?? []).some(
        (tag) =>
          tag.grantVariant === intent.row.choiceId &&
          tag.sourceType === 'class' &&
          norm(tag.sourceName) === norm(intent.row.className) &&
          norm(tag.sourceRef) === norm(intent.row.classSource) &&
          tag.grantType === 'choice',
      )
    if (
      !intent ||
      norm(feature.name) !== norm(intent.option.name) ||
      norm(feature.source) !== norm(intent.option.source) ||
      feature.level !== intent.option.slotLevel ||
      feature.description !== '' ||
      !hasTag ||
      materialized.has(feature.id)
    )
      paths.push(['features', index])
    materialized.set(feature.id, index)
  })
  for (const [name, tags] of Object.entries(character.provenance.features))
    tags.forEach((tag, index) => {
      if (!tag.grantVariant?.startsWith('psionic-choice:')) return
      const row = rows.find((row) => row.choiceId === tag.grantVariant)
      const options = [...intents.values()]
        .filter((intent) => intent.row === row && normalizeKey(intent.option.name) === name)
        .map((intent) => intent.option)
      if (
        !row ||
        !options.length ||
        tag.sourceType !== 'class' ||
        tag.grantType !== 'choice' ||
        norm(tag.sourceName) !== norm(row.className) ||
        norm(tag.sourceRef) !== norm(row.classSource) ||
        options.some((option) => !materialized.has(getClassChoiceFeatureId(row, option)))
      )
        paths.push(['provenance', 'features', name, index])
    })
  return paths
}
