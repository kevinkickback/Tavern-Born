interface WeaponProficiencyTarget {
  name: string
  weaponCategory?: string
}

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

/** Checks source-derived weapon proficiencies by exact item name or weapon category. */
export function isProficientWithWeapon(
  proficiencies: readonly string[],
  weapon: WeaponProficiencyTarget,
): boolean {
  const name = normalized(weapon.name)
  const category = normalized(weapon.weaponCategory)
  return proficiencies.some((rawProficiency) => {
    const proficiency = normalized(rawProficiency)
    return (
      proficiency === name ||
      (category.length > 0 &&
        (proficiency === category || proficiency.includes(`${category} weapon`)))
    )
  })
}
