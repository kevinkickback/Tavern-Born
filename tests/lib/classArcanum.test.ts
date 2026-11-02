import { describe, expect, test } from 'vitest'
import { getFixedLevelCastingGain } from '@/lib/5etools/classCastingStructure'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  retainEarnedManagedClassSpells,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import {
  getManagedClassSpellFeatureLabel,
  managedClassSpellId,
} from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import {
  getManagedClassSpellPool,
  type ManagedClassSpellContext,
  projectManagedClassSpellState,
} from '@/lib/character/managedClassSpells'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  makeBundledClassCastingLayer,
  makeClassCastingLayer,
} from '../fixtures/classCastingFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'

const fixture = makeManagedClassSpellFixtures()
const gains = [
  [11, 6, 'Circle of Death', '6th'],
  [13, 7, 'Finger of Death', '7th'],
  [15, 8, 'Demiplane', '8th'],
  [17, 9, 'Foresight', '9th'],
] as const
const address = (source: 'PHB' | 'XPHB', gain = 11): ManagedClassSpellSlot => {
  const rank = gains.find((row) => row[0] === gain)![3]
  const key = source.toLowerCase()
  return [
    ['class', 'warlock', key],
    'class-arcanum',
    `class-feature|mystic arcanum${source === 'PHB' ? ` (${rank} level)` : ''}|warlock|${key}|${gain}|${key}`,
    gain,
    0,
  ]
}
const initial = (source: 'PHB' | 'XPHB' = 'XPHB', levels = 17) =>
  makeCharacterFixture({
    originSystem: source === 'PHB' ? '2014' : '2024',
    allowedSources: [source],
    classProgression: [{ name: 'Warlock', source, levels }],
  })
