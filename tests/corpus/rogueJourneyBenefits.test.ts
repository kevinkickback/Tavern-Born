// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parseItems } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { getRogueJourneyResources } from '@/lib/5etools/rogueJourneyResources'
import { getScionResistance } from '@/lib/5etools/rogueScion'
import { getRogueStrikeEntries } from '@/lib/5etools/rogueStrikeEntries'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { prepareToolProficiencySources } from '@/lib/5etools/toolProficiencySource'
import { deriveRoguePassiveEffects } from '@/lib/calculations/roguePassiveEffects'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getClassChoiceCandidates } from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { getClassProficiencyWorkflow } from '@/lib/character/classProficiencyWorkflow'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { renderEntriesToText } from '@/lib/entryText'
import type { Class5e, ClassFeature, GameData } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'

const file = 'data/class/class-rogue.json'

test('Devious Strikes reads the current referenced rules and rejects an ambiguous body', () => {
  const path = 'resources/srd/data/class/class-rogue.json'
  const document = JSON.parse(readFileSync(path, 'utf8'))
  const expand = () => {
    const parsed = parseClassDocument(document, path)
    const classFeatures = parsed.classFeatures as ClassFeature[]
    const parent = classFeatures.find((row) => row.name === 'Devious Strikes')!
    return renderEntriesToText(getRogueStrikeEntries(parent, { classFeatures }))
  }
  expect(expand()).toContain('Knock Out (Cost: 6d6)')
  expect(expand()).toContain('Unconscious condition')
  const knockOut = document.classFeature.find(
    (row: ClassFeature) => row.name === 'Knock Out (Cost: 6d6)',
  )
  document.classFeature.push({ ...knockOut, entries: ['Different rules.'] })
  expect(expand()).not.toContain('Unconscious condition')
  expect(expand()).not.toContain('Different rules.')
  expect(expand()).toContain('Daze (Cost: 2d6)')
})

test('both Included Rogue grants resolve independently on the same class', () => {
  const path = 'resources/srd/data/class/class-rogue.json'
  const source = 'XPHB'
  const document = JSON.parse(readFileSync(path, 'utf8'))
  const actor = createEmptyCharacter({
    name: 'Rogue fixed source grants',
    originSystem: '2024',
    allowedSources: [source],
    classProgression: [{ name: 'Rogue', source, levels: 15 }],
  })
  const current = () => {
    const parsed = parseClassDocument(document, path)
    const classes = parsed.classes as Class5e[]
    const catalogs = buildClassChoiceFeatureCatalogs({
      classes,
      classFeatures: parsed.classFeatures as ClassFeature[],
    })
    return refreshClassProficiencyState(actor, classes, catalogs).proficiencies
  }
  expect(current()).toMatchObject({
    languages: expect.arrayContaining(["thieves' cant"]),
    savingThrows: expect.arrayContaining(['wisdom', 'charisma']),
  })
  const cls = document.class.find((row: { source: string }) => row.source === source)
  cls.classFeatures = cls.classFeatures.filter(
    (row: unknown) => typeof row !== 'string' || !row.startsWith('Slippery Mind|'),
  )
  expect(current().languages).toContain("thieves' cant")
  expect(current().savingThrows).not.toContain('wisdom')
})

