import { expect, test } from 'vitest'
import { buildClassLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  getNativeRacialSpellOwners,
  refreshNativeRacialSpellState,
} from '@/lib/calculations/nativeRacialSpells'
import {
  addMulticlass,
  applyClassProgressionUpdate,
  applyClassSelectionCommand,
  applyLevelDown,
  applyLevelUp,
  removeMulticlass,
  updateCharacterLevel,
} from '@/lib/character/commands/classCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import {
  setRacialCastingAbility,
  setRacialSpellChoice,
  setRacialSpellSuite,
} from '@/lib/character/commands/spellCommands'
import type { Class5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  makeNativeRacialCharacter,
  nativeChoiceSpellLookup,
  nativeRaceResolution,
} from '../fixtures/nativeRacialCharacter'
import {
  makeRacialRefreshCharacter as configured,
  racialRefreshRace as race,
} from '../fixtures/racialSpellRefresh'

const profile = (character: Character) =>
  character.spells.spellProfiles.find((p) => p.type === 'racial')!
const apply = (c: Character, r: ReturnType<typeof setRacialSpellChoice>): Character => ({
  ...c,
  ...r.characterPatch,
  provenance: r.provenanceUpdate,
})
const reopen = (c: Character) => characterPersistenceSchema.parse(JSON.parse(JSON.stringify(c)))
const refreshed = (c: Character, owner: Race5e, spellsByKey = nativeChoiceSpellLookup) =>
  refreshNativeRacialSpellState(c, nativeRaceResolution(owner), { spellsByKey })
const changed = (descriptor: { choose: string | { from: string[] }; count?: number }): Race5e => ({
  ...race,
  additionalSpells: [{ ability: { choose: ['wis', 'cha'] }, known: { 1: [descriptor] } }],
})

test.each([
  'race',
  'progression',
  'level up',
  'level down',
  'base class',
  'subclass',
  'level setter',
  'multiclass add',
  'multiclass remove',
  'Finish',
] as const)('%s forwards exact primary/raw spell authority for compatible rules and conflicting existing targets', (writer) => {
  const original = configured()
  const before = structuredClone(original)
  const fighter = { name: 'Fighter', source: 'PHB', hd: { faces: 10, number: 1 } } as Class5e
  const rogue = { name: 'Rogue', source: 'PHB', hd: { faces: 8, number: 1 } } as Class5e
  for (const conflict of [false, true]) {
    let c = original
    const owner = conflict ? race : changed({ choose: 'level=0|class=Cleric', count: 2 })
    const rawSpellsByKey = conflict
      ? {
          ...nativeChoiceSpellLookup,
          'Light|PHB': { ...nativeChoiceSpellLookup['Light|PHB'], level: 1 },
        }
      : nativeChoiceSpellLookup
    const lookups = { spellsByKey: {}, rawSpellsByKey }
    const resolution = nativeRaceResolution(owner)
    if (writer === 'multiclass remove')
      c = apply(c, addMulticlass(c, c.provenance, rogue.name, rogue, rogue.source, 1))
    const calculation = createCharacterCalculationContext(
      c,
      {
        racesByKey: buildRaceLookup([owner]),
        classesByKey: buildClassLookup([fighter, rogue]),
        spellsByKey: {},
      },
      {
        racesByKey: buildRaceLookup([owner]),
        classesByKey: buildClassLookup([fighter, rogue]),
        spellsByKey: rawSpellsByKey,
      },
    )
    const options = { ...lookups, raceResolution: resolution }
    const result =
      writer === 'race'
        ? applyRaceSelectionCommand(c, c.provenance, owner, undefined, 0, () => [], options)
        : writer === 'progression'
          ? applyClassProgressionUpdate(c, c.provenance, c.classProgression, resolution, lookups)
          : writer === 'level up'
            ? applyLevelUp(
                c,
                c.provenance,
                [{ name: 'Fighter', source: 'PHB', levels: 6 }],
                {
                  className: 'Fighter',
                  classSource: 'PHB',
                  classLevel: 6,
                  hitDie: 10,
                  dieResult: 6,
                  method: 'average',
                },
                calculation,
              )
            : writer === 'level down'
              ? applyLevelDown(c, c.provenance, calculation)
              : writer === 'base class'
                ? applyClassSelectionCommand(
                    c,
                    c.provenance,
                    fighter,
                    undefined,
                    new Map(),
                    options,
                  )
                : writer === 'subclass'
                  ? applyClassSelectionCommand(
                      c,
                      c.provenance,
                      fighter,
                      { name: 'Champion', source: 'PHB' },
                      new Map(),
                      options,
                    )
                  : writer === 'level setter'
                    ? updateCharacterLevel(c, c.provenance, 4, resolution, lookups)
                    : writer === 'multiclass add'
                      ? addMulticlass(
                          c,
                          c.provenance,
                          rogue.name,
                          rogue,
                          rogue.source,
                          1,
                          resolution,
                          lookups,
                        )
                      : writer === 'multiclass remove'
                        ? removeMulticlass(
                            c,
                            c.provenance,
                            rogue.name,
                            rogue.source,
                            resolution,
                            lookups,
                          )
                        : undefined
    const next = result
      ? apply(c, result)
      : buildInitialCharacter(
          { initial: c, race: owner, classEntity: fighter },
          new Map(),
          () => [],
          lookups,
        )
    expect(profile(next).cantrips, writer).toEqual(conflict ? ['Mage Hand|PHB'] : ['Light|PHB'])
    expect(profile(next).castingAbility, writer).toBe('wis')
    expect(
      next.provenance.spells.light.filter((tag) => tag.sourceType === 'race'),
      writer,
    ).toHaveLength(conflict ? 0 : 1)
    expect(next.provenance.spells.light, writer).toContainEqual(
      expect.objectContaining({ sourceType: 'manual' }),
    )
    reopen(next)
  }
  expect(original).toEqual(before)
})

