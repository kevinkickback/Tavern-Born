// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { getClassChoiceSlotLevels } from '@/lib/5etools/classChoiceNormalization'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  deriveMonkSubclassSenses,
  getElementalDisciplineSpells,
  getMonkSubclassResources,
} from '@/lib/5etools/monkSubclassRules'
import { parseItems, parseOptionalFeatures } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { prepareToolProficiencySources } from '@/lib/5etools/toolProficiencySource'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  getEarnedFixedClassChoiceOptions,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { getClassProficiencyWorkflow } from '@/lib/character/classProficiencyWorkflow'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, GameData, OptionalFeatureLike } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const configured = 'data/class/class-monk.json'
const bundled = 'resources/srd/data/class/class-monk.json'
const configuredTest = test.skipIf(!existsSync(configured))
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const parse = (document: unknown) => {
  const data = parseClassDocument(document)
  return {
    classes: data.classes as Class5e[],
    classFeatures: data.classFeatures as GameData['classFeatures'],
  }
}
const monk = (classes: Class5e[], source: string) => classes.find((row) => row.source === source)!
const entry = (
  source: string,
  subclass: string,
  subclassSource: string,
  levels: number,
): CharacterClassEntry => ({ name: 'Monk', source, subclass, subclassSource, levels })
const actor = (owner: CharacterClassEntry) =>
  createEmptyCharacter({
    name: 'Monk journey',
    classProgression: [owner],
    originSystem: owner.source === 'PHB' ? '2014' : '2024',
    allowedSources: [owner.source, owner.subclassSource!],
  })

test('Included SRD Open Hand distinguishes the classic rest effect from an ordinary prepared spell', () => {
  const { classes } = parse(read(bundled))
  const classic = (level: number) =>
    getEarnedSubclassSpellGrants(
      monk(classes, 'PHB'),
      entry('PHB', 'Way of the Open Hand', 'PHB', level),
    )
  expect(classic(10)).toEqual([])
  expect(classic(11)).toMatchObject([
    {
      spellName: 'sanctuary|PHB',
      level: 11,
      mode: 'cast-only',
      castOnly: { castingTime: 'End of Long Rest' },
    },
  ])
  expect(
    getEarnedSubclassSpellGrants(
      monk(classes, 'XPHB'),
      entry('XPHB', 'Warrior of the Open Hand', 'XPHB', 20),
    ),
  ).toEqual([])
  const owner = entry('XPHB', 'Warrior of the Open Hand', 'XPHB', 6)
  expect(getMonkSubclassResources(actor(owner), owner, classes, 3, 3)).toMatchObject([
    {
      label: 'Wholeness of Body',
      maxPerLevel: [0, 0, 0, 0, 0, ...Array(15).fill(3)],
      restType: 'long',
    },
  ])
})

