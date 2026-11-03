import {
  claimsKenseiChoice,
  decodeLegacySubclassChoice,
  KENSEI_POOLS,
  legacyChoiceKey as key,
} from '@/lib/5etools/legacySubclassChoiceIdentity'
import type { SourceTag } from '@/lib/provenance/types'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'

export function isKenseiProficiencyTag(tag: SourceTag): boolean {
  return (
    !!tag.grantVariant?.includes('|subclass:way-of-the-kensei|') ||
    (tag.sourceType === 'subclass' &&
      key(tag.sourceName) === 'way of the kensei' &&
      key(tag.sourceRef) === 'xge' &&
      tag.grantType === 'choice')
  )
}
export function isValidKenseiSelection(row: CharacterClassChoiceSelection): boolean {
  const relation = decodeLegacySubclassChoice(row.choiceId)
  if (!relation || relation.family !== 'kensei') return false
  const pool = KENSEI_POOLS[relation.pool]
  return (
    row.kind === 'item' &&
    key(row.className) === 'monk' &&
    key(row.classSource) === key(relation.source) &&
    key(row.subclassName) === 'way of the kensei' &&
    key(row.subclassSource) === 'xge' &&
    row.classLevel === pool.level &&
    row.inactive === undefined &&
    !row.favoredEnemy &&
    !row.proficiencyAtGain &&
    row.selected.length > 0 &&
    row.selected.length <= pool.slots.length &&
    new Set(row.selected.map((v) => v.slotLevel)).size === row.selected.length &&
    new Set(row.selected.map((v) => key(v.name))).size === row.selected.length &&
    row.selected.every(
      (v) =>
        v.entityType === 'item' &&
        !!key(v.name) &&
        !/[|{}]/u.test(v.name) &&
        key(v.source) === 'phb' &&
        v.ref === undefined &&
        (pool.slots as readonly number[]).includes(v.slotLevel) &&
        (relation.pool !== 'tools' ||
          ["calligrapher's supplies", "painter's supplies"].includes(key(v.name))),
    )
  )
}
export function getInvalidKenseiSelectionIds(rows: readonly CharacterClassChoiceSelection[]) {
  const invalid = new Set<string>(),
    ids = new Set<string>(),
    targets = new Map<string, string>()
  for (const row of rows) {
    if (!claimsKenseiChoice(row)) continue
    if (!isValidKenseiSelection(row) || ids.has(row.choiceId)) invalid.add(row.choiceId)
    ids.add(row.choiceId)
    const relation = decodeLegacySubclassChoice(row.choiceId)
    if (relation?.pool === 'tools') continue
    for (const v of row.selected) {
      const identity = JSON.stringify([
        key(row.className),
        key(row.classSource),
        key(v.name),
        key(v.source),
      ])
      const prior = targets.get(identity)
      if (prior) {
        invalid.add(prior)
        invalid.add(row.choiceId)
      }
      targets.set(identity, row.choiceId)
    }
  }
  return invalid
}
/** Saved relation proof is source-independent; only the current projection may activate it. */
export function isValidLegacyStyleSelection(row: CharacterClassChoiceSelection): boolean {
  const relation = decodeLegacySubclassChoice(row.choiceId)
  return (
    relation?.family === 'swords' &&
    row.kind === 'optional-feature' &&
    key(row.className) === 'bard' &&
    key(row.classSource) === key(relation.source) &&
    key(row.subclassName) === 'college of swords' &&
    key(row.subclassSource) === 'xge' &&
    row.classLevel === 3 &&
    row.inactive === undefined &&
    !row.favoredEnemy &&
    !row.proficiencyAtGain &&
    row.selected.length === 1 &&
    row.selected.every(
      (v) =>
        v.entityType === 'optionalFeature' &&
        ['dueling', 'two-weapon fighting'].includes(key(v.name)) &&
        key(v.source) === 'phb' &&
        v.ref === undefined &&
        v.slotLevel === 3,
    )
  )
}

export function getInvalidLegacySubclassChoicePaths(
  character: Character,
): Array<Array<string | number>> {
  const paths: Array<Array<string | number>> = [],
    rows = character.classChoiceSelections ?? [],
    invalid = getInvalidKenseiSelectionIds(rows)
  const selections = new Map(rows.map((row) => [row.choiceId, row]))
  rows.forEach((row, index) => {
    if (
      row.choiceId.includes('|subclass:college-of-swords|xge|') ||
      (row.kind === 'optional-feature' &&
        key(row.className) === 'bard' &&
        key(row.subclassName) === 'college of swords' &&
        key(row.subclassSource) === 'xge')
    ) {
      const owner = character.classProgression.find(
        (v) => key(v.name) === key(row.className) && key(v.source) === key(row.classSource),
      )
      if (
        !isValidLegacyStyleSelection(row) ||
        !owner ||
        owner.levels < 3 ||
        key(owner.subclass) !== key(row.subclassName) ||
        key(owner.subclassSource) !== key(row.subclassSource) ||
        rows.filter((v) => v.choiceId === row.choiceId).length !== 1
      )
        paths.push(['classChoiceSelections', index])
      return
    }
    if (!claimsKenseiChoice(row)) return
    const owner = character.classProgression.find(
      (v) => key(v.name) === key(row.className) && key(v.source) === key(row.classSource),
    )
    if (
      invalid.has(row.choiceId) ||
      !owner ||
      key(owner.subclass) !== key(row.subclassName) ||
      key(owner.subclassSource) !== key(row.subclassSource) ||
      row.selected.some((v) => v.slotLevel > owner.levels)
    )
      paths.push(['classChoiceSelections', index])
  })
  for (const [domain, values] of Object.entries(character.provenance.proficiencies))
    for (const [name, tags] of Object.entries((values ?? {}) as Record<string, SourceTag[]>)) {
      const seen = new Set<string>()
      for (const tag of tags) {
        if (!isKenseiProficiencyTag(tag)) continue
        const row = selections.get(tag.grantVariant!),
          relation = row && decodeLegacySubclassChoice(row.choiceId)
        if (
          !row ||
          invalid.has(row.choiceId) ||
          !relation ||
          relation.family !== 'kensei' ||
          KENSEI_POOLS[relation.pool].domain !== domain ||
          !row.selected.some(
            (v) => key(v.name) === name && key(v.source) === key(tag.grantSource),
          ) ||
          tag.sourceType !== 'subclass' ||
          tag.sourceName !== row.subclassName ||
          tag.sourceRef !== row.subclassSource ||
          tag.grantType !== 'choice' ||
          key(tag.grantSource) !== 'phb' ||
          seen.has(tag.grantVariant!) ||
          !character.proficiencies[domain as 'tools' | 'weapons']?.some((v) => key(v) === name)
        )
          paths.push(['provenance', 'proficiencies', domain, name])
        seen.add(tag.grantVariant!)
      }
    }
  for (const domain of ['features', 'feats', 'spells', 'equipment'] as const)
    for (const [name, tags] of Object.entries(character.provenance[domain]))
      if (tags.some(isKenseiProficiencyTag)) paths.push(['provenance', domain, name])
  character.provenance.abilityBonuses.forEach((v, i) => {
    if (isKenseiProficiencyTag(v.sourceTag)) paths.push(['provenance', 'abilityBonuses', i])
  })
  character.provenance.choices.forEach((v, i) => {
    if (isKenseiProficiencyTag(v.sourceTag)) paths.push(['provenance', 'choices', i])
  })
  return paths
}
