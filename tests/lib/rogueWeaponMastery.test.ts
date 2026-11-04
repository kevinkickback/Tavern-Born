import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { parseItems } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { deriveWeaponActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getClassChoiceCompletionCount,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { addMulticlass, applyClassSelectionCommand } from '@/lib/character/commands/classCommands'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Class5e, ClassFeature, Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const read = (file: string) => JSON.parse(readFileSync(`resources/srd/core/data/${file}`, 'utf8'))
const { classes, classFeatures } = parseClassDocument(read('class/class-rogue.json'))
const rogue = (classes as Class5e[]).find((cls) => cls.source === 'XPHB')!
const choice = rogue.normalizedRules!.choices.find((row) => row.optionFilter?.requiresMastery)!
const itemsBase = (parseItems(read('items-base.json')) as Item5e[]).filter(
  (item) => item.source === 'XPHB',
)
const itemLookup = buildItemLookup(itemsBase)
const catalogs = buildClassChoiceFeatureCatalogs({
  classes: [rogue],
  classFeatures: classFeatures as ClassFeature[],
  itemsBase,
})
const authority = { classes: [rogue], catalogs }
const item = (name: string) => ({ entityType: 'item' as const, name, source: 'XPHB' })

function createRogue() {
  const initial = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [{ name: 'Rogue', source: 'XPHB', levels: 1 }],
  })
  const selected = applyClassSelectionCommand(
    initial,
    initial.provenance,
    rogue,
    undefined,
    itemLookup,
    {
      classChoiceFeatureCatalogs: catalogs,
    },
  )
  return { ...initial, ...selected.characterPatch, provenance: selected.provenanceUpdate }
}

test('revised Rogue uses its simple or Light-or-Finesse martial proficiency at confirmation', () => {
  const character = createRogue()
  const options = resolveClassChoiceOptions(
    choice,
    createClassChoiceCatalogs(catalogs),
    [],
    1,
    character,
  )
  expect(options).toHaveLength(19)
  expect(options.map(({ reference }) => reference.name)).toEqual(
    expect.arrayContaining([
      'Dagger',
      'Hand Crossbow',
      'Rapier',
      'Scimitar',
      'Shortsword',
      'Whip',
      'Quarterstaff',
    ]),
  )
  const apply = (name: string) =>
    applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      choice,
      [item(name)],
      authority,
    )
  expect(apply('Scimitar').characterPatch.classChoiceSelections?.[0].selected).toEqual([
    { ...item('Scimitar'), slotLevel: 1 },
  ])
  for (const invalid of ['Greatsword', 'Longbow', 'Staff', 'Wooden Staff']) {
    expect(options.some((option) => option.reference.name === invalid)).toBe(false)
    expect(() => apply(invalid)).toThrow(RangeError)
  }
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      { ...choice, optionFilter: undefined },
      [item('Greatsword')],
      authority,
    ),
  ).toThrow(RangeError)
})

