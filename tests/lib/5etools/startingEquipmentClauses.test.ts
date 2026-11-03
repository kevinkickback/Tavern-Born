import { expect, test } from 'vitest'
import { splitInlineTagFields, splitInlineTagSegments } from '@/lib/5etools/inlineTagSegments'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { startingFilterRule, startingGroupRule } from '@/lib/5etools/startingEquipmentClauses'
import { createStartingEquipmentPolicy } from '@/lib/5etools/startingEquipmentPolicy'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import { makeStartingEquipmentScenario } from '../../fixtures/startingEquipmentFixtures'

const group = { name: 'Arcane Focus', source: 'XPHB' }
const members = ['Crystal|XPHB', 'Wand|XPHB', 'Orb|XPHB']
const address = { option: 'a', entry: 0 }
test('balanced inline tokens preserve nested tags, source/display fields and escaped pipes', () => {
  const text = 'Before {@item Crystal|XPHB|{@i Crystal (polished)}} after'
  expect(splitInlineTagSegments(text).map((segment) => segment.text)).toEqual([
    'Before ',
    '{@item Crystal|XPHB|{@i Crystal (polished)}}',
    ' after',
  ])
  expect(splitInlineTagSegments(text)[1].tag?.fields).toEqual([
    'Crystal',
    'XPHB',
    '{@i Crystal (polished)}',
  ])
  expect(splitInlineTagFields('label\\|suffix|XPHB|{@i name|display}')).toEqual([
    'label\\|suffix',
    'XPHB',
    '{@i name|display}',
  ])
  expect(splitInlineTagSegments('{@item Crystal|XPHB')[0].malformed).toBe(true)
})
test('local exact subsets do not inherit an adjacent gaming proficiency requirement', () => {
  const text =
    '{@item Gaming Set|XPHB} (same as above), {@item Arcane Focus|XPHB} ({@item Crystal|XPHB} or {@item Wand|XPHB})'
  expect(startingGroupRule([text], group, members, address)).toEqual({
    relation: 'any',
    members: [
      { name: 'Crystal', source: 'XPHB' },
      { name: 'Wand', source: 'XPHB' },
    ],
  })
  expect(
    startingGroupRule([text], { name: 'Gaming Set', source: 'XPHB' }, ['Dice Set|XPHB'], address),
  ).toEqual({ relation: 'background' })
})
test('option branches bind independently and conflicting unbound repetitions stay unsupported', () => {
  const text =
    '(A) {@item Arcane Focus|XPHB} ({@item Crystal|XPHB}); or (B) {@item Arcane Focus|XPHB} ({@item Wand|XPHB})'
  expect(startingGroupRule([text], group, members, address).members).toEqual([
    { name: 'Crystal', source: 'XPHB' },
  ])
  expect(startingGroupRule([text], group, members, { option: 'b', entry: 0 }).members).toEqual([
    { name: 'Wand', source: 'XPHB' },
  ])
  expect(
    startingGroupRule([text], group, members, { option: '_', entry: 0 }).diagnostic,
  ).toBeTruthy()
  expect(
    startingGroupRule(
      [
        '{@item Arcane Focus|XPHB} ({@item Crystal|XPHB}), {@item Arcane Focus|XPHB} ({@item Wand|XPHB})',
      ],
      group,
      members,
      address,
    ).diagnostic,
  ).toBeTruthy()
  expect(
    startingGroupRule(
      ['{@item Arcane Focus|XPHB}', '{@item Arcane Focus|XPHB}'],
      group,
      members,
      address,
    ),
  ).toEqual({ relation: 'any' })
})
test.each([
  '{@item Arcane Focus|XPHB} (except {@item Orb|XPHB})',
  '{@item Arcane Focus|XPHB} ({@item Crystal|PHB})',
  '{@item Arcane Focus|XPHB} ({@item Missing|XPHB})',
  '{@item Arcane Focus|XPHB} (unknown rule)',
  '{@item Arcane Focus|XPHB} (any) (except {@item Wand|XPHB})',
  '{@item Arcane Focus|XPHB} (any) (unknown rule)',
  '{@item Arcane Focus|XPHB} (any) excluding {@item Wand|XPHB}',
  '{@item Arcane Focus|XPHB} (any) {@item Wand|XPHB}',
  '{@item Arcane Focus|XPHB} (any) with unknown restrictions',
  '{@item Arcane Focus|XPHB} (any) with unknown restrictions and a {@item Shield|PHB}',
  '{@item Arcane Focus|XPHB} ({@i {@item Crystal|XPHB}})',
  '{@item Arcane Focus|XPHB} ({@item Crystal|XPHB}',
  '{@item Arcane Focus|XPHB|Arcane Focus (Quarterstaff)}',
])('unsupported qualifiers never broaden the declared group: %s', (text) => {
  expect(startingGroupRule([text], group, members, address).diagnostic).toBeTruthy()
})
test('display qualifiers can corroborate independently qualified targets but cannot invent them', () => {
  const text = '{@item Arcane Focus|XPHB} ({@item Crystal|XPHB} or {@item Wand|XPHB})'
  expect(
    startingGroupRule([text], group, members, {
      ...address,
      displayName: 'Arcane Focus (Crystal or Wand)',
    }).diagnostic,
  ).toBeUndefined()
  expect(
    startingGroupRule([text], group, members, { ...address, displayName: 'Arcane Focus (Orb)' })
      .diagnostic,
  ).toBeTruthy()
  expect(
    startingGroupRule(['{@item Arcane Focus|XPHB}'], group, members, {
      ...address,
      displayName: 'Arcane Focus (Crystal)',
    }).diagnostic,
  ).toBeTruthy()
})
test('descriptive gift and explicit any preserve the full group', () => {
  for (const suffix of ['(a gift to you when you entered the priesthood)', '(any)', '']) {
    expect(
      startingGroupRule([`{@item Arcane Focus|XPHB} ${suffix}`], group, members, address),
    ).toEqual({ relation: 'any' })
  }
  expect(
    startingGroupRule(
      ['{@item Arcane Focus|XPHB} (any) and a {@item Shield|PHB}'],
      group,
      members,
      address,
    ),
  ).toEqual({ relation: 'any' })
})
const instrument = '{@filter musical instrument|items|type=instrument}',
  gaming = '{@filter gaming set|items|type=gaming set}'
