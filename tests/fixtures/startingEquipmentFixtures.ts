import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import { applyClassSelectionCommand } from '@/lib/character/commands/classCommands'
import { addManualEquipmentBatchCommand } from '@/lib/character/commands/equipmentCommands'
import type { Background5e, Class5e, Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from './characterFixtures'

/** Synthetic declarations exercise the shared UI without redistributing configured rule sources. */
export function makeStartingEquipmentScenario() {
  const filter = '{@filter martial weapons|items|source=phb|category=basic|type=martial weapon}'
  const cls = {
    name: 'Fighter',
    source: 'PHB',
    hd: { number: 1, faces: 10 },
    classFeatures: ['Combat Training|Fighter|PHB|1|PHB'],
    proficiency: ['str', 'con'],
    startingEquipment: {
      default: [filter, 'Choose a travel supply.'],
      defaultData: [
        {
          a: [{ equipmentType: 'weaponMartial', quantity: 2 }],
          b: [{ value: 5000 }],
          _: [{ item: 'Dagger|PHB', quantity: 2 }],
        },
        { a: ['Rope|PHB'], b: ['Torch|PHB'] },
      ],
    },
  } as Class5e
  const background = {
    name: 'Quartermaster',
    source: 'PHB',
    entries: [{ type: 'entries', name: 'Equipment:', entries: [filter] }],
    startingEquipment: [
      { a: [{ equipmentType: 'weaponMartial', quantity: 2 }], b: [{ value: 1000 }] },
    ],
  } as Background5e
  const base = [
    {
      name: 'Longsword',
      type: 'M',
      weaponCategory: 'martial',
      dmg1: '1d8',
      weight: 3,
      value: 1500,
      entries: [
        'Practice fixture rules.',
        'This longer equipment description includes handling, storage, maintenance and use. It continues past the short preview length so the starting picker must show the complete supplied text. The second paragraph remains readable directly in the item card.',
      ],
    },
    {
      name: 'Warhammer',
      type: 'M',
      weaponCategory: 'martial',
      dmg1: '1d8',
      weight: 2,
      value: 1500,
    },
    { name: 'Dagger', type: 'M', weaponCategory: 'simple', dmg1: '1d4' },
    { name: 'Rope', type: 'G', weight: 10 },
    { name: 'Torch', type: 'G', weight: 1 },
    ...Array.from({ length: 40 }, (_, index) => ({
      name: `Training Blade ${String(index).padStart(2, '0')}`,
      type: 'M',
      weaponCategory: 'martial',
    })),
  ].map((item) => ({ ...item, source: 'PHB', startingEquipmentCategory: 'Basic' })) as Item5e[]
  const magic = {
    name: 'Enchanted Sword',
    source: 'PHB',
    type: 'M',
    weaponCategory: 'martial',
    rarity: 'rare',
    startingEquipmentCategory: 'Other',
  } as Item5e
  const data = {
    ...createEmptyGameData(),
    classes: [cls],
    classFeatures: [
      {
        name: 'Combat Training',
        className: 'Fighter',
        classSource: 'PHB',
        source: 'PHB',
        level: 1,
        entries: ['Training fixture.'],
      },
    ],
    backgrounds: [background],
    itemsBase: base,
    items: [magic],
    sources: [
      {
        name: 'Test source',
        abbreviation: 'PHB',
        hasCharacterOptions: true,
        group: 'other' as const,
      },
    ],
  }
  const lookup = buildItemLookup([...base, magic])
  let character = makeCharacterFixture({
    name: 'Starting Equipment Hero',
    originSystem: '2014',
    allowedSources: ['PHB'],
    classProgression: [],
    initialClass: undefined,
    race: '',
    raceSource: undefined,
    background: '',
    backgroundSource: undefined,
  })
  const apply = (result: {
    characterPatch: Partial<Character>
    provenanceUpdate: Character['provenance']
  }) => {
    character = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  character.currency = { cp: 0, sp: 0, ep: 0, gp: 5, pp: 0 }
  apply(
    addManualEquipmentBatchCommand(character, character.provenance, [
      base.find((item) => item.name === 'Dagger')!,
    ]),
  )
  apply(applyClassSelectionCommand(character, character.provenance, cls, undefined, lookup))
  apply(applyBackgroundSelectionCommand(character, character.provenance, background, [], lookup))
  return { character, data }
}
