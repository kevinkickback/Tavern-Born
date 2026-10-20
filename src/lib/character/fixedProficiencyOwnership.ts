import { canonicalProficiencyName } from '@/lib/5etools/classProficiencyIdentity'
import { getConcreteToolProficiencyName } from '@/lib/5etools/concreteToolProficiencies'
import { CONCRETE_TOOL_PROFICIENCY_NAMES } from '@/lib/5etools/fixedProficiencyRules'
import { addGrant, emptyProvenance } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import { isFixedProficiencyTag } from '@/lib/schema/fixedProficiencyValidation'
import type { Character } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import {
  type CurrentFixedProficiency,
  getCurrentFixedProficiencies,
} from './fixedProficiencyAuthority'

/** Remove attributed stale values once, retaining every independent owner. */
export function stripFixedProficiencyGrants(character: Character): Character {
  const ledger = character.provenance ?? emptyProvenance()
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
    const original = ledger.proficiencies[domain] ?? {}
    const retained = Object.fromEntries(
      Object.entries(original).flatMap(([name, tags]) => {
        const kept = tags.filter((tag) => !isFixedProficiencyTag(tag))
        return kept.length ? [[name, kept]] : []
      }),
    )
    if (domain !== 'expertise' || ledger.proficiencies.expertise) maps[domain] = retained
    proficiencies[domain] = proficiencies[domain].filter((value) => {
      const name = canonicalProficiencyName(value) ?? value
      return !(original[name] ?? []).some(isFixedProficiencyTag) || !!retained[name]?.length
    })
  }
  return { ...character, proficiencies, provenance: { ...ledger, proficiencies: maps } }
}

export function grantFixedProficiencies(
  character: Character,
  current: readonly CurrentFixedProficiency[],
  phase: 'foundations' | 'expertise',
  catalogs?: ClassChoiceFeatureCatalogs,
): Character {
  const proficiencies = { ...character.proficiencies }
  let ledger = character.provenance ?? emptyProvenance()
  const tools = new Set(
    (catalogs?.allConcreteTools ?? []).flatMap(
      (item) => getConcreteToolProficiencyName(item) ?? [],
    ),
  )
  for (const owner of current) {
    const automatic = owner.rule.kind === 'proficient-tools'
    if (automatic && phase === 'foundations') continue
    const names = automatic
      ? character.proficiencies.tools.flatMap((value) => {
          const name = canonicalProficiencyName(value)
          return name && tools.has(name) && CONCRETE_TOOL_PROFICIENCY_NAMES.includes(name)
            ? [name]
            : []
        })
      : (owner.rule.skills ?? [])
    const domain = phase === 'foundations' ? 'skills' : 'expertise'
    const tag = {
      ...makeSourceTag(
        owner.owner.length === 4 ? 'subclass' : 'class',
        owner.sourceName,
        'fixed',
        owner.sourceRef,
      ),
      grantVariant: owner.id,
    }
    for (const name of names) {
      ledger = addGrant(ledger, domain, name, tag)
      if (!proficiencies[domain].some((value) => canonicalProficiencyName(value) === name))
        proficiencies[domain] = [...proficiencies[domain], name]
    }
  }
  return { ...character, proficiencies, provenance: ledger }
}

/** Command-only capture before first fixed ownership; reads never infer a manual owner. */
export function captureFixedProficiencyManualOwners(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
): Character {
  const current = getCurrentFixedProficiencies(character, catalogs)
  const projected = grantFixedProficiencies(
    grantFixedProficiencies(character, current, 'foundations', catalogs),
    current,
    'expertise',
    catalogs,
  )
  let ledger = character.provenance ?? emptyProvenance()
  for (const domain of ['skills', 'expertise'] as const) {
    for (const value of character.proficiencies[domain]) {
      const name = canonicalProficiencyName(value)
      if (
        name &&
        !(ledger.proficiencies[domain]?.[name]?.length ?? 0) &&
        (projected.provenance.proficiencies[domain]?.[name] ?? []).some(isFixedProficiencyTag)
      )
        ledger = addGrant(ledger, domain, name, makeSourceTag('manual', 'User Choice', 'choice'))
    }
  }
  return ledger === character.provenance ? character : { ...character, provenance: ledger }
}
