// @vitest-environment jsdom
import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { getItemRulesEntries } from '@/lib/5etools/itemTypeEntries'
import { addManualEquipmentBatchCommand } from '@/lib/character/commands/equipmentCommands'
import { renderEntriesToText } from '@/lib/entryText'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { loadMagicTemplates } from '../fixtures/magicVariantFixtures'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

test.each([
  [
    'PHB',
    '2014',
    'DMG',
    'LA',
    '{#itemEntry Armor of Resistance}',
    'You have resistance to fire damage while you wear this armor.',
  ],
  [
    'XPHB',
    '2024',
    'XDMG',
    'LA|XPHB',
    '{#itemEntry Armor of Resistance|XDMG}',
    'You have {@variantrule Resistance|XPHB} to {{getFullImmRes item.resist}} damage while you wear this armor.',
  ],
] as const)(
  'generated %s resistance armor uses the shared item consumers',
  async (baseSource, originSystem, source, type, include, rules) => {
    const classic = originSystem === '2014'
    const edition = classic ? 'classic' : 'one'
    const publicFlag = classic ? { srd: true } : { srd52: true }
    const base = {
      name: 'Leather Armor',
      source: baseSource,
      edition,
      type,
      armor: true,
      rarity: 'none',
      ...publicFlag,
      ac: 11,
      weight: 10,
    }
    const template = {
      name: 'Armor of Fire Resistance',
      type: `GV|${source}`,
      ...(classic ? { edition } : {}),
      requires: [classic ? { armor: true } : { type }],
      inherits: {
        source,
        ...publicFlag,
        nameSuffix: ' of Fire Resistance',
        rarity: 'rare',
        reqAttune: true,
        resist: ['fire'],
        entries: [include],
      },
    }
    const support = {
      baseitem: [base],
      itemEntry: [
        {
          name: 'Armor of Resistance',
          source,
          entriesTemplate: [source === 'DMG' ? rules.replace('fire', '{{item.resist}}') : rules],
        },
      ],
    }
    const data = await loadMagicTemplates([template], [], support)
    const item = data.items.find((row) => row.name === 'Leather Armor of Fire Resistance')!
    expect(item).toMatchObject({
      source,
      ac: 11,
      weight: 10,
      reqAttune: true,
      resist: ['fire'],
      startingEquipmentCategory: 'Other',
      magicVariantGenerated: {
        base: { name: base.name, source: baseSource },
        template: { name: template.name, source },
      },
    })
    expect(renderEntriesToText(getItemRulesEntries(item))).toMatch(/while you wear this armor/i)
    expect(renderEntriesToText(getItemRulesEntries(item))).toMatch(/fire damage/i)
    const actor = makeCharacterFixture({ originSystem, equipment: [] })
    const { characterPatch, provenanceUpdate } = addManualEquipmentBatchCommand(
      actor,
      actor.provenance,
      [item],
    )
    const [equipment] = characterPatch.equipment!
    const saved = (equipped: boolean, attuned: boolean) =>
      characterPersistenceSchema.parse(
        JSON.parse(
          JSON.stringify({
            ...actor,
            provenance: provenanceUpdate,
            equipment: [{ ...equipment, equipped, attuned }],
          }),
        ),
      )
    const view = (equipped: boolean, attuned: boolean) =>
      createCurrentCharacterSheetViewModel(saved(equipped, attuned), data.lookups!)
    expect(view(true, true).defensiveTraits).toContain('fire resistance')
    expect(view(true, false).defensiveTraits).not.toContain('fire resistance')
    expect(view(false, true).defensiveTraits).not.toContain('fire resistance')
    expect(view(true, true).effectiveArmorClass).toBe(view(true, false).effectiveArmorClass)
    const active = saved(true, true)
    const shadow = await loadMagicTemplates([], [], { baseitem: [{ ...base, ac: '11' }] })
    const missing = composeGameDataLayers([data, shadow])
    expect(missing.items.some((row) => row.name === item.name)).toBe(false)
    const missingView = createCurrentCharacterSheetViewModel(active, missing.lookups!)
    expect(missingView.defensiveTraits).not.toContain('fire resistance')
    expect(missingView.effectiveArmorClass).toBe(view(true, true).effectiveArmorClass)
    const restored = composeGameDataLayers([
      data,
      shadow,
      await loadMagicTemplates([], [], { baseitem: [base] }),
    ])
    expect(
      createCurrentCharacterSheetViewModel(active, restored.lookups!).defensiveTraits,
    ).toContain('fire resistance')

    const explicit = { ...item, resist: ['cold'] }
    const explicitData = await loadMagicTemplates([template], [explicit], support)
    const winner = explicitData.items.find((row) => row.name === item.name)
    expect(winner?.resist).toEqual(['cold'])
    expect(winner?.magicVariantGenerated).toBeUndefined()

    const rejected = await loadMagicTemplates(
      [template, { ...template, inherits: { ...template.inherits, resist: ['cold'] } }],
      [],
      support,
    )
    expect(rejected.items.some((row) => row.name === item.name)).toBe(false)

    const wrongFragment = await loadMagicTemplates(
      [
        {
          ...template,
          inherits: {
            ...template.inherits,
            entries: [
              classic
                ? '{#itemEntry Armor of Resistance|XDMG}'
                : '{#itemEntry Armor of Resistance}',
            ],
          },
        },
      ],
      [],
      support,
    )
    expect(wrongFragment.items.some((row) => row.name === item.name)).toBe(false)

    if (classic) {
      const bytes = await generateTestCharacterSheet(view(true, true), '2014-custom', {
        pages: { notes: false, spells: false },
      })
      const form = (await PDFDocument.load(bytes)).getForm()
      expect(form.getDropdown('Resistance Damage Type 1').getSelected()).toEqual([
        'fire resistance',
      ])
    }
  },
  15000,
)