test('child reselection preserves compatible targets and independent parent/manual ownership through offline Clear', () => {
  const parent: Race5e = {
    name: 'Parent',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'] } }],
  }
  const c = configured(race, parent)
  const child = changed({ choose: 'level=0|class=Cleric', count: 2 })
  const next = apply(
    c,
    applySubraceSelectionCommand(c, c.provenance, parent, child, () => [], {
      subraceIsNested: true,
      previousSubrace: race,
      rawSpellsByKey: nativeChoiceSpellLookup,
    }),
  )
  const chosen = next.spells.spellProfiles.find(
    (p) => p.type === 'racial' && p.racial!.ownerType === 'subrace',
  )!
  expect(chosen.cantrips).toEqual(['Light|PHB'])
  expect(next.provenance.spells.light).toHaveLength(3)
  const saved = reopen(next)
  const cleared = apply(
    saved,
    setRacialSpellChoice(saved, saved.provenance, chosen.id, chosen.choices![0].id, []),
  )
  expect(cleared.provenance.spells.light.map((tag) => tag.sourceType).sort()).toEqual([
    'manual',
    'race',
  ])
  expect(
    cleared.spells.spellProfiles.find((p) => p.type === 'racial' && p.racial!.ownerType === 'race')!
      .cantrips,
  ).toEqual(['light|PHB'])
  reopen(cleared)
})

test('compatible mandatory setup survives unrelated block changes, with current IDs and idempotent strict reopen', () => {
  const c = configured()
  const before = structuredClone(c)
  const owner: Race5e = {
    ...race,
    additionalSpells: [
      {
        ...race.additionalSpells![0],
        ability: { choose: ['wis', 'cha'] },
        innate: { 6: ['darkness'] },
      },
    ],
  }
  const next = refreshed(c, owner)
  expect(profile(next).racial!.suite!.id).not.toBe(profile(c).racial!.suite!.id)
  expect(profile(next).choices![0].id).not.toBe(profile(c).choices![0].id)
  expect(profile(next)).toMatchObject({
    castingAbility: 'wis',
    cantrips: ['Light|PHB', 'Mage Hand|PHB'],
  })
  expect(next.provenance.spells.light).toHaveLength(2)
  expect(next.spells.spellSlots).toBe(c.spells.spellSlots)
  expect(next.spells.pactSpellSlots).toBe(c.spells.pactSpellSlots)
  const saved = reopen(next)
  expect(refreshed(saved, owner)).toBe(saved)
  expect(refreshNativeRacialSpellState(saved)).toBe(saved)
  expect(c).toEqual(before)
})

test('count, pool and filter changes retain only proven compatible targets without dormant resurrection', () => {
  const c = configured()
  const smaller = changed({ choose: 'level=0|class=Wizard', count: 1 })
  const bounded = refreshed(c, smaller, {})
  expect(profile(bounded).cantrips).toEqual(['Light|PHB'])
  expect(profile(refreshed(reopen(bounded), race)).cantrips).toEqual(['Light|PHB'])
  const pool = changed({ choose: { from: ['mage hand#c'] }, count: 2 })
  const pooled = refreshed(c, pool, {})
  expect(profile(pooled).cantrips).toEqual(['Mage Hand|PHB'])
  const cleric = changed({ choose: 'level=0|class=Cleric', count: 2 })
  expect(profile(refreshed(c, cleric)).cantrips).toEqual(['Light|PHB'])
  expect(profile(refreshed(c, cleric, {})).cantrips).toEqual([])
  expect(profile(refreshed(pooled, race, {})).cantrips).toEqual([])
  const rejected = refreshed(c, cleric)
  expect(profile(refreshed(reopen(rejected), race)).cantrips).toEqual(['Light|PHB'])
  expect(rejected.provenance.spells.light).toContainEqual(
    expect.objectContaining({ sourceType: 'manual' }),
  )
  reopen(rejected)
})

