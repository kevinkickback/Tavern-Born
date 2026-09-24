import { existsSync, readFileSync } from 'node:fs'
import { PDFDocument, PDFName, PDFTextField } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import { buildClassLookup, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseClasses, parseCreatures, parseSpells } from '@/lib/5etools/parsers'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { getCharacterSheetAssetPlan } from '@/lib/pdf/characterSheetAssets'
import { get2024SpellRows } from '@/lib/pdf/characterSheetMapping2024'
import { getOptionalCharacterSheetPages } from '@/lib/pdf/characterSheetPages'
import {
  buildCharacterSheetFieldMap,
  createCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import { buildCompanionSheetData } from '@/lib/pdf/companionSheet'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import { get2024FieldLabel } from '@/lib/pdf/official2024Text'
import type { Class5e, Creature5e, Spell5e } from '@/types/5etools'
import { generateTestCharacterSheet, sourceTemplateBytes } from '../fixtures/pdfTemplates'

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const hasCorpus = [
  'data/class/class-wizard.json',
  'data/class/class-ranger.json',
  'data/spells/spells-xphb.json',
  'data/bestiary/bestiary-xphb.json',
].every(existsSync)
const lookups = {
  classesByKey: hasCorpus
    ? buildClassLookup(parseClasses(json('data/class/class-wizard.json')) as Class5e[])
    : {},
  spellsByKey: hasCorpus
    ? buildSpellLookup(parseSpells(json('data/spells/spells-xphb.json')) as Spell5e[])
    : {},
}

function caster() {
  const character = createEmptyCharacter({
    name: 'Aster',
    originSystem: '2024',
    classProgression: [{ name: 'Wizard', source: 'XPHB', levels: 5 }],
  })
  character.spells.spellProfiles = [
    {
      id: 'class:Wizard|XPHB',
      type: 'class',
      label: 'Wizard',
      className: 'Wizard',
      classSource: 'XPHB',
      castingAbility: 'int',
      cantrips: ['Ray of Frost|XPHB'],
      spellsKnown: ['Mage Armor|XPHB', 'Shield|XPHB'],
      preparedSpells: ['Mage Armor|XPHB'],
    },
  ]
  return createCharacterSheetViewModel(character, lookups)
}

describe.runIf(hasCorpus)('2024 PDF layout and optional pages', () => {
  test.each([
    ['Beast of the Land', 30, '5d8'],
    ['Beast of the Sea', 30, '5d8'],
    ['Beast of the Sky', 24, '5d6'],
  ] as const)('resolves %s companion formulas from its 2024 source', (name, hp, dice) => {
    const creature = (
      parseCreatures(json('data/bestiary/bestiary-xphb.json')) as Creature5e[]
    ).find((entry) => entry.name === name)!
    const character = createEmptyCharacter({
      originSystem: '2024',
      classProgression: [{ name: 'Ranger', source: 'XPHB', levels: 5 }],
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 18,
        charisma: 10,
      },
    })
    const vm = createCharacterSheetViewModel(character, {
      classesByKey: buildClassLookup(
        parseClasses(json('data/class/class-ranger.json')) as Class5e[],
      ),
    })
    const companion = buildCompanionSheetData(vm, {
      name,
      source: 'XPHB',
      className: 'Ranger',
      classSource: 'XPHB',
      creature,
    })
    expect(companion.armorClass).toBe('17')
    expect(companion.maxHp).toBe(String(hp))
    expect(companion.hitDice).toBe(dice)
    expect(companion.proficiency).toBe('+3')
    expect(companion.passive).toBe('15')
    expect(companion.skills.find((skill) => skill.name === 'perception')?.modifier).toBe('+5')
    expect(companion.actions[0].bonus).toBe('+7')
    expect(companion.actions[0].damage).toContain('+ 4')
    expect(companion.attacks).toContain('Melee Attack Roll:')
    // Unknown expressions remain source text; never substitute a familiar creature's rules.
    const unknown = buildCompanionSheetData(vm, {
      name,
      creature: {
        ...creature,
        ac: [{ special: 'Special armor' }],
        hp: { special: 'Depends on the summoning spell' },
      },
    })
    expect(unknown.armorClass).toBe('Special armor')
    expect(unknown.maxHp).toBe('Depends on the summoning spell')
  })
  test.each([
    '2024-official',
    '2024-custom',
  ] as const)('%s includes active companions, supports blank pages, and keeps notes last and editable', async (id) => {
    const vm = caster()
    expect(
      getOptionalCharacterSheetPages(vm, id).map(({ id, included }) => [id, included]),
    ).toEqual([
      ['companion', false],
      ['notes', false],
    ])
    vm.companions = [
      { name: 'Owl', source: 'XMM' },
      { name: 'Wolf', source: 'XMM' },
    ]
    expect(getCharacterSheetAssetPlan(vm, id).map(({ id }) => id)).toEqual(['main', 'companion'])
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, id, { pages: { notes: true } }),
    )
    expect(doc.getPageCount()).toBe(5)
    const form = doc.getForm()
    for (const [name, pageIndex] of [
      ['Text_1', 0],
      ['Text_122', 1],
      ['Companion1__companion name', 2],
      ['Companion2__companion name', 3],
      ['P5.ASnotes.Notes.Left', 4],
    ] as const) {
      expect(form.getTextField(name).acroField.getWidgets()[0].P()).toBe(doc.getPage(pageIndex).ref)
    }
    expect(form.getTextField('Companion1__companion name').getText()).toBe('Owl')
    expect(form.getTextField('Companion2__companion name').getText()).toBe('Wolf')
    form.getTextField('P5.ASnotes.Notes.Right').setText('Session journal')
    const reopened = await PDFDocument.load(await doc.save())
    expect(reopened.getForm().getTextField('P5.ASnotes.Notes.Right').getText()).toBe(
      'Session journal',
    )
    const omitted = await PDFDocument.load(
      await generateTestCharacterSheet(vm, id, { pages: { companion: false, notes: false } }),
    )
    expect(omitted.getPageCount()).toBe(2)
    expect(omitted.getForm().getFieldMaybe('Companion1__companion name')).toBeUndefined()
    vm.companions = []
    const blank = await PDFDocument.load(
      await generateTestCharacterSheet(vm, id, { pages: { companion: true, notes: false } }),
    )
    expect(blank.getPageCount()).toBe(3)
    expect(blank.getForm().getTextField('Companion1__companion name').getText() ?? '').toBe('')
  }, 30_000)

  test('maps the actual printed spell columns and omits unprepared spells', () => {
    const vm = caster()
    expect(get2024SpellRows(vm).map(({ name }) => name)).toEqual(['Ray of Frost', 'Mage Armor'])
    const official = buildCharacterSheetFieldMap(vm, '2024-official').textFields
    expect(official.Text_152).toBe('Action')
    expect(official.SpellRange_1).toBe('60 ft.')
    expect(official.Text_182).toBe('Instant.; V, S')
    expect(official.Text_183).toContain('8 hr.')
    expect(official.Text_124).toBe('')
    const custom = buildCharacterSheetFieldMap(vm, '2024-custom').textFields
    expect(custom.Text_152).toBe('Action; Instant.')
    expect(custom.Text_182).toBe('60 ft.; V, S')
    expect(custom.SpellRange_1).toBeUndefined()
  })

  test.each([
    '2024-official',
    '2024-custom',
  ] as const)('%s preserves the artwork and fits ordinary spell entries without tiny text', async (id) => {
    const warnings: string[] = []
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(caster(), id, {
        onTextTruncated: (field) => warnings.push(field),
      }),
    )
    for (const field of doc.getForm().getFields()) {
      if (!(field instanceof PDFTextField)) continue
      for (const widget of field.acroField.getWidgets()) {
        expect(widget.getAppearanceCharacteristics()?.getBackgroundColor()).toBeUndefined()
        expect(widget.getAppearances()?.normal).toBeDefined()
      }
    }
    const scale = id === '2024-custom' ? 1700 / 603 : 1
    for (const name of ['Text_122', 'Text_152', 'Text_182']) {
      expect(warnings).not.toContain(name)
      const field = doc.getForm().getTextField(name)
      const size = Number(field.acroField.getDefaultAppearance()?.match(/([\d.]+)\s+Tf/)?.[1])
      expect(size / scale).toBeGreaterThanOrEqual(7)
      expect(size / scale).toBeLessThanOrEqual(8.5)
    }
    expect(warnings).not.toContain('Text_8')
    expect(warnings).not.toContain('Text_9')
    // Every source field remains mapped, including the official range additions.
    const source = await PDFDocument.load(new Uint8Array(sourceTemplateBytes(id)))
    const map = buildCharacterSheetFieldMap(caster(), id)
    const mapped = new Set([...Object.keys(map.textFields), ...Object.keys(map.checkboxFields)])
    expect(
      source
        .getForm()
        .getFields()
        .filter((field) => !mapped.has(field.getName())),
    ).toEqual([])
    expect(doc.getForm().getCheckBox('Checkbox_8').acroField.dict.has(PDFName.of('V'))).toBe(true)
  }, 30_000)

  test('all 2024 fitting warnings have readable labels, including spell notes and ranges', () => {
    for (let id = 1; id <= 230; id += 1)
      expect(get2024FieldLabel(`Text_${id}`, true)).not.toMatch(/^Text_/)
    const issues = getPdfExportPreflight('2024-official', caster(), null, [], {}, [
      'Text_182',
      'SpellRange_1',
    ]).issues
    expect(issues.map(({ title }) => title)).toContain(
      'Spell notes (row 1) was shortened on this sheet',
    )
    expect(issues.map(({ title }) => title)).toContain('Spell 1 range was shortened on this sheet')
  })
})
