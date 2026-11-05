import { findClassReference } from '@/lib/5etools/classReference'
import { getCurrentDirectFixedClassRules } from '@/lib/5etools/directFixedProficiencySource'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import type { Class5e } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { Character } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import type { ClassFixedSpellGrant } from './optionalClassFixedSpells'

/** A current certified feature must corroborate its own gain in the class spell schedule. */
export function getDirectClassPreparedSpellGrants(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): ClassFixedSpellGrant[] {
  if (!catalogs) return []
  return character.classProgression.flatMap((entry) => {
    const cls = findClassReference(entry, classes)
    if (
      !cls ||
      character.classProgression.filter((row) => findClassReference(entry, [row])).length !== 1
    )
      return []
    return getCurrentDirectFixedClassRules(cls, catalogs).flatMap((rule) => {
      const reference = rule.alwaysPreparedSpell
      if (!reference || entry.levels < rule.level) return []
      const blocks = cls.additionalSpells as AdditionalSpellBlock[] | undefined
      const block = Array.isArray(blocks) && blocks.length === 1 ? blocks[0] : undefined
      const schedule = block?.prepared
      const token = schedule?.[String(rule.level)]
      if (
        !block ||
        Object.keys(block).length !== 1 ||
        !schedule ||
        typeof schedule !== 'object' ||
        Array.isArray(schedule) ||
        Object.keys(schedule).filter((key) => Number(key) === rule.level).length !== 1 ||
        !Array.isArray(token) ||
        token.length !== 1 ||
        typeof token[0] !== 'string' ||
        !/^[^|#{}]+\|[^|#{}]+$/.test(token[0]) ||
        getSpellReferenceKey(token[0]) !== getSpellReferenceKey(reference)
      )
        return []
      // Other scheduled gains require their own corroborating feature.
      return [
        {
          owner: ['class', rule.className.toLowerCase(), rule.classSource.toLowerCase()],
          target: rule.target,
          featureName: rule.name,
          level: rule.level,
          reference,
        },
      ]
    })
  })
}
