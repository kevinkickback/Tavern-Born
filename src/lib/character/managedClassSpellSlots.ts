import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ManagedClassSpellDomain, ManagedClassSpellSlot } from '@/types/classCasting'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
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
  const { rule } = getClassSpellProfilePolicy(entry)
  const domains: Exclude<ManagedClassSpellDomain, 'feature-cantrip'>[] = [
    'class-cantrip',
    'class-known',
    'class-spellbook',
  ]
  const ordinary =
    !rule || entry.levels < rule.declaration.level
      ? []
      : domains.flatMap((domain) =>
          (rule.domains[domain] ?? []).flatMap((gain) =>
            gain.level <= entry.levels
              ? Array.from(
                  { length: gain.count },
                  (_, ordinal): ManagedClassSpellSlot => [
                    rule.declaration.owner,
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
          .filter((choice) => choice.slot[1] === 'feature-cantrip')
          .map((choice) => choice.slot),
      ].filter((slot) => getManagedClassSpellOwnerEntry(slot, [entry]) && slot[3] <= entry.levels)
    : []
  return [
    ...new Map([...ordinary, ...feature].map((slot) => [managedClassSpellId(slot), slot])).values(),
  ]
}
