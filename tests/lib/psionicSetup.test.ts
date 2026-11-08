// @vitest-environment jsdom
import fs from 'node:fs'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import {
  getProgressiveChoiceGainCount,
  normalizeClassChoices,
} from '@/lib/5etools/classChoiceNormalization'
import { decodeClassFeatureReference } from '@/lib/5etools/classFeatureIdentity'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { getCurrentMysticRules, getMysticMasteryResource } from '@/lib/5etools/mysticJourneyRules'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { parsePsionics } from '@/lib/5etools/parsers/psionics'
import { normalizePsionicChoices } from '@/lib/5etools/psionicChoices'
import { getPsionicEntries } from '@/lib/5etools/psionicEntries'
import { getPsionicChoiceId, PSIONIC_ROOT_REF } from '@/lib/5etools/psionicIdentity'
import { getPsionicKey, resolvePsionic } from '@/lib/5etools/psionics'
import { deriveCharacterActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  getClassChoiceOptionKey,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  reconcileClassChoiceSelections,
} from '@/lib/character/commands/classChoiceCommands'
import {
  getEffectiveClassChoiceFeatureRoutes,
  projectEffectiveClassChoiceFeatures,
} from '@/lib/character/effectiveClassChoiceFeatures'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Class5e, ClassFeature, GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const classFile = 'data/class/class-mystic.json',
  psiFile = 'data/psionics.json'
const hasSource = fs.existsSync(classFile) && fs.existsSync(psiFile)
const source = hasSource ? JSON.parse(fs.readFileSync(classFile, 'utf8')) : undefined
const rawPsionics = hasSource ? JSON.parse(fs.readFileSync(psiFile, 'utf8')).psionic : []
function catalog(): GameData {
  const parsed = parseClassDocument(structuredClone(source))
  return {
    ...createEmptyGameData(),
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    psionics: parsePsionics({ psionic: rawPsionics }),
  }
}
function actor(level = 1, order = 'Avatar'): Character {
  return makeCharacterFixture({
    classProgression: [
      {
        name: 'Mystic',
        source: 'UATheMysticClass',
        levels: level,
        subclass: `Order of the ${order}`,
        subclassSource: 'UATheMysticClass',
      },
    ],
    features: [],
  })
}
function choices(data: GameData, character: Character) {
  const catalogs = buildClassChoiceFeatureCatalogs(data),
    cls = data.classes[0],
    sub = cls.subclasses?.find((row) => row.name === character.classProgression[0].subclass)
  return {
    catalogs,
    rows: getCharacterClassChoices(
      cls,
      sub,
      createOptionalClassFeatureActivity(character, catalogs),
      catalogs,
    ),
  }
}
function pick(data: GameData, character: Character, label: string, names: string[]): Character {
  const { catalogs, rows } = choices(data, character),
    choice = rows.find((row) => row.label === label)!
  expect(choice).toBeTruthy()
  const selected = names.map((name) => ({
    entityType: 'psionic' as const,
    name,
    source: 'UATheMysticClass',
  }))
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance,
    choice,
    selected,
    { classes: data.classes, catalogs },
  )
  return { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
}

test('psionic rules project modes, submodes, focus and costs without mutating the catalog', () => {
  const source = {
    name: 'Example',
    source: 'Test',
    type: 'D',
    order: 'Example',
    entries: ['Introduction.'],
    focus: 'Focus benefit.',
    modes: [
      {
        name: 'Mode',
        entries: ['As an action, do something.'],
        cost: { min: 1, max: 3 },
        concentration: { duration: 1, unit: 'min' },
        submodes: [{ name: 'Submode', entries: ['Submode content.'], cost: { min: 2, max: 2 } }],
      },
    ],
  }
  const before = JSON.stringify(source),
    text = JSON.stringify(getPsionicEntries(source))
  for (const expected of [
    'Focus benefit',
    'Mode (1-3 psi; conc., 1 min.)',
    'Submode (2 psi)',
    'Submode content',
  ])
    expect(text).toContain(expected)
  expect(JSON.stringify(source)).toBe(before)
})

