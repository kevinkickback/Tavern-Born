import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { getArcaneArcherCantripChoice } from '@/lib/5etools/arcaneArcherCantripSource'
import { getClassChoiceSlotLevels } from '@/lib/5etools/classChoiceNormalization'
import { getFighterSubclassResources } from '@/lib/5etools/fighterSubclassResources'
import { getFighterSuperiorityDice } from '@/lib/5etools/fighterSuperiorityDice'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { deriveFighterPassiveEffects } from '@/lib/calculations/fighterPassiveEffects'
import { deriveAllSkills } from '@/lib/calculations/skills'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createClassChoiceCatalogs,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import {
  applySkillProficiencyActionCommand,
  removeSavedSkillProficiencyCommand,
} from '@/lib/character/commands/skillProficiencyCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { getSkillProficiencyChoices } from '@/lib/character/skillProficiencyChoices'
import { addGrant } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { Class5e, GameData } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const fighterDocument = 'data/class/class-fighter.json'
const bundledDocument = 'resources/srd/data/class/class-fighter.json'
const configuredTest = test.skipIf(!existsSync(fighterDocument))
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const parse = (document: unknown) => parseClassDocument(document).classes as Class5e[]
const fighter = (classes: readonly Class5e[], source: string) =>
  classes.find((row) => row.name === 'Fighter' && row.source === source)!
const archetype = (cls: Class5e, name: string, source: string) => {
  const found = cls.subclasses?.find((row) => row.name === name && row.source === source)
  if (!found) throw new Error('Expected Fighter archetype ' + name)
  return found
}
const entry = (
  source: string,
  subclass: string,
  subclassSource: string,
  levels: number,
): CharacterClassEntry => ({ name: 'Fighter', source, subclass, subclassSource, levels })
const actor = (owner: CharacterClassEntry) =>
  createEmptyCharacter({
    name: 'Fighter journey',
    originSystem: owner.source === 'PHB' ? '2014' : '2024',
    allowedSources: [owner.source, owner.subclassSource!],
    classProgression: [owner],
  })

function configuredData(...documents: string[]) {
  const parsed = documents.map((file) => parseClassDocument(read(file)))
  return makeGameDataFixture({
    classes: parsed.flatMap((row) => row.classes) as GameData['classes'],
    classFeatures: parsed.flatMap((row) => row.classFeatures) as GameData['classFeatures'],
    skills: read('resources/srd/data/skills.json').skill,
    languages: [{ name: 'Dwarvish', source: 'PHB' }],
  })
}

const reopen = (character: Character, result: CharacterCommandResult) =>
  characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })

test.each([
  ['PHB', 7, 'add'],
  ['XPHB', 3, 'conditional-note'],
] as const)('Included SRD Champion %s gains Remarkable Athlete at the declared level', (source, level, kind) => {
  const classes = parse(read(bundledDocument))
  const effects = (levels: number) =>
    deriveFighterPassiveEffects(actor(entry(source, 'Champion', source, levels)), {
      classes,
      classFeatures: [],
      subclassFeatures: [],
    })
  expect(effects(level - 1)).toEqual([])
  expect(effects(level)).toContainEqual(
    expect.objectContaining({
      label: 'Remarkable Athlete',
      target: { kind: 'initiative' },
      operation: expect.objectContaining({ kind }),
    }),
  )
})

configuredTest(
  'both Battle Master printings follow a changed Superiority Dice gain in the source',
  () => {
    const document = read(fighterDocument)
    for (const printing of ['PHB', 'XPHB']) {
      const owner = entry(printing, 'Battle Master', printing, 20)
      const character = actor(owner)
      const counts = () => getFighterSuperiorityDice(character, owner, parse(document))?.maxPerLevel
      expect(counts()?.slice(5, 8)).toEqual([4, 5, 5])
      const feature = document.subclassFeature.find(
        (row: { name: string; classSource: string }) =>
          row.name === 'Combat Superiority' && row.classSource === printing,
      )
      const section = feature.entries
        .flatMap((row: { name?: string; type?: string; entries?: unknown[] }) =>
          row?.type === 'entries' && !row.name ? row.entries : [row],
        )
        .find((row: { name?: string }) => row?.name === 'Superiority Dice')
      section.entries[1] = section.entries[1].replace('7', '8')
      expect(counts()?.slice(5, 8)).toEqual([4, 4, 5])
    }
  },
)

