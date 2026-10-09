import { PDFDocument } from '@cantoo/pdf-lib'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import { buildRacialSpellcastingDetails } from '@/lib/calculations/spellProfiles.casting'
import {
  mapOfficial2014SpellPage,
  OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL,
  paginateOfficial2014SpellPages,
} from '@/lib/pdf/characterSheetMapping2014Official'
import {
  buildCharacterSheetFieldMap,
  createCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import { planSheetContent } from '@/lib/pdf/sheetContent'
import type { SheetExportReport } from '@/lib/pdf/types'
import { SpellcastingDetailsCard } from '@/pages/spells/components/SpellcastingDetailsCard'
import type { Race5e, Spell5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'
import { makeNativeRacialCharacter } from '../fixtures/nativeRacialCharacter'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

afterEach(cleanup)

function caster() {
  const child = {
    name: 'Child',
    source: 'CHILD',
    additionalSpells: [
      {
        ability: 'wis',
        known: { 1: ['child light|XPHB#c'] },
        innate: { 3: { daily: { 1: ['missing ward|PHB'] } } },
      },
    ],
  } as Race5e
  const parent = {
    name: 'Parent',
    source: 'PARENT',
    additionalSpells: [{ ability: 'int', known: { 1: ['parent light#c'] } }],
  } as Race5e
  const character = makeNativeRacialCharacter(parent, child, 5)
  character.abilityScores = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 16,
    wisdom: 18,
    charisma: 10,
  }
  const childId = character.spells.spellProfiles.find((profile) => profile.raceName === 'Child')!.id
  character.manualEffects = [
    {
      id: 'int-boost',
      label: 'Intelligence boost',
      source: { kind: 'manual', name: 'Test' },
      target: { kind: 'ability-score', ability: 'intelligence' },
      operation: { kind: 'add', value: 2 },
    },
    {
      id: 'global-dc',
      label: 'Global casting',
      source: { kind: 'manual', name: 'Test' },
      target: { kind: 'spell-save-dc' },
      operation: { kind: 'add', value: 1 },
    },
    {
      id: 'child-dc',
      label: 'Child casting',
      source: { kind: 'manual', name: 'Test' },
      target: { kind: 'spell-save-dc', profileId: childId },
      operation: { kind: 'add', value: 2 },
    },
    {
      id: 'child-attack',
      label: 'Conditional attack',
      source: { kind: 'manual', name: 'Test' },
      target: { kind: 'spell-attack', profileId: childId },
      operation: { kind: 'add', value: 3 },
      requirements: [{ kind: 'flag', key: 'active', expected: true }],
    },
  ]
  character.effectFlags = { active: true }
  character.spells.spellSlots[1] = { max: 99, used: 2 }
  character.createdAt = '2001-01-01T00:00:00.000Z'
  return characterPersistenceSchema.parse(character)
}

test('effective scores and global/profile/conditional effects give independent racial UI and PDF numbers without class slot pools', () => {
  const character = caster()
  const before = structuredClone(character)
  const vm = createCharacterSheetViewModel(character, {})
  expect(vm.spellcastingDetails).toEqual([])
  expect(
    vm.spellcastingSources.map((source) => ({
      name: source.sourceName,
      ability: source.spellcastingAbility,
      dc: source.spellSaveDC,
      attack: source.spellAttackBonus,
    })),
  ).toEqual([
    { name: 'Parent', ability: 'intelligence', dc: 16, attack: 7 },
    { name: 'Child', ability: 'wisdom', dc: 18, attack: 10 },
  ])
  const details = buildRacialSpellcastingDetails(
    vm.character,
    vm.effectiveAbilityScores,
    character.manualEffects,
    { flags: character.effectFlags },
  )
  render(
    <SpellcastingDetailsCard
      isSpellcaster={false}
      spellcastingDetails={[]}
      racialProfiles={character.spells.spellProfiles.filter((profile) => profile.type === 'racial')}
      racialSpellcastingDetails={details}
      hasMultipleSpellcastingClasses={false}
      sharedSlots={[]}
      pactSlots={[]}
    />,
  )
  const parent = screen.getByText('Parent').closest('.overflow-hidden')!
  const child = screen.getByText('Child').closest('.overflow-hidden')!
  expect(within(parent as HTMLElement).getByText('16')).toBeTruthy()
  expect(within(parent as HTMLElement).getByText('+7')).toBeTruthy()
  expect(within(child as HTMLElement).getByText('18')).toBeTruthy()
  expect(within(child as HTMLElement).getByText('+10')).toBeTruthy()
  expect(screen.queryByText('Spell Slots')).toBeNull()
  expect(vm.spellRows).toContainEqual(
    expect.objectContaining({ name: 'missing ward', level: '?', castingTime: '', range: '' }),
  )
  const pages = paginateOfficial2014SpellPages(vm)
  expect(pages.map((page) => page.detail?.sourceName)).toEqual(['Parent', 'Child'])
  const maps = pages.map((page) => mapOfficial2014SpellPage(vm, page))
  expect(maps.map((map) => map.textFields['SpellSaveDC  2'])).toEqual(['16', '18'])
  expect(maps.map((map) => map.textFields['SpellAtkBonus 2'])).toEqual(['+7', '+10'])
  expect(maps.map((map) => map.textFields[OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL[0][0]])).toEqual([
    'parent light',
    'child light',
  ])
  for (const map of maps) expect(map.textFields['SlotsTotal 19']).toBe('')
  expect(Object.values(maps[1].textFields)).not.toContain('missing ward')
  expect(character).toEqual(before)
})

test('community 2014 and both 2024 summaries keep actual owners and report secondary casting capacity', () => {
  const character = caster()
  const vm = createCharacterSheetViewModel(character, {})
  const community = buildCharacterSheetFieldMap(vm, '2014-custom')
  expect(community.textFields['Spell save DC 1']).toBe('16')
  expect(community.textFields['Spell save DC 2']).toBe('18')
  for (const id of ['2024-official', '2024-custom'] as const) {
    const map = buildCharacterSheetFieldMap(vm, id)
    expect(map.textFields.Text_86).toBe('16')
    expect(map.textFields.Text_87).toBe('+7')
    expect(map.textFields.Text_230).toBe('Intelligence')
    expect(planSheetContent(vm, id).overflow).toContainEqual(
      expect.objectContaining({
        id: 'capacity:spellcasting-profiles',
        text: 'Child: wisdom; save DC 18; attack 10',
      }),
    )
  }
  const unknown = planSheetContent(vm, '2014-official').overflow.find((section) =>
    section.id.startsWith('unknown-spell-levels:'),
  )!
  expect(unknown.text).toBe('missing ward — spell level unknown')
  expect(
    planSheetContent(vm, '2014-official', undefined, { spells: false }).overflow,
  ).not.toContainEqual(unknown)
})

test.each([
  '2014-official',
  '2014-custom',
  '2024-official',
  '2024-custom',
] as const)('actual %s export preserves unknown leveled targets in notes and independent racial casting', async (id) => {
  const character = caster()
  const before = structuredClone(character)
  const vm = createCharacterSheetViewModel(character, {})
  let report: SheetExportReport | undefined
  const bytes = await generateTestCharacterSheet(vm, id, {
    pages: { notes: true },
    text: { descriptions: 'names', overflow: 'notes' },
    onReport: (value) => {
      report = value
    },
  })
  const saved = await PDFDocument.load(bytes)
  const form = saved.getForm()
  expect(report?.preserved).toContainEqual(
    expect.objectContaining({
      title: 'Child: spells with unknown levels',
      text: 'missing ward — spell level unknown',
    }),
  )
  if (id.startsWith('2014')) {
    const prefix = id === '2014-custom' ? 'WotC__' : ''
    expect(form.getTextField(prefix + 'Spellcasting Class 2').getText()).toBe('Parent')
    expect(form.getTextField(prefix + 'SpellPage2__Spellcasting Class 2').getText()).toBe('Child')
    expect(form.getTextField(prefix + 'SpellPage2__SpellSaveDC  2').getText()).toBe('18')
    expect(form.getTextField(prefix + 'SpellPage2__SlotsTotal 19').getText() ?? '').toBe('')
    expect(
      form
        .getTextField(prefix + 'SpellPage2__' + OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL[0][0])
        .getText(),
    ).toBe('child light')
  } else {
    expect(form.getTextField('Text_86').getText()).toBe('16')
    expect(report?.preserved).toContainEqual(
      expect.objectContaining({
        id: 'capacity:spellcasting-profiles',
        text: 'Child: wisdom; save DC 18; attack 10',
      }),
    )
  }
  expect(character).toEqual(before)
}, 30_000)

test.each([
  '2024-official',
  '2024-custom',
] as const)('default %s exports retain secondary casting details without unknown spell levels', async (id) => {
  const character = caster()
  const before = structuredClone(character)
  const vm = createCharacterSheetViewModel(character, {
    spellsByKey: buildSpellLookup([
      makeSpellFixture({ name: 'parent light', source: 'PHB', level: 0 }),
      makeSpellFixture({ name: 'child light', source: 'XPHB', level: 0 }),
      makeSpellFixture({ name: 'missing ward', source: 'PHB', level: 1 }),
    ]),
  })
  expect(
    planSheetContent(vm, id).overflow.some((entry) => entry.id.startsWith('unknown-spell-levels:')),
  ).toBe(false)
  const expected = {
    id: 'capacity:spellcasting-profiles',
    title: 'Additional spellcasting abilities',
    text: 'Child: wisdom; save DC 18; attack 10',
  }
  let report: SheetExportReport | undefined
  const bytes = await generateTestCharacterSheet(vm, id, {
    onReport: (value) => {
      report = value
    },
  })
  expect(report?.notesPageCount).toBe(1)
  expect(report?.preserved).toContainEqual(expected)
  const saved = await PDFDocument.load(bytes)
  expect(saved.getForm().getTextField('P5.ASnotes.Notes.Left').getText()).toContain(expected.text)

  const disabled = await generateTestCharacterSheet(vm, id, {
    pages: { notes: false },
    onReport: (value) => {
      report = value
    },
  })
  expect(report?.notesPageCount).toBe(0)
  expect(report?.preserved).not.toContainEqual(expected)
  expect(report?.omitted).toContainEqual(expected)
  expect((await PDFDocument.load(disabled)).getPageCount()).toBe(2)
  expect(character).toEqual(before)
}, 30_000)

test('an unselected casting ability has unknown numbers despite global numeric modifiers', () => {
  const character = caster()
  character.spells.spellProfiles.find((profile) => profile.raceName === 'Child')!.castingAbility =
    undefined
  const vm = createCharacterSheetViewModel(character, {})
  expect(vm.spellcastingSources.find((source) => source.sourceName === 'Child')).toMatchObject({
    spellSaveDC: null,
    spellAttackBonus: null,
  })
})

test('a competing cantrip printing cannot fill missing leveled spell metadata or a cantrip field', () => {
  const character = caster()
  const spell: Spell5e = {
    name: 'missing ward',
    source: 'XPHB',
    level: 0,
    school: 'A',
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 60 } },
    duration: [{ type: 'instant' }],
    components: { v: true },
    entries: [],
  }
  const vm = createCharacterSheetViewModel(character, {
    spellsByKey: { 'missing ward|XPHB': spell, 'missing ward': spell },
  })
  const row = vm.spellRows.find((row) => row.id === 'missing ward|phb')!
  expect(row).toMatchObject({
    level: '?',
    castingTime: '',
    duration: '',
    range: '',
    components: '',
  })
  const childPage = paginateOfficial2014SpellPages(vm).find(
    (page) => page.detail?.sourceName === 'Child',
  )!
  const map = mapOfficial2014SpellPage(vm, childPage)
  expect(Object.values(map.textFields)).not.toContain('missing ward')
  expect(planSheetContent(vm, '2014-official').overflow).toContainEqual(
    expect.objectContaining({
      title: 'Child: spells with unknown levels',
      text: 'missing ward — spell level unknown',
    }),
  )
})
