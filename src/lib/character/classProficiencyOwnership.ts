import {
  canonicalProficiencyName,
  decodeClassProficiencyChoiceId,
  decodeProficiencyOption,
} from '@/lib/5etools/classProficiencyIdentity'
import { ownedClassProficiencyRule as classProficiencyRule } from '@/lib/5etools/ownedClassProficiencyRules'
import { reconcileSkillExpertise } from '@/lib/calculations/skills'
import { addGrant, emptyProvenance } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import {
  isClassProficiencyTag,
  isValidClassProficiencySelection,
} from '@/lib/schema/classProficiencyValidation'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import { reconcileExpertiseOwnership } from './expertiseOwnership'

function reconcileUnderlyingExpertise(character: Character): Character {
  const reconciled = reconcileExpertiseOwnership({
    characterPatch: { proficiencies: reconcileSkillExpertise(character.proficiencies) },
    provenanceUpdate: character.provenance ?? emptyProvenance(),
  })
  return {
    ...character,
    proficiencies: reconciled.characterPatch.proficiencies,
    provenance: reconciled.provenanceUpdate,
  }
}

/** Recovery deletes exact owned contributions; it never replays unavailable sibling intent. */
export function retainClassProficiencyGrants(
  character: Character,
  ledger: ProvenanceLedger,
  selection: Pick<CharacterClassChoiceSelection, 'choiceId'>,
  keptNames: ReadonlySet<string>,
): Character {
  const proficiencies = { ...character.proficiencies }
  const maps = { ...ledger.proficiencies }
  for (const domain of [
    'armor',
    'weapons',
    'tools',
    'skills',
    'expertise',
    'languages',
    'savingThrows',
  ] as const) {
    const original = character.provenance?.proficiencies[domain] ?? {}
    const current = ledger.proficiencies[domain] ?? {}
    const relation = decodeClassProficiencyChoiceId(selection.choiceId)
    const coupled =
      relation &&
      classProficiencyRule(relation.target)?.domains.some(
        (row) => row.domain === 'expertise' && row.coupled,
      )
    const allowedDomain =
      relation?.domain === domain ||
      (relation?.domain === 'expertise' && coupled && domain === 'skills')
    const removing = (name: string, tag: SourceTag) =>
      tag.grantVariant === selection.choiceId && (!keptNames.has(name) || !allowedDomain)
    const values = Object.fromEntries(
      Object.entries(current).flatMap(([name, tags]) => {
        const retained = tags.filter((tag) => !removing(name, tag))
        return retained.length ? [[name, retained]] : []
      }),
    )
    if (domain !== 'expertise' || ledger.proficiencies.expertise || Object.keys(values).length)
      maps[domain] = values
    proficiencies[domain] = proficiencies[domain].filter((value) => {
      const name = canonicalProficiencyName(value) ?? value
      return (
        ![...(original[name] ?? []), ...(current[name] ?? [])].some((tag) => removing(name, tag)) ||
        (values[name]?.length ?? 0) > 0
      )
    })
  }
  return reconcileUnderlyingExpertise({
    ...character,
    proficiencies,
    provenance: { ...ledger, proficiencies: maps },
  })
}

/** Remove only attributed contributions. A just-stripped value never becomes a manual owner. */
export function stripClassProficiencyGrants(
  character: Character,
  ledger = character.provenance ?? emptyProvenance(),
): Character {
  const proficiencies = { ...character.proficiencies }
  const owned = { ...ledger.proficiencies }
  for (const domain of [
    'armor',
    'weapons',
    'tools',
    'skills',
    'expertise',
    'languages',
    'savingThrows',
  ] as const) {
    const original = character.provenance?.proficiencies[domain] ?? {}
    const current = ledger.proficiencies[domain] ?? {}
    const values = Object.fromEntries(
      Object.entries(current).flatMap(([name, tags]) => {
        const retained = tags.filter((tag) => !isClassProficiencyTag(tag))
        return retained.length ? [[name, retained]] : []
      }),
    )
    if (domain !== 'expertise' || ledger.proficiencies.expertise || Object.keys(values).length)
      owned[domain] = values
    proficiencies[domain] = proficiencies[domain].filter((name) => {
      const key = canonicalProficiencyName(name) ?? name
      const wasOwned = [...(original[key] ?? []), ...(current[key] ?? [])].some(
        isClassProficiencyTag,
      )
      return !wasOwned || (values[key]?.length ?? 0) > 0
    })
  }
  return { ...character, proficiencies, provenance: { ...ledger, proficiencies: owned } }
}

