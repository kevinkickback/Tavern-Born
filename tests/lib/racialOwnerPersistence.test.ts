import { expect, test } from 'vitest'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { applyRaceSelectionCommand } from '@/lib/character/commands/raceCommands'
import { emptyProvenance, makeSourceTag } from '@/lib/provenance'
import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const locations = [
  'armor',
  'weapons',
  'tools',
  'languages',
  'skills',
  'expertise',
  'savingThrows',
  'features',
  'feats',
  'spells',
  'equipment',
  'abilityBonuses',
  'choices',
] as const

function putOwner(ledger: ProvenanceLedger, location: (typeof locations)[number], tag: SourceTag) {
  if (location === 'abilityBonuses') {
    ledger.abilityBonuses = [{ ability: 'strength', value: 1, sourceTag: tag }]
  } else if (location === 'choices') {
    ledger.choices = [
      {
        id: 'owner-proof',
        domain: 'skills',
        sourceTag: { ...tag, grantType: 'placeholder' },
        chooseCount: 1,
        optionPool: ['Arcana'],
        selected: [],
        status: 'pending',
      },
    ]
  } else if (
    location === 'features' ||
    location === 'feats' ||
    location === 'spells' ||
    location === 'equipment'
  ) {
    ledger[location]['owner-proof'] = [
      { ...tag, ...(location === 'feats' || location === 'spells' ? { grantSource: 'PHB' } : {}) },
    ]
  } else {
    ledger.proficiencies[location] = { 'owner-proof': [tag] }
  }
}

test.each(locations)('rejects an inactive racial printing in %s', (location) => {
  const ledger = emptyProvenance()
  putOwner(ledger, location, makeSourceTag('race', 'Human', 'fixed', 'OTHER'))
  expect(
    characterPersistenceSchema.safeParse(makeCharacterFixture({ provenance: ledger })).success,
  ).toBe(false)
})

test.each([
  makeSourceTag('race', 'Elf', 'fixed', 'PHB'),
  makeSourceTag('race', 'Human', 'fixed'),
  makeSourceTag('race', 'Human', 'fixed', 'PHB|OTHER'),
  makeSourceTag('race', 'Human|OTHER', 'fixed', 'PHB'),
  makeSourceTag('subrace', 'Variant', 'fixed', 'PHB'),
])('rejects an unselected or unqualified racial owner %#', (tag) => {
  const ledger = emptyProvenance()
  putOwner(ledger, 'skills', tag)
  expect(
    characterPersistenceSchema.safeParse(makeCharacterFixture({ provenance: ledger })).success,
  ).toBe(false)
})

test('rejects a selected child without a parent even when it owns no grants', () => {
  expect(
    characterPersistenceSchema.safeParse(
      makeCharacterFixture({
        race: '',
        raceSource: undefined,
        subrace: 'Variant',
        subraceSource: 'PHB',
      }),
    ).success,
  ).toBe(false)
})

test.each(
  locations,
)('accepts normalized active racial ownership and independent manual/class owners in %s', (location) => {
  for (const tag of [
    makeSourceTag('race', ' hUMAN ', 'fixed', ' phb '),
    makeSourceTag('subrace', ' vARIANT ', 'fixed', ' phb '),
    makeSourceTag('manual', 'User Choice', 'choice'),
    makeSourceTag('class', 'Independent', 'fixed', 'OTHER'),
  ]) {
    const ledger = emptyProvenance()
    putOwner(ledger, location, tag)
    let character = makeCharacterFixture({
      subrace: 'Variant',
      subraceSource: 'PHB',
      provenance: ledger,
    })
    if (location === 'spells' && (tag.sourceType === 'race' || tag.sourceType === 'subrace')) {
      character = buildInitialCharacter(
        {
          initial: makeCharacterFixture(),
          race: {
            name: 'Human',
            source: 'PHB',
            ...(tag.sourceType === 'race'
              ? { additionalSpells: [{ known: { _: ['owner-proof|PHB#c'] } }] }
              : {}),
          } as Race5e,
          subrace: {
            name: 'Variant',
            source: 'PHB',
            ...(tag.sourceType === 'subrace'
              ? { additionalSpells: [{ known: { _: ['owner-proof|PHB#c'] } }] }
              : {}),
          } as Race5e,
        },
        new Map(),
        () => [],
      )
      Object.assign(character.provenance.spells['owner-proof'][0], {
        sourceName: tag.sourceName,
        sourceRef: tag.sourceRef,
      })
    }
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  }
})

test('accepts empty drafts and rejects a whitespace-only selected printing', () => {
  expect(
    characterPersistenceSchema.safeParse(
      makeCharacterFixture({ race: '', raceSource: undefined, provenance: emptyProvenance() }),
    ).success,
  ).toBe(true)
  expect(
    characterPersistenceSchema.safeParse(makeCharacterFixture({ raceSource: '  ' })).success,
  ).toBe(false)
})

test('fresh Finish and sequential parent replacement with the same child strictly reopen', () => {
  const parents = parseRaces({
    race: [
      { name: 'Parent', source: 'HB1', skillProficiencies: [{ arcana: true }] },
      { name: 'Parent', source: 'HB2', skillProficiencies: [{ history: true }] },
    ],
    subrace: [
      {
        name: 'Shared',
        source: 'PHB',
        raceName: 'Parent',
        raceSource: 'HB1',
        ability: [{ con: 1 }],
      },
      {
        name: 'Shared',
        source: 'PHB',
        raceName: 'Parent',
        raceSource: 'HB2',
        ability: [{ con: 1 }],
      },
    ],
  }) as Race5e[]
  const first = buildInitialCharacter(
    {
      initial: { name: 'Active owner', originSystem: '2014' },
      race: parents[0],
      subrace: parents[0].subraces?.[0],
    },
    new Map(),
    () => [],
  )
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(first)))
  const replaced = applyRaceSelectionCommand(
    reopened,
    reopened.provenance!,
    parents[1],
    parents[1].subraces?.[0],
    0,
    () => [],
  )
  const final = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...reopened,
        ...replaced.characterPatch,
        provenance: replaced.provenanceUpdate,
      }),
    ),
  )
  expect(final.raceSource).toBe('HB2')
  expect(final.subraceSource).toBe('PHB')
  expect(final.proficiencies.skills).toContain('history')
  expect(final.proficiencies.skills).not.toContain('arcana')
  expect(
    final.provenance!.abilityBonuses.filter((record) => record.sourceTag.sourceType === 'subrace'),
  ).toHaveLength(1)
})
