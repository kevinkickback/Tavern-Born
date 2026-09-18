import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import type { CompendiumEntry } from '@/lib/compendiumEntries'
import { CompendiumEntryDetails } from '@/pages/compendium/CompendiumEntryDetails'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Item5e, Spell5e } from '@/types/5etools'

describe('CompendiumEntryDetails', () => {
  afterEach(() => {
    cleanup()
    useGameDataStore.setState({ gameData: null })
  })

  test('renders additional item entries before list-summary metadata', () => {
    const item = {
      name: 'Test Relic',
      source: 'TEST',
      type: 'W',
      additionalEntries: ['The relic reveals its full rules text.'],
    } as Item5e
    const entry = {
      id: 'item|test|test relic',
      name: item.name,
      source: item.source,
      type: 'Item',
      description: 'Wondrous Item',
      data: item,
    } as CompendiumEntry

    render(<CompendiumEntryDetails selectedEntry={entry} />)

    expect(screen.getByText('The relic reveals its full rules text.')).toBeTruthy()
    expect(screen.queryByText('Wondrous Item')).toBeNull()
  })

  test('does not present spell list metadata as rules prose', () => {
    const spell = {
      name: 'Test Spell',
      source: 'TEST',
      level: 1,
      school: 'E',
      time: [],
      range: { type: 'special' },
      duration: [],
      entries: [],
    } as Spell5e
    const entry = {
      id: 'spell|test|test spell',
      name: spell.name,
      source: spell.source,
      type: 'Spell',
      description: 'Level 1 E',
      data: spell,
    } as CompendiumEntry

    render(<CompendiumEntryDetails selectedEntry={entry} />)

    expect(screen.getByText('No description available for this entry.')).toBeTruthy()
    expect(screen.queryByText('Level 1 E')).toBeNull()
  })
})
