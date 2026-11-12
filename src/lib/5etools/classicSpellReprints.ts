import {
  getSpellReferenceKey,
  isSourceQualifiedSpellReference,
} from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Spell5e } from '@/types/5etools'
import { getRevisedSpellReprintReferences } from './spellReprintReferences'
import { getAmbiguousSpellReprintTargets, hasUniqueSpellRouteSource } from './spellRouteSources'

type SpellCatalog = Readonly<Record<string, Spell5e>>
type Reprint = { classic: Spell5e; revised: string }

function* classicReprintClaims(spells: readonly Spell5e[]) {
  for (const spell of spells) {
    if (norm(spell.source) !== 'phb') continue
    for (const target of getAmbiguousSpellReprintTargets(spell)) yield { target }
    const targets = getRevisedSpellReprintReferences(spell.reprintedAs)
    for (const revised of targets) {
      if (!isSourceQualifiedSpellReference(revised)) continue
      yield {
        target: getSpellReferenceKey(revised),
        reprint: { classic: spell, revised },
        unambiguous: targets.length === 1,
      }
    }
  }
}

/** Any authored claim, including one hidden by catalog composition, can veto a fallback. */
export function getClaimedRevisedSpellReprints(raw: SpellCatalog | undefined) {
  const targets = new Set<string>()
  for (const { target } of classicReprintClaims(Object.values(raw ?? {}))) targets.add(target)
  return targets
}

/** Preserve both ends of an unambiguous explicit reprint, including renamed spells. */
export function getClassicSpellReprints(raw: SpellCatalog | undefined) {
  const byClassic = new Map<string, Reprint>()
  const byRevised = new Map<string, Reprint>()
  const spells = Object.values(raw ?? {})
  const claims = new Map<string, Reprint | undefined>()
  const occurrences = new Map<string, number>()
  for (const spell of spells) {
    if (norm(spell.source) !== 'phb') continue
    const key = getSpellReferenceKey(spell.name, spell.source)
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1)
  }
  for (const { target, reprint, unambiguous } of classicReprintClaims(spells)) {
    claims.set(target, unambiguous && !claims.has(target) ? reprint : undefined)
  }
  for (const [target, reprint] of claims) {
    if (!reprint) continue
    const key = getSpellReferenceKey(reprint.classic.name, reprint.classic.source)
    if (occurrences.get(key) !== 1) continue
    byClassic.set(key, reprint)
    byRevised.set(target, reprint)
  }
  // A calculation usually uses only a handful of targets from the entire raw catalog.
  const lookup = (index: Map<string, Reprint>) => ({
    get(key: string) {
      const match = index.get(key)
      return match && hasUniqueSpellRouteSource(match.classic) ? match : undefined
    },
  })
  return { byClassic: lookup(byClassic), byRevised: lookup(byRevised) }
}

export type ClassicSpellReprints = ReturnType<typeof getClassicSpellReprints>
