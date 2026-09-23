import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import { buildClassLookup, buildSpellLookup } from '@/lib/5etools/lookups'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import { makeClassFixture, makeSpellFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const blank = () =>
  createCharacterSheetViewModel(createEmptyCharacter({ name: 'Supplement test' }), {})

describe('Tavern Born PDF supplements', () => {
  test('does not append unused pages, and allows editable blank companion and notes pages', async () => {
    expect(
      (
        await PDFDocument.load(await generateTestCharacterSheet(blank(), '2014-official'))
      ).getPageCount(),
    ).toBe(2)
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(blank(), '2014-official', {
        pages: { companion: true, notes: true },
      }),
    )
    expect(doc.getPageCount()).toBe(4)
    doc.getForm().getTextField('Companion1__companion name').setText('New familiar')
    doc.getForm().getTextField('P5.ASnotes.Notes.Left').setText('Our next adventure')
    const saved = await PDFDocument.load(await doc.save())
    expect(saved.getForm().getTextField('Companion1__companion name').getText()).toBe(
      'New familiar',
    )
    expect(saved.getForm().getTextField('P5.ASnotes.Notes.Left').getText()).toBe(
      'Our next adventure',
    )
    for (const field of saved.getForm().getFields()) {
      for (const widget of field.acroField.getWidgets()) {
        const page = saved.getPages().find((candidate) => candidate.ref === widget.P())
        expect(
          page?.node
            .Annots()
            ?.asArray()
            .some((ref) => saved.context.lookup(ref) === widget.dict),
        ).toBe(true)
        expect(widget.dict.has(PDFName.of('AP'))).toBe(true)
        if (widget.dict !== field.acroField.dict)
          expect(widget.dict.lookup(PDFName.of('Parent'))).toBe(field.acroField.dict)
      }
    }
  })

  test('fills every companion without continuation pages and reports text that does not fit', async () => {
    const vm = blank()
    vm.companions = [
      {
        name: 'Wolf',
        source: 'MM',
        creature: {
          name: 'Wolf',
          source: 'MM',
          ac: [13],
          hp: { average: 11 },
          speed: { walk: 40 },
          str: 12,
          dex: 15,
          con: 12,
          int: 3,
          wis: 12,
          cha: 6,
          size: ['M'],
          type: 'beast',
          save: { dex: '+4' },
          skill: { perception: '+3', stealth: '+4' },
          senses: ['darkvision 60 ft.'],
          immune: ['poison'],
          resist: [{ resist: ['slashing'], note: 'from nonmagical attacks' }],
          conditionImmune: ['poisoned'],
          action: [
            {
              name: 'Bite',
              entries: ['{@atk mw} {@hit 4} to hit. Hit: {@damage 2d4 + 2} piercing damage.'],
            },
          ],
          trait: [
            {
              name: 'Long history',
              entries: [`${'A long story about this companion. '.repeat(150)}THE END`],
            },
          ],
        },
      },
      { name: 'Unresolved creature', source: 'TEST' },
    ]
    const warnings: string[] = []
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2014-official', {
        onTextTruncated: (label) => warnings.push(label),
      }),
    )
    expect(doc.getPageCount()).toBe(4)
    expect(doc.getForm().getTextField('Companion1__AC').getText()).toBe('13')
    expect(doc.getForm().getTextField('Companion1__MAX HP').getText()).toBe('11')
    const form = doc.getForm()
    expect(form.getTextField('Companion1__stat.0').getText()).toBe('12')
    expect(form.getTextField('Companion1__stats modifier').getText()).toBe('+1')
    expect(form.getTextField('Companion1__saves number.1').getText()).toBe('+4')
    expect(form.getTextField('Companion1__skills.11').getText()).toBe('+3')
    expect(form.getCheckBox('Companion1__saves.1').isChecked()).toBe(true)
    expect(form.getCheckBox('Companion1__irv.0.6').isChecked()).toBe(true)
    expect(form.getCheckBox('Companion1__irv.1.2').isChecked()).toBe(false)
    expect(form.getCheckBox('Companion1__irv.2.7.1').isChecked()).toBe(true)
    expect(form.getCheckBox('Companion1__Check Box2').isChecked()).toBe(true)
    expect(form.getTextField('Companion1__Attacks.0.2.1.2.0').getText()).toBe('+4')
    expect(form.getTextField('Companion1__current hit points').getText()).toBeUndefined()
    expect(form.getTextField('Companion2__stat.0').getText()).toBeUndefined()
    // Positional contracts: score circle, large modifier box, header and damage cell.
    for (const [name, x, y] of [
      ['stat.0', 45.8, 591.8],
      ['stats modifier', 46.6, 614.4],
      ['companion.0.1', 363.8, 725.4],
      ['Attacks.0.0.2', 329.7, 385.3],
    ] as const) {
      const rect = form.getTextField(`Companion1__${name}`).acroField.getWidgets()[0].getRectangle()
      expect(Math.abs(rect.x - x)).toBeLessThan(0.1)
      expect(Math.abs(rect.y - y)).toBeLessThan(0.1)
    }
    expect(doc.getForm().getTextField('Companion2__companion name').getText()).toBe(
      'Unresolved creature',
    )
    expect(form.getFields().some((field) => field.getName().includes('Continuation'))).toBe(false)
    expect(warnings).toContain('Companion 1: Feats & Traits')
    expect(form.getTextField('Companion1__Feats & Traits').getText()).toContain('...')
    const contents = doc.getPage(2).node.Contents()
    expect(contents).toBeInstanceOf(PDFArray)
    const artwork = (contents as PDFArray)
      .asArray()
      .map((ref) => {
        const stream = doc.context.lookup(ref)
        expect(stream).toBeInstanceOf(PDFRawStream)
        return new TextDecoder().decode(decodePDFRawStream(stream as PDFRawStream).decode())
      })
      .join('\n')
    expect(artwork).toContain('0.871 0.875 0.876 rg')
    expect(artwork).toContain('0.905 0.908 0.909 rg')
    expect(artwork).not.toContain('0.157 0.103 0.12 0 k')
    form.getTextField('Companion1__companion name').setText('Edited wolf')
    const reopened = await PDFDocument.load(await doc.save())
    expect(reopened.getForm().getTextField('Companion1__companion name').getText()).toBe(
      'Edited wolf',
    )
    expect(reopened.getForm().getTextField('Companion2__companion name').getText()).toBe(
      'Unresolved creature',
    )
    const fields = reopened.getForm().getFields()
    const widgetCount = fields.reduce(
      (total, field) => total + field.acroField.getWidgets().length,
      0,
    )
    expect(widgetCount).toBe(
      reopened.getPages().reduce((total, page) => total + (page.node.Annots()?.size() ?? 0), 0),
    )
    for (const field of fields.filter((field) => field.getName().startsWith('Companion'))) {
      expect(field.acroField.dict.has(PDFName.of('TU'))).toBe(false)
      expect(field.acroField.dict.has(PDFName.of('AA'))).toBe(false)
    }
  }, 30_000)

  test('exports independent caster pages, prepared dots and separate Pact Magic slots', async () => {
    const character = createEmptyCharacter({
      classProgression: ['Wizard', 'Cleric', 'Warlock'].map((name) => ({
        name,
        source: 'PHB',
        levels: 3,
      })),
    })
    character.spells.spellProfiles = ['Wizard', 'Cleric', 'Warlock'].map((name) => ({
      id: `class:${name}|PHB`,
      type: 'class',
      label: name,
      className: name,
      classSource: 'PHB',
      cantrips: [],
      spellsKnown: ['Detect Magic|PHB'],
      preparedSpells: name === 'Wizard' ? ['Detect Magic|PHB'] : [],
    }))
    const vm = createCharacterSheetViewModel(character, {
      classesByKey: buildClassLookup([
        makeClassFixture({ name: 'Wizard', spellcastingAbility: 'int' }),
        makeClassFixture({ name: 'Cleric', spellcastingAbility: 'wis' }),
        makeClassFixture({
          name: 'Warlock',
          spellcastingAbility: 'cha',
          casterProgression: 'pact',
        }),
      ]),
      spellsByKey: buildSpellLookup([makeSpellFixture({ name: 'Detect Magic' })]),
    })
    vm.spellSlots.mergedSharedWithUsage = { 1: { max: 4, used: 1 } }
    vm.spellSlots.mergedPactWithUsage = { 2: { max: 2, used: 1 } }
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2014-custom', { pages: { notes: false } }),
    )
    const form = doc.getForm()
    expect(doc.getPageCount()).toBe(7)
    expect(form.getTextField('WotC__Spellcasting Class 2').getText()).toBe('Wizard')
    expect(form.getTextField('WotC__SpellPage2__Spellcasting Class 2').getText()).toBe('Cleric')
    expect(form.getTextField('WotC__SpellPage3__Spellcasting Class 2').getText()).toBe(
      'Warlock (Pact Magic)',
    )
    expect(form.getCheckBox('WotC__Check Box 251').isChecked()).toBe(true)
    expect(form.getCheckBox('WotC__SpellPage2__Check Box 251').isChecked()).toBe(false)
    expect(form.getTextField('WotC__SlotsTotal 19').getText()).toBe('4')
    expect(form.getTextField('WotC__SlotsRemaining 19').getText()).toBe('1')
    expect(form.getTextField('WotC__SpellPage3__SlotsTotal 19').getText()).toBeUndefined()
    expect(form.getTextField('WotC__SpellPage3__SlotsTotal 20').getText()).toBe('2')
    expect(
      getPdfExportPreflight('2014-custom', vm, null, []).issues.some(
        (issue) => issue.id === 'unsupported:pact-slots',
      ),
    ).toBe(false)
    form.getTextField('WotC__Spells 1015').setText('Edited spell')
    const reopened = await PDFDocument.load(await doc.save())
    expect(reopened.getForm().getTextField('WotC__Spells 1015').getText()).toBe('Edited spell')
    expect(reopened.getForm().getTextField('WotC__SpellPage2__Spells 1015').getText()).toContain(
      'Detect Magic',
    )
  }, 30_000)

  test('reports the official spell-page capacity for MPMB and suppresses it when omitted', () => {
    const vm = blank()
    vm.spellRows = Array.from({ length: 35 }, (_, i) => ({
      name: `Spell ${i + 1}`,
      level: '1',
      prepared: false,
      castingTimeAndDuration: '',
      notes: '',
      concentration: false,
      ritual: false,
      material: false,
    }))
    expect(
      getPdfExportPreflight('2014-custom', vm, null, []).issues.some((issue) =>
        issue.id.startsWith('capacity:spells'),
      ),
    ).toBe(true)
    expect(
      getPdfExportPreflight('2014-custom', vm, null, [], {}, [], { spells: false }).issues.some(
        (issue) => issue.id.startsWith('capacity:spells'),
      ),
    ).toBe(false)
  })
})
