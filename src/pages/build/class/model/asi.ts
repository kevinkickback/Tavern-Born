import type { AsiChoice } from '@/types/character'

interface ApplyAsiParams {
  currentAsiChoices: AsiChoice[]
  className: string
  level: number
  abilityChanges: Record<string, 1 | 2>
}

export function applyClassAsiChoice({
  currentAsiChoices,
  className,
  level,
  abilityChanges,
}: ApplyAsiParams): AsiChoice[] {
  return [
    ...currentAsiChoices.filter(
      (choice) => !(choice.level === level && choice.className === className),
    ),
    {
      id: `asi-${className}-${level}`,
      level,
      className,
      abilityChanges,
    },
  ]
}

interface ResetAsiParams {
  currentAsiChoices: AsiChoice[]
  className: string
  level: number
}

export function resetClassAsiChoice({
  currentAsiChoices,
  className,
  level,
}: ResetAsiParams): AsiChoice[] | null {
  const exists = currentAsiChoices.some(
    (choice) => choice.level === level && choice.className === className,
  )
  if (!exists) return null

  return currentAsiChoices.filter(
    (choice) => !(choice.level === level && choice.className === className),
  )
}
