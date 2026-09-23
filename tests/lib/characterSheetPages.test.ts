import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, test, vi } from 'vitest'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import {
  createPdfAssetLoader,
  getCharacterSheetAssetPlan,
  PDF_2014_ASSETS,
} from '@/lib/pdf/characterSheetAssets'
import { getOptionalCharacterSheetPages } from '@/lib/pdf/characterSheetPages'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetPdf'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import type { CharacterSheetPageOptions, CharacterSheetTemplateId } from '@/lib/pdf/types'
import { makeClassFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const blank = () =>
  createCharacterSheetViewModel(createEmptyCharacter({ name: 'Optional Pages' }), {})

async function generate(
  id: CharacterSheetTemplateId,
  pages?: CharacterSheetPageOptions,
  vm = blank(),
) {
  return PDFDocument.load(await generateTestCharacterSheet(vm, id, { pages }))
}

describe('optional PDF pages', () => {
  test('loads only selected modules and shares spell and notes assets between layouts', () => {
    const vm = blank()
    expect(getCharacterSheetAssetPlan(vm, '2014-official').map((part) => part.id)).toEqual(['main'])
    const choices = { companion: true, spells: true, notes: true }
    for (const id of ['2014-official', '2014-custom'] as const) {
      const plan = getCharacterSheetAssetPlan(vm, id, choices)
      expect(plan.map((part) => part.id)).toEqual(['main', 'companion', 'spells', 'notes'])
      expect(plan[2].path).toBe(PDF_2014_ASSETS.spells)
      expect(plan[3].path).toBe(PDF_2014_ASSETS.notes)
      expect(
        getCharacterSheetAssetPlan(vm, id, { companion: false, spells: false, notes: false }),
      ).toHaveLength(1)
    }
  })

  test('caches concurrent asset loads without sharing mutable bytes, and retries failures', async () => {
    const fetchBytes = vi.fn(async () => new Uint8Array([1, 2, 3]))
    const load = createPdfAssetLoader(fetchBytes)
    const [first, second] = await Promise.all([load('spells'), load('spells')])
    expect(fetchBytes).toHaveBeenCalledTimes(1)
    first[0] = 9
    expect(second[0]).toBe(1)
    expect((await load('spells'))[0]).toBe(1)
    fetchBytes.mockRejectedValueOnce(new Error('temporary failure'))
    await expect(load('notes')).rejects.toThrow('temporary failure')
    await expect(load('notes')).resolves.toEqual(new Uint8Array([1, 2, 3]))
    expect(fetchBytes).toHaveBeenCalledTimes(3)
  })

  test.each([
    '2014-official',
    '2014-custom',
  ] as const)('%s assembles core, companion, spells, then editable MPMB notes', async (id) => {
    const doc = await generate(id, { companion: true, spells: true, notes: true })
    const coreCount = id === '2014-official' ? 2 : 4
    expect(doc.getPageCount()).toBe(coreCount + 3)
    const pageIndex = (name: string) => {
      const widget = doc.getForm().getField(name).acroField.getWidgets()[0]
      return doc.getPages().findIndex((page) => page.ref === widget.P())
    }
    expect(
      pageIndex(id === '2014-official' ? 'Companion1__companion name' : 'P4.AScomp.Comp.Desc.Name'),
    ).toBe(coreCount)
    expect(
      pageIndex(id === '2014-official' ? 'Spellcasting Class 2' : 'WotC__Spellcasting Class 2'),
    ).toBe(coreCount + 1)
    expect(pageIndex('P5.ASnotes.Notes.Left')).toBe(coreCount + 2)
    expect(
      doc
        .getForm()
        .getFields()
        .some((field) => field.getName().startsWith('TB_')),
    ).toBe(false)
    doc.getForm().getTextField('P5.ASnotes.Notes.Left').setText('Session notes')
    doc.getForm().getTextField('P5.ASnotes.Notes.Right').setText('Next adventure')
    const saved = await PDFDocument.load(await doc.save())
    expect(saved.getForm().getTextField('P5.ASnotes.Notes.Left').getText()).toBe('Session notes')
    expect(saved.getForm().getTextField('P5.ASnotes.Notes.Right').getText()).toBe('Next adventure')
  }, 30_000)

  test('MPMB can include a blank official spell page, then omit it entirely', async () => {
    const included = await generate('2014-custom', { spells: true, notes: false })
    expect(included.getPageCount()).toBe(5)
    expect(included.getForm().getFieldMaybe('WotC__Spellcasting Class 2')).toBeDefined()
    const omitted = await generate('2014-custom', { spells: false, notes: false })
    expect(omitted.getPageCount()).toBe(4)
    expect(
      omitted
        .getForm()
        .getFields()
        .some((field) => field.getName().startsWith('WotC__')),
    ).toBe(false)
  }, 30_000)
  test('does not add spell pages before a class gains casting', () => {
    const character = createEmptyCharacter({
      classProgression: [{ name: 'Ranger', source: 'PHB', levels: 1 }],
    })
    character.spells.spellProfiles = [
      {
        id: 'class:Ranger|PHB',
        type: 'class',
        label: 'Ranger',
        cantrips: [],
        spellsKnown: [],
        preparedSpells: [],
      },
    ]
    const lookups = {
      classesByKey: buildClassLookup([
        makeClassFixture({
          name: 'Ranger',
          casterProgression: '1/2',
          spellcastingAbility: 'wis',
          classTableGroups: [{ rowsSpellProgression: [[], [2]] }],
        }),
      ]),
    }
    expect(
      getOptionalCharacterSheetPages(
        createCharacterSheetViewModel(character, lookups),
        '2014-official',
      )[0].included,
    ).toBe(false)
    character.classProgression[0].levels = 2
    expect(
      getOptionalCharacterSheetPages(
        createCharacterSheetViewModel(character, lookups),
        '2014-official',
      )[0].included,
    ).toBe(true)
  })

  test('keeps racial magic and unresolved casting profiles, and allows blank spell pages', () => {
    const vm = blank()
    expect(getOptionalCharacterSheetPages(vm, '2014-official')[0].included).toBe(false)
    expect(getOptionalCharacterSheetPages(vm, '2014-official', { spells: true })[0].included).toBe(
      true,
    )
    vm.character.spells.spellProfiles.push({
      id: 'racial:test|TEST',
      type: 'racial',
      label: 'Racial magic',
      cantrips: ['Light|PHB'],
      spellsKnown: [],
      preparedSpells: [],
    })
    const racial = createCharacterSheetViewModel(vm.character, {})
    expect(getOptionalCharacterSheetPages(racial, '2014-official')[0].included).toBe(true)
    racial.character.spells.spellProfiles = [
      {
        id: 'class:Wizard|PHB',
        type: 'class',
        label: 'Wizard',
        cantrips: [],
        spellsKnown: [],
        preparedSpells: [],
      },
    ]
    expect(
      getOptionalCharacterSheetPages(
        createCharacterSheetViewModel(racial.character, {}),
        '2014-official',
      )[0].included,
    ).toBe(true)
  })

  test.each([
    [undefined, 2],
    [{ spells: true }, 3],
    [{ spells: false }, 2],
  ] as const)(
    'official 2014 exports the selected pages (%j)',
    async (pages, count) => {
      const output = await generate('2014-official', pages)
      expect(output.getPageCount()).toBe(count)
      expect(output.getForm().getFieldMaybe('Spellcasting Class 2') !== undefined).toBe(count === 3)
      expect(output.getForm().getTextField('CharacterName').getText()).toBe('Optional Pages')
      output.getForm().getTextField('CharacterName').setText('Edited after export')
      const reopened = await PDFDocument.load(await output.save())
      expect(reopened.getForm().getTextField('CharacterName').getText()).toBe('Edited after export')
      expect(reopened.getPageCount()).toBe(count)
    },
    30_000,
  )

  test.each([
    [undefined, 5, false, true],
    [{ companion: false, notes: false }, 4, false, false],
    [{ companion: true, notes: false }, 5, true, false],
    [{ companion: true, notes: true }, 6, true, true],
  ] as const)(
    'MPMB removes only omitted pages and their fields (%j)',
    async (pages, count, companion, notes) => {
      const output = await generate('2014-custom', pages)
      expect(output.getPageCount()).toBe(count)
      const form = output.getForm()
      expect(form.getFields().some((field) => field.getName().startsWith('P4.AScomp.'))).toBe(
        companion,
      )
      expect(form.getFields().some((field) => field.getName().startsWith('P5.ASnotes.'))).toBe(
        notes,
      )
      expect(form.getTextField('PC Name').getText()).toBe('Optional Pages')
      for (const field of form.getFields()) {
        for (const widget of field.acroField.getWidgets()) {
          const page = output.getPages().find((candidate) => candidate.ref === widget.P())
          expect(page, field.getName()).toBeDefined()
          expect(
            page?.node
              .Annots()
              ?.asArray()
              .some((ref) => output.context.lookup(ref) === widget.dict),
            field.getName(),
          ).toBe(true)
        }
      }
      form.getTextField('PC Name').setText('Still editable')
      expect(
        (await PDFDocument.load(await output.save())).getForm().getTextField('PC Name').getText(),
      ).toBe('Still editable')
    },
    30_000,
  )

  test('includes an unresolved selected companion by default but permits omitting it', async () => {
    const vm = blank()
    vm.companions = [{ name: 'Wolf', source: 'MM' }]
    expect(
      getOptionalCharacterSheetPages(vm, '2014-custom').find((page) => page.id === 'companion')
        ?.included,
    ).toBe(true)
    expect((await generate('2014-custom', undefined, vm)).getPageCount()).toBe(6)
    expect(
      (await generate('2014-custom', { companion: false, notes: false }, vm)).getPageCount(),
    ).toBe(4)
  }, 30_000)

  test('omitted spell and companion pages do not cause export warnings', () => {
    const vm = blank()
    vm.spellRows = Array.from({ length: 20 }, (_, index) => ({
      name: `Spell ${index}`,
      level: '1',
      prepared: true,
      castingTimeAndDuration: '',
      notes: '',
      concentration: false,
      ritual: false,
      material: false,
    }))
    vm.companions = [{ name: 'Wolf' }, { name: 'Bear' }]
    const readiness = {
      status: 'incomplete' as const,
      blockingIssues: [],
      recommendations: [],
      issues: [
        {
          id: 'spell-choice',
          section: 'spells' as const,
          severity: 'blocking' as const,
          title: 'Choose spells',
          explanation: 'Select spells.',
          navigationTarget: '/spells',
        },
      ],
    }
    expect(
      getPdfExportPreflight('2014-official', vm, readiness, []).issues.some((issue) =>
        issue.id.startsWith('capacity:spells'),
      ),
    ).toBe(true)
    expect(
      getPdfExportPreflight('2014-official', vm, readiness, [], {}, ['Spells 1014'], {
        spells: false,
      }).issues,
    ).toEqual([])
    expect(
      getPdfExportPreflight('2014-custom', vm, null, [], {}, [], { companion: false }).issues.some(
        (issue) => issue.id === 'capacity:companions',
      ),
    ).toBe(false)
  })
})
