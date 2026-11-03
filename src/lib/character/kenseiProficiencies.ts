import { findClassReference } from '@/lib/5etools/classReference'
import {
  decodeLegacySubclassChoice,
  KENSEI_POOLS,
  legacyChoiceKey as key,
} from '@/lib/5etools/legacySubclassChoiceIdentity'
import {
  getLegacySubclassChoices,
  isLegacyChoiceItemEligible,
} from '@/lib/5etools/legacySubclassChoices'
import { addGrant } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import {
  getInvalidKenseiSelectionIds,
  isValidKenseiSelection,
} from '@/lib/schema/legacySubclassChoiceValidation'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'

/** Same live source/target policy as the picker, independent of stored materialized benefits. */
function currentGrants(character: Character, catalogs?: ClassChoiceFeatureCatalogs) {
  const grants: Array<{
    selection: CharacterClassChoiceSelection
    domain: 'weapons' | 'tools'
    name: string
    source: string
  }> = []
  if (!catalogs) return grants
  const invalid = getInvalidKenseiSelectionIds(character.classChoiceSelections ?? [])
  for (const selection of character.classChoiceSelections ?? []) {
    if (invalid.has(selection.choiceId) || !isValidKenseiSelection(selection)) continue
    const relation = decodeLegacySubclassChoice(selection.choiceId)!
    if (relation.family !== 'kensei') continue
    const owner = findClassReference(
      { name: selection.className, source: selection.classSource },
      character.classProgression,
    )
    if (
      !owner ||
      key(owner.subclass) !== key(selection.subclassName) ||
      key(owner.subclassSource) !== key(selection.subclassSource)
    )
      continue
    const ownerKey = getFeatureOwnerKey(
      owner.name,
      owner.source,
      owner.subclass,
      owner.subclassSource,
    )
    const scoped = scopeClassChoiceFeatureCatalogs(catalogs, ownerKey)
    const choice = getLegacySubclassChoices(
      owner,
      { name: owner.subclass!, source: owner.subclassSource! },
      scoped,
    ).find((v) => v.id === selection.choiceId)
    const rows = (catalogs.legacySubclassChoices ?? []).filter((v) => v.ownerKey === ownerKey)
    if (
      !choice ||
      rows.length !== 1 ||
      owner.levels < choice.level ||
      selection.selected.length > (choice.selectionCountByLevel[owner.levels - 1] ?? 0)
    )
      continue
    for (const pick of selection.selected) {
      if (pick.slotLevel > owner.levels) continue
      const items = rows[0].items.filter(
        (v) => key(v.name) === key(pick.name) && key(v.source) === key(pick.source),
      )
      if (items.length !== 1 || !isLegacyChoiceItemEligible(choice, items[0], rows[0])) continue
      grants.push({
        selection,
        domain: KENSEI_POOLS[relation.pool].domain,
        name: key(pick.name),
        source: pick.source!,
      })
    }
  }
  return grants
}

/** Foundation before Expertise; item-type picks never add equipment or weapon mastery. */
export function grantKenseiProficiencies(
  character: Character,
  authority: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
): Character {
  let provenance = character.provenance
  const proficiencies = { ...character.proficiencies }
  for (const { selection, domain, name, source } of currentGrants(authority, catalogs)) {
    provenance = addGrant(provenance, domain, name, {
      ...makeSourceTag('subclass', selection.subclassName!, 'choice', selection.subclassSource),
      grantVariant: selection.choiceId,
      grantSource: source,
    })
    if (!proficiencies[domain].some((v) => key(v) === name))
      proficiencies[domain] = [...proficiencies[domain], name]
  }
  return { ...character, proficiencies, provenance }
}

/** Only genuinely untracked pre-command values may become independent manual providers. */
export function captureKenseiManualOwners(
  before: Character,
  next: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
): Character {
  let provenance = next.provenance
  for (const { domain, name } of currentGrants(next, catalogs))
    if (
      before.proficiencies[domain].some((v) => key(v) === name) &&
      !(before.provenance.proficiencies[domain]?.[name]?.length ?? 0)
    ) {
      provenance = addGrant(
        provenance,
        domain,
        name,
        makeSourceTag('manual', 'User Choice', 'choice'),
      )
    }
  return provenance === next.provenance ? next : { ...next, provenance }
}