const request = (
  character: Character,
  slot = address('XPHB'),
  name = 'Circle of Death',
  policy: 'default' | 'ignore-class-list' = 'default',
) => ({
  slot,
  expected:
    character.managedClassSpellChoices?.find(
      (row) => managedClassSpellId(row.slot) === managedClassSpellId(slot),
    ) ?? null,
  expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
  target: { name, source: slot[0][2].toUpperCase() },
  policy,
})
const commit = (
  character: Character,
  requests: Parameters<typeof setManagedClassSpellChoicesCommand>[2],
  context: ManagedClassSpellContext = fixture.context,
) => {
  const result = setManagedClassSpellChoicesCommand(
    character,
    character.provenance,
    requests,
    context,
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}

describe('source-qualified Mystic Arcanum setup', () => {
  test('the bounded map reader reads values and rejects ambiguous or malformed entitlement', () => {
    expect(getFixedLevelCastingGain({ 12: { 8: 2 } }, 12)).toEqual({
      level: 12,
      count: 2,
      spellLevel: 8,
    })
    for (const value of [
      undefined,
      [],
      { 11: [] },
      { 11: { '06': 1 } },
      { 11: { 6: 0 } },
      { 11: { 6: '1' } },
      { 11: { 6: 1, 7: 1 } },
      { 11: { 10: 1 } },
    ])
      expect(getFixedLevelCastingGain(value, 11)).toBeUndefined()
  })

  for (const source of ['PHB', 'XPHB'] as const) {
    test(`${source} all four exact entitlements select, persist and reopen without ordinary quota or Pact access`, () => {
      let character = initial(source)
      const entry = character.classProgression[0]
      expect(
        getManagedClassSpellSlots({ ...entry, levels: 10 }).filter(
          (slot) => slot[1] === 'class-arcanum',
        ),
      ).toEqual([])
      expect(
        getManagedClassSpellSlots(entry).filter((slot) => slot[1] === 'class-arcanum'),
      ).toEqual(gains.map(([gain]) => address(source, gain)))
      for (const [gain, level, name] of gains) {
        const slot = address(source, gain)
        const pool = getManagedClassSpellPool(character, slot, fixture.context)
        expect(pool.reason).toBeUndefined()
        expect(pool.allowedLevels).toEqual([level])
        expect(pool.spells.every((spell) => spell.level === level)).toBe(true)
        expect(pool.defaultReferences.has(`${name.toLowerCase()}|${source.toLowerCase()}`)).toBe(
          true,
        )
        character = commit(character, [request(character, slot, name)])
      }
      const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
      expect(reopened.schemaVersion).toBe(13)
      expect(reopened.managedClassSpellRevision).toBe(4)
      expect(reopened.spells.spellProfiles[0].spellsKnown).toHaveLength(4)
      expect(reopened.spells.spellProfiles[0].fixedSpells ?? []).toEqual([])
      expect(reopened.spells.spellProfiles[0].preparedSpells).toEqual([])
      const projected = projectManagedClassSpellState(reopened, fixture.context)
      expect(
        projected.statuses.every(
          (row) => row.active && row.castingNote?.includes('without expending a spell slot'),
        ),
      ).toBe(true)
      expect(projected.character.managedClassSpellRevision).toBe(4)
    })

    test.each([
      'default',
      'ignore-class-list',
    ] as const)(`${source} hard exact spell level survives %s and multiclass slots`, (policy) => {
      const character = initial(source)
      character.classProgression.push({ name: 'Wizard', source, levels: 3 })
      for (const name of ['Magic Missile', 'Foresight'])
        expect(() =>
          commit(character, [request(character, address(source), name, policy)]),
        ).toThrow(/outside the level/)
      expect(() => commit(initial(source, 10), [request(character, address(source))])).toThrow(
        /not earned/,
      )
    })

    test(`${source} configured and bundled current declarations suspend and restore without rewriting intent`, () => {
      const saved = commit(initial(source), [
        request(initial(source), address(source), 'Circle of Death'),
      ])
      const before = JSON.stringify(saved)
      for (const layer of [
        makeClassCastingLayer('class/class-warlock.json'),
        makeBundledClassCastingLayer('class/class-warlock.json'),
      ]) {
        const catalogs = buildClassChoiceFeatureCatalogs(layer)
        for (const visible of [true, false, true]) {
          const projection = projectManagedClassSpellState(saved, {
            ...fixture.context,
            catalogs: {
              ...catalogs,
              classCastingSources: visible ? catalogs.classCastingSources : [],
            },
          })
          expect(projection.statuses[0].active).toBe(visible)
          expect(
            projection.character.spells.spellProfiles[0].spellsKnown.includes(
              `Circle of Death|${source}`,
            ),
          ).toBe(visible)
          expect(projection.character.managedClassSpellChoices).toEqual(
            saved.managedClassSpellChoices,
          )
        }
      }
      expect(JSON.stringify(saved)).toBe(before)
    })
  }

  test('XPHB higher gains require the exact introductory declaration; PHB repeating gains do not', () => {
    for (const source of ['PHB', 'XPHB'] as const) {
      const start = initial(source)
      const saved = commit(start, [request(start, address(source, 13), 'Finger of Death')])
      const changed = makeClassCastingLayer('class/class-warlock.json', (document) => {
        document.classFeature = document.classFeature?.filter(
          (row) =>
            !(
              row.level === 11 &&
              row.classSource === source &&
              typeof row.name === 'string' &&
              row.name.toLowerCase().startsWith('mystic arcanum')
            ),
        )
      })
      const projection = projectManagedClassSpellState(saved, {
        ...fixture.context,
        catalogs: buildClassChoiceFeatureCatalogs(changed),
      })
      expect(projection.statuses[0].active).toBe(source === 'PHB')
      if (source === 'XPHB') expect(projection.statuses[0].reason).toMatch(/introductory/)
      expect(projectManagedClassSpellState(saved, fixture.context).statuses[0].active).toBe(true)
    }
  })

  test('the explicit numeric override changes only class-list membership', () => {
    const start = initial()
    expect(() => commit(start, [request(start, address('XPHB'), 'Heal')])).toThrow(/spell list/)
    const saved = commit(start, [request(start, address('XPHB'), 'Heal', 'ignore-class-list')])
    expect(projectManagedClassSpellState(saved, fixture.context).statuses[0].active).toBe(true)
    const denied = projectManagedClassSpellState(saved, { ...fixture.context, spellsByKey: {} })
    expect(denied.statuses[0].active).toBe(false)
    expect(denied.character.managedClassSpellChoices).toEqual(saved.managedClassSpellChoices)
  })

  test('strict admission rejects forged owner/printing/gain, prepare and either orphan direction', () => {
    const saved = commit(initial(), [request(initial())])
    const malformed = [
      (c: Character) => {
        c.managedClassSpellChoices![0].slot[0][2] = 'phb'
      },
      (c: Character) => {
        c.managedClassSpellChoices![0].slot[3] = 13
      },
      (c: Character) => {
        c.managedClassSpellChoices![0].slot[4] = 1
      },
      (c: Character) => {
        c.managedClassSpellChoices![0].prepare = true
      },
      (c: Character) => {
        c.provenance.spells = {}
      },
      (c: Character) => {
        c.spells.spellProfiles[0].spellsKnown = []
      },
      (c: Character) => {
        c.managedClassSpellChoices = []
      },
    ]
    for (const mutate of malformed) {
      const changed = structuredClone(saved)
      mutate(changed)
      expect(characterPersistenceSchema.safeParse(changed).success).toBe(false)
    }
    const dormant = structuredClone(saved)
    dormant.provenance.spells = {}
    dormant.spells.spellProfiles[0].spellsKnown = []
    expect(characterPersistenceSchema.safeParse(dormant).success).toBe(true)
  })

  for (const source of ['PHB', 'XPHB'] as const) {
    test.each([
      'not-a-feature',
      'class-feature|',
      'class-feature|unknown|warlock|xphb|11|xphb',
      'class-feature|mystic arcanum|warlock|phb|11|xphb',
    ])(`${source} rejects malformed saved declaration %s without throwing or guessing its label`, (target) => {
      const start = initial(source)
      const saved = commit(start, [request(start, address(source))])
      expect(
        getManagedClassSpellFeatureLabel(saved.managedClassSpellChoices![0].slot),
      ).toBeDefined()
      for (const relation of ['matched', 'unmatched', 'dormant']) {
        const malformed = structuredClone(saved)
        const choice = malformed.managedClassSpellChoices![0]
        const oldId = managedClassSpellId(choice.slot)
        choice.slot[2] = target
        if (relation === 'matched') {
          for (const tags of Object.values(malformed.provenance.spells))
            for (const tag of tags)
              if (tag.grantVariant === oldId) tag.grantVariant = managedClassSpellId(choice.slot)
        } else if (relation === 'dormant') {
          malformed.provenance.spells = {}
          malformed.spells.spellProfiles.find((profile) => profile.type === 'class')!.spellsKnown =
            []
        }
        let valid: boolean | undefined
        expect(() => {
          valid = characterPersistenceSchema.safeParse(malformed).success
        }).not.toThrow()
        expect(valid).toBe(false)
        expect(getManagedClassSpellFeatureLabel(choice.slot)).toBeUndefined()
      }
      expect(characterPersistenceSchema.safeParse(saved).success).toBe(true)
    })
  }

  test('Clear is source-free, preserves independent fixed and Bonus copies, and invalidates an older empty Add', () => {
    const start = initial()
    const stale = request(start)
    const saved = commit(start, [stale])
    saved.spells.spellProfiles[0].fixedSpells = ['Circle of Death|XPHB']
    saved.spells.spellProfiles.push({
      id: 'special:bonus',
      type: 'special',
      label: 'Bonus',
      cantrips: [],
      spellsKnown: ['Circle of Death|XPHB'],
      preparedSpells: [],
    })
    const cleared = commit(
      saved,
      [{ slot: address('XPHB'), expected: saved.managedClassSpellChoices![0] }],
      {},
    )
    expect(cleared.spells.spellProfiles.find((row) => row.type === 'class')?.spellsKnown).toContain(
      'Circle of Death|XPHB',
    )
    expect(
      cleared.spells.spellProfiles.find((row) => row.id === 'special:bonus')?.spellsKnown,
    ).toContain('Circle of Death|XPHB')
    expect(cleared.managedClassSpellChoices).toEqual([])
    expect(cleared.managedClassSpellRevision).toBe(1)
    expect(() => commit(cleared, [stale])).toThrow(/empty spell choice changed/)
  })

  test('empty and occupied gain loss retire lifetime; atomic errors/no-op/saturation preserve the base', () => {
    const start = initial()
    const stale = request(start)
    const lower = retainEarnedManagedClassSpells(start, [
      { ...start.classProgression[0], levels: 10 },
    ])
    const regained = retainEarnedManagedClassSpells(lower, start.classProgression)
    expect(regained.managedClassSpellRevision).toBe(1)
    expect(() => commit(regained, [stale])).toThrow(/empty spell choice changed/)
    const saved = commit(start, [stale])
    const before = JSON.stringify(saved)
    expect(commit(saved, [request(saved)])).toEqual(saved)
    expect(() =>
      commit(saved, [
        { slot: address('XPHB'), expected: saved.managedClassSpellChoices![0] },
        request(saved, address('XPHB', 13), 'Magic Missile'),
      ]),
    ).toThrow(/outside the level/)
    expect(JSON.stringify(saved)).toBe(before)
    expect(
      retainEarnedManagedClassSpells(saved, lower.classProgression).managedClassSpellChoices,
    ).toEqual([])
    const saturated = { ...saved, managedClassSpellRevision: Number.MAX_SAFE_INTEGER }
    expect(() =>
      commit(saturated, [request(saturated, address('XPHB', 13), 'Finger of Death')]),
    ).toThrow(/revision limit/)
    expect(
      commit(
        saturated,
        [{ slot: address('XPHB'), expected: saved.managedClassSpellChoices![0] }],
        {},
      ).managedClassSpellChoices,
    ).toEqual([])
  })
})
