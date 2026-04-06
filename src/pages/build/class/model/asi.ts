import type { AbilityScores, AsiChoice } from '@/types/character';

interface ApplyAsiParams {
  characterAbilityScores: AbilityScores;
  currentAsiChoices: AsiChoice[];
  className: string;
  level: number;
  abilityChanges: Record<string, 1 | 2>;
}

export function applyClassAsiChoice({
  characterAbilityScores,
  currentAsiChoices,
  className,
  level,
  abilityChanges,
}: ApplyAsiParams): { abilityScores: AbilityScores; asiChoices: AsiChoice[] } {
  const existing = currentAsiChoices.find(
    (choice) => choice.level === level && choice.className === className,
  );
  const updatedScores = { ...characterAbilityScores } as AbilityScores;

  if (existing) {
    for (const [ability, bonus] of Object.entries(existing.abilityChanges)) {
      updatedScores[ability as keyof AbilityScores] =
        (updatedScores[ability as keyof AbilityScores] ?? 10) - bonus;
    }
  }

  for (const [ability, bonus] of Object.entries(abilityChanges)) {
    updatedScores[ability as keyof AbilityScores] =
      (updatedScores[ability as keyof AbilityScores] ?? 10) + bonus;
  }

  const updatedChoices: AsiChoice[] = [
    ...currentAsiChoices.filter(
      (choice) => !(choice.level === level && choice.className === className),
    ),
    {
      id: `asi-${className}-${level}`,
      level,
      className,
      abilityChanges,
    },
  ];

  return {
    abilityScores: updatedScores,
    asiChoices: updatedChoices,
  };
}

interface ResetAsiParams {
  characterAbilityScores: AbilityScores;
  currentAsiChoices: AsiChoice[];
  className: string;
  level: number;
}

export function resetClassAsiChoice({
  characterAbilityScores,
  currentAsiChoices,
  className,
  level,
}: ResetAsiParams): {
  abilityScores: AbilityScores;
  asiChoices: AsiChoice[];
} | null {
  const existing = currentAsiChoices.find(
    (choice) => choice.level === level && choice.className === className,
  );
  if (!existing) return null;

  const updatedScores = { ...characterAbilityScores } as AbilityScores;
  for (const [ability, bonus] of Object.entries(existing.abilityChanges)) {
    updatedScores[ability as keyof AbilityScores] =
      (updatedScores[ability as keyof AbilityScores] ?? 10) - bonus;
  }

  return {
    abilityScores: updatedScores,
    asiChoices: currentAsiChoices.filter(
      (choice) => !(choice.level === level && choice.className === className),
    ),
  };
}