test.each([
  'level',
  'class',
  'absent',
  'other printing',
  'poisoned name',
  'literal name delimiter',
  'poisoned source',
] as const)('existing filter target uses exact metadata authority: %s', (kind) => {
  const c = configured()
  const lookup = { ...nativeChoiceSpellLookup }
  const light = lookup['Light|PHB']
  if (kind === 'level') lookup['Light|PHB'] = { ...light, level: 1 }
  if (kind === 'class')
    lookup['Light|PHB'] = {
      ...light,
      classes: { fromClassList: [{ name: 'Druid', source: 'PHB' }] },
    }
  if (kind === 'absent' || kind === 'other printing') delete lookup['Light|PHB']
  if (kind === 'absent') delete lookup['Light|XPHB']
  if (kind === 'other printing') lookup['Light|XPHB'] = { ...lookup['Light|XPHB'], level: 1 }
  if (kind === 'poisoned name') lookup['Light|PHB'] = { ...light, name: 'Wrong', level: 1 }
  if (kind === 'literal name delimiter')
    lookup['Light|PHB'] = { ...light, name: 'Light|literal', level: 1 }
  if (kind === 'poisoned source') lookup['Light|PHB'] = { ...light, source: 'OTHER', level: 1 }
  const next = refreshed(c, race, lookup)
  const conflict = kind === 'level' || kind === 'class'
  expect(profile(next).cantrips).toEqual(
    conflict ? ['Mage Hand|PHB'] : ['Light|PHB', 'Mage Hand|PHB'],
  )
  expect(next.provenance.spells.light.filter((tag) => tag.sourceType === 'race')).toHaveLength(
    conflict ? 0 : 1,
  )
  expect(next.spells.spellProfiles.find((p) => p.type === 'special')!.cantrips).toEqual([
    'Light|PHB',
  ])
  expect(profile(refreshed(reopen(next), race)).cantrips).toEqual(profile(next).cantrips)
})

test.each([
  'eligibility',
  'grant kind',
  'usage',
  'daily limit',
  'applied kind',
] as const)('a conflicting descriptor scope cannot borrow setup through uniqueness: %s', (field) => {
  const c = configured()
  const descriptor = {
    choose: field === 'applied kind' ? 'level=1|class=Wizard' : 'level=0|class=Wizard',
    count: 2,
  }
  const block =
    field === 'eligibility'
      ? { known: { 2: [descriptor] } }
      : field === 'grant kind'
        ? { innate: { 1: [descriptor] } }
        : field === 'usage'
          ? { known: { 1: { will: [descriptor] } } }
          : field === 'daily limit'
            ? { known: { 1: { daily: { 2: [descriptor] } } } }
            : { known: { 1: [descriptor] } }
  const owner = { ...race, additionalSpells: [block] } as Race5e
  const next = refreshed(c, owner, {
    ...nativeChoiceSpellLookup,
    'Light|PHB': { ...nativeChoiceSpellLookup['Light|PHB'], level: 1 },
  })
  expect(profile(next).choices).toHaveLength(1)
  expect(profile(next).choices![0].selected).toEqual([])
  expect(next.provenance.spells.light).toEqual([expect.objectContaining({ sourceType: 'manual' })])
  reopen(next)
})

test('ambiguous residual descriptors start empty while an unchanged sibling retains its setup', () => {
  const before: Race5e = {
    ...race,
    additionalSpells: [
      {
        known: {
          1: [
            { choose: 'level=0|class=Wizard', count: 2 },
            { choose: 'level=0|class=Cleric' },
            { choose: 'level=0|class=Druid' },
          ],
        },
      },
    ],
  }
  let c = configured(before)
  const lookup = {
    ...nativeChoiceSpellLookup,
    'Light|PHB': {
      ...nativeChoiceSpellLookup['Light|PHB'],
      classes: {
        fromClassList: ['Wizard', 'Cleric', 'Druid', 'Bard', 'Sorcerer'].map((name) => ({
          name,
          source: 'PHB',
        })),
      },
    },
  }
  for (const choice of profile(c).choices!.slice(1))
    c = apply(
      c,
      setRacialSpellChoice(
        c,
        c.provenance,
        profile(c).id,
        choice.id,
        ['Light|PHB'],
        nativeRaceResolution(before),
        lookup,
      ),
    )
  const after: Race5e = {
    ...race,
    additionalSpells: [
      {
        known: {
          1: [
            { choose: 'level=0|class=Wizard', count: 2 },
            { choose: 'level=0|class=Bard' },
            { choose: 'level=0|class=Sorcerer' },
          ],
        },
      },
    ],
  }
  const next = refreshed(c, after, lookup)
  expect(profile(next).choices!.map((choice) => choice.selected)).toEqual([
    ['Light|PHB', 'Mage Hand|PHB'],
    [],
    [],
  ])
  reopen(next)
})

