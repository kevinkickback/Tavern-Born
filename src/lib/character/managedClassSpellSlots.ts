import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import type { CharacterClassEntry } from '@/types/character'
import type { ManagedClassSpellDomain, ManagedClassSpellSlot } from '@/types/classCasting'

/** Earned addresses for presentation and completion; current source authority is checked separately. */
export function getManagedClassSpellSlots(entry: CharacterClassEntry): ManagedClassSpellSlot[] {
  const { rule } = getClassSpellProfilePolicy(entry)
  if (!rule || entry.levels < rule.declaration.level) return []
  const domains: ManagedClassSpellDomain[] = ['class-cantrip', 'class-known', 'class-spellbook']
  return domains.flatMap((domain) =>
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
}
