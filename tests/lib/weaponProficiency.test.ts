import { describe, expect, it } from 'vitest'
import { isProficientWithWeapon } from '@/lib/calculations/weaponProficiency'

describe('isProficientWithWeapon', () => {
  it('respects the difference between the revised Rogue and Monk property grants', () => {
    const martial = { name: 'Rapier', weaponCategory: 'martial', property: [{ uid: 'F|XPHB' }] }
    expect(
      isProficientWithWeapon(['Martial weapons that have the Finesse or Light property'], martial),
    ).toBe(true)
    expect(isProficientWithWeapon(['Martial weapons that have the Light property'], martial)).toBe(
      false,
    )
    expect(
      isProficientWithWeapon(['Martial weapons that have the Light property'], {
        ...martial,
        property: [{ uid: 'L|XPHB' }],
      }),
    ).toBe(true)
  })
  it('matches an exact source-derived weapon name', () => {
    expect(isProficientWithWeapon(['training blade'], { name: 'Training Blade' })).toBe(true)
    const named = ['{@item rapier|phb|rapiers}']
    expect(isProficientWithWeapon(named, { name: 'Rapier', source: 'PHB' })).toBe(true)
    expect(isProficientWithWeapon(named, { name: 'Rapier', source: 'XPHB' })).toBe(false)
    expect(isProficientWithWeapon(['{@item rapier}'], { name: 'Rapier', source: 'PHB' })).toBe(
      false,
    )
  })

  it('matches category labels without accepting another category', () => {
    expect(
      isProficientWithWeapon(['simple weapons'], {
        name: 'Training Blade',
        weaponCategory: 'simple',
      }),
    ).toBe(true)
    expect(
      isProficientWithWeapon(['simple weapons'], {
        name: 'Heavy Blade',
        weaponCategory: 'martial',
      }),
    ).toBe(false)
  })

  it('honors melee and ranged category qualifiers', () => {
    const simpleMelee = { name: 'Dagger', weaponCategory: 'simple', type: 'M' }
    const simpleRanged = { name: 'Shortbow', weaponCategory: 'simple', type: 'R' }
    const martialMelee = { name: 'Longsword', weaponCategory: 'martial', type: 'M|XPHB' }

    expect(isProficientWithWeapon(['simple melee weapons'], simpleMelee)).toBe(true)
    expect(isProficientWithWeapon(['simple melee weapons'], simpleRanged)).toBe(false)
    expect(isProficientWithWeapon(['simple ranged weapons'], simpleRanged)).toBe(true)
    expect(isProficientWithWeapon(['martial melee weapons'], martialMelee)).toBe(true)
    expect(isProficientWithWeapon(['simple melee weapons'], martialMelee)).toBe(false)
  })

  it('recognizes 2024 melee and ranged weapon type codes', () => {
    const simpleMelee = { name: 'Sickle', weaponCategory: 'simple', type: 'MW|XPHB' }
    const martialRanged = { name: 'Longbow', weaponCategory: 'martial', type: 'RW' }

    expect(isProficientWithWeapon(['simple melee weapons'], simpleMelee)).toBe(true)
    expect(isProficientWithWeapon(['simple ranged weapons'], simpleMelee)).toBe(false)
    expect(isProficientWithWeapon(['martial ranged weapons'], martialRanged)).toBe(true)
    expect(isProficientWithWeapon(['martial melee weapons'], martialRanged)).toBe(false)
  })
})
