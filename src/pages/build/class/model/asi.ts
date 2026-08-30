import type { AsiChoice, Feat } from '@/types/character'

export function isClassAsiFeatForSlot(
  feat: Feat,
  className: string,
  classSource: string | undefined,
  level?: number,
): boolean {
  return (
    feat.className === className &&
    (feat.classSource ?? '') === (classSource ?? '') &&
    (level == null || feat.classLevel === level)
  )
}

export interface ClassAsiSlot {
  className: string
  classSource?: string
  level: number
}

/** Assign legacy unscoped feats to the first earned, unresolved class ASI slots. */
export function assignLegacyClassAsiFeats(
  feats: Feat[],
  slots: ClassAsiSlot[],
  asiChoices: AsiChoice[],
): Feat[] {
  const availableSlots = slots.filter((slot) => {
    const hasAsi = asiChoices.some(
      (choice) =>
        choice.className === slot.className &&
        choice.level === slot.level &&
        (choice.classSource == null || (choice.classSource ?? '') === (slot.classSource ?? '')),
    )
    const hasScopedFeat = feats.some((feat) =>
      isClassAsiFeatForSlot(feat, slot.className, slot.classSource, slot.level),
    )
    return !hasAsi && !hasScopedFeat
  })

  let slotIndex = 0
  return feats.map((feat) => {
    if (feat.className != null && feat.classLevel != null) return feat
    const slot = availableSlots[slotIndex]
    if (!slot) return feat
    slotIndex += 1
    return {
      ...feat,
      className: slot.className,
      classSource: slot.classSource,
      classLevel: slot.level,
    }
  })
}

interface ApplyAsiParams {
  currentAsiChoices: AsiChoice[]
  className: string
  classSource?: string
  level: number
  abilityChanges: Record<string, 1 | 2>
}

export function applyClassAsiChoice({
  currentAsiChoices,
  className,
  classSource,
  level,
  abilityChanges,
}: ApplyAsiParams): AsiChoice[] {
  return [
    ...currentAsiChoices.filter(
      (choice) =>
        !(
          choice.level === level &&
          choice.className === className &&
          (choice.classSource == null || (choice.classSource ?? '') === (classSource ?? ''))
        ),
    ),
    {
      id: `asi-${className}${classSource ? `-${classSource}` : ''}-${level}`,
      level,
      className,
      classSource,
      abilityChanges,
    },
  ]
}

interface ResetAsiParams {
  currentAsiChoices: AsiChoice[]
  className: string
  classSource?: string
  level: number
}

export function resetClassAsiChoice({
  currentAsiChoices,
  className,
  classSource,
  level,
}: ResetAsiParams): AsiChoice[] | null {
  const exists = currentAsiChoices.some(
    (choice) =>
      choice.level === level &&
      choice.className === className &&
      (choice.classSource == null || (choice.classSource ?? '') === (classSource ?? '')),
  )
  if (!exists) return null

  return currentAsiChoices.filter(
    (choice) =>
      !(
        choice.level === level &&
        choice.className === className &&
        (choice.classSource == null || (choice.classSource ?? '') === (classSource ?? ''))
      ),
  )
}
