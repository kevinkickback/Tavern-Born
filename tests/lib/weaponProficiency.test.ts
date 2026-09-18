import { describe, expect, it } from 'vitest'
import { isProficientWithWeapon } from '@/lib/calculations/weaponProficiency'

describe('isProficientWithWeapon', () => {
  it('matches an exact source-derived weapon name', () => {
    expect(isProficientWithWeapon(['training blade'], { name: 'Training Blade' })).toBe(true)
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
})
