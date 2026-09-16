import { describe, expect, test } from 'vitest'
import { buildClassProfileMap } from '@/lib/calculations/classProfileMap'
import type { Class5e } from '@/types/5etools'

describe('buildClassProfileMap', () => {
  test('adds a source-less alias for an unambiguous resolved class', () => {
    const rogue = { name: 'Rogue', source: 'PHB' } as Class5e

    const result = buildClassProfileMap([rogue])

    expect(result.get('class:Rogue|PHB')).toBe(rogue)
    expect(result.get('class:Rogue|')).toBe(rogue)
  })

  test('does not create a source-less alias across multiple printings', () => {
    const result = buildClassProfileMap([
      { name: 'Rogue', source: 'PHB' } as Class5e,
      { name: 'Rogue', source: 'XPHB' } as Class5e,
    ])

    expect(result.has('class:Rogue|')).toBe(false)
  })
})
