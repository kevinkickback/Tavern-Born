import { canonicalProficiencyName } from '@/lib/5etools/classProficiencyIdentity'
import { getConcreteToolProficiencyName } from '@/lib/5etools/concreteToolProficiencies'
import { decodeFixedProficiencyId } from '@/lib/5etools/fixedProficiencyIdentity'
import {
  CONCRETE_TOOL_PROFICIENCY_NAMES,
  fixedProficiencyRule,
} from '@/lib/5etools/fixedProficiencyRules'
import { addGrant, emptyProvenance } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { SourceTag } from '@/lib/provenance/types'
import { isFixedProficiencyTag } from '@/lib/schema/fixedProficiencyValidation'
import type { Language5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import {
  type CurrentFixedProficiency,
  getCurrentFixedProficiencies,
} from './fixedProficiencyAuthority'

export const FIXED_PROFICIENCY_FOUNDATION_DOMAINS = [
  'armor',
  'weapons',
  'skills',
  'expertise',
  'languages',
  'tools',
  'savingThrows',
] as const

function findExactLanguage(
  languages: readonly Language5e[] | undefined,
  name: string,
  source: string,
) {
  const matches = languages?.filter(
    (row) =>
      canonicalProficiencyName(row.name) === name &&
      canonicalProficiencyName(row.source ?? '') === canonicalProficiencyName(source),
  )
  return matches?.length === 1 && !matches[0].sourceIdentityConflict ? matches[0] : undefined
}

/** For fixed language grants, keep detail text tied to its active printing. */
export function getFixedLanguageDetails(
  languages: readonly Language5e[],
  name: string,
  tags: readonly SourceTag[],
): Language5e | null | undefined {
  const sources = new Set(
    tags.flatMap((tag) => {
      const relation = tag.grantVariant && decodeFixedProficiencyId(tag.grantVariant)
      const rule = relation ? fixedProficiencyRule(relation.target, relation.owner) : undefined
      return rule?.languageSource && rule.languages?.includes(name) ? [rule.languageSource] : []
    }),
  )
  if (!sources.size) return undefined
  if (sources.size > 1) return null
  return findExactLanguage(languages, name, [...sources][0]) ?? null
}

/** Remove attributed stale values once, retaining every independent owner. */
export function stripFixedProficiencyGrants(
  character: Character,
  matches: (tag: SourceTag) => boolean = isFixedProficiencyTag,
): Character {
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
        const kept = tags.filter((tag) => !matches(tag))
        return kept.length ? [[name, kept]] : []
      }),
    )
    if (domain !== 'expertise' || ledger.proficiencies.expertise) maps[domain] = retained
    proficiencies[domain] = proficiencies[domain].filter((value) => {
      const name = canonicalProficiencyName(value) ?? value
      return !(original[name] ?? []).some(matches) || !!retained[name]?.length
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
    if (owner.trainingInactive) continue
    const automatic = owner.rule.kind === 'proficient-tools'
    const language = owner.rule.kind === 'fixed-languages'
    if (automatic && phase === 'foundations') continue
    if ((language || owner.rule.kind === 'fixed-training') && phase === 'expertise') continue
    const names = automatic
      ? character.proficiencies.tools.flatMap((value) => {
          const name = canonicalProficiencyName(value)
          return name && tools.has(name) && CONCRETE_TOOL_PROFICIENCY_NAMES.includes(name)
            ? [name]
            : []
        })
      : ((language ? owner.rule.languages : owner.rule.skills) ?? [])
    const tag = {
      ...makeSourceTag(
        owner.owner.length === 4 ? 'subclass' : 'class',
        owner.sourceName,
        'fixed',
        owner.sourceRef,
      ),
      grantVariant: owner.id,
    }
    const grants =
      owner.rule.kind === 'fixed-training'
        ? (['armor', 'weapons', 'tools', 'skills', 'savingThrows'] as const).map((domain) => ({
            domain,
            names: owner.rule.training?.[domain] ?? [],
          }))
        : [
            {
              domain: language
                ? ('languages' as const)
                : phase === 'foundations'
                  ? ('skills' as const)
                  : ('expertise' as const),
              names,
            },
          ]
    for (const { domain, names } of grants) {
      for (const name of names) {
        if (domain === 'tools') {
          if (!tools.has(name)) continue
          const tool =
            owner.rule.trainingTools?.find((item) => item.name === name) ?? owner.rule.trainingTool
          if (tool?.name === name) {
            const exact = (source: string) =>
              catalogs?.allConcreteTools?.filter(
                (item) => item.source === source && getConcreteToolProficiencyName(item) === name,
              ).length ?? 0
            const declared = exact(tool.source)
            if (
              declared !== 1 &&
              !(
                declared === 0 &&
                owner.owner[1] === 'xphb' &&
                tool.reprint &&
                exact(tool.reprint) === 1
              )
            )
              continue
          }
        }
        if (
          domain === 'languages' &&
          owner.rule.languageSource &&
          !findExactLanguage(catalogs?.languages, name, owner.rule.languageSource)
        )
          continue
        ledger = addGrant(ledger, domain, name, tag)
        if (!proficiencies[domain].some((value) => canonicalProficiencyName(value) === name))
          proficiencies[domain] = [...proficiencies[domain], name]
      }
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
  for (const domain of FIXED_PROFICIENCY_FOUNDATION_DOMAINS) {
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
