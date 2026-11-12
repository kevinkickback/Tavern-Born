import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import { getSubclassSelectionInfo } from '@/lib/5etools/classData'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import { parseClasses, parseClassFeatures } from '@/lib/5etools/parsers/classes'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { getRetainedRankedExpansion } from '@/lib/5etools/retainedSubclassSpells'
import { createStartingEquipmentPolicy } from '@/lib/5etools/startingEquipmentPolicy'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { MAX_CHARACTER_LEVEL } from '@/lib/calculations/gameRules'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import {
  applyClassProgressionUpdate,
  applyClassSelectionCommand,
  applyLevelUp,
  selectSubclass,
} from '@/lib/character/commands/classCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { resolveProficiencyChoiceCommand } from '@/lib/character/commands/featCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import {
  getDeclaredInvocationRequirement,
  hasDeclaredInvocationSpells,
} from '@/lib/character/declaredInvocationPrerequisites'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { CHARACTER_SHEET_TEMPLATES } from '@/lib/pdf/characterSheetTemplates'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { getClassStaticFeatureSummaries } from '@/lib/pdf/classStaticFeatureSummaries'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import { getImplicitSource } from '@/lib/sourcePresets'
import type { Class5e, ClassFeature, Spell5e, Subclass5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'
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

const inheritedRules = [
  ['Bard', 'College of Spirits', 'VRGR', 'Spiritual Focus', 'Spirit Session'],
  ['Sorcerer', 'Shadow Magic', 'XGE', 'Strength of the Grave', 'Hound of Ill Omen'],
  ['Warlock', 'The Undead', 'VRGR', 'Form of Dread', 'Grave Touched'],
  ['Wizard', 'School of Conjuration', 'PHB', 'Minor Conjuration', 'Benign Transposition'],
  ['Wizard', 'School of Enchantment', 'PHB', 'Hypnotic Gaze', 'Instinctive Charm'],
  ['Wizard', 'School of Necromancy', 'PHB', 'Grim Harvest', 'Undead Thralls'],
  ['Wizard', 'School of Transmutation', 'PHB', 'Minor Alchemy', "Transmuter's Stone"],
  ['Wizard', 'Bladesinging', 'TCE', 'Bladesong', 'Extra Attack'],
] as const

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

async function verifyJourneyExport(
  character: Character,
  data: StandardJourneyCatalog,
  cls: Class5e,
  subclass: Subclass5e,
) {
  const view = createCharacterSheetViewModel(character, data.raw, data.primary)
  for (const template of CHARACTER_SHEET_TEMPLATES.filter(
    ({ edition }) => edition === data.edition,
  )) {
    const pdf = await PDFDocument.load(
      await generateTestCharacterSheet(view, template.id, { text: { overflow: 'notes' } }),
    )
    const form = pdf.getForm()
    const text = form
      .getFields()
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
      .join('\n')
      .replace(/\s+/gu, ' ')
    if (template.id === '2014-official') {
      expect(form.getTextField('ClassLevel').getText(), template.id).toBe(`${cls.name} 20`)
    } else if (template.id === '2014-custom') {
      expect(form.getTextField('Class and Levels').getText(), template.id).toContain(
        `${cls.name} 20`,
      )
    } else {
      expect(form.getTextField('Text_4').getText(), template.id).toBe(cls.name)
      expect(form.getTextField('Text_6').getText(), template.id).toBe('20')
    }
    expect(text, template.id).toContain(subclass.name)
    const rules =
      data.edition === '2024' &&
      inheritedRules.find(
        ([name, subclassName, source]) =>
          name === cls.name && subclassName === subclass.name && source === subclass.source,
      )
    if (rules)
      for (const rule of rules.slice(3))
        expect(text.replace(/’/gu, "'"), template.id).toContain(rule)
    for (const spell of view.spellRows) expect(text, template.id).toContain(spell.name)
  }
}

async function exerciseJourney(data: StandardJourneyCatalog, cls: Class5e, subclass: Subclass5e) {
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
  if (
    !gain ||
    !hitDie ||
    !data.primary.itemLookup ||
    !data.raw.startingEquipmentItems ||
    !data.primary.startingEquipmentItems
  )
    throw new Error(`${label}: missing class progression data`)
  const blank = createEmptyCharacter({
    name: 'Standard Journey',
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
      {
        ...options(starter),
        startingEquipmentPolicy: createStartingEquipmentPolicy(
          starter,
          { ...cls, kind: 'class' },
          cls.startingEquipment,
          data.raw.startingEquipmentItems,
          data.primary.startingEquipmentItems,
          data.raw.itemTypeByAbbr,
        ),
      },
    ),
  )
  if (data.edition === '2024' && cls.name === 'Artificer' && cls.source === 'TCE')
    expect(character.equipment).toContainEqual(
      expect.objectContaining({ name: 'Light Crossbow', source: 'PHB', dmg1: '1d8' }),
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
  await verifyJourneyExport(character, data, cls, subclass)
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

const standardData = hasCatalog ? await loadStandardJourneyData() : undefined

describe('Standard subclass journeys', () => {
  if (!standardData) {
    test.skip('requires the configured local sourcebooks', () => {})
    return
  }
  const catalogs = {
    '2014': getStandardJourneyCatalog(standardData, '2014'),
    '2024': getStandardJourneyCatalog(standardData, '2024'),
  }

  test('covers the configured player roster in both editions', () => {
    expect(catalogs['2014'].paths).toHaveLength(106)
    expect(catalogs['2024'].paths).toHaveLength(109)
    for (const { paths } of Object.values(catalogs))
      expect([...new Set(paths.map(({ cls }) => cls.name))].sort()).toEqual(classes)
  })

  test('2024 inherited subclass rules follow earned levels and the selected source', () => {
    const data = catalogs['2024']
    for (const [name, subclass, subclassSource, first, later] of inheritedRules) {
      const create = (levels: number, allowedSources = data.sources) =>
        createEmptyCharacter({
          name: 'Standard Inherited PDF',
          originSystem: '2024',
          allowedSources,
          classProgression: [{ name, source: 'XPHB', levels, subclass, subclassSource }],
        })
      const summarize = (character: Character) =>
        createCharacterSheetViewModel(
          character,
          data.raw,
          data.primary,
        ).declaredClassFeatureSummaries?.map((summary) => summary.compactText)
      expect(summarize(create(2)), subclass).not.toContain(first)
      expect(summarize(create(3)), subclass).toContain(first)
      expect(summarize(create(5)), subclass).not.toContain(later)
      expect(summarize(create(6)), subclass).toContain(later)
      const narrowed = create(6, ['XPHB'])
      const saved = reopen(narrowed)
      if (subclassSource === 'PHB') expect(summarize(narrowed), subclass).toContain(later)
      else expect(summarize(narrowed), subclass).not.toContain(first)
      expect(narrowed).toEqual(saved)
    }
  }, 30_000)

  test('2024 inherited PDF rules print a directly earned and nested feature once', async () => {
    const document = JSON.parse(await readFile('data/class/class-bard.json', 'utf8')) as {
      subclass: Array<
        Pick<Subclass5e, 'name' | 'source' | 'classSource'> & { subclassFeatures?: string[] }
      >
    }
    const [original, retained] = ['PHB', 'XPHB'].map((classSource) =>
      document.subclass.find(
        (row) =>
          row.name === 'College of Spirits' &&
          row.source === 'VRGR' &&
          row.classSource === classSource,
      ),
    )
    if (!original?.subclassFeatures || !retained)
      throw new Error('Missing the authored Spirits owners')
    retained.subclassFeatures = [
      ...original.subclassFeatures,
      'Spiritual Focus|Bard||Spirits|VRGR|3',
    ]
    const current = buildClassChoiceFeatureCatalogs({
      classes: parseClasses(document) as Class5e[],
      classFeatures: parseClassFeatures(document) as ClassFeature[],
    })
    const character = createEmptyCharacter({
      name: 'Repeated Spiritual Focus',
      originSystem: '2024',
      allowedSources: ['XPHB', 'VRGR'],
      classProgression: [
        {
          name: 'Bard',
          source: 'XPHB',
          levels: 3,
          subclass: 'College of Spirits',
          subclassSource: 'VRGR',
        },
      ],
    })
    expect(
      getClassStaticFeatureSummaries(character, current, false).filter(
        (row) => row.compactText === 'Spiritual Focus',
      ),
    ).toHaveLength(1)
  })

  test('2024 retained patron spell choices use earned subclass and spell ranks', async () => {
    const data = catalogs['2024']
    const actor = (levels: number) =>
      createEmptyCharacter({
        name: 'Retained Undead Spell List',
        originSystem: '2024',
        allowedSources: data.sources,
        classProgression: [
          {
            name: 'Warlock',
            source: 'XPHB',
            levels,
            subclass: 'The Undead',
            subclassSource: 'VRGR',
          },
        ],
      })
    const pool = (character: Character, raw = data.raw) => {
      const entry = character.classProgression[0]
      const slot = getManagedClassSpellSlots(entry).find(
        (row) => row[1] === 'class-known' && row[3] === entry.levels,
      )
      const context = createCharacterCalculationContext(character, data.primary, raw).classChoices
        .spellContext
      if (!slot || !context) throw new Error('Missing the current Warlock spell slot')
      return { ...getManagedClassSpellPool(character, slot, context), slot, context }
    }
    expect(pool(actor(2)).defaultReferences.has('false life|xphb')).toBe(false)
    const character = actor(3)
    const available = pool(character)
    expect(available.defaultReferences.has('false life|xphb')).toBe(true)
    expect(available.defaultReferences.has('phantasmal force|xphb')).toBe(true)
    expect(available.defaultReferences.has('death ward|xphb')).toBe(false)
    expect(pool(actor(7)).defaultReferences.has('death ward|xphb')).toBe(true)
    const withoutProof = {
      ...data.raw,
      spellsByKey: Object.fromEntries(
        Object.entries(data.raw.spellsByKey ?? {}).filter(
          ([, spell]) => spell.name !== 'False Life' || spell.source !== 'PHB',
        ),
      ),
    }
    expect(pool(character, withoutProof).defaultReferences.has('false life|xphb')).toBe(false)
    const unselected = createCharacterSheetViewModel(character, data.raw, data.primary)
    expect(unselected.spellRows.some(({ name }) => name === 'False Life')).toBe(false)
    const selected = reopen(
      applyCharacterCommandResult(
        character,
        setManagedClassSpellChoiceCommand(
          character,
          character.provenance,
          {
            slot: available.slot,
            expected: null,
            expectedEmptyRevision: 0,
            target: { name: 'False Life', source: 'XPHB' },
            policy: 'default',
          },
          available.context,
        ),
      ),
    )
    const sheet = createCharacterSheetViewModel(selected, data.raw, data.primary)
    for (const template of CHARACTER_SHEET_TEMPLATES.filter(({ edition }) => edition === '2024')) {
      const pdf = await PDFDocument.load(await generateTestCharacterSheet(sheet, template.id))
      expect(
        pdf
          .getForm()
          .getFields()
          .some((field) => field instanceof PDFTextField && field.getText() === 'False Life'),
        template.id,
      ).toBe(true)
    }
  }, 30_000)

  test('2024 retained expansion requires the classic source declaration', async () => {
    const document = JSON.parse(await readFile('data/class/class-warlock.json', 'utf8')) as {
      subclass: Subclass5e[]
    }
    const retained = document.subclass.find(
      (row) => row.name === 'The Undead' && row.source === 'VRGR' && row.classSource === 'XPHB',
    )
    if (!retained) throw new Error('Missing the authored Undead copy')
    const readExpansion = () => {
      const warlock = (parseClasses(document) as Class5e[]).find(
        (row) => row.name === 'Warlock' && row.source === 'XPHB',
      )
      const subclass = warlock?.subclasses?.find(
        (row) => row.name === retained.name && row.source === retained.source,
      )
      if (!subclass) throw new Error('Missing the parsed Undead copy')
      return getRetainedRankedExpansion(subclass)
    }
    expect(readExpansion()?.s1).toContain('false life')
    retained.additionalSpells = [{ expanded: { s1: ['shield'] } }]
    expect(readExpansion()).toBeUndefined()
    delete retained.additionalSpells
    const original = document.subclass.find(
      (row) =>
        row.name === retained.name && row.source === retained.source && row.classSource === 'PHB',
    )
    if (!original) throw new Error('Missing the classic Undead source')
    document.subclass.push({ ...original, shortName: 'Other Undead' })
    expect(readExpansion()).toBeUndefined()
    document.subclass.pop()
    expect(readExpansion()?.s1).toContain('false life')
    original.additionalSpells = [{ expanded: { 3: ['false life'] } }]
    expect(readExpansion()).toBeUndefined()
  })

  test('2024 Warlock uses supplemental fixed Invocation spells and exact Pact prerequisites', async () => {
    const data = catalogs['2024']
    const cls = data.paths.find(({ cls }) => cls.name === 'Warlock')?.cls
    if (!cls) throw new Error('Missing the Standard Warlock')
    const actor = createEmptyCharacter({
      name: 'Standard Invocation test',
      originSystem: '2024',
      allowedSources: data.sources,
      classProgression: [{ name: cls.name, source: cls.source, levels: 20 }],
    })
    const choice = getCharacterClassChoices(
      cls,
      undefined,
      createOptionalClassFeatureActivity(actor, data.catalogs),
      data.catalogs,
    ).find((row) => row.label === 'Eldritch Invocations')
    if (!choice) throw new Error('Missing the Standard Invocation pool')
    const options = resolveClassChoiceOptions(choice, data.catalogs, [], 20, actor)
    const reference = (name: string, source: string) => {
      const option = options.find(
        ({ reference }) => reference.name === name && reference.source === source,
      )
      if (!option) throw new Error('Missing ' + name)
      return option.reference
    }
    const tome = reference('Pact of the Tome', 'XPHB')
    const farScribe = reference('Far Scribe', 'TCE')
    const candidates = [
      ['Shroud of Shadow', 'XGE', 'Invisibility', 'at will', 15],
      ["Trickster's Escape", 'XGE', 'Freedom of Movement', 'on yourself', 7],
      ['Undying Servitude', 'TCE', 'Animate Dead', 'long rest', 5],
    ] as const
    for (const [name, source, , , level] of candidates) {
      expect(options.find(({ reference }) => reference.name === name)?.availability).toBe(
        'eligible',
      )
      expect(
        resolveClassChoiceOptions(choice, data.catalogs, [], level - 1, actor).find(
          ({ reference }) => reference.name === name && reference.source === source,
        )?.availability,
      ).toBe('retained')
    }
    const calculate = (character: Character) =>
      createCharacterCalculationContext(character, data.primary, data.raw)
    const select = (character: Character, ...references: ReturnType<typeof reference>[]) =>
      reopen(
        applyCharacterCommandResult(
          character,
          applyClassChoiceSelectionWithGrantsCommand(
            character,
            character.provenance,
            choice,
            references,
            {
              classes: data.primary.classChoiceClasses,
              catalogs: data.catalogs,
              spellContext: calculate(character).classChoices.spellContext,
            },
          ),
        ),
      )
    expect(() => select(actor, farScribe)).toThrow(/current prerequisites/)
    const selected = select(
      actor,
      tome,
      farScribe,
      ...candidates.map(([name, source]) => reference(name, source)),
    )
    expect(() => select(selected, farScribe)).toThrow(/prerequisite|Tome/i)
    const without = (name: string, field: 'prerequisite' | 'additionalSpells') => ({
      ...data.catalogs,
      optionalFeatureCandidates: undefined,
      optionalFeatures: data.catalogs.optionalFeatures.map((feature) =>
        feature.name === name ? { ...feature, [field]: undefined } : feature,
      ),
    })
    expect(
      getDeclaredInvocationRequirement(choice, farScribe, without('Far Scribe', 'prerequisite')),
    ).toBeNull()
    expect(
      getDeclaredInvocationRequirement(
        choice,
        farScribe,
        without('Pact of the Tome', 'additionalSpells'),
      ),
    ).toBeNull()
    const withoutCast = without('Far Scribe', 'additionalSpells')
    expect(hasDeclaredInvocationSpells(farScribe, withoutCast)).toBe(true)
    expect(getDeclaredInvocationRequirement(choice, farScribe, withoutCast)).toBeNull()
    const names = [
      ...candidates.map(([name, , spell, note]) => [name, spell, note]),
      ['Far Scribe', 'Sending', 'whose name is on the page'],
    ]
    for (const [featureName, spell, note] of names) {
      expect(calculate(selected).fixedClassSpellStatuses).toContainEqual(
        expect.objectContaining({
          featureName,
          reference: spell + '|XPHB',
          active: true,
          prepared: false,
          castingNote: expect.stringContaining(note),
        }),
      )
    }
    const rawWithoutSending = {
      ...data.raw,
      spellsByKey: Object.fromEntries(
        Object.entries(data.raw.spellsByKey ?? {}).filter(
          ([, spell]) => spell.name !== 'Sending' || spell.source !== 'PHB',
        ),
      ),
    }
    expect(
      createCharacterCalculationContext(selected, data.primary, rawWithoutSending)
        .fixedClassSpellStatuses,
    ).toContainEqual(expect.objectContaining({ featureName: 'Far Scribe', active: false }))
    const competing = parseSpells({
      spell: ['Sending', 'Other Spell'].map((spell) =>
        makeSpellFixture({ name: 'Conflicting Printing', reprintedAs: [`${spell}|XPHB`] }),
      ),
    }) as Spell5e[]
    const rawWithConflict = {
      ...data.raw,
      spellsByKey: {
        ...data.raw.spellsByKey,
        ...buildSpellLookup([...competing].reverse()),
      },
    }
    expect(
      createCharacterCalculationContext(selected, data.primary, rawWithConflict)
        .fixedClassSpellStatuses,
    ).toContainEqual(expect.objectContaining({ featureName: 'Far Scribe', active: false }))
    expect(
      createCharacterSheetViewModel(selected, rawWithConflict, data.primary).spellRows.map(
        ({ name }) => name,
      ),
    ).not.toContain('Sending')
    const disabled = {
      ...selected,
      allowedSources: selected.allowedSources?.filter((source) => source !== 'TCE'),
    }
    expect(
      calculate(disabled).fixedClassSpellStatuses.map(({ featureName }) => featureName),
    ).not.toContain('Far Scribe')
    const vm = createCharacterSheetViewModel(selected, data.raw, data.primary)
    expect(vm.spellRows).toContainEqual(
      expect.objectContaining({
        name: 'Sending',
        castOnly: true,
        material: false,
      }),
    )
    const pdf = await PDFDocument.load(await generateTestCharacterSheet(vm, '2024-official'))
    const values = pdf
      .getForm()
      .getFields()
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText()] : []))
    for (const [, spell] of names) expect(values).toContain(spell)
  }, 30_000)
  test.each(
    (['2014', '2024'] as const).flatMap((edition) =>
      catalogs[edition].paths.map(({ cls, subclass }) => ({
        edition,
        className: cls.name,
        subclassName: subclass.name,
        cls,
        subclass,
      })),
    ),
  )(
    '$edition $className / $subclassName reaches level 20 with its Standard choices',
    async ({ edition, cls, subclass }) => exerciseJourney(catalogs[edition], cls, subclass),
    60_000,
  )
})
