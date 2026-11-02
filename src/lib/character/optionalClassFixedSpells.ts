import { parseSpellToken } from '@/lib/5etools/spellTokens'
import { getSpellNameKey } from '@/lib/calculations/spellIdentity'
import type { Character, OptionalClassFeatureOwner } from '@/types/character'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'

export interface OptionalClassFixedSpellGrant {
  owner: OptionalClassFeatureOwner
  target: string
  featureName: string
  level: number
  reference: string
}
export interface OptionalClassFixedSpellStatus extends OptionalClassFixedSpellGrant {
  active: boolean
  reason?: string
}

/**
 * Narrow adapter for a source lacking additionalSpells. The existing whole-declaration
 * certificate verifies its owner, prose and table before this reader sees it. Changed or
 * newly structured semantics require renewed certification, never a name-only fallback.
 * Upstream Renderer.TagSpell / Parser.getTagSource default omitted printing to PHB;
 * parseSpellToken shares that rule and preserves an explicit printing.
 */
export function getOptionalClassFixedSpellGrants(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  atClassLevel?: number,
): OptionalClassFixedSpellGrant[] {
  const row = createOptionalClassFeatureActivity(character, catalogs).states.find(
    ({ root }) => root.target === 'class-feature|primal awareness|ranger|phb|3|tce',
  )
  if (row?.state !== 'active' || !row.current) return []
  const tables = (row.current.entries ?? []).filter(
    (entry): entry is { type: 'table'; rows: unknown[] } =>
      !!entry && typeof entry === 'object' && 'type' in entry && entry.type === 'table',
  )
  if (tables.length !== 1 || !Array.isArray(tables[0].rows)) return []
  const entry = character.classProgression.find(
    (entry) =>
      entry.name.trim().toLowerCase() === row.root.owner[1] &&
      entry.source.trim().toLowerCase() === row.root.owner[2],
  )
  if (!entry) return []
  const limit = Math.min(entry.levels, atClassLevel ?? entry.levels)
  const grants: OptionalClassFixedSpellGrant[] = []
  let previous = 0
  for (const cells of tables[0].rows) {
    if (!Array.isArray(cells) || cells.length !== 2) return []
    const level = typeof cells[0] === 'string' && cells[0].match(/^(\d+)(?:st|nd|rd|th)$/)
    const spell = typeof cells[1] === 'string' && cells[1].match(/^\{@spell ([^{}#]+)\}$/)
    const gain = level ? Number(level[1]) : 0
    if (!spell || gain < row.root.level || gain > 20 || gain <= previous) return []
    previous = gain
    const reference = parseSpellToken(spell[1]).name
    if (!reference) return []
    if (gain <= limit)
      grants.push({
        owner: row.root.owner,
        target: row.root.target,
        featureName: row.root.name,
        level: gain,
        reference,
      })
  }
  return grants
}

/** Prospective numeric eligibility only; established independent ownership stays active. */
export function getOptionalClassFixedSpellNamesAtGain(
  character: Character,
  slot: ManagedClassSpellSlot,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  return new Set(
    getOptionalClassFixedSpellGrants(character, catalogs, slot[3])
      .filter((grant) => grant.owner[1] === slot[0][1] && grant.owner[2] === slot[0][2])
      .map((grant) => getSpellNameKey(grant.reference)),
  )
}