test.skipIf(!existsSync(file))(
  'Rogue proficiencies and Mastermind choices use the authored gain and item category',
  () => {
    const parsed = parseClassDocument(JSON.parse(readFileSync(file, 'utf8')), file)
    const classes = parsed.classes as Class5e[]
    const itemDocuments = ['data/items.json', 'data/items-base.json']
    const items = itemDocuments.flatMap(
      (path) => parseItems(JSON.parse(readFileSync(path, 'utf8'))) as GameData['items'],
    )
    const languages = ['Common', 'Dwarvish', 'Elvish', 'Gnomish'].flatMap((name) =>
      ['PHB', 'XPHB'].map((source) => ({ name, source })),
    )
    const extra = parseItems({
      item: [
        { name: 'Tile Set', source: 'XPHB', type: 'GS|XPHB', rarity: 'none' },
        { name: 'Tile Maker', source: 'XPHB', type: 'AT|XPHB', rarity: 'none' },
      ],
    }) as GameData['items']
    const catalogs = buildClassChoiceFeatureCatalogs({
      classes,
      classFeatures: parsed.classFeatures as ClassFeature[],
      items: [...prepareToolProficiencySources(items, items), ...extra],
      languages,
    })
    const actor = (source: string, levels: number, subclass: string, subclassSource: string) =>
      createEmptyCharacter({
        name: subclass,
        originSystem: source === 'XPHB' ? '2024' : '2014',
        allowedSources: [source, subclassSource],
        classProgression: [{ name: 'Rogue', source, levels, subclass, subclassSource }],
      })
    const proficiencies = (
      source: string,
      levels: number,
      subclass: string,
      subclassSource: string,
    ) =>
      refreshClassProficiencyState(
        actor(source, levels, subclass, subclassSource),
        classes,
        catalogs,
      ).proficiencies
    for (const source of ['PHB', 'XPHB']) {
      expect(proficiencies(source, 2, 'Assassin', source).tools).not.toContain('disguise kit')
      expect(proficiencies(source, 3, 'Assassin', source).tools).toEqual(
        expect.arrayContaining(['disguise kit', "poisoner's kit"]),
      )
      expect(proficiencies(source, 14, 'Assassin', source).savingThrows).not.toContain('wisdom')
      expect(proficiencies(source, 15, 'Assassin', source).savingThrows).toEqual(
        expect.arrayContaining(source === 'PHB' ? ['wisdom'] : ['wisdom', 'charisma']),
      )
      const mastermind = actor(source, 3, 'Mastermind', 'XGE')
      const workflow = getClassProficiencyWorkflow(mastermind, classes, catalogs).filter(
        (row) => row.subclassName === 'Mastermind',
      )
      expect(
        workflow.map(({ domain, level, choice }) => [domain, level, choice?.minimumSelections]),
      ).toEqual(
        expect.arrayContaining([
          ['tools', 3, 1],
          ['languages', 3, 2],
        ]),
      )
      const { choice: tool, options } = workflow.find((row) => row.domain === 'tools')!
      expect(options.map((row) => row.reference.name)).toContain('Dice Set')
      expect(options.map((row) => row.reference.name)).not.toContain('Disguise Kit')
      expect(options.map((row) => row.reference.name)).not.toContain('Tile Maker')
      const choice = options.find(
        (row) => row.reference.name === (source === 'XPHB' ? 'Tile Set' : 'Dice Set'),
      )
      expect(choice).toBeDefined()
      const saved = applyClassChoiceSelectionWithGrantsCommand(
        mastermind,
        mastermind.provenance,
        tool!,
        [choice!.reference],
        { classes, catalogs },
      )
      const reopened = characterPersistenceSchema.parse({
        ...mastermind,
        ...saved.characterPatch,
        provenance: saved.provenanceUpdate,
      })
      expect(reopened.proficiencies.tools).toContain(choice!.reference.name.toLowerCase())
    }
  },
)

