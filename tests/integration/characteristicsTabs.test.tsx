import { fireEvent, render, screen } from '@testing-library/react'
import { useId, useState } from 'react'
import { describe, expect, test } from 'vitest'
import { CharacteristicsTabs } from '@/pages/details/characteristics/CharacteristicsTabs'
import type { CharacteristicsSection } from '@/pages/details/characteristics/model'

function Harness() {
  const [active, setActive] = useState<CharacteristicsSection>('identity')
  const idPrefix = useId()
  return <CharacteristicsTabs activeSection={active} idPrefix={idPrefix} onChange={setActive} />
}

describe('CharacteristicsTabs', () => {
  test('uses roving focus and standard horizontal tab keys', () => {
    render(<Harness />)
    const identity = screen.getByRole('tab', { name: 'Identity' })
    const personality = screen.getByRole('tab', { name: 'Personality' })
    const connections = screen.getByRole('tab', { name: 'Connections' })

    identity.focus()
    fireEvent.keyDown(identity, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(personality)
    expect(personality.getAttribute('aria-selected')).toBe('true')
    expect(identity.tabIndex).toBe(-1)

    fireEvent.keyDown(personality, { key: 'End' })
    expect(document.activeElement).toBe(connections)
    expect(connections.getAttribute('aria-controls')).toMatch(/-panel-connections$/)

    fireEvent.keyDown(connections, { key: 'Home' })
    expect(document.activeElement).toBe(identity)
  })
})
