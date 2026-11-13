// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { PDFDocument } from '@cantoo/pdf-lib'
import { clear, get, set } from 'idb-keyval'
import { expect, test, vi } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  createStartingEquipmentPolicy,
  getStartingEquipmentCandidates,
} from '@/lib/5etools/startingEquipmentPolicy'
import { deriveWeaponActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  resolveClassChoiceOptionEntity,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { applyClassSelectionCommand } from '@/lib/character/commands/classCommands'
import {
  addManualEquipmentBatchCommand,
  removeManualEquipmentCommand,
} from '@/lib/character/commands/equipmentCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { readGameDataCache, writeGameDataCache } from '@/lib/storage/dataCache'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e, ClassFeature, Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { loadMagicTemplates } from '../fixtures/magicVariantFixtures'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

vi.unmock('@/lib/storage/idb-storage')

const read = (file: string) => JSON.parse(readFileSync(`resources/srd/data/${file}`, 'utf8'))
const items = read('items-base.json')
const bases = (items.baseitem as Item5e[]).filter((row) => ['Rapier', 'Dagger'].includes(row.name))
const templates = [
  { source: 'DMG', bonus: 1, edition: 'classic', srd: true, excludes: { net: true } },
  { source: 'XDMG', bonus: 2, srd52: true },
].map(({ source, bonus, edition, srd, srd52, excludes }) => ({
  name: `+${bonus} Weapon`,
  type: `GV|${source}`,
  edition,
  requires: [{ weapon: true }],
  excludes,
  inherits: {
    namePrefix: `+${bonus} `,
    source,
    srd,
    srd52,
    rarity: 'uncommon',
    bonusWeapon: `+${bonus}`,
    entries: ['Gain {=bonusWeapon} to attack and damage with this weapon.'],
  },
}))
const load = (
  variants: unknown[] = templates,
  baseitem: unknown[] = bases,
  concrete: Item5e[] = [],
  other: Item5e[] = [],
) => loadMagicTemplates(variants, concrete, { baseitem, item: other, itemType: items.itemType })

test('fixed weapons require an exact winning base and keep explicit equipment and cached authority', async () => {
  const original = await load()
  expect(original.items.filter((row) => row.magicVariantGenerated)).toHaveLength(4)
  const rapier = bases.find((row) => row.name === 'Rapier' && row.source === 'PHB')!
  const generated = original.items.find((row) => row.name === '+1 Rapier')!
  const explicit = {
    ...rapier,
    name: '+1 Rapier',
    source: 'DMG',
    bonusWeapon: '+3',
    magicVariantGenerated: generated.magicVariantGenerated,
  }
  const overlay = await load([], [{ ...rapier, weapon: false }], [explicit])
  const composed = composeGameDataLayers([original, overlay])
  expect(composed.items.find((row) => row.name === '+1 Rapier')).toMatchObject({
    bonusWeapon: '+3',
  })
  expect(
    composed.items.find((row) => row.name === '+1 Rapier')?.magicVariantGenerated,
  ).toBeUndefined()
  const occupied = await load(templates, bases, [explicit])
  expect(occupied.items.filter((row) => row.name === '+1 Rapier')).toEqual([
    expect.objectContaining({ source: 'DMG', bonusWeapon: '+3' }),
  ])
  expect(
    occupied.items.find((row) => row.name === '+1 Rapier')?.magicVariantGenerated,
  ).toBeUndefined()
  for (const replacement of [
    await load([], [{ ...rapier, weapon: false }]),
    await load([], [rapier, rapier]),
    await load([], [], [], [rapier]),
    await load([], [], [rapier]),
  ]) {
    expect(
      composeGameDataLayers([original, replacement]).items.some((row) => row.name === '+1 Rapier'),
    ).toBe(false)
  }
  const crossFileCollision = await load(templates, bases, [rapier])
  expect(crossFileCollision.items.some((row) => row.name === '+1 Rapier')).toBe(false)
  expect(
    composeGameDataLayers([crossFileCollision]).items.some((row) => row.name === '+1 Rapier'),
  ).toBe(false)
  expect(
    (await load(templates, [], [], [rapier])).items.some((row) => row.magicVariantGenerated),
  ).toBe(false)
  expect(
    (await load([{ ...templates[0], requires: [{ weapon: true, axe: true }] }])).items.some(
      (row) => row.magicVariantGenerated,
    ),
  ).toBe(false)
  expect(
    (
      await load([{ ...templates[0], inherits: { ...templates[0].inherits, bonusWeapon: '+2' } }])
    ).items.some((row) => row.magicVariantGenerated),
  ).toBe(false)

  await clear()
  await writeGameDataCache(original, { type: 'local', path: '/weapon-test', isValid: true })
  const cached = await readGameDataCache()
  expect(
    composeGameDataLayers([cached!.data]).items.filter((row) => row.magicVariantGenerated),
  ).toHaveLength(4)
  const key = 'tb:game-data-cache'
  await set(key, { ...cached, cacheSchemaVersion: 99 })
  expect(await readGameDataCache()).toBeNull()
})

test.each([
  {
    book: 'PHB',
    originSystem: '2014',
    weapon: '+1 Rapier',
    printing: 'DMG',
    bonus: 1,
    base: 'Rapier',
    expectedDamage: '1d8 + 4',
    pdf: '2014-official',
  },
  {
    book: 'XPHB',
    originSystem: '2024',
    weapon: '+2 Dagger',
    printing: 'XDMG',
    bonus: 2,
    base: 'Dagger',
    expectedDamage: '1d4 + 5',
    pdf: '2024-official',
  },
] as const)('equips, reopens and exports $weapon with its source-derived weapon kind', async ({
  book,
  originSystem,
  weapon,
  printing,
  bonus,
  base,
  expectedDamage,
  pdf,
}) => {
  await clear()
  await useCharacterStore.persist.rehydrate()
  await useCharacterStore.getState().setCharacters([])
  const data = await load()
  const { classes, classFeatures } = parseClassDocument(read('class/class-rogue.json'))
  const rogue = (classes as Class5e[]).find((row) => row.source === book)!
  const catalogs = buildClassChoiceFeatureCatalogs({
    ...data,
    classes: [rogue],
    classFeatures: classFeatures as ClassFeature[],
  })
  const item = data.items.find((row) => row.name === weapon && row.source === printing)!
  const lookups = { ...data.lookups!, classChoiceFeatureCatalogs: catalogs }
  expect(
    resolveClassChoiceOptionEntity(
      { entityType: 'item', name: weapon, source: printing },
      createClassChoiceCatalogs(catalogs),
    ),
  ).toBe(item)
  const fixture = makeCharacterFixture({
    originSystem,
    allowedSources: [book],
    equipment: [],
    classProgression: [{ name: 'Rogue', source: book, levels: 1 }],
  })
  fixture.abilityScores.dexterity = 16
  let character = applyCharacterCommandResult(
    fixture,
    applyClassSelectionCommand(fixture, fixture.provenance, rogue, undefined, lookups.itemLookup, {
      classChoiceFeatureCatalogs: catalogs,
    }),
  )
  if (originSystem === '2024') {
    const mastery = rogue.normalizedRules!.choices.find((row) => row.optionFilter?.requiresMastery)!
    character = applyCharacterCommandResult(
      character,
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        mastery,
        [{ entityType: 'item', name: base, source: book }],
        { classes: [rogue], catalogs },
      ),
    )
  } else {
    const fighter = (
      parseClassDocument(read('class/class-fighter.json')).classes as Class5e[]
    ).find((row) => row.source === book)!
    const policy = createStartingEquipmentPolicy(
      character,
      { ...fighter, kind: 'class' },
      fighter.startingEquipment,
      [...data.itemsBase, item],
      undefined,
      catalogs.itemTypeByAbbr,
    )
    const candidates = getStartingEquipmentCandidates(policy, 1, 'weaponMartial', undefined, {
      option: 'a',
      entry: 0,
    })
    expect(candidates.candidates.map((row) => row.name)).toContain(base)
    expect(candidates.candidates.map((row) => row.name)).not.toContain(weapon)
  }
  character = await useCharacterStore.getState().addCharacter(character)
  useCharacterStore.getState().setActiveCharacter(character.id)
  const added = addManualEquipmentBatchCommand(character, character.provenance, [item])
  const equipped = added.characterPatch.equipment!.map((row) => ({ ...row, equipped: true }))
  useCharacterStore
    .getState()
    .updateCharacter(character.id, { equipment: equipped, provenance: added.provenanceUpdate })
  await useCharacterStore.getState().saveActiveCharacter()
  const stored = await get<{ state: { characters: Character[] } }>('character-storage')
  const saved = characterPersistenceSchema.parse(stored!.state.characters[0])
  const savedWeapon = saved.equipment.find((row) => row.name === weapon && row.source === printing)!
  expect(savedWeapon.equipped).toBe(true)
  expect(savedWeapon).not.toHaveProperty('magicVariantGenerated')
  useCharacterStore.getState().setActiveCharacter(null)
  await useCharacterStore.persist.rehydrate()
  useCharacterStore.getState().setActiveCharacter(character.id)
  expect(useCharacterStore.getState().activeCharacter).toEqual(saved)

  const action = (rawLookups: typeof lookups) => {
    const context = createCharacterCalculationContext(saved, rawLookups, rawLookups)
    return deriveWeaponActions(context.character, {
      abilityModifiers: context.abilityScores.modifiers,
      proficiencyBonus: 2,
      itemLookup: rawLookups.itemLookup,
      effects: context.effects.declarations,
      effectContext: context.effects.resolutionContext,
      classChoiceFeatureCatalogs: catalogs,
    }).find((row) => row.id === `weapon:${savedWeapon.id}`)!
  }
  expect(action(lookups)).toMatchObject({
    name: weapon,
    proficient: true,
    attackBonus: 5 + bonus,
    damage: [{ bonus: 3 + bonus, damageType: 'P' }],
  })
  if (originSystem === '2024')
    expect(action(lookups).mastery).toEqual([{ name: 'Nick', source: 'XPHB' }])
  const missing = {
    ...lookups,
    itemLookup: new Map([...lookups.itemLookup].filter(([, row]) => row !== item)),
  }
  expect(action(missing).attackBonus).toBe(originSystem === '2014' ? 3 : 5)
  expect(action(missing).mastery).toEqual([])
  expect(action(lookups).attackBonus).toBe(5 + bonus)

  const view = createCurrentCharacterSheetViewModel(saved, lookups)
  const weaponIndex = view.weaponRows.findIndex((row) => row.id === `weapon:${savedWeapon.id}`)
  expect(view.weaponRows[weaponIndex]).toMatchObject({
    name: weapon,
    attackBonus: `+${5 + bonus}`,
    damage: expectedDamage,
  })
  const form = (await PDFDocument.load(await generateTestCharacterSheet(view, pdf))).getForm()
  const classicFields = [
    ['Wpn Name', 'Wpn1 AtkBonus', 'Wpn1 Damage'],
    ['Wpn Name 2', 'Wpn2 AtkBonus ', 'Wpn2 Damage '],
    ['Wpn Name 3', 'Wpn3 AtkBonus  ', 'Wpn3 Damage '],
  ]
  const fieldNames =
    originSystem === '2014'
      ? classicFields[weaponIndex]
      : [61, 67, 73].map((field) => `Text_${field + weaponIndex}`)
  expect(fieldNames.map((field) => form.getTextField(field).getText())).toEqual([
    weapon,
    `+${5 + bonus}`,
    expect.stringContaining(expectedDamage),
  ])
  if (originSystem === '2024')
    expect(form.getTextField(`Text_${79 + weaponIndex}`).getText()).toContain('Nick')
  expect(
    removeManualEquipmentCommand(saved, saved.provenance, savedWeapon.id).characterPatch.equipment,
  ).toEqual(saved.equipment.filter((row) => row.id !== savedWeapon.id))
}, 30_000)
