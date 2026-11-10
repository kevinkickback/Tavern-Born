import type { EntityReference } from '@/lib/5etools/entityResolvers'
import { decodeFixedProficiencyId } from '@/lib/5etools/fixedProficiencyIdentity'
import { decodeOptionalDeclaration } from '@/lib/5etools/optionalClassDeclarationStructure'
import {
  getSpellReferenceKey,
  isSourceQualifiedSpellReference,
} from '@/lib/calculations/spellIdentity'
import { decodeManagedClassSpellId } from '@/lib/character/managedClassSpellIdentity'
import type { Character, CharacterClassEntry } from '@/types/character'
import { removeGrantsBySource, removeGrantsBySourceRef } from './ledger'
import { normalizeOwnerIdentity } from './normalization'
import type { ProvenanceLedger, SourceTag } from './types'

type SavedClassGrants = Pick<Character, 'classChoiceSelections' | 'spells'>
type SubclassOwner = [string, string, string, string]

function subclassOwner(entry: CharacterClassEntry): SubclassOwner {
  const norm = normalizeOwnerIdentity
  return [norm(entry.name), norm(entry.source), norm(entry.subclass), norm(entry.subclassSource)]
}

function taggedSubclassOwner(
  tag: SourceTag,
  saved: SavedClassGrants | undefined,
  namedSpell: boolean,
) {
  const variant = tag.grantVariant
  if (!variant) return undefined
  const managed = decodeManagedClassSpellId(variant)?.[0]
  if (managed?.[0] === 'subclass') return managed.slice(1)
  const fixed = decodeFixedProficiencyId(variant)?.owner
  if (fixed?.length === 4) return fixed
  const choice = saved?.classChoiceSelections?.find((row) => row.choiceId === variant)
  if (choice?.subclassName)
    return [choice.className, choice.classSource, choice.subclassName, choice.subclassSource].map(
      normalizeOwnerIdentity,
    )
  // Named subclass spell tags already carry the selected owner and exact feature target.
  if (!namedSpell) return undefined
  try {
    const row: unknown = JSON.parse(variant)
    const prefix = 'subclass-feature|'
    if (
      !Array.isArray(row) ||
      row.length !== 6 ||
      !row.slice(0, 4).every((part) => typeof part === 'string' && part.trim()) ||
      typeof row[4] !== 'string' ||
      !row[4].startsWith(prefix) ||
      !Number.isInteger(row[5])
    )
      return undefined
    const feature = decodeOptionalDeclaration(row[4].slice(prefix.length), 'subclassFeature')
    if (
      feature?.target === row[4] &&
      feature.decoded.level &&
      row[5] >= feature.decoded.level &&
      row[5] <= 20
    )
      return row.slice(0, 4).map(normalizeOwnerIdentity)
  } catch {
    return undefined
  }
}

/**
 * Reconcile ledger when a race selection changes.
 * Removes only the previous selected race and subrace printings.
 */
export function reconcileRaceChange(
  ledger: ProvenanceLedger,
  oldRace: EntityReference | undefined,
  oldSubrace: EntityReference | undefined,
): ProvenanceLedger {
  let result = ledger
  if (oldRace?.name)
    result = removeGrantsBySourceRef(result, 'race', oldRace.name, oldRace.source, undefined, {
      normalizeIdentity: true,
    })
  if (oldSubrace?.name)
    result = removeGrantsBySourceRef(
      result,
      'subrace',
      oldSubrace.name,
      oldSubrace.source,
      undefined,
      { normalizeIdentity: true },
    )
  return result
}

/**
 * Reconcile ledger when only the subrace changes (race stays the same).
 */
export function reconcileSubraceChange(
  ledger: ProvenanceLedger,
  oldSubrace: EntityReference | undefined,
): ProvenanceLedger {
  if (!oldSubrace?.name) return ledger
  return removeGrantsBySourceRef(ledger, 'subrace', oldSubrace.name, oldSubrace.source, undefined, {
    normalizeIdentity: true,
  })
}

/**
 * Reconcile ledger when a class selection changes.
 * Removes only the replaced class printing and its unshared subclass grants.
 */