test('generic shared OR postfix/prefix relations stay inside their own balanced clause', () => {
  const postfix = `Travel clothes, any ${instrument} or ${gaming} you are proficient with, an independent focus`
  const prefix = `Inheritance, the tool you choose for this background's tool proficiency (${gaming} or ${instrument}), a pouch`
  for (const tag of [instrument, gaming]) {
    expect(
      startingFilterRule(
        [`A set of ${gaming} or a ${instrument} (one of your choice), a pouch`],
        address,
        (text) => text === tag,
      ),
    ).toEqual({ relation: 'any' })
    expect(startingFilterRule([postfix], address, (text) => text === tag)).toEqual({
      relation: 'effective',
    })
    expect(startingFilterRule([prefix], address, (text) => text === tag)).toEqual({
      relation: 'background',
    })
  }
  expect(
    startingFilterRule(
      [`A tool ${gaming} you are proficient with, independently ${instrument}`],
      address,
      (text) => text === instrument,
    ),
  ).toEqual({ relation: 'any' })
  expect(
    startingFilterRule([`Choose ${gaming} unless proficient`], address, (text) => text === gaming)
      .diagnostic,
  ).toBeTruthy()
})

test('generic qualifiers and display constraints must all be accounted for', () => {
  for (const suffix of [
    '(only longswords)',
    '(any) (only longswords)',
    'only longswords',
    'with unknown restrictions',
  ]) {
    expect(
      startingFilterRule([`A ${gaming} ${suffix}`], address, (text) => text === gaming).diagnostic,
    ).toBeTruthy()
  }
  expect(
    startingFilterRule(
      [`A ${gaming} of your choice`],
      { ...address, displayName: 'Gaming set (same as above)' },
      (text) => text === gaming,
    ).diagnostic,
  ).toBeTruthy()
  expect(
    startingFilterRule(
      [`A ${gaming} and a {@item Shield|PHB}`],
      address,
      (text) => text === gaming,
    ),
  ).toEqual({ relation: 'any' })
  expect(
    startingFilterRule(
      [`A ${gaming} only longswords and a {@item Shield|PHB}`],
      address,
      (text) => text === gaming,
    ).diagnostic,
  ).toBeTruthy()
})

test('an unknown generic restriction cannot issue equipment through the command', () => {
  const { character, data } = makeStartingEquipmentScenario()
  const background = {
    ...data.backgrounds[0],
    entries: [
      {
        type: 'item',
        name: 'Equipment:',
        entry:
          'A {@filter martial weapons|items|source=phb|category=basic|type=martial weapon} (only longswords)',
      },
    ],
  }
  const items = [...data.items, ...data.itemsBase]
  const policy = createStartingEquipmentPolicy(
    character,
    { ...background, kind: 'background' },
    background.startingEquipment,
    items,
  )
  expect(() =>
    applyBackgroundSelectionCommand(
      character,
      character.provenance,
      background,
      ['a'],
      buildItemLookup(items),
      {
        '0:a:0': [
          { name: 'Warhammer', source: 'PHB' },
          { name: 'Warhammer', source: 'PHB' },
        ],
      },
      policy,
    ),
  ).toThrow()
  expect(character.equipment.some((item) => item.name === 'Warhammer')).toBe(false)
})