test('retains exact older picks for repair and projects only current valid mastery', () => {
  const initial = createRogue()
  const equipment = ['Quarterstaff', 'Staff', 'Wooden Staff', 'Greatsword'].map((name) => ({
    ...itemsBase.find((row) => row.name === name)!,
    id: name,
    name,
    source: 'XPHB',
    quantity: 1,
    equipped: true,
  })) as Character['equipment']
  const applied = applyClassChoiceSelectionWithGrantsCommand(
    initial,
    initial.provenance,
    choice,
    [item('Quarterstaff')],
    authority,
  )
  const [selection] = applied.characterPatch.classChoiceSelections!
  const character = characterPersistenceSchema.parse({
    ...initial,
    ...applied.characterPatch,
    provenance: applied.provenanceUpdate,
    equipment: [...initial.equipment, ...equipment],
    classChoiceSelections: [
      {
        ...selection,
        selected: [...selection.selected, { ...item('Greatsword'), slotLevel: 1 }],
      },
    ],
  })
  const options = resolveClassChoiceOptions(
    choice,
    createClassChoiceCatalogs(catalogs),
    character.classChoiceSelections![0].selected,
    1,
    character,
  ).filter((option) => ['Quarterstaff', 'Greatsword'].includes(option.reference.name))
  expect(getClassChoiceCompletionCount(choice, options)).toBe(1)
  const calculation = createCharacterCalculationContext(character, {
    classesByKey: buildClassLookup([rogue]),
    classChoiceClasses: [rogue],
    classChoiceFeatureCatalogs: catalogs,
  })
  expect(
    validateClassChoices(character, calculation, createClassChoiceCatalogs(catalogs)),
  ).toContainEqual(
    expect.objectContaining({
      title: 'Finish Weapon Mastery',
      explanation: 'Rogue: choose 2 selections; 1 chosen.',
    }),
  )
  const attacks = (currentCatalogs = catalogs, activeCharacter = character) =>
    deriveWeaponActions(activeCharacter, {
      abilityModifiers: {
        strength: 0,
        dexterity: 2,
        constitution: 0,
        intelligence: 0,
        wisdom: 0,
        charisma: 0,
      },
      proficiencyBonus: 2,
      itemLookup,
      classChoiceFeatureCatalogs: currentCatalogs,
    })
  expect(
    attacks()
      .filter((attack) => attack.mastery?.length)
      .map((attack) => attack.name),
  ).toEqual(['Quarterstaff', 'Staff', 'Wooden Staff'])
  expect(attacks({ ...catalogs, itemsBase: [] }).every((attack) => !attack.mastery?.length)).toBe(
    true,
  )
  expect(attacks().find((attack) => attack.name === 'Greatsword')?.mastery).toEqual([])
  expect(
    attacks({ ...catalogs, itemsBase: itemsBase.filter((row) => row.name !== 'Staff') })
      .filter((attack) => attack.mastery?.length)
      .map((attack) => attack.name),
  ).toEqual(['Quarterstaff', 'Wooden Staff'])
  expect(
    attacks(catalogs, {
      ...character,
      classChoiceSelections: [
        selection,
        { ...selection, selected: [{ ...item('Dagger'), slotLevel: 1 }] },
      ],
    }).every((attack) => !attack.mastery?.length),
  ).toBe(true)
})

test('qualifies live class grants and suspends a conflicting mastery declaration', () => {
  const character = createRogue()
  const lightOnly = {
    ...rogue,
    startingProficiencies: {
      ...rogue.startingProficiencies,
      weapons: ['simple', 'Martial weapons that have the Light property'],
      weaponProficiencies: [
        { simple: true, all: { fromFilter: 'type=martial weapon|property=light' } },
      ],
    },
  }
  const options = (current: typeof catalogs, activeCharacter = character) =>
    resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(current),
      [],
      1,
      activeCharacter,
    ).map((option) => option.reference.name)
  const current = { ...catalogs, classes: [lightOnly] }
  expect(options(current)).toContain('Scimitar')
  expect(options(current)).toContain('Dagger')
  expect(options(current)).not.toContain('Rapier')
  expect(options(catalogs)).toContain('Rapier')
  expect(
    options(current, {
      ...character,
      proficiencies: {
        ...character.proficiencies,
        weapons: [...character.proficiencies.weapons, 'Rapier'],
      },
    }),
  ).toContain('Rapier')
  const conflicted = buildClassChoiceFeatureCatalogs({
    classes: [rogue],
    itemsBase,
    classFeatures: (classFeatures as ClassFeature[]).map((feature) =>
      feature.name === 'Weapon Mastery' ? { ...feature, sourceIdentityConflict: true } : feature,
    ),
  })
  expect(options(conflicted)).toEqual([])
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      choice,
      [item('Scimitar')],
      { ...authority, catalogs: conflicted },
    ),
  ).toThrow(RangeError)
})

test('adding Rogue as a multiclass keeps independent proficiency without adding primary weapons', () => {
  const initial = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [{ name: 'Wizard', source: 'XPHB', levels: 1 }],
  })
  initial.proficiencies.weapons = ['Dagger']
  const result = addMulticlass(initial, initial.provenance, rogue.name, rogue)
  const multiclass = { ...initial, ...result.characterPatch, provenance: result.provenanceUpdate }
  expect(multiclass.proficiencies.weapons).toEqual(['Dagger'])
  const options = resolveClassChoiceOptions(
    choice,
    createClassChoiceCatalogs(catalogs),
    [],
    1,
    multiclass,
  )
  expect(options.map((option) => option.reference.name)).toEqual(['Dagger'])
})
