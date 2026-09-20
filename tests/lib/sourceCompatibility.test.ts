import { describe, expect, test } from 'vitest'
import {
  collectRevisedSourceAbbreviations,
  getEffectiveSources,
  getSourceCompatibility,
  normalizeAllowedSources,
} from '@/lib/sourceCompatibility'
import type { GameData, SourceBook } from '@/types/5etools'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const sources: SourceBook[] = [
  { abbreviation: 'PHB', name: "Player's Handbook (2014)", group: 'core' },
  { abbreviation: 'XPHB', name: "Player's Handbook (2024)", group: 'core' },
  { abbreviation: 'DMG', name: "Dungeon Master's Guide (2014)", group: 'core' },
  { abbreviation: 'XDMG', name: "Dungeon Master's Guide (2024)", group: 'core' },
  { abbreviation: 'XGE', name: "Xanathar's Guide to Everything", group: 'supplement' },
  {
    abbreviation: 'EFA',
    name: 'Eberron: Forge of the Artificer',
    group: 'setting',
    minimumRuleset: '2024',
  },
]

describe('source compatibility', () => {
  test('keeps only the core printing that matches the character ruleset', () => {
    expect(normalizeAllowedSources(['PHB', 'XPHB', 'DMG', 'XDMG'], '2014', sources)).toEqual([
      'PHB',
      'DMG',
    ])
    expect(normalizeAllowedSources(['PHB', 'XPHB', 'DMG', 'XDMG'], '2024', sources)).toEqual([
      'XPHB',
      'XDMG',
    ])
  })

  test('allows legacy supplements for revised characters but not revised-only books for legacy characters', () => {
    expect(normalizeAllowedSources(['XGE', 'EFA'], '2014', sources)).toEqual(['XGE'])
    expect(normalizeAllowedSources(['XGE', 'EFA'], '2024', sources)).toEqual(['XGE', 'EFA'])
    expect(getSourceCompatibility(sources[5], '2014')).toEqual({
      compatible: false,
      reason: 'Requires the 2024 ruleset',
    })
  })

  test('adds exactly the matching Player’s Handbook as the implicit source', () => {
    expect(getEffectiveSources(['XGE', 'XPHB'], '2014', sources)).toEqual(['XGE', 'PHB'])
    expect(getEffectiveSources(['XGE', 'PHB'], '2024', sources)).toEqual(['XGE', 'XPHB'])
  })

  test('detects revised-only sources from parsed entity metadata', () => {
    const gameData = makeGameDataFixture({
      races: [
        { name: 'Legacy', source: 'XGE' },
        { name: 'Revised', source: 'EFA', edition: 'one' },
      ],
      items: [{ name: 'Revised Item', source: 'CUSTOM', srd52: true }],
    } as Partial<GameData>)

    expect(collectRevisedSourceAbbreviations(gameData)).toEqual(
      new Set(['XPHB', 'XDMG', 'XMM', 'EFA', 'CUSTOM']),
    )
  })
})