test('malformed reserved psionic tuples reject safely without loaded rules', () => {
  const owner = { type: 'class' as const, name: 'Mystic', source: 'UATheMysticClass' }
  const saved = {
    ...actor(),
    classChoiceSelections: [
      {
        choiceId: getPsionicChoiceId(owner, 'talent'),
        label: 'Talents',
        kind: 'psionic' as const,
        className: 'Mystic',
        classSource: 'UATheMysticClass',
        classLevel: 1,
        selected: [
          {
            entityType: 'psionic' as const,
            name: 'Beacon',
            source: 'UATheMysticClass',
            slotLevel: 1,
          },
        ],
      },
    ],
  }
  expect(characterPersistenceSchema.safeParse(saved).success).toBe(true)
  for (const patch of [
    { classSource: 'PHB' },
    { classLevel: 2 },
    { subclassName: 'Bad owner', subclassSource: 'Bad' },
    { choiceId: 'psionic-choice:%' },
    { kind: 'optional-feature' },
  ]) {
    const value = {
      ...saved,
      classChoiceSelections: [{ ...saved.classChoiceSelections[0], ...patch }],
    }
    expect(() => characterPersistenceSchema.safeParse(value)).not.toThrow()
    expect(characterPersistenceSchema.safeParse(value).success).toBe(false)
  }
})
test('psionic target keys preserve literal field boundaries and require the exact current printing', () => {
  expect(getPsionicKey('Name|Other', 'Book')).not.toBe(getPsionicKey('Name', 'Other|Book'))
  const records = [{ name: 'Beacon', source: 'Other', type: 'T', entries: ['Current rules.'] }]
  expect(resolvePsionic({ name: 'Beacon', source: 'UATheMysticClass' }, records)).toBeUndefined()
  expect(resolvePsionic({ name: 'Beacon' }, records)).toBeUndefined()
  expect(resolvePsionic({ name: ' beacon ', source: ' other ' }, records)).toBe(records[0])
})

test('required Psionics diagnostics survive alternate owner printings and canonical source restoration', () => {
  const ref = decodeClassFeatureReference(PSIONIC_ROOT_REF)
  for (const name of ['Mystic', ' Mystic '])
    for (const source of [
      'UATheMysticClass',
      'AlternatePrinting',
      ' uathemysticclass ',
      'UATheMysticClass',
    ]) {
      const result = normalizeClassChoices({ name, source } as Class5e, [ref])
      const diagnostics = result.diagnostics.filter((row) => row.featureName === 'Psionics')
      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0]).toMatchObject({
        code: 'unverified-required-choice',
        classSource: source,
      })
    }
  const ranger = normalizeClassChoices({ name: 'Ranger', source: 'PHB' } as Class5e, [
    decodeClassFeatureReference('Favored Enemy|Ranger|PHB|1|PHB'),
  ])
  expect(ranger.diagnostics.some((row) => row.featureName === 'Favored Enemy')).toBe(true)
})