configuredTest(
  'Arcane Archer’s source-qualified pool and later slot counts remain independent of its cantrip',
  () => {
    const document = read(fighterDocument)
    const readRules = () => {
      const cls = fighter(parse(document), 'XPHB')
      const subclass = archetype(cls, 'Arcane Archer', 'AU')
      const choice = subclass.normalizedRules?.choices.find((row) => row.label === 'Arcane Shots')
      if (!choice) throw new Error('Expected a current Arcane Shots pool')
      return { cls, subclass, choice }
    }
    const { cls, subclass, choice } = readRules()
    expect(choice.optionFilter?.source).toBe('AU')
    expect(choice.replacement).toEqual({ cadence: 'choice-gain', maximumPerEvent: 1 })
    expect(getClassChoiceSlotLevels(choice)).toEqual([3, 3, 7, 10, 15, 18])
    expect(getArcaneArcherCantripChoice(cls, subclass)?.references).toHaveLength(2)
    const root = document.subclass.find(
      (row: { name: string; source: string }) =>
        row.name === 'Arcane Archer' && row.source === 'AU',
    )
    const progression = root.optionalfeatureProgression[0].progression
    progression['8'] = progression['7']
    delete progression['7']
    root.additionalSpells[0].known['3'][0] = 'light|xphb#c'
    const revised = readRules()
    expect(getClassChoiceSlotLevels(revised.choice)).toEqual([3, 3, 8, 10, 15, 18])
    expect(getArcaneArcherCantripChoice(revised.cls, revised.subclass)).toBeUndefined()
    expect(
      revised.subclass.normalizedRules?.choices.filter((row) =>
        row.label.startsWith('Arcane Archer Lore'),
      ),
    ).toHaveLength(2)
  },
)

configuredTest('Cavalier and Samurai share one slot across skill and language alternatives', () => {
  const classes = parse(read(fighterDocument))
  for (const source of ['PHB', 'XPHB'])
    for (const name of ['Cavalier', 'Samurai']) {
      const choices = archetype(
        fighter(classes, source),
        name,
        'XGE',
      ).normalizedRules?.choices.filter((row) => row.label.startsWith('Bonus Proficiency'))
      expect(choices).toMatchObject([
        { proficiencyDomain: 'skill-or-language', minimumSelections: 1, maximumSelections: 1 },
      ])
    }
})

configuredTest('Proficiencies edits only the skill side of the Cavalier choice', () => {
  const data = configuredData(fighterDocument)
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const authority = { classes: data.classes, feats: data.feats, catalogs }
  const character = actor(entry('PHB', 'Cavalier', 'XGE', 3))
  const model = getSkillProficiencyChoices(character, authority)
  const row = model.classOwners.find((owner) => owner.domain === 'skill-or-language')!
  expect(model.remaining).toBe(1)
  expect(model.actions.dwarvish).toBeUndefined()
  const add = model.actions.persuasion.find((action) => action.ownerId === row.id)!
  const selected = reopen(
    character,
    applySkillProficiencyActionCommand(
      character,
      character.provenance,
      'persuasion',
      add.id,
      authority,
    ),
  )
  expect(selected.provenance.proficiencies.skills.persuasion).toContainEqual(
    expect.objectContaining({ grantVariant: row.id }),
  )
  const filled = getSkillProficiencyChoices(selected, authority)
  expect(filled.remaining).toBe(0)
  const remove = filled.actions.persuasion.find((action) => action.ownerId === row.id)!
  const overlap = {
    ...selected,
    provenance: addGrant(
      selected.provenance,
      'skills',
      'persuasion',
      makeSourceTag('manual', 'Independent', 'choice'),
    ),
  }
  const cleared = reopen(
    overlap,
    applySkillProficiencyActionCommand(
      overlap,
      overlap.provenance,
      'persuasion',
      remove.id,
      authority,
    ),
  )
  expect(cleared.classChoiceSelections).toEqual([])
  expect(cleared.provenance.proficiencies.skills.persuasion.map((tag) => tag.sourceType)).toEqual([
    'manual',
  ])
  const language = row.options.find((option) => option.reference.name.toLowerCase() === 'dwarvish')!
  const alternate = reopen(
    character,
    applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      row.choice!,
      [language.reference],
      authority,
    ),
  )
  const alternateModel = getSkillProficiencyChoices(alternate, authority)
  expect(alternateModel.remaining).toBe(0)
  expect(alternateModel.actions.persuasion).toBeUndefined()
  expect(alternateModel.actions.dwarvish).toBeUndefined()
  expect(
    removeSavedSkillProficiencyCommand(alternate, alternate.provenance, 'dwarvish', remove.id)
      .characterPatch,
  ).toEqual({})
  const absent = { ...authority, catalogs: { ...catalogs, classes: [] } }
  const dormant = getSkillProficiencyChoices(selected, absent)
  expect(dormant.rows).toContainEqual(
    expect.objectContaining({ itemName: 'Persuasion — retained, inactive' }),
  )
  expect(dormant.actions.persuasion).toMatchObject([{ id: remove.id, adding: false }])
  expect(
    reopen(
      selected,
      removeSavedSkillProficiencyCommand(selected, selected.provenance, 'persuasion', remove.id),
    ).classChoiceSelections,
  ).toEqual([])
})

