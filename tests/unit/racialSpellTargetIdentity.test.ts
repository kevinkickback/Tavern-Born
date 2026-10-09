import { expect, test } from 'vitest'
import { resolveRaceReference } from '@/lib/5etools/entityResolvers'
import { buildRaceLookup, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { parseRaceSpells } from '@/lib/5etools/raceSpells'
import { deriveSpellActions } from '@/lib/calculations/actions'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { applyRaceSelectionCommand } from '@/lib/character/commands/raceCommands'
import {
  addSpellToCharacter,
  removeRacialSpell,
  setRacialSpellChoice,
  syncSpellProfiles,
} from '@/lib/character/commands/spellCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { addSpellGrant, getSpellRows, makeSourceTag } from '@/lib/provenance'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'

function finish(race: Race5e) {
  return buildInitialCharacter(
    { initial: { name: 'Target identity', originSystem: '2014' }, race },
    new Map(),
    () => [],
  )
}

function reopen(character: Character): Character {
  return characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character))) as Character
}

function commit(
  character: Character,
  result: { characterPatch: Partial<Character>; provenanceUpdate: Character['provenance'] },
): Character {
  return { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
}

test('a canonical child choice rejects the active parent as its owner and clears its own normalized tag', () => {
  const parent = { name: 'Parent', source: 'PARENT' } as Race5e
  const child = {
    name: 'Child',
    source: 'CHILD',
    additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
  } as Race5e
  let character = buildInitialCharacter(
    { initial: { name: 'Child ownership', originSystem: '2014' }, race: parent, subrace: child },
    new Map(),
    () => [],
  )
  const id = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
  character = reopen(
    commit(
      character,
      setRacialSpellChoice(character, character.provenance, id, 'direct-_-choose-0', ['Light|PHB']),
    ),
  )
  character = reopen(
    commit(
      character,
      addSpellToCharacter(
        character,
        character.provenance,
        'Light|PHB',
        'cantrip',
        'special:unrestricted',
        { sourceType: 'manual', sourceName: 'User Choice' },
      ),
    ),
  )
  const malformed = structuredClone(character)
  Object.assign(malformed.provenance.spells.light[0], {
    sourceType: 'race',
    sourceName: parent.name,
    sourceRef: parent.source,
  })
  const original = structuredClone(malformed)
  expect(characterPersistenceSchema.safeParse(malformed).success).toBe(false)
  const synced = syncSpellProfiles(malformed, malformed.provenance, malformed.spells.spellProfiles)
  expect(synced.provenanceUpdate.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'manual' }),
  ])
  expect(malformed).toEqual(original)

  Object.assign(character.provenance.spells.light[0], {
    sourceName: ' child ',
    sourceRef: ' child ',
  })
  const cleared = reopen(
    commit(
      character,
      setRacialSpellChoice(character, character.provenance, id, 'direct-_-choose-0', []),
    ),
  )
  expect(cleared.spells.spellProfiles.find((profile) => profile.id === id)!.cantrips).toEqual([])
  expect(
    cleared.spells.spellProfiles.find((profile) => profile.type === 'special')!.cantrips,
  ).toEqual(['Light|PHB'])
  expect(cleared.provenance.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'manual' }),
  ])
})

test('native spell targets retain explicit printing and suffix without borrowing the racial printing', () => {
  const rules = [
    {
      known: { _: ['light|XPHB#c', 'mage hand#c'] },
      innate: { 3: { daily: { 1: ['shield|TCE'] } } },
    },
  ]
  const before = structuredClone(rules)
  expect(parseRaceSpells(rules)).toEqual([
    expect.objectContaining({ spellName: 'light|XPHB', isCantrip: true }),
    expect.objectContaining({ spellName: 'mage hand|PHB', isCantrip: true }),
    expect.objectContaining({ spellName: 'shield|TCE', isCantrip: false, dailyUses: 1 }),
  ])
  expect(rules).toEqual(before)
})

test.each([
  '2014',
  '2024',
] as const)('actual %s Finish and strict reopen retain separate owner and target printing', (originSystem) => {
  const race = parseRaces({
    race: [
      {
        name: 'Printing Caster',
        source: 'OWNER',
        additionalSpells: [{ ability: 'wis', known: { _: ['light|XPHB#c'] } }],
      },
    ],
  })[0] as Race5e
  const character = reopen(
    buildInitialCharacter(
      { initial: { name: 'Target identity', originSystem }, race },
      new Map(),
      () => [],
    ),
  )
  expect(
    character.spells.spellProfiles.find((profile) => profile.type === 'racial')?.cantrips,
  ).toEqual(['light|XPHB'])
  expect(character.provenance.spells.light).toEqual([
    expect.objectContaining({
      sourceType: 'race',
      sourceName: 'Printing Caster',
      sourceRef: 'OWNER',
      grantSource: 'XPHB',
    }),
  ])
})

