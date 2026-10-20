import { DECLARED_CASTING_LISTS } from '@/lib/5etools/classCastingRules'
import { decodeSubclassFeatureReference } from '@/lib/5etools/classFeatureIdentity'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { OPTIONAL_CLASS_SECTION_RULES } from '@/lib/5etools/optionalClassSectionRules'
import { auditSpellRouteMultiplicity } from '@/lib/5etools/spellRouteSources'
import { getNativeExpandedSpellReferences } from '@/lib/calculations/nativeRacialSpells'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import type { Spell5e, Subclass5e } from '@/types/5etools'
import type { AbilityScores, Character, CharacterClassEntry } from '@/types/character'
import type { ClassSpellOwner } from '@/types/classCasting'
import type { ClassSpellRoute } from '@/types/spellRoutes'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
export interface ManagedClassSpellContext {
  catalogs?: ClassChoiceFeatureCatalogs
  /** Current filtered spell authority only; raw text lookups cannot replenish missing targets. */
  spellsByKey?: Readonly<Record<string, Spell5e>>
  abilityScores?: AbilityScores
  /** Resolved only from current filtered race data; retained raw text cannot authorize a list. */
  currentRaceResolution?: ResolvedRaceReference
}

const norm = normalizeOwnerIdentity
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const spellSections = OPTIONAL_CLASS_SECTION_RULES.sections.filter((row) =>
  row.members.every(([kind]) => kind === 'spell'),
)
export const sources = (character: Character) =>
  character.allowedSources?.length
    ? new Set(getEffectiveSources(character.allowedSources, character.originSystem).map(norm))
    : undefined
export const permitted = (allowed: ReadonlySet<string> | undefined, source: string) =>
  !allowed || allowed.has(norm(source))

/** One exact actor path; declared-list owner is intentionally separate from the actual actor owner. */
function routeAllowed(
  character: Character,
  owner: ClassSpellOwner,
  listOwner: readonly [string, string],
  route: ClassSpellRoute,
  context: ManagedClassSpellContext,
  allowOptional: boolean,
) {
  const allowed = sources(character)
  if (
    route[3] !== listOwner[0] ||
    route[4] !== listOwner[1] ||
    ![route[2], route[4], ...(route[6] === null ? [] : [route[6]])].every((source) =>
      permitted(allowed, source),
    )
  )
    return false
  const ownSectionPath =
    owner[0] === 'class' &&
    owner[2] === 'phb' &&
    route[6] === 'tce' &&
    owner[1] === route[3] &&
    owner[2] === route[4]
  if (!ownSectionPath) return true
  const section = spellSections.find((row) => equal(row.owner, owner))
  if (
    !allowOptional ||
    !section?.members.some(([, name, source]) => name === route[1] && source === route[2])
  )
    return false
  return createOptionalClassFeatureActivity(character, context.catalogs).states.some(
    (row) =>
      row.root.target === section.target && equal(row.root.owner, owner) && row.state === 'active',
  )
}

function exactSubclassPath(
  spell: Spell5e,
  entry: CharacterClassEntry,
  provider: Subclass5e,
  requestedTarget?: string,
) {
  const requested = requestedTarget?.startsWith('subclass-feature|')
    ? decodeSubclassFeatureReference(requestedTarget.slice('subclass-feature|'.length))
    : undefined
  const className = norm(requested?.className ?? entry.name)
  const classSource = norm(requested?.classSource ?? entry.source)
  const shortName = norm(provider.shortName ?? provider.name)
  const names = new Set([norm(provider.name), shortName])
  const subSource = norm(requested?.subclassSource ?? entry.subclassSource)
  if (!shortName || !subSource || (requested && norm(requested.subclassShortName) !== shortName))
    return false
  return (
    spell.classes?.fromSubclass?.some(
      (row) =>
        norm(row.class.name) === className &&
        norm(row.class.source) === classSource &&
        norm(row.subclass.source) === subSource &&
        (row.subclass.name !== undefined || row.subclass.shortName !== undefined) &&
        (row.subclass.name === undefined || names.has(norm(row.subclass.name))) &&
        (row.subclass.shortName === undefined || norm(row.subclass.shortName) === shortName),
    ) === true
  )
}

/** Current list membership, independent of numeric gain/level and every hard selection bound. */
export function hasCurrentClassSpellListRoute(
  character: Character,
  entry: CharacterClassEntry,
  spell: Spell5e,
  context: ManagedClassSpellContext,
  options: { owner?: ClassSpellOwner; requestedTarget?: string; allowOptional?: boolean } = {},
) {
  const allowed = sources(character)
  if (!permitted(allowed, spell.source)) return false
  const owner: ClassSpellOwner = options.owner ?? ['class', norm(entry.name), norm(entry.source)]
  const checked = auditSpellRouteMultiplicity([spell])[0]
  const routes = checked.classSpellRouteSource ? (checked.classSpellRoutes ?? []) : []
  const lists = options.requestedTarget
    ? DECLARED_CASTING_LISTS[options.requestedTarget]
    : undefined
  const listOwners = lists ?? [[owner[1], owner[2]]]
  if (
    listOwners.some(([name, source]) =>
      routes.some((route) =>
        routeAllowed(
          character,
          owner,
          [name, source],
          route,
          context,
          options.allowOptional !== false,
        ),
      ),
    )
  )
    return true
  const currentParent = context.catalogs?.classes?.filter(
    (row) => norm(row.name) === norm(entry.name) && norm(row.source) === norm(entry.source),
  )
  const currentSubclasses =
    currentParent?.length === 1
      ? currentParent[0].subclasses?.filter(
          (row) =>
            norm(row.name) === norm(entry.subclass) &&
            norm(row.source) === norm(entry.subclassSource) &&
            norm(row.className) === norm(entry.name) &&
            norm(row.classSource) === norm(entry.source),
        )
      : []
  if (
    currentSubclasses?.length === 1 &&
    permitted(allowed, entry.subclassSource ?? '') &&
    exactSubclassPath(spell, entry, currentSubclasses[0], options.requestedTarget)
  )
    return true
  const resolution = context.currentRaceResolution
  if (
    !resolution?.parentRace ||
    !permitted(allowed, resolution.parentRace.source) ||
    (character.subrace &&
      (!resolution.subraceData || !permitted(allowed, resolution.subraceData.source)))
  )
    return false
  const target = getSpellReferenceKey(spell.name, spell.source)
  if (
    Object.values(context.spellsByKey ?? {}).filter(
      (row) => getSpellReferenceKey(row.name, row.source) === target,
    ).length !== 1
  )
    return false
  return [...getNativeExpandedSpellReferences(character, resolution)].some(
    (reference) => getSpellReferenceKey(reference) === target,
  )
}

export function currentClasses(character: Character, context?: ManagedClassSpellContext) {
  const allowed = sources(character)
  const catalog = context?.catalogs?.classes ?? []
  return catalog
    .filter(
      (row) =>
        permitted(allowed, row.source) &&
        catalog.filter(
          (other) => norm(other.name) === norm(row.name) && norm(other.source) === norm(row.source),
        ).length === 1,
    )
    .map((row) => ({
      ...row,
      subclasses: row.subclasses?.filter((subclass) => permitted(allowed, subclass.source)),
    }))
}
