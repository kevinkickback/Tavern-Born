import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildSpellcastingClassDetails } from '@/lib/calculations/spellProfiles.casting'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { getSpellProfileSelectionCounts } from '@/lib/calculations/spellProfiles.profiles'
import { spellChoiceReadinessId, spellProfileReadinessId } from '@/lib/navigation/readinessFocus'
import type { Spell5e } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'
import { readinessIssue } from './readinessIssue'
import type { CharacterReadinessIssue } from './types'

type SpellcastingDetail = ReturnType<typeof buildSpellcastingClassDetails>[number]

function validateSpellProfile(
  profile: SpellProfile,
  detail: SpellcastingDetail,
): CharacterReadinessIssue[] {
  const issues: CharacterReadinessIssue[] = []
  const counts = getSpellProfileSelectionCounts(profile)
  if (detail.cantripLimit != null && counts.cantrips !== detail.cantripLimit) {
    issues.push(
      readinessIssue(
        spellProfileReadinessId('cantrips', detail.profileId),
        'blocking',
        'spells',
        `Finish ${detail.className} cantrip choices`,
        `${detail.cantripLimit} are required; ${counts.cantrips} are stored.`,
      ),
    )
  }
  if (
    detail.knownSpellLimit != null &&
    !detail.isTruePreparedCaster &&
    counts.spells !== detail.knownSpellLimit
  ) {
    issues.push(
      readinessIssue(
        spellProfileReadinessId('known', detail.profileId),
        'blocking',
        'spells',
        `Finish ${detail.className} spell choices`,
        `${detail.knownSpellLimit} are required; ${counts.spells} are stored.`,
      ),
    )
  }
  if (detail.preparedSpellLimit != null && counts.prepared > detail.preparedSpellLimit) {
    issues.push(
      readinessIssue(
        spellProfileReadinessId('prepared-over-limit', detail.profileId),
        'blocking',
        'spells',
        `Reduce ${detail.className} prepared spells`,
        `${counts.prepared} are prepared, above the current limit of ${detail.preparedSpellLimit}.`,
      ),
    )
  }
  if (
    detail.isTruePreparedCaster &&
    (detail.preparedSpellLimit ?? 0) > 0 &&
    counts.prepared === 0
  ) {
    issues.push(
      readinessIssue(
        spellProfileReadinessId('prepared-empty', detail.profileId),
        'recommendation',
        'spells',
        `Prepare ${detail.className} spells`,
        'This character may be ready without a full list, but preparing spells will make the sheet more useful.',
      ),
    )
  }
  return issues
}

export function validateSpells(
  character: Character,
  calculation: CharacterCalculationContext,
  spellsByKey: Readonly<Record<string, Spell5e>> | undefined,
): CharacterReadinessIssue[] {
  const classMap = new Map(
    calculation.classes.map((classData) => [
      toClassProfileId(classData.name, classData.source),
      classData,
    ]),
  )
  const details = buildSpellcastingClassDetails(
    character,
    classMap,
    calculation.abilityScores.total,
    calculation.effects.declarations,
    calculation.effects.resolutionContext,
  )
  const profileById = new Map(
    character.spells.spellProfiles.map((profile) => [profile.id, profile]),
  )
  const issues = details.flatMap((detail) => {
    const profile = profileById.get(detail.profileId)
    if (profile) return validateSpellProfile(profile, detail)
    return [
      readinessIssue(
        spellProfileReadinessId('profile', detail.profileId),
        'blocking',
        'spells',
        `Configure ${detail.className} spellcasting`,
        'The required class spell profile is missing.',
      ),
    ]
  })

  for (const profile of character.spells.spellProfiles) {
    for (const choice of profile.choices ?? []) {
      if (choice.selected.length !== choice.count) {
        issues.push(
          readinessIssue(
            spellChoiceReadinessId(profile.id, choice.id),
            'blocking',
            'spells',
            `Finish ${profile.label} spell choices`,
            `${choice.count} are required; ${choice.selected.length} are stored.`,
          ),
        )
      }
    }
  }

  if (spellsByKey) {
    const knownNames = new Set(Object.values(spellsByKey).map((spell) => spell.name))
    const selectedNames = character.spells.spellProfiles.flatMap((profile) => [
      ...profile.cantrips,
      ...profile.spellsKnown,
      ...profile.preparedSpells,
      ...(profile.fixedSpells ?? []),
      ...(profile.alwaysPreparedSpells ?? []),
    ])
    for (const name of new Set(selectedNames)) {
      if (knownNames.has(name)) continue
      issues.push(
        readinessIssue(
          `source:spell:${name}`,
          'blocking',
          'sources',
          `Restore the source for ${name}`,
          'A selected spell cannot be resolved from the enabled or cached content.',
        ),
      )
    }
  }
  return issues
}