test('same-name printing replacement and clear preserve independent target ownership', () => {
  const race = parseRaces({
    race: [
      {
        name: 'Choosing Caster',
        source: 'OWNER',
        additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
      },
    ],
  })[0] as Race5e
  let character = reopen(finish(race))
  character = commit(
    character,
    addSpellToCharacter(
      character,
      character.provenance,
      'Light|PHB',
      'cantrip',
      'special:unrestricted',
      { sourceType: 'manual', sourceName: 'User Choice' },
    ),
  )
  const independent = structuredClone(
    character.spells.spellProfiles.filter((profile) => profile.type !== 'racial'),
  )
  const profileId = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
  for (const printing of ['PHB', 'XPHB']) {
    character = reopen(
      commit(
        character,
        setRacialSpellChoice(character, character.provenance, profileId, 'direct-_-choose-0', [
          `Light|${printing}`,
        ]),
      ),
    )
    const racial = character.spells.spellProfiles.find((profile) => profile.id === profileId)!
    expect(racial.choices?.[0].selected).toEqual([`Light|${printing}`])
    expect(racial.cantrips).toEqual([`Light|${printing}`])
    expect(character.spells.spellProfiles.filter((profile) => profile.type !== 'racial')).toEqual(
      independent,
    )
  }
  expect(character.provenance.spells.light.filter((tag) => tag.sourceType === 'race')).toEqual([
    expect.objectContaining({ grantSource: 'XPHB' }),
  ])
  character = reopen(
    commit(
      character,
      setRacialSpellChoice(character, character.provenance, profileId, 'direct-_-choose-0', []),
    ),
  )
  expect(character.provenance.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'manual', grantSource: 'PHB' }),
  ])
  expect(character.spells.spellProfiles.filter((profile) => profile.type !== 'racial')).toEqual(
    independent,
  )
})

test('Sources, Actions and PDF retain racial and independent spell printings through race removal', () => {
  const race = parseRaces({
    race: [
      {
        name: 'Printing Caster',
        source: 'OWNER',
        additionalSpells: [{ known: { _: ['light|XPHB#c'] } }],
      },
    ],
  })[0] as Race5e
  let character = reopen(finish(race))
  character = reopen(
    commit(
      character,
      addSpellToCharacter(
        character,
        character.provenance,
        'Light|PHB',
        'cantrip',
        'special:unrestricted',
        { sourceType: 'manual', sourceName: 'User Choice' },
      ),
    ),
  )
  const spells = ['PHB', 'XPHB'].map((source) =>
    makeSpellFixture({ name: 'Light', source, level: 0 }),
  )
  const lookups = {
    racesByKey: buildRaceLookup([race]),
    spellsByKey: buildSpellLookup(spells),
    classesByKey: {},
  }
  const raceResolution = resolveRaceReference(
    { name: character.race, source: character.raceSource },
    lookups,
  )
  expect(
    getSpellRows(character.provenance).map((row) => ({
      name: row.itemName,
      source: row.itemSource,
    })),
  ).toEqual(
    expect.arrayContaining([
      { name: 'Light', source: 'PHB' },
      { name: 'Light', source: 'XPHB' },
    ]),
  )
  expect(
    deriveSpellActions(character, lookups.spellsByKey, { raceResolution })
      .filter((action) => action.name === 'Light')
      .map((action) => action.source.source)
      .sort(),
  ).toEqual(['PHB', 'XPHB'])
  expect(
    createCharacterSheetViewModel(character, lookups)
      .spellRows.map((row) => row.id)
      .sort(),
  ).toEqual(['light|phb', 'light|xphb'])
  const emptyRace = parseRaces({ race: [{ name: 'Noncaster', source: 'OTHER' }] })[0] as Race5e
  character = reopen(
    commit(
      character,
      applyRaceSelectionCommand(character, character.provenance, emptyRace, undefined, 0, () => []),
    ),
  )
  expect(
    character.spells.spellProfiles.find((profile) => profile.type === 'special')?.cantrips,
  ).toEqual(['Light|PHB'])
  expect(character.provenance.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'manual', grantSource: 'PHB' }),
  ])
})