configuredTest(
  'Elegant Courtier stacks with Jack of All Trades while Remarkable Athlete does not',
  () => {
    const data = configuredData(fighterDocument, 'data/class/class-bard.json')
    const lookups = buildGameDataLookups(data)
    const primary = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
    }
    for (const [subclass, source, skill, modifier, labels] of [
      ['Samurai', 'XGE', 'persuasion', 6, ['Elegant Courtier', 'Jack of All Trades']],
      ['Champion', 'PHB', 'athletics', 2, ['Remarkable Athlete']],
    ] as const) {
      const character = actor(entry('PHB', subclass, source, 7))
      character.abilityScores.wisdom = 16
      character.abilityScores.charisma = 12
      character.classProgression.push({ name: 'Bard', source: 'PHB', levels: 2 })
      const current = createCharacterCalculationContext(character, primary, lookups)
      expect(
        current.effects.declarations
          .flatMap(({ target, label }) =>
            target.kind === 'skill-modifier' && target.skill === skill ? [label] : [],
          )
          .sort(),
      ).toEqual(labels)
      expect(
        deriveAllSkills(
          current.abilityScores.modifiers,
          current.character.proficiencies.skills,
          current.character.proficiencies.expertise,
          4,
          undefined,
          undefined,
          current.effects.declarations,
          current.effects.resolutionContext,
        ).find((row) => row.name.toLowerCase() === skill)?.modifier,
      ).toBe(modifier)
    }
  },
)

configuredTest(
  'Arcane Shot requires a unique sourced introduction and a separately declared feature body',
  () => {
    const original = read(fighterDocument)
    const owner = entry('PHB', 'Arcane Archer', 'XGE', 3)
    const character = actor(owner)
    const inspect = (document: unknown) => {
      const classes = parse(document)
      const subclass = archetype(fighter(classes, 'PHB'), 'Arcane Archer', 'XGE')
      const choice = subclass.normalizedRules?.choices.find((row) => row.label === 'Arcane Shots')
      return {
        options: choice?.optionFilter?.source,
        resources: getFighterSubclassResources(character, owner, classes, undefined, 2),
      }
    }
    expect(inspect(original)).toMatchObject({
      options: 'XGE',
      resources: [{ label: 'Arcane Shot' }],
    })
    const duplicate = structuredClone(original)
    const intro = (data: typeof original) =>
      data.subclassFeature.find(
        (row: { name: string; source: string }) =>
          row.name === 'Arcane Archer' && row.source === 'XGE',
      )
    duplicate.subclassFeature.push(structuredClone(intro(duplicate)))
    expect(inspect(duplicate)).toEqual({ options: undefined, resources: [] })
    const inline = structuredClone(original)
    const index = inline.subclassFeature.findIndex(
      (row: { name: string; source: string }) => row.name === 'Arcane Shot' && row.source === 'XGE',
    )
    const [missing] = inline.subclassFeature.splice(index, 1)
    intro(inline).entries.find((row: { subclassFeature?: string }) =>
      row?.subclassFeature?.startsWith('Arcane Shot|'),
    ).feature = missing
    expect(inspect(inline)).toEqual({ options: undefined, resources: [] })
  },
)

configuredTest('both Psi Warrior printings honor their exact Telekinetic Master spell mode', () => {
  const classes = parse(read(fighterDocument))
  for (const [source, subclassSource, mode] of [
    ['PHB', 'TCE', 'cast-only'],
    ['XPHB', 'XPHB', 'prepared'],
  ] as const) {
    const cls = fighter(classes, source)
    expect(
      getEarnedSubclassSpellGrants(cls, entry(source, 'Psi Warrior', subclassSource, 17)),
    ).toEqual([])
    const grants = getEarnedSubclassSpellGrants(
      cls,
      entry(source, 'Psi Warrior', subclassSource, 18),
    )
    expect(grants).toMatchObject([
      {
        level: 18,
        mode,
        ...(mode === 'cast-only' && {
          castOnly: { ignoresComponents: true },
        }),
      },
    ])
    expect(grants?.[0].spellName.toLowerCase()).toBe('telekinesis|' + source.toLowerCase())
  }
})

