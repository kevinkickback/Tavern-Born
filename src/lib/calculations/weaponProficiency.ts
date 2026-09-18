interface WeaponProficiencyTarget {
  name: string
  weaponCategory?: string
  type?: string
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
  const typeCode = normalized(weapon.type).split('|')[0]
  const range =
    typeCode === 'm' || typeCode === 'mw'
      ? 'melee'
      : typeCode === 'r' || typeCode === 'rw'
        ? 'ranged'
        : ''
  return proficiencies.some((rawProficiency) => {
    const proficiency = normalized(rawProficiency)
    if (proficiency === name) return true
    if (!category) return false

    const categoryLabels = new Set([category, `${category} weapon`, `${category} weapons`])
    if (categoryLabels.has(proficiency)) return true
    return range.length > 0 && proficiency === `${category} ${range} weapons`
  })
}
