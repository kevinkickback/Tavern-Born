import { getBardLoreSpellSlots } from '@/lib/5etools/bardSpellSources'
import {
  getClassCastingProducersForOwner,
  getClassSpellProfilePolicy,
  getManagedClassSpellRule,
  isCatalogCastingCopyOwner,
} from '@/lib/5etools/classCastingRules'
import { getCurrentClassCastingProducer } from '@/lib/5etools/classCastingSource'
import type { CastingProducerRule } from '@/lib/5etools/classCastingStructure'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  getClericArcanaSpellRule,
  getClericArcanaSpellSlots,
} from '@/lib/5etools/clericArcanaSpells'
import { getArcaneDabblerSlots, isArcaneDabblerSlot } from '@/lib/5etools/mysticArcaneDabbler'
import { getSavantSpellbookGain, getSavantSpellbookSlots } from '@/lib/5etools/savantSpellbookRules'
import { getSpellbookSpecialtySlots } from '@/lib/5etools/spellbookSpecialtyRules'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ManagedClassSpellDomain, ManagedClassSpellSlot } from '@/types/classCasting'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'
import { sources as characterSources, permitted } from './classSpellAuthority'
import type { ClassChoicePrerequisiteContext } from './effectiveClassChoiceFeatures'
import { getManagedClassSpellOwnerEntry, managedClassSpellId } from './managedClassSpellIdentity'
import { getSelectedFeatureCantripSlots } from './selectedFeatureSpells'

/** Earned addresses for presentation and completion; current source authority is checked separately. */
export function getManagedClassSpellSlots(
  entry: CharacterClassEntry,
  character?: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  prerequisites?: ClassChoicePrerequisiteContext,
): ManagedClassSpellSlot[] {
  const sources = catalogs?.classCastingSources
  const { rule, owner, mode } = getClassSpellProfilePolicy(entry, sources)
  const allowed = character && characterSources(character)
  const currentRule = (producer: CastingProducerRule) => {
    if (!catalogs || !isCatalogCastingCopyOwner(owner)) return true
    const current = getCurrentClassCastingProducer(
      catalogs,
      owner,
      producer.declaration.target,
      producer.declaration.level,
    )
    return (
      !!current &&
      (!current.templateSources ||
        [entry.source ?? '', current.declaration.feature.source, ...current.templateSources].every(
          (source) => permitted(allowed, source),
        ))
    )
  }
  const domains: Extract<
    ManagedClassSpellDomain,
    'class-cantrip' | 'class-known' | 'class-spellbook'
  >[] = ['class-cantrip', 'class-known', 'class-spellbook']
  const ordinary =
    !rule || entry.levels < rule.declaration.level || !currentRule(rule)
      ? []
      : domains.flatMap((domain) =>
          (rule.domains[domain] ?? []).flatMap((gain) =>
            gain.level <= entry.levels
              ? Array.from(
                  { length: gain.count },
                  (_, ordinal): ManagedClassSpellSlot => [
                    owner,
                    domain,
                    rule.declaration.target,
                    gain.level,
                    ordinal,
                  ],
                )
              : [],
          ),
        )
  const feature = character
    ? [
        ...getSelectedFeatureCantripSlots(character, catalogs, prerequisites),
        ...(character.managedClassSpellChoices ?? [])
          .filter(
            (choice) =>
              choice.slot[1] === 'feature-cantrip' ||
              isArcaneDabblerSlot(choice.slot) ||
              getClericArcanaSpellRule(choice.slot) ||
              getSavantSpellbookGain(choice.slot) ||
              getManagedClassSpellRule(choice.slot),
          )
          .map((choice) => choice.slot),
      ].filter((slot) => getManagedClassSpellOwnerEntry(slot, [entry]) && slot[3] <= entry.levels)
    : []
  const arcanumOwner = ['class', owner[1], owner[2]] as ['class', string, string]
  const arcanum = getClassCastingProducersForOwner(arcanumOwner, sources)
    .filter(currentRule)
    .flatMap((producer) =>
      (producer.domains['class-arcanum'] ?? []).flatMap((gain) =>
        gain.level <= entry.levels
          ? Array.from(
              { length: gain.count },
              (_, ordinal): ManagedClassSpellSlot => [
                arcanumOwner,
                'class-arcanum',
                producer.declaration.target,
                gain.level,
                ordinal,
              ],
            ).filter((slot) => getManagedClassSpellOwnerEntry(slot, [entry]))
          : [],
      ),
    )
  const matches = catalogs?.classes?.filter((cls) => findClassReference(entry, [cls]))
  const currentClass = matches?.length === 1 ? matches[0] : undefined
  const savantCatalog =
    catalogs && entry.subclass && rule && mode === 'spellbook' && currentRule(rule)
      ? scopeClassChoiceFeatureCatalogs(
          catalogs,
          getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource),
        )
      : undefined
  return [
    ...new Map(
      [
        ...ordinary,
        ...arcanum,
        ...feature,
        ...getBardLoreSpellSlots(entry),
        ...getClericArcanaSpellSlots(entry, currentClass),
        ...(character ? getArcaneDabblerSlots(character, entry, catalogs?.classes) : []),
        ...getSavantSpellbookSlots(entry, currentClass, savantCatalog),
        ...getSpellbookSpecialtySlots(entry),
      ].map((slot) => [managedClassSpellId(slot), slot]),
    ).values(),
  ]
}
