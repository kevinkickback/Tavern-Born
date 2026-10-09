import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildSpellNameKeySet,
  getSpellNameKey,
  getSpellReferenceKey,
} from '@/lib/calculations/spellIdentity'
import { buildSpellcastingClassDetails } from '@/lib/calculations/spellProfiles.casting'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { getSpellProfileSelectionCounts } from '@/lib/calculations/spellProfiles.profiles'
import { deriveSpellProfileState } from '@/lib/character/spellProfileState'
import { spellChoiceReadinessId, spellProfileReadinessId } from '@/lib/navigation/readinessFocus'
import type { Spell5e } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'
import { readinessIssue } from './readinessIssue'
import type { CharacterReadinessIssue } from './types'

type SpellcastingDetail = ReturnType<typeof buildSpellcastingClassDetails>[number]

function classSpellChoiceTarget(detail: SpellcastingDetail): string {
  const params = new URLSearchParams({
    class: `${detail.className}|${detail.classSource ?? ''}`,
    level: String(detail.classLevel),
  })
  return `/build/class?${params.toString()}`
}

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
        `${detail.cantripLimit} cantrip choices are available; ${counts.cantrips} chosen.`,
        classSpellChoiceTarget(detail),
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
        `${detail.knownSpellLimit} spell choices are available; ${counts.spells} chosen.`,
        classSpellChoiceTarget(detail),
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
  const storedProfiles = character.spells.spellProfiles.filter(
    (profile) => profile.type !== 'racial',
  )
  const storedProfileIds = new Set(storedProfiles.map((profile) => profile.id))
  const derivedProfiles = deriveSpellProfileState(
    character,
    classMap,
    undefined,
    calculation.raceResolution,
  ).spells.spellProfiles
  // Refresh the native relation while retaining existing class and special command state.
  const spellProfiles = [
    ...storedProfiles,
    ...derivedProfiles.filter(
      (profile) => profile.type === 'racial' || !storedProfileIds.has(profile.id),
    ),
  ]
  const profileById = new Map(spellProfiles.map((profile) => [profile.id, profile]))
  const issues = details.flatMap((detail) => {
    const profile = profileById.get(detail.profileId)
    if (profile) return validateSpellProfile(profile, detail)
    return [
      readinessIssue(
        spellProfileReadinessId('profile', detail.profileId),
        'blocking',
        'spells',
        `Configure ${detail.className} spellcasting`,
        'Spellcasting details for this class are missing.',
      ),
    ]
  })

  for (const profile of spellProfiles) {
    if (profile.type === 'racial' && profile.racial) {
      if (profile.racial.mode === 'alternative' && !profile.racial.suite)
        issues.push(
          readinessIssue(
            spellProfileReadinessId('profile', profile.id),
            'blocking',
            'spells',
            'Choose ' + profile.label + ' spell suite',
            'Choose one of the racial spell suites.',
          ),
        )
      if (profile.racial.suite && profile.castingAbilityOptions?.length && !profile.castingAbility)
        issues.push(
          readinessIssue(
            spellProfileReadinessId('profile', profile.id),
            'blocking',
            'spells',
            'Choose ' + profile.label + ' casting ability',
            'Choose the ability used for these spells.',
          ),
        )
    }
    for (const choice of profile.choices ?? []) {
      if (choice.selected.length !== choice.count) {
        issues.push(
          readinessIssue(
            spellChoiceReadinessId(profile.id, choice.id),
            'blocking',
            'spells',
            `Finish ${profile.label} spell choices`,
            `${choice.count} spell choices are available; ${choice.selected.length} chosen.`,
          ),
        )
      }
    }
  }

  if (spellsByKey) {
    const knownNames = buildSpellNameKeySet(Object.values(spellsByKey).map((spell) => spell.name))
    const knownReferences = new Set(
      Object.values(spellsByKey).map((spell) => getSpellReferenceKey(spell.name, spell.source)),
    )
    const selected = spellProfiles.flatMap((profile) =>
      [
        ...profile.cantrips,
        ...profile.spellsKnown,
        ...profile.preparedSpells,
        ...(profile.fixedSpells ?? []),
        ...(profile.alwaysPreparedSpells ?? []),
      ].map((name) => ({ name, racial: profile.type === 'racial' })),
    )
    const selectedByIdentity = new Map(
      selected.map((target) => [
        target.racial ? getSpellReferenceKey(target.name) : getSpellNameKey(target.name),
        target,
      ]),
    )
    for (const { name, racial } of selectedByIdentity.values()) {
      if (
        racial
          ? knownReferences.has(getSpellReferenceKey(name))
          : knownNames.has(getSpellNameKey(name))
      )
        continue
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
