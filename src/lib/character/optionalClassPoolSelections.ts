import { featureOptionRulesSignature } from '@/lib/5etools/featureRulesSignature'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import { getOptionalClassPoolSelectionSection } from './optionalClassAdoptionRules'
import { optionalClassOwner } from './optionalClassFeatureIdentity'

const norm = (value: string) => value.trim().toLowerCase()

/** Finite saved pool relation only. This proves removal ownership, never current eligibility. */
export function getRegisteredOptionalPoolSelection(
  character: Character,
  selection: CharacterClassChoiceSelection,
) {
  const section = getOptionalClassPoolSelectionSection(selection)
  if (
    !section ||
    selection.kind !== 'optional-feature' ||
    selection.classLevel !== section.level ||
    selection.proficiencyAtGain !== undefined
  )
    return undefined
  const actual = optionalClassOwner({
    name: selection.className,
    source: selection.classSource,
    subclassName: selection.subclassName,
    subclassSource: selection.subclassSource,
  })
  if (JSON.stringify(actual) !== JSON.stringify(section.owner)) return undefined
  if (section.owner[0] === 'class' && (selection.subclassName || selection.subclassSource))
    return undefined
  const owners = character.classProgression.filter(
    (row) => norm(row.name) === section.owner[1] && norm(row.source) === section.owner[2],
  )
  if (owners.length !== 1 || owners[0].levels < section.level) return undefined
  const owner = owners[0]
  if (
    section.owner[0] === 'subclass' &&
    (norm(owner.subclass ?? '') !== section.owner[3] ||
      norm(owner.subclassSource ?? '') !== section.owner[4])
  )
    return undefined
  if (
    !selection.selected.length ||
    selection.selected.some(
      (row) =>
        row.entityType !== 'optionalFeature' ||
        !row.name.trim() ||
        !row.source?.trim() ||
        row.ref !== undefined ||
        !Number.isInteger(row.slotLevel) ||
        row.slotLevel < section.level ||
        row.slotLevel > owner.levels,
    )
  )
    return undefined
  return { section, owner }
}

/** Complete saved option/slot snapshot; object-key order and enrichment supply no new authority. */
export function getOptionalPoolSelectionHandle(selection: CharacterClassChoiceSelection) {
  return featureOptionRulesSignature([selection], false)
}
