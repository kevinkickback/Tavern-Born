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
})
