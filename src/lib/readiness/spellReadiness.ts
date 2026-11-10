import { getSavantSpellbookGain } from '@/lib/5etools/savantSpellbookRules'
import { isSelectedInvocationRitualSlot } from '@/lib/5etools/selectedFeatureSpellIdentity'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellProfileDisplayLabel } from '@/lib/calculations/raceDisplay'
import {
  buildSpellNameKeySet,
  getSpellNameKey,
  getSpellReferenceKey,
} from '@/lib/calculations/spellIdentity'
import type { SpellcastingClassDetail } from '@/lib/calculations/spellProfiles.casting'
import { getSpellProfileSelectionCounts } from '@/lib/calculations/spellProfiles.profiles'
import {
  getManagedClassSpellFeatureLabel,
  managedClassSpellId,
} from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getSelectedFeatureCantripSetups } from '@/lib/character/selectedFeatureSpells'
import { spellChoiceReadinessId, spellProfileReadinessId } from '@/lib/navigation/readinessFocus'
import type { Spell5e } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'
import { readinessIssue } from './readinessIssue'
import type { CharacterReadinessIssue } from './types'

type SpellcastingDetail = SpellcastingClassDetail

function validateSpellProfile(
  profile: SpellProfile,
  detail: SpellcastingDetail,
): CharacterReadinessIssue[] {
  const issues: CharacterReadinessIssue[] = []
  const counts = getSpellProfileSelectionCounts(profile)
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
  character = calculation.character
  const details = calculation.classCasting.details
  const spellProfiles = character.spells.spellProfiles
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
  for (const profileId of new Set(
    calculation.dailyClassSpellStatuses.filter((row) => !row.active).map((row) => row.profileId),
  )) {
    const unavailable = calculation.dailyClassSpellStatuses.filter(
      (row) => row.profileId === profileId && !row.active,
    )
    issues.push(
      readinessIssue(
        spellProfileReadinessId('prepared-unavailable', profileId),
        'blocking',
        'spells',
        'Review unavailable prepared spells',
        `${unavailable.map((row) => `${row.reference}: ${row.reason}`).join(' ')} Restore their sources or unprepare the saved choices.`,
      ),
    )
  }

  const statuses = new Map(
    calculation.managedClassSpellStatuses.map((status) => [
      managedClassSpellId(status.choice.slot),
      status,
    ]),
  )
  const featureSetups = getSelectedFeatureCantripSetups(
    character,
    calculation.classChoices.catalogs,
    calculation.classChoices.prerequisites,
  )
  for (const setup of featureSetups) {
    if (!setup.reason || (setup.offered && setup.count)) continue
    issues.push(
      readinessIssue(
        `spells:feature-source:${JSON.stringify([setup.owner, setup.producer, setup.level])}`,
        'blocking',
        'sources',
        `Review ${setup.name} spell choices`,
        setup.reason,
      ),
    )
  }
  for (const grant of calculation.fixedClassSpellStatuses) {
    if (grant.active) continue
    issues.push(
      readinessIssue(
        `spells:${grant.prepared ? 'class-fixed' : 'optional-fixed'}:${JSON.stringify([grant.owner, grant.target, grant.level, grant.reference])}`,
        'blocking',
        'sources',
        `Restore ${grant.featureName} spell: ${grant.reference}`,
        grant.reason ?? 'Restore the exact granted spell printing.',
      ),
    )
  }
  for (const grant of calculation.atWillInvocationSpellStatuses) {
    if (grant.spell) continue
    issues.push(
      readinessIssue(
        `spells:invocation-fixed:${grant.id}`,
        'blocking',
        'sources',
        `Restore ${grant.featureName} spell: ${grant.reference}`,
        grant.reason ?? 'Restore the exact granted spell printing from enabled content.',
      ),
    )
  }
  for (const entry of character.classProgression) {
    const groups = new Map<string, ReturnType<typeof getManagedClassSpellSlots>>()
    for (const slot of getManagedClassSpellSlots(
      entry,
      character,
      calculation.classChoices.catalogs,
      calculation.classChoices.prerequisites,
    )) {
      const key = JSON.stringify(slot.slice(0, 4))
      groups.set(key, [...(groups.get(key) ?? []), slot])
    }
    for (const slots of groups.values()) {
      const rows = slots.map((slot) => statuses.get(managedClassSpellId(slot)))
      const active = rows.filter((row) => row?.active).length
      if (active === slots.length) continue
      const unavailable = rows.flatMap((row) => (row && !row.active ? [row] : []))
      const level = slots[0][3]
      const savant = getSavantSpellbookGain(slots[0])
      const featureLabel = getManagedClassSpellFeatureLabel(slots[0])
      const selectedFeature = featureSetups.find((setup) => setup.producer === slots[0][2])?.name
      const kind = isSelectedInvocationRitualSlot(slots[0])
        ? `${selectedFeature ?? featureLabel ?? 'feature'} ritual`
        : slots[0][1] === 'feature-cantrip'
          ? `${selectedFeature ?? 'feature'} cantrip`
          : slots[0][1] === 'class-cantrip'
            ? 'cantrip'
            : slots[0][1] === 'class-arcanum'
              ? 'Mystic Arcanum'
              : savant
                ? `${featureLabel ?? 'Savant'} spellbook`
                : (featureLabel ?? 'spell')
      issues.push(
        readinessIssue(
          `spells:managed:${managedClassSpellId(slots[0])}`,
          'blocking',
          'spells',
          `${unavailable.length ? 'Review' : 'Finish'} ${entry.name} ${kind} choices at level ${level}`,
          unavailable.length
            ? unavailable
                .map(
                  (row) => `${row.choice.target.name} (${row.choice.target.source}): ${row.reason}`,
                )
                .join(' ')
            : savant
              ? `${slots.length} extra spellbook ${slots.length === 1 ? 'choice is' : 'choices are'} earned here. ${active} of ${slots.length} complete.`
              : `${slots.length} choices are earned here; ${active} are active.`,
          `/build/class?${new URLSearchParams({ class: `${entry.name}|${entry.source}`, level: String(level) })}`,
        ),
      )
    }
  }

  for (const profile of spellProfiles) {
    const label = getSpellProfileDisplayLabel(profile)
    if (profile.type === 'racial' && profile.racial) {
      if (profile.racial.mode === 'alternative' && !profile.racial.suite)
        issues.push(
          readinessIssue(
            spellProfileReadinessId('profile', profile.id),
            'blocking',
            'spells',
            `Choose ${label} spell suite`,
            'Choose one of the racial spell suites.',
          ),
        )
      if (profile.racial.suite && profile.castingAbilityOptions?.length && !profile.castingAbility)
        issues.push(
          readinessIssue(
            spellProfileReadinessId('profile', profile.id),
            'blocking',
            'spells',
            `Choose ${label} casting ability`,
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
            `Finish ${label} spell choices`,
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
