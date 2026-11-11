import {
  getSpellReferenceKey,
  isSourceQualifiedSpellReference,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Spell5e, Subclass5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { getNativeSubclassIntroFeature } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import { auditSpellRouteMultiplicity } from './spellRouteSources'
import type { SubclassSpellGrant } from './subclassSpells'

type SpellCatalog = Readonly<Record<string, Spell5e>>
type Reprint = { classic: Spell5e; revised: string }

export function isTceArtificer(entry: CharacterClassEntry) {
  return norm(entry.name) === 'artificer' && norm(entry.source) === 'tce'
}

/** Preserve both ends of the explicit reprint, including renamed spells. */
export function getArtificerSpellReprints(raw: SpellCatalog | undefined) {
  const byClassic = new Map<string, Reprint>()
  const byRevised = new Map<string, Reprint>()
  if (!raw) return { byClassic, byRevised }
  const claims = new Map<string, Array<Reprint & { unambiguous: boolean }>>()
  const occurrences = new Map<string, number>()
  for (const spell of Object.values(raw)) {
    if (norm(spell.source) !== 'phb') continue
    const key = getSpellReferenceKey(spell.name, spell.source)
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1)
    const targets = (Array.isArray(spell.reprintedAs) ? spell.reprintedAs : []).filter(
      (ref): ref is string =>
        typeof ref === 'string' && norm(parseSpellReference(ref).source) === 'xphb',
    )
    for (const revised of targets) {
      if (!isSourceQualifiedSpellReference(revised)) continue
      const target = getSpellReferenceKey(revised)
      const prior = claims.get(target) ?? []
      prior.push({ classic: spell, revised, unambiguous: targets.length === 1 })
      claims.set(target, prior)
    }
  }
  for (const [target, rows] of claims) {
    if (rows.length !== 1) continue
    const [reprint] = rows
    const key = getSpellReferenceKey(reprint.classic.name, reprint.classic.source)
    if (
      occurrences.get(key) === 1 &&
      reprint.classic.classSpellRouteSource?.input.targetOccurrences.length === 1 &&
      reprint.unambiguous
    ) {
      byClassic.set(key, reprint)
      byRevised.set(target, reprint)
    }
  }
  return { byClassic, byRevised }
}

export type ArtificerSpellReprints = ReturnType<typeof getArtificerSpellReprints>

export function getArtificerReprintListRoutes(
  spell: Spell5e,
  reprints: ArtificerSpellReprints | undefined,
) {
  const legacy = reprints?.byRevised.get(getSpellReferenceKey(spell.name, spell.source))?.classic
  if (!legacy || legacy.level !== spell.level) return []
  const [checked] = auditSpellRouteMultiplicity([legacy])
  return checked.classSpellRouteDiagnostics?.length === 0 ? (checked.classSpellRoutes ?? []) : []
}

/** Only the original TCE specialty table can authorize these prepared spells. */
function getTceSpecialtySpellFeature(cls: Class5e, subclass: Subclass5e) {
  if (
    cls.name !== 'Artificer' ||
    cls.source !== 'TCE' ||
    subclass.classSource !== cls.source ||
    subclass.source !== cls.source ||
    subclass.sourceIdentityConflict ||
    '_copy' in subclass ||
    !['Alchemist', 'Armorer', 'Artillerist', 'Battle Smith'].includes(subclass.name) ||
    !matchesNativeSubclassGain(cls, 'class-feature|artificer specialist|artificer|tce|3|tce', 3)
  )
    return undefined
  return getNativeSubclassIntroFeature(cls, subclass, 3, `${subclass.name} Spells`)
}

function applyArtificerSpellReprint(
  grant: SubclassSpellGrant,
  reprints: ArtificerSpellReprints | undefined,
): SubclassSpellGrant {
  const reprint = reprints?.byClassic.get(getSpellReferenceKey(grant.spellName))
  return reprint
    ? { ...grant, spellName: reprint.revised, expectedSpellLevel: reprint.classic.level }
    : grant
}

export function reprintTceArtificerSubclassSpells(
  cls: Class5e,
  subclass: Subclass5e,
  grants: SubclassSpellGrant[],
  reprints: ArtificerSpellReprints | undefined,
) {
  const feature = getTceSpecialtySpellFeature(cls, subclass)
  const tables = feature?.entries
    ?.map(record)
    .filter((row) => row.type === 'table' && row.caption === feature.feature?.name)
  const rows = tables?.length === 1 && Array.isArray(tables[0].rows) ? tables[0].rows : []
  return grants.flatMap((grant) => {
    if (grant.mode === 'cast-only') return [applyArtificerSpellReprint(grant, reprints)]
    if (grant.mode !== 'prepared') return [grant]
    const row = rows.filter(
      (value) =>
        Array.isArray(value) &&
        value.length === 2 &&
        value[0] ===
          ({ 3: '3rd', 5: '5th', 9: '9th', 13: '13th', 17: '17th' } as Record<number, string>)[
            grant.level
          ] &&
        typeof value[1] === 'string',
    )
    const key = getSpellReferenceKey(grant.spellName)
    return row.length === 1 &&
      [...(row[0][1] as string).matchAll(/\{@spell ([^{}]+)\}/g)].some(
        ([, token]) =>
          getSpellReferenceKey(token, parseSpellReference(token).source ?? 'PHB') === key,
      )
      ? [applyArtificerSpellReprint(grant, reprints)]
      : []
  })
}