export function reconcileClassChange(
  ledger: ProvenanceLedger,
  previous: CharacterClassEntry,
  retained: readonly CharacterClassEntry[],
  saved?: SavedClassGrants,
): ProvenanceLedger {
  let result = ledger
  const norm = normalizeOwnerIdentity
  const removeClass = (source?: string) => {
    result = removeGrantsBySourceRef(result, 'class', previous.name, source, undefined, {
      normalizeIdentity: true,
    })
  }
  if (norm(previous.source)) removeClass(previous.source)
  // A historical tag without a source can only be assigned when the name is unambiguous.
  if (!retained.some((row) => norm(row.name) === norm(previous.name))) removeClass()
  if (!previous.subclass) return result
  const retainedSubclassOwners = retained
    .filter((row) => norm(row.subclass) === norm(previous.subclass))
    .map(subclassOwner)
  const matchingSubclassSource = norm(previous.subclassSource)
  const sharedFixedSpells = new Set(
    (saved?.spells.spellProfiles ?? []).flatMap((profile) =>
      profile.type === 'class' &&
      retainedSubclassOwners.some(
        ([name, source, , subclassSource]) =>
          subclassSource === matchingSubclassSource &&
          name === norm(profile.className) &&
          source === norm(profile.classSource),
      )
        ? (profile.fixedSpells ?? [])
            .filter(isSourceQualifiedSpellReference)
            .map((spell) => getSpellReferenceKey(spell))
        : [],
    ),
  )
  const subclassOptions: Parameters<typeof removeGrantsBySourceRef>[5] = {
    normalizeIdentity: true,
    preserve(tag, domain, key) {
      const namedSpell =
        domain === 'spells' && tag.grantType === 'fixed' && !!tag.grantVariant?.startsWith('[')
      const owner = taggedSubclassOwner(tag, saved, namedSpell)
      const source = norm(tag.sourceRef)
      if (owner || namedSpell)
        return (
          owner?.[2] === norm(tag.sourceName) &&
          owner[3] === source &&
          retainedSubclassOwners.some((row) => row.every((part, i) => part === owner[i]))
        )
      // A shared legacy tag can preserve exact fixed spell intent already recorded for a
      // retained parent. Live projection still verifies the grant against the active rules.
      return (
        retainedSubclassOwners.some(
          ([name, , , subclassSource]) =>
            name === norm(previous.name) && (!source || source === subclassSource),
        ) ||
        (domain === 'spells' &&
          !!key &&
          !!source &&
          tag.grantType === 'fixed' &&
          !tag.grantVariant &&
          sharedFixedSpells.has(getSpellReferenceKey(key, tag.grantSource)))
      )
    },
  }
  if (matchingSubclassSource)
    result = removeGrantsBySourceRef(
      result,
      'subclass',
      previous.subclass,
      previous.subclassSource,
      undefined,
      subclassOptions,
    )
  return removeGrantsBySourceRef(
    result,
    'subclass',
    previous.subclass,
    undefined,
    undefined,
    subclassOptions,
  )
}

/**
 * Reconcile ledger when a background selection changes.
 */
export function reconcileBackgroundChange(
  ledger: ProvenanceLedger,
  oldBackgroundName: string | undefined,
): ProvenanceLedger {
  if (!oldBackgroundName) return ledger
  return removeGrantsBySource(ledger, 'background', oldBackgroundName)
}

/**
 * Given sets of old and new proficiency names for a given source, return
 * the items that were only attributed to that source (safe to remove) and
 * items newly granted.
 *
 * Used to update the actual proficiency arrays alongside the ledger.
 */
export function diffProficiencyGrants(
  ledger: ProvenanceLedger,
  domain: keyof import('./types').ProficiencyProvenance,
  sourceType: string,
  sourceName: string,
): { toRemove: string[] } {
  const map = ledger.proficiencies[domain] ?? {}

  // Keys that are exclusively attributed to this source (removing safe)
  const toRemove = Object.entries(map)
    .filter(
      ([, tags]) =>
        tags.length > 0 &&
        tags.every((t) => t.sourceType === sourceType && t.sourceName === sourceName),
    )
    .map(([key]) => key)

  return { toRemove }
}
