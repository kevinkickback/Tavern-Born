import { resolveBackgroundReference, resolveClassReference } from '@/lib/5etools/entityResolvers'
import {
  getBackgroundEquipmentBlocks,
  getClassDefaultEquipmentBlocks,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import { createStartingEquipmentPolicy } from '@/lib/5etools/startingEquipmentPolicy'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { needsStartingEquipmentApplication } from '@/lib/character/startingEquipmentGrants'
import type { Character } from '@/types/character'
import { readinessIssue } from './readinessIssue'
import type { CharacterReadinessIssue } from './types'

export function validateStartingEquipment(
  character: Character,
  calculation?: CharacterCalculationContext,
): CharacterReadinessIssue[] {
  const issues: CharacterReadinessIssue[] = []
  if (character.classProgression.length && !character.initialClass)
    issues.push(
      readinessIssue(
        'starting-equipment:class',
        'blocking',
        'class',
        'Select an initial Class for starting equipment',
        'Class order does not select a starting package. Choose the initial Class explicitly.',
        '/build/class?attention=starting-equipment%3Aclass',
      ),
    )
  if (!calculation?.lookups.rawItemsAuthoritative) return issues
  const { primary, raw } = calculation.lookups
  const rawItems = raw.startingEquipmentItems ?? [...(raw.itemLookup?.values() ?? [])]
  const available = primary.startingEquipmentItems ?? [...(primary.itemLookup?.values() ?? [])]
  for (const role of ['class', 'background'] as const) {
    const reference =
      role === 'class'
        ? character.initialClass
        : character.background && character.backgroundSource
          ? { name: character.background, source: character.backgroundSource }
          : undefined
    if (!reference) continue
    const current =
      role === 'class'
        ? resolveClassReference(reference, primary)
        : resolveBackgroundReference(reference, primary)
    const owner =
      current ??
      (role === 'class'
        ? resolveClassReference(reference, raw)
        : resolveBackgroundReference(reference, raw))
    const id = `starting-equipment:${role}`
    const navigation = `/build/${role}?attention=${encodeURIComponent(id)}`
    if (!owner || !current) {
      issues.push(
        readinessIssue(
          id,
          'blocking',
          role,
          `Restore ${role === 'class' ? 'Class' : 'Background'} starting equipment rules`,
          'The selected owner’s current source rules are unavailable. Saved equipment and choices are retained.',
          navigation,
        ),
      )
      continue
    }
    const policy = createStartingEquipmentPolicy(
      character,
      {
        ...reference,
        kind: role,
        sourceIdentityConflict: owner.sourceIdentityConflict === true,
        entries: Array.isArray(owner.entries) ? owner.entries : undefined,
      },
      owner.startingEquipment,
      rawItems,
      available,
      raw.itemTypeByAbbr ?? primary.itemTypeByAbbr,
    )
    const classKey = `${reference.name}|${reference.source}`
    const pkg = resolveEquipmentWithBlockChoices(
      role === 'class'
        ? getClassDefaultEquipmentBlocks(owner.startingEquipment)
        : getBackgroundEquipmentBlocks(owner.startingEquipment),
      new Map(raw.itemLookup),
      role === 'class'
        ? (character.classEquipmentChoices?.[classKey] ?? [])
        : (character.backgroundEquipmentChoices ?? []),
      role === 'class'
        ? (character.classEquipmentItemChoices?.[classKey] ?? {})
        : (character.backgroundEquipmentItemChoices ?? {}),
      policy,
    )
    if (pkg.issues?.length || needsStartingEquipmentApplication(character, role, pkg))
      issues.push(
        readinessIssue(
          id,
          'blocking',
          role,
          `Finish ${role === 'class' ? 'Class' : 'Background'} starting equipment`,
          pkg.issues?.length
            ? [...new Set(pkg.issues)].slice(0, 3).join(' ')
            : 'Apply the current package to receive its available starting grants. Spent items and gold stay spent.',
          navigation,
        ),
      )
  }
  return issues
}