/** Publish paired foundations or final Expertise with their exact selected owner. */
export function grantClassProficiencySelection(
  character: Character,
  selection: CharacterClassChoiceSelection,
  phase: 'all' | 'foundations' | 'expertise' = 'all',
): Character {
  if (!isValidClassProficiencySelection(selection)) return character
  const relation = decodeClassProficiencyChoiceId(selection.choiceId)!
  const rule = classProficiencyRule(relation.target)?.domains.find(
    (row) => row.domain === relation.domain,
  )
  let provenance = character.provenance ?? emptyProvenance()
  const proficiencies = { ...character.proficiencies }
  for (const option of selection.selected) {
    const target = decodeProficiencyOption(option)!
    const domains =
      target.domain === 'expertise' && rule?.coupled
        ? phase === 'foundations'
          ? (['skills'] as const)
          : phase === 'expertise'
            ? (['expertise'] as const)
            : (['skills', 'expertise'] as const)
        : target.domain === 'expertise'
          ? phase === 'foundations'
            ? []
            : (['expertise'] as const)
          : phase === 'expertise'
            ? []
            : [target.domain]
    if (
      target.domain === 'expertise' &&
      !rule?.coupled &&
      !(
        target.proficiencyType === 'skill' &&
        proficiencies.skills.some((name) => canonicalProficiencyName(name) === target.name)
      ) &&
      !(
        target.proficiencyType === 'tool' &&
        rule?.tools?.includes(target.name) &&
        proficiencies.tools.some((name) => canonicalProficiencyName(name) === target.name)
      )
    )
      continue
    for (const domain of domains) {
      provenance = addGrant(provenance, domain, target.name, {
        ...makeSourceTag(
          selection.subclassName ? 'subclass' : 'class',
          selection.subclassName ?? selection.className,
          'choice',
          selection.subclassSource ?? selection.classSource,
        ),
        grantVariant: selection.choiceId,
      })
      if (!proficiencies[domain].some((name) => canonicalProficiencyName(name) === target.name))
        proficiencies[domain] = [...proficiencies[domain], target.name]
    }
  }
  return { ...character, proficiencies, provenance }
}

/** Command-only capture of genuinely preexisting, untracked values before adding new ownership. */
export function reconcileClassProficiencyGrants(
  character: Character,
  ledger: ProvenanceLedger,
  selections: readonly CharacterClassChoiceSelection[],
): Character {
  let captured = ledger
  for (const selection of selections) {
    if (selection.inactive || !isValidClassProficiencySelection(selection)) continue
    const prior = character.classChoiceSelections?.find(
      (row) => row.choiceId === selection.choiceId,
    )
    for (const option of selection.selected) {
      const target = decodeProficiencyOption(option)!
      if (prior?.selected.some((row) => decodeProficiencyOption(row)?.name === target.name))
        continue
      const relation = decodeClassProficiencyChoiceId(selection.choiceId)!
      const paired = classProficiencyRule(relation.target)?.domains.some(
        (row) => row.domain === 'expertise' && row.coupled,
      )
      for (const domain of paired && target.domain === 'expertise'
        ? (['skills', 'expertise'] as const)
        : [target.domain]) {
        if (
          character.proficiencies[domain].some(
            (name) => canonicalProficiencyName(name) === target.name,
          ) &&
          !(character.provenance?.proficiencies[domain]?.[target.name]?.length ?? 0) &&
          !(ledger.proficiencies[domain]?.[target.name]?.length ?? 0)
        ) {
          captured = addGrant(
            captured,
            domain,
            target.name,
            makeSourceTag('manual', 'User Choice', 'choice'),
          )
        }
      }
    }
  }
  let result = { ...character, provenance: captured }
  const active = new Map(
    selections
      .filter((selection) => !selection.inactive && isValidClassProficiencySelection(selection))
      .map((selection) => [selection.choiceId, selection]),
  )
  const ownedIds = new Set(
    [character.provenance?.proficiencies ?? {}, captured.proficiencies].flatMap((maps) =>
      Object.values(maps).flatMap((values) =>
        Object.values((values ?? {}) as Record<string, SourceTag[]>).flatMap((tags) =>
          tags.filter(isClassProficiencyTag).flatMap((tag) => tag.grantVariant ?? []),
        ),
      ),
    ),
  )
  for (const choiceId of ownedIds) {
    const selection = active.get(choiceId)
    result = retainClassProficiencyGrants(
      result,
      result.provenance,
      { choiceId },
      new Set(
        selection?.selected.flatMap((option) => decodeProficiencyOption(option)?.name ?? []) ?? [],
      ),
    )
  }
  return reconcileUnderlyingExpertise(result)
}
