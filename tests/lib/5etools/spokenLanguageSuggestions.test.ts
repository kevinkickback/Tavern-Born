import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { resolveCopiedRecords } from '@/lib/5etools/copyResolution'
import {
  buildSpokenLanguageSuggestions,
  getSpokenLanguageSuggestions,
} from '@/lib/5etools/spokenLanguageSuggestions'
import type { Creature5e, Language5e, Race5e } from '@/types/5etools'

const languages: Language5e[] = ['Common', 'Draconic', 'Elvish', 'Goblin', 'Giant Owl'].map(
  (name) => ({ name, source: 'PHB' }),
)
test('bare speech is positive evidence; comprehension, tags, telepathy and missing declarations are not', () => {
  const index = buildSpokenLanguageSuggestions(
    [
      {
        name: 'Adult Red Dragon',
        source: 'MM',
        type: { type: 'dragon' },
        languages: ['Common', 'Draconic', 'telepathy 120 ft.'],
      },
      {
        name: 'Giant Owl',
        source: 'MM',
        type: 'beast',
        languages: ['Giant Owl', "understands Common, Elvish, and Sylvan but can't speak them"],
        languageTags: ['C', 'E', 'S', 'CS', 'OTH'],
      },
      {
        name: 'Skeleton',
        source: 'MM',
        type: 'undead',
        languages: ["understands all languages it spoke in life but can't speak"],
      },
      { name: 'Silent', source: 'MM', type: 'ooze' },
      {
        name: 'Unresolved',
        source: 'MM',
        type: 'ooze',
        languages: ['Common'],
        _copy: { name: 'Missing', source: 'MM' },
      },
      {
        name: 'Malformed',
        source: 'MM',
        type: 'ooze',
        languages: [{ name: 'Common' }, 'all', 'any one language'],
      },
    ],
    [],
    languages,
  )
  expect(getSpokenLanguageSuggestions(index, { creatureType: ' DRAGON ' })).toEqual([
    'common',
    'draconic',
  ])
  expect(getSpokenLanguageSuggestions(index, { creatureType: 'beast' })).toEqual(['giant owl'])
  expect(getSpokenLanguageSuggestions(index, { creatureType: 'undead' })).toEqual([])
  expect(getSpokenLanguageSuggestions(index, { creatureType: 'ooze' })).toEqual([])
})

test('exact race labels union fixed declarations across printings without interpreting variable choices or broad monster tags', () => {
  const races: Race5e[] = [
    {
      name: 'Goblin',
      source: 'VGM',
      // Raw 5etools blocks can mix fixed and variable declarations.
      languageProficiencies: JSON.parse(
        '[{"common":true,"goblin":true,"anyStandard":1,"choose":{"from":["elvish"],"count":1}}]',
      ),
    },
    {
      name: 'Goblin',
      source: 'OTHER',
      creatureTypes: ['humanoid'],
      languageProficiencies: [{ elvish: true }],
    },
    {
      name: 'Fairy',
      source: 'MPMM',
      creatureTypes: ['fey'],
      languageProficiencies: [{ common: true }],
    },
    {
      name: 'Unresolved',
      source: 'PHB',
      _copy: { name: 'Missing', source: 'PHB' },
      languageProficiencies: [{ common: true }],
    },
  ]
  const index = buildSpokenLanguageSuggestions(
    [
      {
        name: 'Hobgoblin',
        source: 'MM',
        type: { type: 'humanoid', tags: ['goblinoid'] },
        languages: ['Common', 'Goblin'],
      },
    ],
    races,
    languages,
  )
  expect(getSpokenLanguageSuggestions(index, { races: [' GOBLIN ', 'Campaign race'] })).toEqual([
    'common',
    'elvish',
    'goblin',
  ])
  expect(getSpokenLanguageSuggestions(index, { races: ['Hobgoblin', 'Gob'] })).toEqual([])
  expect(index.races).toEqual([
    { name: 'Goblin', source: 'OTHER' },
    { name: 'Goblin', source: 'VGM' },
  ])
  expect(getSpokenLanguageSuggestions(index, { races: ['Fairy'] })).toEqual([])
})

test('existing copy resolution supplies inherited speech and the passed vocabulary bounds all suggestions', () => {
  const raw: Creature5e[] = [
    { name: 'Base', source: 'MM', type: 'dragon', languages: ['Common', 'Draconic'] },
    { name: 'Copy', source: 'MM', _copy: { name: 'Base', source: 'MM' } },
  ]
  const resolved = resolveCopiedRecords(raw, 'monster').records
  const index = buildSpokenLanguageSuggestions(
    resolved.filter((c) => c.name === 'Copy'),
    [],
    [{ name: 'Common', source: 'PHB' }],
  )
  expect(getSpokenLanguageSuggestions(index, { creatureType: 'dragon' })).toEqual(['common'])
  expect(buildSpokenLanguageSuggestions([], [], languages).byCreatureType.size).toBe(0)
})

test.skipIf(!existsSync('data/bestiary/bestiary-mm.json'))(
  'configured MM speech keeps dragon alternatives and excludes understood-only owl languages',
  () => {
    const creatures: Creature5e[] = JSON.parse(
      readFileSync('data/bestiary/bestiary-mm.json', 'utf8'),
    ).monster
    const selected = creatures.filter((c) =>
      ['Adult Red Dragon', 'Giant Owl', 'Skeleton'].includes(c.name),
    )
    const index = buildSpokenLanguageSuggestions(selected, [], languages)
    expect(getSpokenLanguageSuggestions(index, { creatureType: 'dragon' })).toEqual([
      'common',
      'draconic',
    ])
    expect(getSpokenLanguageSuggestions(index, { creatureType: 'beast' })).toEqual(['giant owl'])
    expect(getSpokenLanguageSuggestions(index, { creatureType: 'undead' })).toEqual([])
  },
)
