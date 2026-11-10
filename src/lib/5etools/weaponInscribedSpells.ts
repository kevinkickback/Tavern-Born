import { getNormalizedItemTraits } from '@/lib/calculations/itemClassification'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { scopeClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type {
  Character,
  CharacterClassEntry,
  Equipment,
  WeaponInscription,
} from '@/types/character'
import { findClassReference } from './classReference'
import { getCurrentSelectedClass, permitsClassRuleSource } from './earnedClassFeatureSource'
import { getNamedSubclassSpellSource } from './namedSubclassSpells'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import { getOwnedSubclassFeature } from './ownedSubclassFeature'
import { isEarnedWeaponInscription, weaponInscriptionOwner } from './weaponInscriptionIdentity'

type SpellSource = NonNullable<ReturnType<typeof getNamedSubclassSpellSource>>

function isInscribableWeapon(
  weapon: Equipment,
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  if (
    weapon.quantity < 1 ||
    !weapon.source ||
    weapon._unresolved ||
    !permitsClassRuleSource(character, weapon.source) ||
    character.equipment.filter((item) => item.id === weapon.id).length !== 1
  )
    return false
  const matchesWeapon = (item: { name: string; source?: string }) =>
    norm(item.name) === norm(weapon.name) && norm(item.source) === norm(weapon.source)
  const matches = catalogs.items?.filter(matchesWeapon) ?? []
  const candidates = matches.length ? matches : (catalogs.itemsBase?.filter(matchesWeapon) ?? [])
  return (
    candidates.length === 1 &&
    !candidates[0].sourceIdentityConflict &&
    getNormalizedItemTraits(candidates[0], catalogs.itemTypeByAbbr).weaponRanges.join() === 'melee'
  )
}

function getInscriptionSource(
  cls: Class5e,
  subclass: Subclass5e,
  spells: SpellSource,
  entry: CharacterClassEntry,
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const target = spells.inscriptionTarget
  const owner = weaponInscriptionOwner(entry)
  if (
    !target ||
    !isEarnedWeaponInscription({ owner, target }, character.classProgression) ||
    ![
      entry.source,
      entry.subclassSource,
      spells.feature.source,
      spells.feature.classSource,
      spells.feature.subclassSource,
    ].every((source) => permitsClassRuleSource(character, source))
  )
    return undefined
  const scoped = scopeClassChoiceFeatureCatalogs(
    catalogs,
    getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource),
  )
  const current = getOwnedSubclassFeature(cls, subclass, target, scoped)
  if (
    !current ||
    current.level !== spells.level ||
    current.level > entry.levels ||
    ![current.feature.source, current.feature.classSource, current.feature.subclassSource].every(
      (source) => permitsClassRuleSource(character, source),
    )
  )
    return undefined
  const [clause, ...entries] = current.feature.entries ?? []
  if (
    typeof clause !== 'string' ||
    !/^When you finish a \{@variantrule Long Rest\|[^|{}]+\}, you can inscribe one of the following runes on a melee weapon you are holding, or you can transfer the rune to a different weapon\. Whenever you gain a level, you can replace it with a different rune\.$/.test(
      clause,
    ) ||
    entries.length !== spells.named.length
  )
    return undefined
  const runes = entries.map(record)
  if (
    !runes.every(
      (row) =>
        row.type === 'entries' &&
        typeof row.name === 'string' &&
        Array.isArray(row.entries) &&
        row.entries.length &&
        spells.named.filter(({ name }) => norm(name) === norm(row.name as string)).length === 1,
    ) ||
    new Set(runes.map((row) => norm(row.name as string))).size !== runes.length
  )
    return undefined
  return { target, clause, runes: spells.named.map(({ name }) => name) }
}

function savedInscription(character: Character, owner: WeaponInscription['owner']) {
  const matches = character.equipment.flatMap((weapon) =>
    (weapon.weaponInscriptions ?? [])
      .filter((mark) => JSON.stringify(mark.owner) === JSON.stringify(owner))
      .map((mark) => ({ weapon, mark })),
  )
  return matches.length === 1 ? matches[0] : undefined
}

export function getCurrentInscribedSpellColumn(
  cls: Class5e,
  subclass: Subclass5e,
  spells: SpellSource,
  entry: CharacterClassEntry,
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const current = getInscriptionSource(cls, subclass, spells, entry, character, catalogs)
  if (!current) return undefined
  const saved = savedInscription(character, weaponInscriptionOwner(entry))
  return saved?.mark.target === current.target &&
    isInscribableWeapon(saved.weapon, character, catalogs)
    ? spells.named.find(({ name }) => norm(name) === saved.mark.rune)
    : undefined
}

export function getWeaponInscriptionSetup(
  character: Character,
  entry: CharacterClassEntry,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  const owner = weaponInscriptionOwner(entry)
  const actor = character.classProgression.filter(
    (row) => JSON.stringify(weaponInscriptionOwner(row)) === JSON.stringify(owner),
  )
  if (actor.length !== 1) return undefined
  entry = actor[0]
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  const matches = cls?.subclasses?.filter((subclass) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [subclass]),
  )
  const subclass = matches?.length === 1 ? matches[0] : undefined
  const scoped =
    catalogs &&
    scopeClassChoiceFeatureCatalogs(
      catalogs,
      getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource),
    )
  const spells = cls && subclass && scoped && getNamedSubclassSpellSource(cls, subclass, scoped)
  const current =
    spells &&
    cls &&
    subclass &&
    catalogs &&
    getInscriptionSource(cls, subclass, spells, entry, character, catalogs)
  const saved = savedInscription(character, owner)
  if (!current && !saved) return undefined
  const weapons =
    current && catalogs
      ? character.equipment.filter((weapon) => isInscribableWeapon(weapon, character, catalogs))
      : []
  const active = !!(
    saved &&
    current &&
    saved.mark.target === current.target &&
    weapons.includes(saved.weapon) &&
    current.runes.some((rune) => norm(rune) === saved.mark.rune)
  )
  return { owner, current, saved, weapons, active }
}
