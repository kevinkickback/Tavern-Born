import { describe, expect, test } from 'vitest'
import {
  resolveBackgroundReference,
  resolveClassReference,
  resolveRaceReference,
} from '@/lib/5etools/entityResolvers'
import { buildBackgroundLookup, buildClassLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import type { Background5e, Class5e, Race5e } from '@/types/5etools'

describe('entity resolvers', () => {
  test('resolves normalized complete nested child fields from raw data without borrowing another printing', () => {
    const child = { name: ' Child|Exact ', source: ' CASE ' } as Race5e
    const primaryParent = {
      name: 'Parent',
      source: 'TEST',
      subraces: [{ name: 'Child|Exact', source: 'OTHER' }],
    } as Race5e
    const rawParent = {
      ...primaryParent,
      subraces: [{ name: 'Child', source: 'CASE' }, child],
    } as Race5e
    const primary = { racesByKey: buildRaceLookup([primaryParent]) }
    const raw = { racesByKey: buildRaceLookup([rawParent]) }
    const reference = {
      name: 'Parent',
      source: 'TEST',
      subraceName: 'child|exact',
      subraceSource: 'case',
    }
    const result = resolveRaceReference(reference, primary, raw)
    expect.soft(result.parentRace).toBe(primaryParent)
    expect.soft(result.subraceData).toBe(child)
    expect.soft(result.subraceIsNested).toBe(true)
    expect(
      resolveRaceReference({ ...reference, subraceSource: undefined }, primary, raw).subraceData,
    ).toBeUndefined()
    expect(
      resolveRaceReference({ ...reference, subraceSource: 'MISSING' }, primary, raw).subraceData,
    ).toBeUndefined()
  })

  test('prefers an exact primary class and falls back to the exact raw class', () => {
    const filteredWizard = { name: 'Wizard', source: 'PHB' } as Class5e
    const rawWizard = { name: 'Wizard', source: 'PHB', page: 1 } as Class5e
    const rawArtificer = { name: 'Artificer', source: 'TCE' } as Class5e
    const primary = { classesByKey: buildClassLookup([filteredWizard]) }
    const raw = { classesByKey: buildClassLookup([rawWizard, rawArtificer]) }

    expect(resolveClassReference({ name: 'Wizard', source: 'PHB' }, primary, raw)).toBe(
      filteredWizard,
    )
    expect(resolveClassReference({ name: 'Artificer', source: 'TCE' }, primary, raw)).toBe(
      rawArtificer,
    )
  })

  test('does not cross sources when a source-qualified entity is unavailable', () => {
    const newerWizard = { name: 'Wizard', source: 'XPHB' } as Class5e
    const lookups = { classesByKey: buildClassLookup([newerWizard]) }

    expect(resolveClassReference({ name: 'Wizard', source: 'PHB' }, lookups)).toBeUndefined()
  })

  test('does not guess an entity when its source is unavailable', () => {
    const wizard = { name: 'Wizard', source: 'PHB' } as Class5e
    const lookups = { classesByKey: buildClassLookup([wizard]) }

    expect(resolveClassReference({ name: 'Wizard' }, lookups)).toBeUndefined()
  })

  test('resolves backgrounds from raw data after filtered data', () => {
    const rawBackground = { name: 'Sage', source: 'PHB' } as Background5e
    expect(
      resolveBackgroundReference(
        { name: 'Sage', source: 'PHB' },
        { backgroundsByKey: {} },
        { backgroundsByKey: buildBackgroundLookup([rawBackground]) },
      ),
    ).toBe(rawBackground)
  })

  test('resolves and merges a nested subrace from raw data', () => {
    const highElf = {
      name: 'High Elf',
      source: 'PHB',
      entries: ['Subrace trait'],
    } as Race5e
    const elf = {
      name: 'Elf',
      source: 'PHB',
      speed: 30,
      entries: ['Parent trait'],
      subraces: [highElf],
    } as Race5e

    const result = resolveRaceReference(
      {
        name: 'Elf',
        source: 'PHB',
        subraceName: 'High Elf',
        subraceSource: 'PHB',
      },
      { racesByKey: {} },
      { racesByKey: buildRaceLookup([elf]) },
    )

    expect(result.parentRace).toBe(elf)
    expect(result.subraceData).toBe(highElf)
    expect(result.subraceIsNested).toBe(true)
    expect(result.mergedRace?.entries).toEqual(['Parent trait', 'Subrace trait'])
  })
})
