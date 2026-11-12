import { existsSync } from 'node:fs'
import { beforeAll, describe, expect, test } from 'vitest'
import { getSubclassSelectionInfo } from '@/lib/5etools/classData'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { MAX_CHARACTER_LEVEL } from '@/lib/calculations/gameRules'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import {
  applyClassProgressionUpdate,
  applyClassSelectionCommand,
  applyLevelUp,
  selectSubclass,
} from '@/lib/character/commands/classCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { resolveProficiencyChoiceCommand } from '@/lib/character/commands/featCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import { getImplicitSource } from '@/lib/sourcePresets'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  getStandardJourneyCatalog,
  loadStandardJourneyData,
  type StandardJourneyCatalog,
} from '../fixtures/standardJourneyCatalog'
import {
  chooseJourneyAdvancement,
  chooseJourneyDailyPreparation,
  chooseJourneyFeatures,
  chooseJourneySpells,
} from '../fixtures/standardJourneyChoices'

const hasCatalog = existsSync('data/class/class-artificer.json')
const classes = [
  'Artificer',
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard',
]

function reopen(character: Character) {
  return characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
}

function completeStartingSkills(character: Character, data: StandardJourneyCatalog) {
  for (const choice of character.provenance.choices) {
    if (choice.sourceTag.sourceType !== 'class' || choice.domain !== 'skills') continue
    for (const skill of choice.optionPool) {
      const saved = character.provenance.choices.find((row) => row.id === choice.id)!
      if (saved.selected.length === choice.chooseCount) break
      if (character.proficiencies.skills.includes(skill)) continue
      character = applyCharacterCommandResult(
        character,
        resolveProficiencyChoiceCommand(
          character,
          character.provenance,
          'skills',
          skill,
          true,
          choice.id,
          data.catalogs,
        ),
      )
    }
    expect(character.provenance.choices.find((row) => row.id === choice.id)?.selected).toHaveLength(
      choice.chooseCount,
    )
  }
  return character
}