test.skipIf(!existsSync(file))(
  'Scion saves one coupled deity, cantrip and resistance from the current JSON',
  () => {
    const document = JSON.parse(readFileSync(file, 'utf8'))
    const actor = createEmptyCharacter({
      name: 'Scion of the Three',
      originSystem: '2024',
      allowedSources: ['XPHB', 'FRHoF'],
      classProgression: [
        {
          name: 'Rogue',
          source: 'XPHB',
          levels: 3,
          subclass: 'Scion of the Three',
          subclassSource: 'FRHoF',
        },
      ],
    })
    const readSetup = () => {
      const parsed = parseClassDocument(document)
      const classes = parsed.classes as Class5e[]
      const cls = classes.find((row) => row.name === 'Rogue' && row.source === 'XPHB')!
      const subclass = cls.subclasses?.find(
        (row) => row.name === 'Scion of the Three' && row.source === 'FRHoF',
      )
      const catalogs = buildClassChoiceFeatureCatalogs({
        classes,
        classFeatures: parsed.classFeatures as ClassFeature[],
      })
      const choice = getClassChoiceCandidates(cls, subclass, catalogs).find(
        (row) => row.label === 'Dread Allegiance',
      )
      return { cls, classes, catalogs, choice }
    }
    const save = (name: string) => {
      const { cls, classes, catalogs, choice } = readSetup()
      const option = choice?.options.find((row) => row.name === name)
      if (!choice || !option) throw new Error(`Missing exact Scion option ${name}`)
      const change = applyClassChoiceSelectionWithGrantsCommand(
        actor,
        actor.provenance,
        choice,
        [option],
        { classes, catalogs },
      )
      const saved = characterPersistenceSchema.parse({
        ...actor,
        ...change.characterPatch,
        provenance: change.provenanceUpdate,
      })
      return {
        saved,
        spells: getEarnedSubclassSpellGrants(cls, actor.classProgression[0], 3, {
          selections: saved.classChoiceSelections,
        }),
        effects: getScionResistance(saved, classes),
        hidden: getScionResistance({ ...saved, allowedSources: ['XPHB'] }, classes),
      }
    }
    expect(readSetup().choice?.options.map((option) => option.name)).toEqual([
      'Bane',
      'Bhaal',
      'Myrkul',
    ])
    expect(save('Bhaal')).toMatchObject({
      spells: [{ spellName: 'Blade Ward|XPHB', mode: 'cast-only' }],
      effects: [{ target: { kind: 'damage-resistance', damageType: 'poison' } }],
      hidden: [],
    })
    const feature = document.subclassFeature.find(
      (row: { name: string }) => row.name === 'Dread Allegiance',
    )
    feature.entries[0] = feature.entries[0]
      .replace('the Dead Three', 'the following deities')
      .replace('Bhaal', 'Kelemvor')
    feature.entries[1].rows[1][0] = feature.entries[1].rows[1][0].replace('Bhaal', 'Kelemvor')
    expect(save('Kelemvor')).toMatchObject({
      spells: [{ spellName: 'Blade Ward|XPHB' }],
      effects: [{ target: { damageType: 'poison' } }],
    })
  },
)

