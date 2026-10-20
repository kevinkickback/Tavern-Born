import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import {
  getClassCastingLevelAccess,
  getCurrentClassCastingParent,
  getCurrentClassCastingProducer,
  getCurrentStandardSpellSlotProvider,
} from '@/lib/5etools/classCastingSource'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { permitted, sources } from '@/lib/character/classSpellAuthority'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { AbilityScores, Character } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import type { EffectResolutionContext } from './effects'
import { buildSpellcastingClassDetails } from './spellProfiles.casting'
import { toClassProfileId } from './spellProfiles.constants'
import { calculateCharacterSpellSlots } from './spellProfiles.slots'
import {
  type CasterProgression,
  getCasterLevelContribution,
  getSpellSlotsFromClassData,
  mergeSpellSlots,
} from './spellSlots'

/** Current casting mechanics require certified declarations and consumed tables, never retained text. */
export function deriveCurrentClassCasting(
  character: Character,
  sourceCatalogs: ClassChoiceFeatureCatalogs | undefined,
  abilityScores: AbilityScores,
  effects: readonly CharacterEffect[] = [],
  effectContext: EffectResolutionContext = {},
  savedIntent: Character = character,
) {
  const catalogs = sourceCatalogs && { ...sourceCatalogs }
  const allowed = sources(character)
  const unearnedProfiles: string[] = []
  const entries = character.classProgression.flatMap((entry) => {
    const { rule } = getClassSpellProfilePolicy(entry)
    if (
      !catalogs ||
      !rule ||
      character.classProgression.filter(
        (other) =>
          norm(other.name) === norm(entry.name) && norm(other.source) === norm(entry.source),
      ).length !== 1
    )
      return []
    const { owner, target, level } = rule.declaration
    const scoped = scopeClassChoiceFeatureCatalogs(
      catalogs,
      owner[0] === 'subclass'
        ? getFeatureOwnerKey(owner[1], owner[2], owner[3], owner[4])
        : undefined,
    )
    if (entry.levels < level) {
      const current = getCurrentClassCastingProducer(scoped, owner, target, level)
      const id = toClassProfileId(entry.name, entry.source)
      const hasIntent =
        savedIntent.managedClassSpellChoices?.some(
          (choice) =>
            choice.slot[0][1] === norm(entry.name) && choice.slot[0][2] === norm(entry.source),
        ) ||
        [...savedIntent.spells.spellProfiles, ...character.spells.spellProfiles].some(
          (profile) =>
            profile.id === id &&
            [
              profile.cantrips,
              profile.spellsKnown,
              profile.preparedSpells,
              profile.fixedSpells,
              profile.alwaysPreparedSpells,
              profile.choices,
              profile.castingAbilityOptions,
            ].some((values) => values?.length),
        )
      if (
        current &&
        !hasIntent &&
        [
          owner[2],
          ...(owner[0] === 'subclass' ? [owner[4]] : []),
          current.declaration.feature.source,
        ].every((source) => permitted(allowed, source))
      )
        unearnedProfiles.push(id)
      return []
    }
    const access = getClassCastingLevelAccess(scoped, owner, target, level, entry.levels)
    if (
      !access ||
      ![
        owner[2],
        ...(owner[0] === 'subclass' ? [owner[4]] : []),
        access.declaration.feature.source,
        ...(access.provider ? [access.provider.source] : []),
      ].every((source) => permitted(allowed, source))
    )
      return []
    // The certified effective fields already include the exact selected subclass.
    return [{ entry, access, effective: { ...access.effective, subclasses: undefined } }]
  })
  const classes = new Map(
    entries.map(({ entry, effective }) => [toClassProfileId(entry.name, entry.source), effective]),
  )
  const details = buildSpellcastingClassDetails(
    character,
    classes,
    abilityScores,
    effects,
    effectContext,
  ).map((detail) => ({
    ...detail,
    maxSpellLevel: entries.find(
      ({ entry }) => toClassProfileId(entry.name, entry.source) === detail.profileId,
    )!.access.maxSpellLevel,
  }))
  const slots = calculateCharacterSpellSlots(character, classes)
  const shared = entries.filter(
    ({ access, effective }) =>
      access.maxSpellLevel > 0 &&
      effective.casterProgression !== 'pact' &&
      effective.casterProgression !== 'none',
  )
  if (shared.length > 1 && catalogs) {
    const level = shared.reduce(
      (sum, { entry, effective }) =>
        sum +
        getCasterLevelContribution(
          (effective.casterProgression ?? 'none') as CasterProgression,
          entry.levels,
        ),
      0,
    )
    const revised = character.classProgression.some((entry) => {
      const parent = getCurrentClassCastingParent(catalogs, [
        'class',
        norm(entry.name),
        norm(entry.source),
      ])
      return (
        parent &&
        permitted(allowed, parent.source) &&
        (parent.edition === 'one' || parent.source.trim().toUpperCase() === 'XPHB')
      )
    })
    const provider = getCurrentStandardSpellSlotProvider(catalogs, level, revised ? '2024' : '2014')
    slots.shared = provider && permitted(allowed, provider.classData.source) ? provider.slots : {}
  } else if (shared.length === 1 && shared[0].access.provider) {
    const { entry, effective, access } = shared[0]
    slots.shared =
      getSpellSlotsFromClassData(
        access.provider!,
        getCasterLevelContribution(
          (effective.casterProgression ?? 'none') as CasterProgression,
          entry.levels,
        ),
      ) ?? {}
  }
  slots.mergedSharedWithUsage = mergeSpellSlots(
    slots.shared,
    Object.fromEntries(
      Object.entries(character.spells.spellSlots).map(([level, slot]) => [level, slot?.used ?? 0]),
    ),
  )
  return { details, slots, unearnedProfiles }
}
