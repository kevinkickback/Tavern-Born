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

interface ApplyAsiParams {
  currentAsiChoices: AsiChoice[]
  className: string
  classSource: string
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
          choice.classSource === classSource
        ),
    ),
    {
      id: `asi-${className}-${classSource}-${level}`,
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
  classSource: string
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
      choice.classSource === classSource,
  )
  if (!exists) return null

  return currentAsiChoices.filter(
    (choice) =>
      !(
        choice.level === level &&
        choice.className === className &&
        choice.classSource === classSource
      ),
  )
}
