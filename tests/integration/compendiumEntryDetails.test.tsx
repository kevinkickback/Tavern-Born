import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import type { CompendiumEntry } from '@/lib/compendiumEntries'
import { CompendiumEntryDetails } from '@/pages/compendium/CompendiumEntryDetails'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Creature5e, Item5e, Spell5e } from '@/types/5etools'

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

  test('renders creature statistics, traits, and actions', () => {
    const creature = {
      name: 'Wolf',
      source: 'MM',
      size: ['M'],
      type: 'beast',
      cr: '1/4',
      alignment: ['N'],
      ac: [13],
      hp: { average: 11, formula: '2d8 + 2' },
      speed: { walk: 40 },
      str: 12,
      dex: 15,
      con: 12,
      int: 3,
      wis: 12,
      cha: 6,
      skill: { perception: '+3', stealth: '+4' },
      senses: ['darkvision 60 ft.'],
      passive: 13,
      languages: [],
      trait: [{ name: 'Keen Hearing and Smell', entries: ['The wolf has advantage.'] }],
      action: [{ name: 'Bite', entries: ['Melee Weapon Attack.'] }],
    } as Creature5e
    const entry = {
      id: 'creature|mm|wolf',
      name: creature.name,
      source: creature.source,
      type: 'Creature',
      data: creature,
    } as CompendiumEntry

    render(<CompendiumEntryDetails selectedEntry={entry} />)

    expect(screen.getByRole('region', { name: 'Wolf stat block' })).toBeTruthy()
    expect(screen.getByText('Medium beast, neutral')).toBeTruthy()
    expect(screen.getByText('Armor Class')).toBeTruthy()
    expect(screen.getByText('Skills')).toBeTruthy()
    expect(screen.getByText('Perception +3, Stealth +4')).toBeTruthy()
    expect(screen.getByText('STR')).toBeTruthy()
    expect(screen.getByTitle('STR 12 (+1)')).toBeTruthy()
    expect(screen.getByText('Keen Hearing and Smell')).toBeTruthy()
    expect(screen.getByText('Bite')).toBeTruthy()
    expect(screen.getByText('Challenge')).toBeTruthy()
    expect(screen.getByText('1/4')).toBeTruthy()
  })
})