test.skipIf(!existsSync(file))(
  'Rogue later resources and passive benefits follow their source gains',
  () => {
    const document = JSON.parse(readFileSync(file, 'utf8'))
    const context = (entry: CharacterClassEntry) => {
      const actor = createEmptyCharacter({
        name: 'Rogue source progression',
        originSystem: entry.source === 'XPHB' ? '2024' : '2014',
        allowedSources: [entry.source, entry.subclassSource].filter(
          (value): value is string => !!value,
        ),
        classProgression: [entry],
        movement: {
          speeds: { walk: 30, swim: 20 },
          source: { kind: 'manual', name: 'Test movement' },
        },
      })
      const parsed = parseClassDocument(document)
      const classes = parsed.classes as Class5e[]
      const catalogs = buildClassChoiceFeatureCatalogs({
        classes,
        classFeatures: parsed.classFeatures as ClassFeature[],
      })
      const modifiers = {
        strength: 0,
        dexterity: 3,
        constitution: 1,
        intelligence: 2,
        wisdom: 1,
        charisma: 3,
      }
      const resources = getRogueJourneyResources(actor, entry, catalogs, modifiers, 4)
      return {
        max: (label: string) =>
          resources.find((row) => row.label === label)?.maxPerLevel[entry.levels - 1],
        recovery: (label: string) => resources.find((row) => row.label === label)?.recovery,
        effects: deriveRoguePassiveEffects(actor, classes, modifiers.charisma, []),
      }
    }
    const subclass = (name: string, subclassSource: string, levels: number, source = 'XPHB') =>
      context({ name: 'Rogue', source, levels, subclass: name, subclassSource })

    expect(subclass('Soulknife', 'XPHB', 4).max('Psionic Energy Dice')).toBe(4)
    expect(subclass('Soulknife', 'XPHB', 5).max('Psionic Energy Dice')).toBe(6)
    expect(subclass('Soulknife', 'TCE', 5, 'PHB').max('Psionic Energy Dice')).toBe(8)
    expect(subclass('Soulknife', 'XPHB', 12).max('Psychic Veil')).toBeUndefined()
    expect(subclass('Soulknife', 'XPHB', 13).max('Psychic Veil')).toBe(1)
    expect(subclass('Soulknife', 'XPHB', 17).max('Rend Mind')).toBe(1)
    expect(subclass('Scion of the Three', 'FRHoF', 16).max('Bloodthirst')).toBe(2)
    expect(subclass('Scion of the Three', 'FRHoF', 16).recovery('Bloodthirst')).toBeUndefined()
    expect(subclass('Scion of the Three', 'FRHoF', 17).recovery('Bloodthirst')).toEqual({
      shortRest: 1,
      longRest: 'all',
    })
    expect(subclass('Phantom', 'RHW', 3).max('Wails from the Grave')).toBe(3)
    expect(subclass('Phantom', 'TCE', 3, 'PHB').max('Wails from the Grave')).toBe(4)
    expect(subclass('Scout', 'XGE', 8).effects).toEqual([])
    expect(subclass('Scout', 'XGE', 9).effects.map(({ target }) => target)).toEqual([
      { kind: 'speed', mode: 'walk' },
      { kind: 'speed', mode: 'swim' },
    ])
    expect(subclass('Swashbuckler', 'XGE', 3, 'PHB').effects).toMatchObject([
      { target: { kind: 'initiative' }, operation: { kind: 'add', value: 3 } },
    ])
    expect(
      context({ name: 'Rogue', source: 'XPHB', levels: 19 }).max('Stroke of Luck'),
    ).toBeUndefined()
    expect(context({ name: 'Rogue', source: 'XPHB', levels: 20 }).max('Stroke of Luck')).toBe(1)

    const producer = document.subclassFeature.find(
      (row: { name: string; source: string }) =>
        row.name === 'Psionic Power' && row.source === 'XPHB',
    )
    producer.entries[1].rows[1][2] = '7'
    expect(subclass('Soulknife', 'XPHB', 5).max('Psionic Energy Dice')).toBe(7)
  },
)

test.skipIf(!existsSync(file))(
  'revised Phantom exposes two source-qualified cast-only effects',
  () => {
    const document = JSON.parse(readFileSync(file, 'utf8'))
    const spells = (levels: number) => {
      const cls = (parseClassDocument(document).classes as Class5e[]).find(
        (row) => row.name === 'Rogue' && row.source === 'XPHB',
      )
      return getEarnedSubclassSpellGrants(cls, {
        name: 'Rogue',
        source: 'XPHB',
        levels,
        subclass: 'Phantom',
        subclassSource: 'RHW',
      })
    }
    expect(spells(8)).toEqual([])
    expect(spells(9)).toMatchObject([
      {
        spellName: 'Speak with Dead|XPHB',
        level: 9,
        mode: 'cast-only',
        castOnly: { ignoresComponents: true },
        feature: { castingNote: expect.stringContaining('Use Dexterity') },
      },
      {
        spellName: 'Augury|XPHB',
        level: 9,
        mode: 'cast-only',
        castOnly: { castingTime: 'Magic Action', ignoresComponents: true },
        feature: { castingNote: expect.stringContaining('Use Constitution') },
      },
    ])
    const phantom = document.subclass.find(
      (row: { name: string; source: string }) => row.name === 'Phantom' && row.source === 'RHW',
    )
    const schedule = phantom.additionalSpells[0].innate[9].rest
    schedule[2] = schedule[1]
    delete schedule[1]
    expect(spells(9)).toMatchObject([{ spellName: 'Augury|XPHB' }])
    const producer = document.subclassFeature.find(
      (row: { name: string; source: string }) =>
        row.name === 'Voice of Death' && row.source === 'RHW',
    )
    producer.entries[0] = producer.entries[0].replace('once without', 'twice without')
    expect(spells(9)?.[0]?.feature?.castingNote).toContain('2 slot-free casts')
  },
)