test('direct stale-ID Clear, same-selection correction and rejected new selection agree with the current relation', () => {
  const c = configured()
  const p = profile(c)
  const owner = changed({ choose: { from: ['light#c', 'mage hand#c'] }, count: 2 })
  const cleared = apply(
    c,
    setRacialSpellChoice(
      c,
      c.provenance,
      p.id,
      p.choices![0].id,
      [],
      nativeRaceResolution(owner),
      nativeChoiceSpellLookup,
    ),
  )
  expect(profile(cleared).cantrips).toEqual([])
  expect(cleared.provenance.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'manual' }),
  ])
  const lookup = {
    ...nativeChoiceSpellLookup,
    'Light|PHB': { ...nativeChoiceSpellLookup['Light|PHB'], level: 1 },
  }
  const corrected = apply(
    c,
    setRacialSpellChoice(
      c,
      c.provenance,
      p.id,
      p.choices![0].id,
      p.choices![0].selected,
      nativeRaceResolution(race),
      lookup,
    ),
  )
  expect(profile(corrected).cantrips).toEqual(['Mage Hand|PHB'])
  const invalid = setRacialSpellChoice(
    c,
    c.provenance,
    p.id,
    p.choices![0].id,
    ['Not available|PHB'],
    nativeRaceResolution(owner),
    {},
  )
  expect(invalid).toEqual({ characterPatch: {}, provenanceUpdate: c.provenance })
  expect(
    setRacialSpellChoice(c, c.provenance, p.id, 'unknown', [], nativeRaceResolution(owner)),
  ).toEqual({ characterPatch: {}, provenanceUpdate: c.provenance })
  const removed: Race5e = {
    ...race,
    additionalSpells: [{ known: { 1: ['light#c', { choose: 'level=1|class=Wizard' }] } }],
  }
  const oldClear = apply(
    c,
    setRacialSpellChoice(
      c,
      c.provenance,
      p.id,
      p.choices![0].id,
      [],
      nativeRaceResolution(removed),
      nativeChoiceSpellLookup,
    ),
  )
  expect(profile(oldClear).cantrips).toEqual(['light|PHB'])
  expect(profile(oldClear).choices![0].selected).toEqual([])
  reopen(oldClear)
  const offlineClear = apply(c, setRacialSpellChoice(c, c.provenance, p.id, p.choices![0].id, []))
  expect(profile(refreshed(reopen(offlineClear), race)).cantrips).toEqual([])
  expect(setRacialCastingAbility(c, c.provenance, p.id, 'int')).toEqual({
    characterPatch: {},
    provenanceUpdate: c.provenance,
  })
  reopen(cleared)
  reopen(corrected)
})

test('a changed selected alternative requires explicit reselection, while native pools retain declared kind', () => {
  const owner: Race5e = {
    ...race,
    additionalSpells: [race.additionalSpells![0], { known: { 1: ['darkness'] } }],
  }
  let c = makeNativeRacialCharacter(owner)
  const p = profile(c)
  const suite = getNativeRacialSpellOwners(c, nativeRaceResolution(owner))![0].suites[0].id
  c = apply(c, setRacialSpellSuite(c, c.provenance, p.id, suite, nativeRaceResolution(owner)))
  c = apply(
    c,
    setRacialSpellChoice(
      c,
      c.provenance,
      p.id,
      profile(c).choices![0].id,
      ['Light|PHB'],
      nativeRaceResolution(owner),
      nativeChoiceSpellLookup,
    ),
  )
  const changedOwner: Race5e = {
    ...owner,
    additionalSpells: [
      { ...owner.additionalSpells![0], innate: { 6: ['darkness'] } },
      owner.additionalSpells![1],
    ],
  }
  expect(profile(refreshed(c, changedOwner)).racial!.suite).toBeUndefined()
  const pool = changed({ choose: { from: ['light#c', 'mage hand#c'] }, count: 2 })
  const pooled = refreshed(configured(), pool)
  expect(
    profile(
      refreshed(pooled, pool, {
        'Light|PHB': { ...nativeChoiceSpellLookup['Light|PHB'], level: 1 },
      }),
    ).cantrips,
  ).toEqual(['Light|PHB', 'Mage Hand|PHB'])
})
