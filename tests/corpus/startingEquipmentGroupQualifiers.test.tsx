// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  resolveBackgroundEquipmentBlocks,
  resolveClassEquipmentBlocks,
} from '@/lib/5etools/startingEquipment'
import { createStartingEquipmentPolicy } from '@/lib/5etools/startingEquipmentPolicy'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { resolveProficiencyChoiceCommand } from '@/lib/character/commands/featCommands'
import type { Class5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const available = [
  'data/backgrounds.json',
  'data/items.json',
  'data/items-base.json',
  'data/class/class-druid.json',
].every(existsSync)
async function loadData() {
  const read = (file: string) => JSON.parse(readFileSync(`data/${file}`, 'utf8'))
  return new FiveEToolsDataLoader(
    {
      type: 'local',
      path: 'data',
      isValid: true,
      availableResources: ['items.json', 'items-base.json', 'backgrounds.json'],
    },
    { type: 'local', readJson: async (file) => read(file) },
  ).loadAllData()
}
test.runIf(available)(
  'configured mixed groups bind exact local subsets and preserve focus through gaming changes/source restoration',
  async () => {
    const read = (file: string) => JSON.parse(readFileSync(`data/${file}`, 'utf8'))
    const data = await loadData()
    const items = [...data.items, ...data.itemsBase],
      lookup = buildGameDataLookups(data).itemLookup
    const background = data.backgrounds.find(
      (row) => row.name === 'Spellfire Initiate' && row.source === 'FRHoF',
    )!
    let character = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['XPHB', 'FRHoF', 'ABH'],
      classProgression: [],
      initialClass: undefined,
      background: '',
      backgroundSource: undefined,
    })
    const apply = (result: CharacterCommandResult) => {
      character = characterPersistenceSchema.parse({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    }
    const policy = (owner = background, raw = items) =>
      createStartingEquipmentPolicy(
        character,
        { ...owner, kind: 'background' },
        owner.startingEquipment,
        raw,
        undefined,
        {},
        true,
      )
    const slots = (owner = background, raw = items) =>
      resolveBackgroundEquipmentBlocks(
        owner.startingEquipment,
        lookup,
        character.backgroundEquipmentItemChoices,
        policy(owner, raw),
      )[0].options.a.genericChoices!
    const focus = () => slots().find((slot) => slot.token === 'Arcane Focus')!
    apply(
      applyBackgroundSelectionCommand(
        character,
        character.provenance,
        background,
        [],
        lookup,
        {},
        policy(),
      ),
    )
    expect(slots().find((slot) => slot.token === 'Gaming Set')!.candidates).toEqual([])
    expect(focus().candidates).toEqual([
      { name: 'Crystal', source: 'XPHB' },
      { name: 'Wand', source: 'XPHB' },
    ])
    const picks = { [focus().key]: [{ name: 'Crystal', source: 'XPHB' }] }
    for (const invalid of [
      { name: 'Crystal', source: 'PHB' },
      ...['Orb', 'Rod', 'Staff'].map((name) => ({ name, source: 'XPHB' })),
    ]) {
      expect(() =>
        applyBackgroundSelectionCommand(
          character,
          character.provenance,
          background,
          ['a'],
          lookup,
          { [focus().key]: [invalid] },
          policy(),
        ),
      ).toThrow()
    }
    apply(
      applyBackgroundSelectionCommand(
        character,
        character.provenance,
        background,
        ['a'],
        lookup,
        picks,
        policy(),
      ),
    )
    const physical = character.equipment.find((item) => item.name === 'Crystal')!
    const tool = character.provenance.choices.find(
      (choice) => choice.domain === 'tools' && choice.sourceTag.sourceType === 'background',
    )!
    apply(
      resolveProficiencyChoiceCommand(
        character,
        character.provenance,
        'tools',
        'Dice Set',
        true,
        tool.id,
      ),
    )
    const gaming = slots().find((slot) => slot.token === 'Gaming Set')!
    expect(gaming.candidates).toEqual([{ name: 'Dice Set', source: 'XPHB' }])
    apply(
      applyBackgroundSelectionCommand(
        character,
        character.provenance,
        background,
        ['a'],
        lookup,
        { ...picks, [gaming.key]: [{ name: 'Dice Set', source: 'XPHB' }] },
        policy(),
      ),
    )
    apply(
      resolveProficiencyChoiceCommand(
        character,
        character.provenance,
        'tools',
        'Dice Set',
        false,
        tool.id,
      ),
    )
    expect(focus().candidates).toHaveLength(2)
    apply(
      applyBackgroundSelectionCommand(
        character,
        character.provenance,
        background,
        ['a'],
        lookup,
        character.backgroundEquipmentItemChoices,
        policy(),
      ),
    )
    expect(character.equipment.find((item) => item.id === physical.id)).toEqual(physical)
    const missing = items.filter((item) => !(item.name === 'Crystal' && item.source === 'XPHB'))
    expect(
      slots(background, missing).find((slot) => slot.token === 'Arcane Focus')!.candidates,
    ).toEqual([{ name: 'Wand', source: 'XPHB' }])
    apply(
      applyBackgroundSelectionCommand(
        character,
        character.provenance,
        background,
        ['a'],
        lookup,
        character.backgroundEquipmentItemChoices,
        policy(background, missing),
      ),
    )
    expect(character.equipment.find((item) => item.id === physical.id)).toEqual(physical)
    apply(
      applyBackgroundSelectionCommand(
        character,
        character.provenance,
        background,
        ['a'],
        lookup,
        character.backgroundEquipmentItemChoices,
        policy(),
      ),
    )
    expect(character.equipment.filter((item) => item.name === 'Crystal')).toEqual([physical])
    const vampire = data.backgrounds.find(
      (row) => row.name === 'Vampire Survivor' && row.source === 'ABH',
    )!
    expect(
      resolveBackgroundEquipmentBlocks(
        vampire.startingEquipment,
        lookup,
        {},
        policy(vampire),
      )[0].options.a.genericChoices!.find((slot) => slot.token === 'Holy Symbol')!.candidates,
    ).toEqual([{ name: 'Reliquary', source: 'XPHB' }])
    const acolyte = data.backgrounds.find((row) => row.name === 'Acolyte' && row.source === 'PHB')!
    expect(
      resolveBackgroundEquipmentBlocks(acolyte.startingEquipment, lookup, {}, policy(acolyte))
        .flatMap((block) => Object.values(block.options))
        .flatMap((pkg) => pkg.genericChoices ?? [])
        .find((slot) => slot.token === 'Holy Symbol')!
        .candidates.map((item) => item.name)
        .sort(),
    ).toEqual(['Amulet', 'Emblem', 'Reliquary'])
    const druid = (parseClassDocument(read('class/class-druid.json')).classes as Class5e[]).find(
      (row) => row.name === 'Druid' && row.source === 'XPHB',
    )!
    const druidPolicy = createStartingEquipmentPolicy(
      character,
      { ...druid, kind: 'class' },
      druid.startingEquipment,
      items,
      undefined,
      {},
      true,
    )
    const unresolved = resolveClassEquipmentBlocks(
      druid.startingEquipment,
      lookup,
      {},
      druidPolicy,
    )[0].options.a.genericChoices!.find((slot) => slot.token === 'Druidic Focus')!
    expect(unresolved.candidates).toEqual([])
    expect(unresolved.diagnostic).toBeTruthy()
  },
)

test.runIf(available)(
  'configured Inheritor prefix coordinates both exact tool categories',
  async () => {
    const data = await loadData(),
      lookups = buildGameDataLookups(data),
      lookup = lookups.itemLookup,
      items = [...data.items, ...data.itemsBase]
    const background = data.backgrounds.find(
      (row) => row.name === 'Inheritor' && row.source === 'SCAG',
    )!
    let character = makeCharacterFixture({
      allowedSources: ['PHB', 'SCAG'],
      classProgression: [],
      initialClass: undefined,
      background: '',
      backgroundSource: undefined,
    })
    const policy = () =>
      createStartingEquipmentPolicy(
        character,
        { ...background, kind: 'background' },
        background.startingEquipment,
        items,
        undefined,
        lookups.itemTypeByAbbr,
      )
    const apply = (result: CharacterCommandResult) => {
      character = characterPersistenceSchema.parse({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    }
    apply(
      applyBackgroundSelectionCommand(
        character,
        character.provenance,
        background,
        [],
        lookup,
        {},
        policy(),
      ),
    )
    const tool = character.provenance.choices.find(
      (choice) => choice.domain === 'tools' && choice.sourceTag.sourceType === 'background',
    )!
    const slot = (branch: 'a' | 'b') =>
      resolveBackgroundEquipmentBlocks(background.startingEquipment, lookup, {}, policy())[1]
        .options[branch].genericChoices![0]
    const pool = (branch: 'a' | 'b') => slot(branch).candidates
    expect(pool('a')).toEqual([])
    expect(pool('b')).toEqual([])
    apply(
      resolveProficiencyChoiceCommand(
        character,
        character.provenance,
        'tools',
        'Lute',
        true,
        tool.id,
      ),
    )
    expect(character.proficiencies.tools.map((name) => name.toLowerCase())).toContain('lute')
    expect(character.provenance.choices.find((choice) => choice.id === tool.id)?.selected).toEqual([
      'Lute',
    ])
    expect(slot('b').diagnostic).toBeUndefined()
    expect(pool('a')).toEqual([])
    expect(pool('b')).toEqual([{ name: 'Lute', source: 'PHB' }])
    apply(
      resolveProficiencyChoiceCommand(
        character,
        character.provenance,
        'tools',
        'Lute',
        false,
        tool.id,
      ),
    )
    apply(
      resolveProficiencyChoiceCommand(
        character,
        character.provenance,
        'tools',
        'Dice Set',
        true,
        tool.id,
      ),
    )
    expect(pool('a')).toEqual([{ name: 'Dice Set', source: 'PHB' }])
    expect(pool('b')).toEqual([])
  },
)