describe.skipIf(!hasSource)('configured Mystic psionic actor and current-source lifecycle', () => {
  test('Psionic Mastery requires agreement between the opening schedule and earned uses', () => {
    const character = actor(20)
    const resource = (data: GameData) =>
      getMysticMasteryResource(
        getCurrentMysticRules(
          character,
          character.classProgression[0],
          buildClassChoiceFeatureCatalogs(data),
        ),
      )
    expect(resource(catalog())?.maxPerLevel[19]).toBe(4)
    const current = structuredClone(source)
    const feature = current.classFeature.find(
      (row: ClassFeature) => row.name === 'Psionic Mastery (4/Day)',
    )
    feature.entries[0] = feature.entries[0].replace('four times', 'three times')
    const parsed = parseClassDocument(current)
    expect(
      resource({
        ...catalog(),
        classes: parsed.classes as Class5e[],
        classFeatures: parsed.classFeatures as ClassFeature[],
      }),
    ).toBeUndefined()
  })

  test('a compatible table edit moves the talent gain and the current bonus clause sets its own quota', () => {
    const current = structuredClone(source)
    current.class[0].classTableGroups[0].rows[2][0] = 1
    const bonus = current.subclassFeature.find(
      (row: ClassFeature) =>
        row.name === 'Bonus Disciplines' &&
        'subclassShortName' in row &&
        row.subclassShortName === 'Avatar',
    )
    bonus.entries[0] = bonus.entries[0].replace('learn two', 'learn three')
    const parsed = parseClassDocument(current)
    const data = {
      ...catalog(),
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
    }
    const { rows } = choices(data, actor(4))
    const talents = rows.find((choice) => choice.label === 'Psionic Talents')!
    const disciplines = rows.find((choice) => choice.label === 'Bonus Disciplines')!
    expect(getProgressiveChoiceGainCount(talents, 3)).toBe(0)
    expect(getProgressiveChoiceGainCount(talents, 4)).toBe(1)
    expect(disciplines.selectionCountByLevel).toEqual(Array(20).fill(3))
    expect(disciplines.optionFilter?.psionicOrders).toEqual(['Avatar'])
  })

  test('all current table counts and six order pools derive from source, with no Soul Knife bonus', () => {
    const data = catalog(),
      cls = data.classes[0]
    for (const order of ['Avatar', 'Awakened', 'Immortal', 'Nomad', 'Soul Knife', 'Wu Jen']) {
      const character = actor(20, order),
        { rows } = choices(data, character)
      expect(rows.map((row) => row.label)).toEqual(
        expect.arrayContaining(['Psionic Talents', 'Psionic Disciplines']),
      )
      expect(rows.find((row) => row.label === 'Psionic Talents')?.selectionCountByLevel).toEqual([
        1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4,
      ])
      expect(
        rows.find((row) => row.label === 'Psionic Disciplines')?.selectionCountByLevel,
      ).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8])
      const bonus = rows.find((row) => row.label === 'Bonus Disciplines')
      if (order === 'Soul Knife') expect(bonus).toBeUndefined()
      else {
        expect(bonus?.selectionCountByLevel).toEqual(Array(20).fill(2))
        expect(bonus?.optionFilter?.psionicOrders).toEqual([order])
      }
    }
    expect(cls.normalizedRules?.choices.filter((row) => row.kind === 'psionic')).toHaveLength(2)
    for (const source of ['AlternatePrinting', 'UATheMysticClass']) {
      const current = normalizeClassChoices({ ...cls, source }, cls.classFeatureRefs!)
      expect(current.choices.filter((row) => row.kind === 'psionic')).toHaveLength(
        source === 'UATheMysticClass' ? 2 : 0,
      )
      expect(current.diagnostics.filter((row) => row.featureName === 'Psionics')).toHaveLength(
        source === 'UATheMysticClass' ? 0 : 1,
      )
    }
  })
  test('partial setup, unrestricted base discipline, separate bonus pool, strict reopen and runtime-only descriptions', () => {
    const data = catalog(),
      bonus = rawPsionics
        .filter((row: any) => row.type === 'D' && row.order === 'Avatar')
        .slice(0, 2)
        .map((row: any) => row.name)
    let character = pick(data, actor(), 'Psionic Talents', ['Beacon'])
    character = pick(data, character, 'Psionic Disciplines', ['Adaptive Body'])
    character = pick(data, character, 'Bonus Disciplines', bonus)
    expect(character.features).toHaveLength(4)
    expect(character.features.every((row) => row.description === '')).toBe(true)
    const reopened = characterPersistenceSchema.parse(character)
    const { catalogs } = choices(data, reopened),
      effective = projectEffectiveClassChoiceFeatures(reopened, catalogs)
    expect(effective.features).toHaveLength(4)
    expect(effective.features.every((row) => row.description.length > 0)).toBe(true)
    expect(reopened.features.every((row) => row.description === '')).toBe(true)
    const current = choices(data, reopened).rows.find((row) => row.label === 'Bonus Disciplines')!
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        reopened,
        reopened.provenance,
        current,
        [{ entityType: 'psionic', name: 'Adaptive Body', source: 'UATheMysticClass' }],
        { classes: data.classes, catalogs },
      ),
    ).toThrow()
    const cleared = pick(data, reopened, 'Bonus Disciplines', [])
    expect(cleared.features.map((row) => row.name).sort()).toEqual(['Adaptive Body', 'Beacon'])
    expect(characterPersistenceSchema.safeParse(cleared).success).toBe(true)
  })
  test('cross-pool exact duplicates reject in either editing order and source absence suspends without deleting intent', () => {
    const data = catalog(),
      name = rawPsionics.find((row: any) => row.type === 'D' && row.order === 'Avatar').name
    const base = pick(data, actor(), 'Psionic Disciplines', [name])
    expect(() => pick(data, base, 'Bonus Disciplines', [name])).toThrow()
    const bonus = pick(data, actor(), 'Bonus Disciplines', [name])
    expect(() => pick(data, bonus, 'Psionic Disciplines', [name])).toThrow()
    const { catalogs } = choices(data, base),
      absent = { ...catalogs, psionics: [] }
    expect(projectEffectiveClassChoiceFeatures(base, absent).features).toEqual([])
    expect(base.classChoiceSelections?.[0].selected).toHaveLength(1)
    expect(
      projectEffectiveClassChoiceFeatures(base, catalogs).features.map((row) => row.name),
    ).toEqual([name])
  })

  test('an incomplete order catalog keeps each independently available saved bonus discipline', () => {
    const data = catalog()
    const name = 'Crown of Despair'
    const character = characterPersistenceSchema.parse(
      pick(data, actor(), 'Bonus Disciplines', [name]),
    )
    const partial = {
      ...data,
      psionics: data.psionics?.filter((row) => row.order !== 'Avatar' || row.name === name),
    }
    const { catalogs, rows } = choices(partial, character)
    expect(rows.find((row) => row.label === 'Bonus Disciplines')?.selectionCountByLevel[0]).toBe(2)
    expect(
      projectEffectiveClassChoiceFeatures(character, catalogs).features.map((row) => row.name),
    ).toEqual([name])
  })

  test('unrelated unresolvable catalog rows cannot grant benefits or suspend an available earned selection', () => {
    const data = catalog(),
      character = pick(data, actor(), 'Psionic Talents', ['Beacon'])
    const partial = {
      ...data,
      psionics: data.psionics!.map((row) =>
        row.type === 'T' && row.name !== 'Beacon'
          ? { ...row, entries: [], focus: undefined, modes: [] }
          : row,
      ),
    }
    const { catalogs, rows } = choices(partial, character)
    expect(rows.filter((row) => row.owner.type === 'class')).toHaveLength(2)
    expect(
      getEffectiveClassChoiceFeatureRoutes(character, catalogs).contributions.map(
        (row) => row.name,
      ),
    ).toEqual(['Beacon'])
    expect(() => pick(partial, actor(), 'Psionic Talents', ['Mind Thrust'])).toThrow()
    expect(
      getEffectiveClassChoiceFeatureRoutes(
        character,
        choices(data, character).catalogs,
      ).contributions.map((row) => row.name),
    ).toEqual(['Beacon'])
  })
  test('an old acquisition slot is retained and suspended after the current table moves its gain', () => {
    const data = catalog()
    let character = pick(data, actor(4), 'Psionic Talents', ['Beacon'])
    character = pick(data, character, 'Psionic Talents', ['Beacon', 'Mind Thrust'])
    expect(character.classChoiceSelections?.[0].selected.map((row) => row.slotLevel)).toEqual([
      1, 3,
    ])
    const changed = structuredClone(data)
    ;(changed.classes[0].classTableGroups![0] as { rows: number[][] }).rows[2][0] = 1
    const { catalogs, rows } = choices(changed, character),
      choice = rows.find((row) => row.label === 'Psionic Talents')!
    const views = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      character.classChoiceSelections![0].selected,
      4,
      character,
    )
    expect(views.find((row) => row.reference.name === 'Mind Thrust')?.availability).toBe('retained')
    expect(
      getEffectiveClassChoiceFeatureRoutes(character, catalogs).contributions.map(
        (row) => row.name,
      ),
    ).toEqual(['Beacon'])
    const noop = applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      choice,
      character.classChoiceSelections![0].selected,
      { classes: changed.classes, catalogs },
    )
    expect(noop.characterPatch).toEqual({})
    expect(character.classChoiceSelections?.[0].selected.map((row) => row.slotLevel)).toEqual([
      1, 3,
    ])
  })
  test('changed declaration and duplicate psionic identities do not borrow stale normalized choices', () => {
    const data = catalog(),
      character = pick(data, actor(), 'Psionic Talents', ['Beacon'])
    const changed = structuredClone(data)
    changed.classFeatures.find((row) => row.name === 'Psionics')!.entries = []
    const { catalogs } = choices(changed, character)
    expect(getEffectiveClassChoiceFeatureRoutes(character, catalogs).contributions).toEqual([])
    const duplicate = structuredClone(data)
    duplicate.psionics!.push({ ...duplicate.psionics!.find((row) => row.name === 'Beacon')! })
    expect(
      getEffectiveClassChoiceFeatureRoutes(character, choices(duplicate, character).catalogs)
        .contributions,
    ).toEqual([])
    expect(normalizePsionicChoices(data.classes[0], undefined).choices).toHaveLength(2)
    const duplicateRaw = structuredClone(source)
    duplicateRaw.subclassFeature.push(
      structuredClone(
        duplicateRaw.subclassFeature.find(
          (row: any) => row.name === 'Bonus Disciplines' && row.subclassShortName === 'Avatar',
        ),
      ),
    )
    const parsed = parseClassDocument(duplicateRaw),
      rawCatalog = {
        ...data,
        classes: parsed.classes as Class5e[],
        classFeatures: parsed.classFeatures as ClassFeature[],
      }
    expect(choices(rawCatalog, actor()).rows.some((row) => row.label === 'Bonus Disciplines')).toBe(
      false,
    )
  })
  test('forged materialized psionic rows and orphan tags reject offline', () => {
    const data = catalog(),
      character = pick(data, actor(), 'Psionic Talents', ['Beacon'])
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
    expect(
      characterPersistenceSchema.safeParse({
        ...character,
        features: character.features.map((row) => ({ ...row, source: 'PHB' })),
      }).success,
    ).toBe(false)
    expect(characterPersistenceSchema.safeParse({ ...character, features: [] }).success).toBe(false)
    expect(
      characterPersistenceSchema.safeParse({
        ...character,
        features: [],
        provenance: { ...character.provenance, features: {} },
      }).success,
    ).toBe(true)
    const { catalogs, rows } = choices(data, character),
      view = resolveClassChoiceOptions(
        rows[0],
        createClassChoiceCatalogs(catalogs),
        [],
        1,
        character,
      )
    expect(new Set(view.map((row) => getClassChoiceOptionKey(row.reference))).size).toBe(
      view.length,
    )
  })
  test('explicit reference conflicts cannot borrow the valid encoded target or cached normalized choices', () => {
    for (const patch of [
      { name: 'Other feature' },
      { source: 'PHB' },
      { className: 'Other class' },
      { classSource: 'PHB' },
      { level: 2 },
    ]) {
      const data = catalog(),
        character = pick(data, actor(), 'Psionic Talents', ['Beacon'])
      Object.assign(
        data.classes[0].classFeatureRefs!.find((row) => row.name === 'Psionics')!,
        patch,
      )
      expect(
        getEffectiveClassChoiceFeatureRoutes(character, choices(data, character).catalogs)
          .contributions,
      ).toEqual([])
    }
  })
  test('oversubscribed current gain slots suspend every conflicting allocation; owner transitions remove only lost gains', () => {
    const data = catalog()
    let character = pick(data, actor(3), 'Psionic Talents', ['Beacon', 'Mind Thrust'])
    const selection = character.classChoiceSelections![0]
    const conflicting = {
      ...character,
      classChoiceSelections: [
        { ...selection, selected: selection.selected.map((row) => ({ ...row, slotLevel: 1 })) },
      ],
    }
    expect(
      getEffectiveClassChoiceFeatureRoutes(conflicting, choices(data, conflicting).catalogs)
        .contributions,
    ).toEqual([])
    expect(
      reconcileClassChoiceSelections(character.classChoiceSelections, [
        { ...character.classProgression[0], levels: 1 },
      ])[0].selected.map((row) => row.slotLevel),
    ).toEqual([1])
    expect(reconcileClassChoiceSelections(character.classChoiceSelections, [])).toEqual([])
    character = pick(data, character, 'Bonus Disciplines', [
      rawPsionics.find((row: any) => row.order === 'Avatar').name,
    ])
    const moved = reconcileClassChoiceSelections(character.classChoiceSelections, [
      { ...character.classProgression[0], subclass: 'Order of the Soul Knife' },
    ])
    expect(moved.map((row) => row.label)).toEqual(['Psionic Talents'])
  })
  test('current readiness, Actions and full versus names-only PDFs agree through exact catalog loss and restoration', async () => {
    const data = catalog(),
      character = pick(data, actor(), 'Psionic Talents', ['Beacon'])
    const before = JSON.stringify(character),
      lookups = buildGameDataLookups(data)
    const { catalogs } = choices(data, character)
    const raw = {
      ...lookups,
      sourceCatalog: data.sources,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    for (const present of [true, false, true]) {
      const current = {
        ...raw,
        classChoiceFeatureCatalogs: { ...catalogs, psionics: present ? data.psionics : [] },
      }
      const calculation = createCharacterCalculationContext(character, current, raw)
      const actions = deriveCharacterActions(calculation.character, {
        abilityModifiers: calculation.abilityScores.modifiers,
        proficiencyBonus: 2,
        classes: calculation.classes,
        classChoiceFeatureCatalogs: current.classChoiceFeatureCatalogs,
      })
      expect(actions.some((row) => row.name === 'Beacon')).toBe(present)
      const duties = validateClassChoices(
        character,
        calculation,
        createClassChoiceCatalogs(current.classChoiceFeatureCatalogs),
      )
      expect(
        duties.some(
          (row) => row.title === 'Restore or remove Psionic Talents' && row.severity === 'blocking',
        ),
      ).toBe(!present)
      const vm = createCharacterSheetViewModel(character, raw, current)
      expect(vm.featuresSummary.includes('Beacon')).toBe(true)
      expect(vm.featuresSummary.includes('bright light')).toBe(present)
      const names = withoutSheetDescriptions(vm)
      expect(names.featuresSummary).not.toContain('bright light')
      for (const id of ['2014-official', '2024-official'] as const) {
        const bytes = await generateTestCharacterSheet(present ? vm : names, id)
        const text = (await PDFDocument.load(bytes))
          .getForm()
          .getFields()
          .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
          .join('\n')
        expect(text).toContain('Beacon')
        expect(text.includes('bright light')).toBe(present)
      }
    }
    expect(JSON.stringify(character)).toBe(before)
  }, 30000)
})