test.each([
  'PHB',
  'XPHB',
])('Included %s Monk applies earned base rules and retracts them on level loss', (source) => {
  const spells = (
    read('resources/srd/data/spells/spells-phb.json').spell as GameData['spells']
  ).filter((spell) => spell.name.toLowerCase() === 'astral projection')
  expect(spells).toHaveLength(1)
  const monks = parse(read(bundled))
  const barbarians = parse(read('resources/srd/data/class/class-barbarian.json'))
  const data = makeGameDataFixture({
    classes: [...monks.classes, ...barbarians.classes],
    classFeatures: [...monks.classFeatures, ...barbarians.classFeatures],
    spells,
  })
  const lookups = buildGameDataLookups(data)
  const inputs = {
    ...lookups,
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
  const make = (levels: number) =>
    createEmptyCharacter({
      name: 'Base Monk',
      originSystem: source === 'PHB' ? '2014' : '2024',
      allowedSources: [source],
      classProgression: [{ name: 'Monk', source, levels }],
      abilityScores: {
        strength: 10,
        dexterity: 21,
        constitution: 12,
        intelligence: 10,
        wisdom: 20,
        charisma: 10,
      },
      movement: { speeds: { walk: 30 }, source: { kind: 'manual', name: 'Walking speed' } },
    })
  const calculate = (level: number) =>
    createCharacterCalculationContext(make(level), inputs, lookups)
  const sheet = (level: number) => createCharacterSheetViewModel(make(level), lookups, inputs)
  expect(sheet(1).effectiveArmorClass).toBe(20)
  expect(calculate(5).movement.speeds.walk).toBe(40)
  expect(calculate(6).movement.speeds.walk).toBe(45)
  expect(calculate(13).character.proficiencies.savingThrows).toEqual([])
  const earned = calculate(14).character
  expect(earned.proficiencies.savingThrows).toHaveLength(6)
  expect(
    createCharacterCalculationContext(
      { ...earned, classProgression: [{ ...earned.classProgression[0], levels: 13 }] },
      inputs,
      lookups,
    ).character.proficiencies.savingThrows,
  ).toEqual([])
  const withShield = make(6)
  withShield.equipment = [
    { id: 'shield', name: 'Shield', type: 'S', quantity: 1, equipped: true, ac: 2 },
  ]
  expect(createCharacterSheetViewModel(withShield, lookups, inputs).effectiveArmorClass).toBe(17)
  expect(createCharacterCalculationContext(withShield, inputs, lookups).movement.speeds.walk).toBe(
    30,
  )
  if (source === 'PHB') {
    const multiclass = make(1)
    const primary = multiclass.classProgression[0]
    const barbarian = { name: 'Barbarian', source: 'PHB', levels: 1 }
    expect(
      createCharacterSheetViewModel(
        { ...multiclass, classProgression: [barbarian, primary] },
        lookups,
        inputs,
      ).effectiveArmorClass,
    ).toBe(16)
    expect(
      createCharacterSheetViewModel(
        { ...multiclass, classProgression: [primary, barbarian] },
        lookups,
        inputs,
      ).effectiveArmorClass,
    ).toBe(20)
    expect(sheet(17).spellRows).toEqual([])
    expect(sheet(18).spellRows).toContainEqual(
      expect.objectContaining({
        name: 'Astral Projection',
        prepared: false,
        castOnly: true,
        components: 'V, S',
      }),
    )
    expect(sheet(18).featuresSummary).toContain('You cannot take other creatures with you.')
  } else {
    expect(calculate(19).abilityScores.total).toMatchObject({ dexterity: 21, wisdom: 20 })
    expect(calculate(20).abilityScores.total).toMatchObject({ dexterity: 25, wisdom: 24 })
    expect(sheet(1).classResourceRows.map((row) => row.label)).not.toContain('Uncanny Metabolism')
    expect(sheet(2).classResourceRows).toContainEqual(
      expect.objectContaining({ label: 'Uncanny Metabolism', max: 1 }),
    )
  }
})

configuredTest(
  'Four Elements earns its fixed discipline and keeps elective prerequisites at the saved gain',
  () => {
    const document = read(configured)
    const options = read('data/optionalfeatures.json')
    const original = parse(document)
    const klass = monk(original.classes, 'PHB')
    const subclass = klass.subclasses?.find((row) => row.shortName === 'Four Elements')
    if (!subclass) throw new Error('Expected classic Four Elements')
    const optionalfeatures = parseOptionalFeatures(options) as OptionalFeatureLike[]
    const catalogs = buildClassChoiceFeatureCatalogs({ ...original, optionalfeatures })
    const choices = getClassChoiceCandidates(klass, subclass, catalogs)
    const choice = choices.find((row) => row.label === 'Elemental Disciplines')!
    expect(getClassChoiceSlotLevels(choice)).toEqual([3, 6, 11, 17])
    expect(getEarnedFixedClassChoiceOptions(choice, catalogs, 2)).toEqual([])
    expect(getEarnedFixedClassChoiceOptions(choice, catalogs, 3)).toMatchObject([
      { level: 3, name: 'Elemental Attunement', source: 'PHB' },
    ])
    expect(choice.options.map((row) => row.name)).not.toContain('Elemental Attunement')
    const character = actor(entry('PHB', subclass.name, subclass.source, 17))
    const views = (level: number) =>
      resolveClassChoiceOptions(choice, createClassChoiceCatalogs(catalogs), [], level)
    const early = views(3).find((row) => row.reference.name === 'Fist of Four Thunders')!
    const late = views(17).find((row) => row.reference.name === 'Breath of Winter')!
    expect(views(3).find((row) => row.reference.name === late.reference.name)).toMatchObject({
      availability: 'retained',
      minimumClassLevel: 17,
    })
    expect(early.availability).toBe('eligible')
    const pick = (before: Character, option: typeof early.reference, level: number) => {
      const previous = before.classChoiceSelections?.[0]
      const result = applyClassChoiceSelectionWithGrantsCommand(
        before,
        before.provenance,
        choice,
        [option],
        { catalogs, classes: original.classes },
        undefined,
        previous ? getOptionalPoolSelectionHandle(previous) : '',
        level,
      )
      return characterPersistenceSchema.parse({
        ...before,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    }
    expect(() => pick(character, late.reference, 3)).toThrow(/prerequisites/)
    const selected = pick(pick(character, early.reference, 3), late.reference, 17)
    expect(selected.classChoiceSelections?.[0].selected.map((row) => row.slotLevel)).toEqual([
      3, 17,
    ])
    const spellsByKey = {
      'thunderwave|phb': { name: 'Thunderwave', source: 'PHB', level: 1 },
      'cone of cold|phb': { name: 'Cone of Cold', source: 'PHB', level: 5 },
    } as unknown as Record<string, GameData['spells'][number]>
    const projection = projectManagedClassSpellState(selected, { catalogs, spellsByKey })
    expect(projection.fixedClassSpellStatuses).toMatchObject([
      {
        reference: 'thunderwave|PHB',
        level: 3,
        active: true,
        prepared: false,
        castOnly: { ignoresMaterial: true },
        castingNote: expect.stringContaining('2 Ki'),
      },
      {
        reference: 'cone of cold|PHB',
        level: 17,
        active: true,
        prepared: false,
        castingNote: expect.stringContaining('6 Ki'),
      },
    ])
    expect(
      projectManagedClassSpellState(selected, {
        catalogs,
        spellsByKey: { 'thunderwave|phb': spellsByKey['thunderwave|phb'] },
      }).fixedClassSpellStatuses,
    ).toContainEqual(
      expect.objectContaining({
        reference: 'cone of cold|PHB',
        active: false,
        prepared: false,
      }),
    )
    const missingAttunement = {
      ...catalogs,
      optionalFeatures: optionalfeatures.filter((row) => row.name !== 'Elemental Attunement'),
    }
    expect(getEarnedFixedClassChoiceOptions(choice, missingAttunement, 3)).toEqual([])
    const changed = structuredClone(
      optionalfeatures.find((row) => row.name === early.reference.name)!,
    )
    ;(changed.additionalSpells?.[0].innate?._ as { resource: Record<string, string[]> }).resource =
      { 3: ['thunderwave'] }
    expect(getElementalDisciplineSpells(changed, 3, choice, original.classes)).toBeUndefined()
    changed.entries = ['You can spend 3 ki points to cast {@spell thunderwave}.']
    expect(
      getElementalDisciplineSpells(changed, 3, choice, original.classes)?.[0].feature?.castingNote,
    ).toContain('3 Ki')
    const contradictory = structuredClone(options)
    contradictory.optionalfeature.find(
      (row: { name: string }) => row.name === late.reference.name,
    ).prerequisite[0].level.level = 6
    const contradictoryOptions = buildClassChoiceFeatureCatalogs({
      ...original,
      optionalfeatures: parseOptionalFeatures(contradictory),
    })
    expect(
      resolveClassChoiceOptions(
        choice,
        createClassChoiceCatalogs(contradictoryOptions),
        [],
        6,
      ).find((row) => row.reference.name === late.reference.name)?.availability,
    ).toBe('retained')
    const rawRoot = document.subclass.find(
      (row: { name: string; classSource: string }) =>
        row.name === subclass.name && row.classSource === 'PHB',
    )
    rawRoot.optionalfeatureProgression[0].progression[8] =
      rawRoot.optionalfeatureProgression[0].progression[6]
    delete rawRoot.optionalfeatureProgression[0].progression[6]
    const disciplineList = document.subclassFeature.find(
      (row: { name: string }) => row.name === 'Elemental Disciplines',
    )
    disciplineList.entries[1].entries.push({
      type: 'refOptionalfeature',
      optionalfeature: 'Stormglass Technique',
    })
    const variant = parse(document)
    const changedClass = monk(variant.classes, 'PHB')
    const changedSubclass = changedClass.subclasses?.find((row) => row.name === subclass.name)
    const newDiscipline = {
      name: 'Stormglass Technique',
      source: 'PHB',
      featureType: ['ED'],
      entries: ['Shape loose glass into a harmless sculpture.'],
    }
    const changedCatalogs = buildClassChoiceFeatureCatalogs({
      ...variant,
      optionalfeatures: [...optionalfeatures, newDiscipline],
    })
    const changedChoice = getClassChoiceCandidates(
      changedClass,
      changedSubclass,
      changedCatalogs,
    ).find((row) => row.id === choice.id)
    if (!changedChoice) throw new Error('Expected altered discipline progression')
    expect(getClassChoiceSlotLevels(changedChoice)).toEqual([3, 8, 11, 17])
    const novel = resolveClassChoiceOptions(
      changedChoice,
      createClassChoiceCatalogs(changedCatalogs),
      [],
      8,
    ).find((row) => row.reference.name === newDiscipline.name)
    expect(novel?.availability).toBe('eligible')
    if (!novel) throw new Error('Expected the new source discipline')
    const result = applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      changedChoice,
      [novel.reference],
      { classes: variant.classes, catalogs: changedCatalogs },
      undefined,
      '',
      8,
    )
    const saved = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
    expect(saved.classChoiceSelections?.[0].selected).toMatchObject([
      { name: newDiscipline.name, slotLevel: 8 },
    ])
    expect(
      resolveClassChoiceOptions(
        changedChoice,
        createClassChoiceCatalogs({ ...changedCatalogs, optionalFeatures: optionalfeatures }),
        saved.classChoiceSelections?.[0].selected,
        8,
      ),
    ).toContainEqual(
      expect.objectContaining({ availability: 'retained', reference: novel.reference }),
    )
  },
)

configuredTest(
  'Monk printings retain exact casting modes, fixed training, language choices, and later senses',
  () => {
    const data = parse(read(configured))
    const tools = ['data/items.json', 'data/items-base.json'].flatMap((file) =>
      (parseItems(read(file)) as GameData['items']).filter((row) =>
        ['herbalism kit', "brewer's supplies"].includes(row.name.toLowerCase()),
      ),
    )
    const catalogs = buildClassChoiceFeatureCatalogs({
      ...data,
      items: prepareToolProficiencySources(tools, tools),
      languages: [
        { name: 'Draconic', source: 'PHB' },
        { name: 'Dwarvish', source: 'PHB' },
      ],
    })
    for (const [source, subclass, printing, level, count] of [
      ['PHB', 'Way of Shadow', 'PHB', 3, 5],
      ['XPHB', 'Warrior of Shadow', 'XPHB', 3, 2],
      ['PHB', 'Way of the Sun Soul', 'XGE', 6, 1],
      ['XPHB', 'Way of the Sun Soul', 'XGE', 6, 1],
      ['XPHB', 'Warrior of the Elements', 'XPHB', 3, 1],
    ] as const) {
      const owner = entry(source, subclass, printing, level)
      const cls = monk(data.classes, source)
      expect(getEarnedSubclassSpellGrants(cls, owner, level - 1)).toEqual([])
      expect(getEarnedSubclassSpellGrants(cls, owner)).toHaveLength(count)
    }
    for (const replacement of ['2 Focus Points', 'Darkness|PHB']) {
      const changed = read(configured)
      const producer = changed.subclassFeature.find(
        (row: { name: string; source: string }) => row.name === 'Darkness' && row.source === 'XPHB',
      )
      producer.entries[0] = replacement.includes('|')
        ? producer.entries[0].replace('Darkness|XPHB', replacement)
        : producer.entries[0].replace('1 Focus Point', replacement)
      const owner = entry('XPHB', 'Warrior of Shadow', 'XPHB', 3)
      expect(
        getEarnedSubclassSpellGrants(monk(parse(changed).classes, 'XPHB'), owner),
      ).toMatchObject([{ spellName: 'minor illusion|xphb', mode: 'known' }])
    }
    for (const [source, subclass, printing, skills, tool] of [
      ['PHB', 'Way of Mercy', 'TCE', ['insight', 'medicine'], 'herbalism kit'],
      ['XPHB', 'Warrior of Mercy', 'XPHB', ['insight', 'medicine'], 'herbalism kit'],
      ['PHB', 'Way of the Drunken Master', 'XGE', ['performance'], "brewer's supplies"],
      ['XPHB', 'Way of the Drunken Master', 'XGE', ['performance'], "brewer's supplies"],
    ] as const) {
      const trained = (level: number) =>
        refreshClassProficiencyState(
          actor(entry(source, subclass, printing, level)),
          data.classes,
          catalogs,
        )
      expect(trained(2).proficiencies.skills).toEqual([])
      expect(trained(3).proficiencies.skills).toEqual(expect.arrayContaining([...skills]))
      expect(trained(3).proficiencies.tools).toContain(tool)
    }
    const dragon = (level: number) =>
      actor(entry('PHB', 'Way of the Ascendant Dragon', 'FTD', level))
    expect(getClassProficiencyWorkflow(dragon(3), data.classes, catalogs)).toContainEqual(
      expect.objectContaining({
        domain: 'languages',
        level: 3,
      }),
    )
    expect(deriveMonkSubclassSenses(dragon(16), data.classes)).toEqual([])
    expect(deriveMonkSubclassSenses(dragon(17), data.classes)).toMatchObject([
      { target: { kind: 'sense', sense: 'blindsight' }, operation: { kind: 'minimum', value: 10 } },
    ])
    const dragonEntry = entry('PHB', 'Way of the Ascendant Dragon', 'FTD', 11)
    expect(
      getMonkSubclassResources(actor(dragonEntry), dragonEntry, data.classes, 3, 4),
    ).toContainEqual(
      expect.objectContaining({
        label: 'Aspect of the Wyrm',
        restType: 'long',
        usageText: expect.stringContaining('3 Ki'),
      }),
    )
  },
)