test('current racial spell ownership cannot omit target printing', () => {
  const character = makeCharacterFixture()
  character.provenance.spells.light = [
    {
      sourceType: 'race',
      sourceName: character.race,
      sourceRef: character.raceSource,
      grantType: 'fixed',
      label: character.race,
    },
  ]
  expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
})

test('clearing one descriptor preserves fixed and other-choice printings of the same spell', () => {
  const race = {
    name: 'Shared Caster',
    source: 'OWNER',
    additionalSpells: [
      {
        known: {
          _: [
            'light|PHB#c',
            { choose: 'level=0|class=Wizard' },
            { choose: 'level=0|class=Wizard' },
          ],
        },
      },
    ],
  } as Race5e
  let character = reopen(finish(race))
  const id = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
  for (const choice of ['direct-_-choose-0', 'direct-_-choose-1']) {
    character = reopen(
      commit(
        character,
        setRacialSpellChoice(character, character.provenance, id, choice, ['Light|XPHB']),
      ),
    )
  }
  const before = structuredClone(character)
  character = reopen(
    commit(
      character,
      removeRacialSpell(character, character.provenance, id, 'direct-_-choose-0', ' light | xphb '),
    ),
  )
  expect(character.spells.spellProfiles.find((profile) => profile.id === id)?.cantrips).toEqual([
    'light|PHB',
    'Light|XPHB',
  ])
  expect(character.provenance.spells.light).toEqual([
    expect.objectContaining({ grantType: 'fixed', grantSource: 'PHB' }),
    expect.objectContaining({
      grantType: 'choice',
      grantSource: 'XPHB',
      grantVariant: 'direct-_-choose-1',
    }),
  ])
  expect(
    before.spells.spellProfiles.find((profile) => profile.id === id)?.choices?.[0].selected,
  ).toEqual(['Light|XPHB'])
})

test.each([
  'Light',
  'Light|PHB',
  'Light|',
  '|XPHB',
])('a rejected target %s leaves the whole choice and ownership unchanged', (target) => {
  const character = reopen(
    finish({
      name: 'Pool Caster',
      source: 'OWNER',
      additionalSpells: [
        { known: { _: ['light|XPHB#c'] } },
        { known: { _: ['mage hand|XPHB#c'] } },
      ],
    } as Race5e),
  )
  const id = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
  const configured = reopen(
    commit(
      character,
      setRacialSpellChoice(character, character.provenance, id, 'block-choice', ['Light|XPHB']),
    ),
  )
  const before = structuredClone(configured)
  const result = setRacialSpellChoice(configured, configured.provenance, id, 'block-choice', [
    target,
  ])
  expect(result).toEqual({ characterPatch: {}, provenanceUpdate: before.provenance })
  expect(configured).toEqual(before)
})

test.each([
  'removed target',
  'other printing',
  'empty pool',
])('strict reopen rejects a choice outside its declared pool (%s)', (corruption) => {
  const initial = finish({
    name: 'Pool Caster',
    source: 'OWNER',
    additionalSpells: [{ known: { _: ['light|PHB#c'] } }, { known: { _: ['mage hand|PHB#c'] } }],
  } as Race5e)
  const id = initial.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
  const character = reopen(
    commit(
      initial,
      setRacialSpellChoice(initial, initial.provenance, id, 'block-choice', [
        corruption === 'removed target' ? 'Mage Hand|PHB' : 'Light|PHB',
      ]),
    ),
  )
  character.spells.spellProfiles.find((profile) => profile.id === id)!.choices![0].pool =
    corruption === 'empty pool' ? [] : [corruption === 'other printing' ? 'Light|TCE' : 'Light|PHB']
  const original = structuredClone(character)
  expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
  expect(character).toEqual(original)
})

test('declared pools compare normalized exact targets and permit an empty unselected choice', () => {
  const initial = finish({
    name: 'Pool Caster',
    source: 'OWNER',
    additionalSpells: [{ known: { _: ['light|PHB#c'] } }, { known: { _: ['mage hand|PHB#c'] } }],
  } as Race5e)
  const id = initial.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
  const character = commit(
    initial,
    setRacialSpellChoice(initial, initial.provenance, id, 'block-choice', ['Light|PHB']),
  )
  character.spells.spellProfiles.find((profile) => profile.id === id)!.choices![0].pool = [
    ' light | phb ',
    'Mage Hand|PHB',
  ]
  expect(
    reopen(character).spells.spellProfiles.find((profile) => profile.id === id)!.cantrips,
  ).toEqual(['Light|PHB'])
  const cleared = commit(
    character,
    setRacialSpellChoice(character, character.provenance, id, 'block-choice', []),
  )
  cleared.spells.spellProfiles.find((profile) => profile.id === id)!.choices![0].pool = []
  expect(characterPersistenceSchema.safeParse(cleared).success).toBe(true)
})