function exerciseJourney(data: StandardJourneyCatalog, cls: Class5e, subclass: Subclass5e) {
  const label = `${data.edition} ${cls.name}|${cls.source} / ${subclass.name}|${subclass.source}`
  const calculations = new WeakMap<
    Character,
    ReturnType<typeof createCharacterCalculationContext>
  >()
  const calculate = (character: Character) => {
    const saved = calculations.get(character)
    if (saved) return saved
    const current = createCharacterCalculationContext(character, data.primary, data.raw)
    calculations.set(character, current)
    return current
  }
  const gain = getSubclassSelectionInfo(cls).subclassLevel
  const hitDie = cls.hd?.faces
  if (!gain || !hitDie || !data.primary.itemLookup)
    throw new Error(`${label}: missing class progression data`)
  const blank = createEmptyCharacter({
    name: label,
    originSystem: data.edition,
    allowedSources: data.sources,
    abilityScores: {
      strength: 15,
      dexterity: 13,
      constitution: 14,
      intelligence: 12,
      wisdom: 10,
      charisma: 8,
    },
  })
  const background = data.primary.backgroundsByKey[`Soldier|${getImplicitSource(data.edition)}`]
  if (!background) throw new Error(`${label}: missing Standard Soldier background`)
  const starter = applyCharacterCommandResult(
    blank,
    applyBackgroundSelectionCommand(
      blank,
      blank.provenance,
      background,
      [],
      data.primary.itemLookup,
    ),
  )
  const options = (character: Character) => {
    const calculation = calculate(character)
    return {
      raceResolution: calculation.raceResolution,
      spellsByKey: data.primary.spellsByKey,
      rawSpellsByKey: data.raw.spellsByKey,
      classChoiceFeatureCatalogs: data.catalogs,
      spellContext: calculation.classChoices.spellContext,
    }
  }
  let character = applyCharacterCommandResult(
    starter,
    applyClassSelectionCommand(
      starter,
      starter.provenance,
      cls,
      undefined,
      data.primary.itemLookup,
      options(starter),
    ),
  )
  character = completeStartingSkills(character, data)
  const average = Math.floor(hitDie / 2) + 1
  for (let level = 1; level <= MAX_CHARACTER_LEVEL; level++) {
    try {
      if (level > 1)
        character = applyCharacterCommandResult(
          character,
          applyLevelUp(
            character,
            character.provenance,
            [{ ...character.classProgression[0], levels: level }],
            {
              className: cls.name,
              classSource: cls.source,
              classLevel: level,
              hitDie,
              dieResult: average,
              method: 'average',
            },
            calculate(character),
          ),
        )
      if (level === gain)
        character = applyCharacterCommandResult(
          character,
          selectSubclass(
            character,
            character.provenance,
            subclass.name,
            subclass.source,
            undefined,
            options(character),
          ),
        )
      character = chooseJourneyAdvancement(character, cls, data, calculate)
      character = chooseJourneyFeatures(
        character,
        cls,
        level >= gain ? subclass : undefined,
        data,
        calculate,
      )
      character = chooseJourneySpells(character, calculate)
      character = chooseJourneyDailyPreparation(character, calculate)
      character = reopen(character)
      expect(character.classProgression).toMatchObject([
        {
          name: cls.name,
          source: cls.source,
          levels: level,
          ...(level >= gain ? { subclass: subclass.name, subclassSource: subclass.source } : {}),
        },
      ])
      if (level < gain) expect(character.classProgression[0].subclass).toBeUndefined()
      expect(character.hitPointGains).toHaveLength(level - 1)
      const calculation = calculate(character)
      const issues = [
        ...validateClassChoices(calculation.character, calculation, data.catalogs),
        ...validateSpells(calculation.character, calculation, data.primary.spellsByKey),
      ].filter((issue) => issue.severity === 'blocking')
      if (issues.length)
        throw new Error(
          issues.map(({ title, explanation }) => `${title}: ${explanation}`).join('; '),
        )
    } catch (cause) {
      throw new Error(
        `${label} at level ${level}: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
  }
  if (cls.name === 'Warlock') {
    const atWillSpells = calculate(character).atWillInvocationSpellStatuses
    expect(atWillSpells).toContainEqual(
      expect.objectContaining({
        featureName: 'Ascendant Step',
        spell: expect.objectContaining({ name: 'Levitate', source: cls.source, level: 2 }),
      }),
    )
    if (data.edition === '2014')
      expect(atWillSpells).toContainEqual(
        expect.objectContaining({
          featureName: 'Beast Speech',
          spell: expect.objectContaining({ name: 'Speak with Animals', source: 'PHB', level: 1 }),
        }),
      )
  }
  const lookup = options(character)
  const reset = reopen(
    applyCharacterCommandResult(
      character,
      applyClassProgressionUpdate(
        character,
        character.provenance,
        [{ name: cls.name, source: cls.source, levels: 1 }],
        lookup.raceResolution,
        lookup,
      ),
    ),
  )
  expect(reset.classProgression).toEqual([{ name: cls.name, source: cls.source, levels: 1 }])
  expect(reset.hitPointGains).toEqual([])
  expect(reset.asiChoices).toEqual([])
  expect(
    reset.classChoiceSelections?.some((choice) => choice.classLevel > 1 || choice.subclassName),
  ).toBe(false)
  expect(
    reset.managedClassSpellChoices?.some(
      (choice) => choice.slot[3] > 1 || choice.slot[0][0] === 'subclass',
    ) ?? false,
  ).toBe(false)
}

describe.skipIf(!hasCatalog)('Standard supplemental subclass journeys', () => {
  let catalogs: Record<'2014' | '2024', StandardJourneyCatalog>
  beforeAll(async () => {
    const data = await loadStandardJourneyData()
    catalogs = {
      '2014': getStandardJourneyCatalog(data, '2014'),
      '2024': getStandardJourneyCatalog(data, '2024'),
    }
  }, 60_000)

  test('covers the supplemental roster in both editions', () => {
    expect(catalogs['2014'].paths).toHaveLength(66)
    expect(catalogs['2024'].paths).toHaveLength(61)
  })

  test.each(
    (['2014', '2024'] as const).flatMap((edition) => classes.map((name) => ({ edition, name }))),
  )('$edition $name reaches level 20 with its Standard choices', ({ edition, name }) => {
    const data = catalogs[edition]
    const paths = data.paths.filter(({ cls }) => cls.name === name)
    expect(paths.length).toBeGreaterThan(0)
    const failures: Error[] = []
    for (const { cls, subclass } of paths) {
      try {
        exerciseJourney(data, cls, subclass)
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error(String(error)))
      }
    }
    if (failures.length) throw new Error(failures.map((error) => error.message).join('\n'))
  }, 180_000)
})