configuredTest('revised Battle Master honors the authored maneuver sources and count', () => {
  const document = read(fighterDocument)
  const getChoice = () => {
    const choice = archetype(
      fighter(parse(document), 'XPHB'),
      'Battle Master',
      'XPHB',
    ).normalizedRules?.choices.find((row) => row.label === 'Maneuvers')
    if (!choice) throw new Error('Missing authored Maneuvers choice')
    return choice
  }
  const choice = getChoice()
  expect(getClassChoiceSlotLevels(choice)).toEqual([3, 3, 3, 7, 7, 10, 10, 15, 15])
  const pool = document.subclassFeature.find(
    (row: { name: string; source: string }) =>
      row.name === 'Maneuver Options' && row.source === 'XPHB',
  )
  const authored = pool.entries.find((row: { type: string }) => row.type === 'options').entries
  if (!choice.optionFilter?.restrictToListedOptions) {
    expect(choice.optionFilter).toMatchObject({
      entityType: 'optionalFeature',
      featureTypes: ['MV:B'],
      source: 'XPHB',
    })
  } else {
    expect(choice.optionFilter).toMatchObject({
      entityType: 'optionalFeature',
      featureTypes: ['MV:B'],
    })
    expect(choice.options.map((option) => `${option.name}|${option.source}`)).toEqual(
      authored.map((entry: { optionalfeature: string }) => entry.optionalfeature),
    )
    const optionalfeatures = [
      { name: 'Precision Attack', source: 'XPHB', featureType: ['MV:B'] },
      { name: 'Fighting Style: Archery', source: 'XPHB', featureType: ['FS:F'] },
      { name: 'Unlisted Maneuver', source: 'XPHB', featureType: ['MV:B'] },
    ]
    const catalogs = createClassChoiceCatalogs(
      buildClassChoiceFeatureCatalogs(makeGameDataFixture({ optionalfeatures })),
    )
    authored[0].optionalfeature = 'Fighting Style: Archery|XPHB'
    expect(
      resolveClassChoiceOptions(getChoice(), catalogs).map((row) => row.reference.name),
    ).toEqual(['Precision Attack'])
    authored[0].prerequisite = [{ level: 20 }]
    expect(resolveClassChoiceOptions(getChoice(), catalogs)).toEqual([])
    delete authored[0].prerequisite
    pool.prerequisite = [{ level: 20 }]
    expect(resolveClassChoiceOptions(getChoice(), catalogs)).toEqual([])
    delete pool.prerequisite
    pool.entries = { type: 'entries', entries: [authored] }
    expect(resolveClassChoiceOptions(getChoice(), catalogs)).toEqual([])
  }
})

configuredTest('revised Psi Warrior reads the count and recovery from its source table', () => {
  const document = read(fighterDocument)
  const owner = entry('XPHB', 'Psi Warrior', 'XPHB', 9)
  const character = actor(owner)
  const resource = () =>
    getFighterSubclassResources(character, owner, parse(document), undefined, 4)[0]
  expect(resource()).toMatchObject({
    label: 'Psionic Energy Dice',
    recovery: { shortRest: 1, longRest: 'all' },
  })
  expect(resource().maxPerLevel[8]).toBe(8)
  const power = document.subclassFeature.find(
    (row: { name: string; source: string }) =>
      row.name === 'Psionic Power' && row.source === 'XPHB',
  )
  power.entries[1].rows.find((row: string[]) => row[0] === '9')[2] = '9'
  expect(resource().maxPerLevel[8]).toBe(9)
})

configuredTest('Cavalier reads Warding Maneuver uses and recovery from its earned rule', () => {
  const document = read(fighterDocument)
  const resource = (level: number, constitution: number) => {
    const owner = entry('PHB', 'Cavalier', 'XGE', level)
    const character = actor(owner)
    return getFighterSubclassResources(
      character,
      owner,
      parse(document),
      {
        ...character.abilityScores,
        constitution,
      },
      3,
    ).find((row) => row.label === 'Warding Maneuver')
  }
  expect(resource(6, 3)).toBeUndefined()
  expect(resource(7, 0)?.maxPerLevel[6]).toBe(1)
  expect(resource(7, 3)).toMatchObject({ restType: 'long' })
  expect(resource(7, 3)?.maxPerLevel[6]).toBe(3)
  const rule = document.subclassFeature.find(
    (row: { name: string }) => row.name === 'Warding Maneuver',
  )
  rule.entries[1] = rule.entries[1].replace('long rest', 'short or long rest')
  expect(resource(7, 3)).toMatchObject({ restType: 'short' })
})

configuredTest('Psi Warrior reads the exact Guarded Mind resistance at its earned level', () => {
  const document = read(fighterDocument)
  const targets = (level: number) =>
    deriveFighterPassiveEffects(actor(entry('XPHB', 'Psi Warrior', 'XPHB', level)), {
      classes: parse(document),
      classFeatures: [],
      subclassFeatures: [],
    }).map((row) => row.target)
  expect(targets(9)).toEqual([])
  expect(targets(10)).toEqual([{ kind: 'damage-resistance', damageType: 'psychic' }])
  const rule = document.subclassFeature.find(
    (row: { name: string; source: string }) => row.name === 'Guarded Mind' && row.source === 'XPHB',
  )
  rule.entries[0] = rule.entries[0].replace('Psychic damage', 'Force damage')
  expect(targets(10)).toEqual([{ kind: 'damage-resistance', damageType: 'force' }])
})