test('spell target deduplication normalizes printing while retaining a competing printing', () => {
  const character = makeCharacterFixture()
  const tag = makeSourceTag('race', character.race, 'fixed', character.raceSource)
  let ledger = addSpellGrant(character.provenance, 'Light|PHB', tag)
  ledger = addSpellGrant(ledger, 'light| phb ', tag)
  ledger = addSpellGrant(ledger, 'LIGHT|XPHB', tag)
  expect(ledger.spells.light.map((tag) => tag.grantSource)).toEqual(['PHB', 'XPHB'])
})

test.each([
  'cantrips',
  'spellsKnown',
  'preparedSpells',
  'fixedSpells',
  'alwaysPreparedSpells',
  'selected',
  'pool',
] as const)('current racial %s cannot contain an unqualified target', (field) => {
  const character = finish({
    name: 'Strict Caster',
    source: 'OWNER',
    additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
  } as Race5e)
  const profile = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!
  if (field === 'selected' || field === 'pool') profile.choices![0][field] = ['Light']
  else profile[field] = ['Light']
  const before = structuredClone(character)
  expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
  expect(character).toEqual(before)
})

test('a current racial choice tag cannot omit its descriptor identity', () => {
  const character = makeCharacterFixture()
  character.provenance.spells.light = [
    {
      ...makeSourceTag('race', character.race, 'choice', character.raceSource),
      grantSource: 'PHB',
    },
  ]
  expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
})

test.each([
  'wrong target printing',
  'wrong descriptor',
  'noncanonical name bucket',
  'missing ownership',
  'missing materialization',
  'wrong materialized printing',
  'duplicate logical selection',
  'over quota',
])('strict current reopen rejects %s without changing the original', (corruption) => {
  let character = finish({
    name: 'Strict Choice Caster',
    source: 'OWNER',
    additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
  } as Race5e)
  const id = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
  character = reopen(
    commit(
      character,
      setRacialSpellChoice(character, character.provenance, id, 'direct-_-choose-0', ['Light|PHB']),
    ),
  )
  const profile = character.spells.spellProfiles.find((profile) => profile.id === id)!
  const choice = profile.choices![0]
  switch (corruption) {
    case 'wrong target printing':
      character.provenance.spells.light[0].grantSource = 'XPHB'
      break
    case 'wrong descriptor':
      character.provenance.spells.light[0].grantVariant = 'direct-_-choose-1'
      break
    case 'noncanonical name bucket':
      character.provenance.spells.Light = character.provenance.spells.light
      delete character.provenance.spells.light
      break
    case 'missing ownership':
      delete character.provenance.spells.light
      break
    case 'missing materialization':
      profile.cantrips = []
      break
    case 'wrong materialized printing':
      profile.cantrips = ['Light|XPHB']
      break
    case 'duplicate logical selection':
      choice.count = 2
      choice.selected.push('LIGHT|PHB')
      break
    case 'over quota':
      choice.selected.push('Mage Hand|XPHB')
      profile.cantrips.push('Mage Hand|XPHB')
      character.provenance = addSpellGrant(character.provenance, 'Mage Hand|XPHB', {
        ...makeSourceTag('race', character.race, 'choice', character.raceSource),
        grantVariant: choice.id,
      })
      break
  }
  const original = structuredClone(character)
  expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
  expect(character).toEqual(original)
})

test.each([
  'unselected spell',
  'unaccounted printing',
  'wrong choice kind',
])('strict current reopen rejects an %s in racial materialization', (corruption) => {
  let character = finish({
    name: 'Accounted Caster',
    source: 'OWNER',
    additionalSpells: [{ known: { _: ['light|XPHB#c', { choose: 'level=0|class=Wizard' }] } }],
  } as Race5e)
  const id = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
  character = reopen(
    commit(
      character,
      setRacialSpellChoice(character, character.provenance, id, 'direct-_-choose-0', ['Light|PHB']),
    ),
  )
  const profile = character.spells.spellProfiles.find((profile) => profile.id === id)!
  expect(profile.cantrips).toEqual(['light|XPHB', 'Light|PHB'])
  if (corruption === 'wrong choice kind') profile.spellsKnown.push('Light|PHB')
  else profile.cantrips.push(corruption === 'unselected spell' ? 'Mage Hand|PHB' : 'Light|TCE')
  const original = structuredClone(character)
  expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
  expect(character).toEqual(original)
})
