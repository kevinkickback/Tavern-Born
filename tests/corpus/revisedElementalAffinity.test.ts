// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  getRevisedAffinitySetup,
  REVISED_AFFINITY_ID,
} from '@/lib/5etools/revisedElementalAffinity'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import {
  applyClassProgressionUpdate,
  applyLevelDown,
  applyLevelUp,
} from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const stacks: Array<['bundled' | 'local', string]> = [['bundled', 'resources/srd/core/data']]
if (existsSync('data/class/class-sorcerer.json')) stacks.push(['local', 'data'])
const owner = {
  name: 'Sorcerer',
  source: 'XPHB',
  subclass: 'Draconic Sorcery',
  subclassSource: 'XPHB',
}
const target = 'subclass-feature|elemental affinity|sorcerer|xphb|draconic|xphb|6|xphb'
const optionNames = ['Acid', 'Cold', 'Fire', 'Lightning', 'Poison']

function reopen(actor: Character, result?: CharacterCommandResult) {
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify(
        result
          ? { ...actor, ...result.characterPatch, provenance: result.provenanceUpdate }
          : actor,
      ),
    ),
  )
}

test('a copied subclass declaration or feature body cannot authorize the direct choice', async () => {
  const data = JSON.parse(
    await readFile('resources/srd/core/data/class/class-sorcerer.json', 'utf8'),
  )
  const native = data.subclass.find((row: Record<string, unknown>) => row.name === owner.subclass)
  const body = data.subclassFeature.find(
    (row: Record<string, unknown>) => row.name === 'Elemental Affinity' && row.source === 'XPHB',
  )
  const importedSubclass = { ...native, name: 'Imported Sorcery', source: 'HB' }
  const { subclassFeatures: _declaration, ...copyOwner } = native
  const { entries: _body, ...copyBody } = body
  const importedFeature = {
    ...body,
    name: 'Imported Elemental Affinity',
    classSource: 'PHB',
    subclassSource: 'PHB',
    source: 'HB',
  }
  const layer = (document: unknown) => {
    const parsed = parseClassDocument(document)
    return makeGameDataFixture({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
    })
  }
  const setup = (...documents: unknown[]) => {
    const combined = composeGameDataLayers(documents.map(layer))
    const { classes } = combined
    const cls = classes.find((row) => row.source === 'XPHB')
    if (!cls) throw new Error('Expected the revised Sorcerer')
    return getRevisedAffinitySetup(
      cls,
      getSelectedSubclassData(cls, owner),
      buildClassChoiceFeatureCatalogs(combined),
    )
  }
  expect(setup(data)?.options).toHaveLength(5)
  expect(
    setup({
      ...data,
      subclass: [
        importedSubclass,
        {
          ...copyOwner,
          _copy: {
            name: importedSubclass.name,
            source: importedSubclass.source,
            shortName: native.shortName,
            className: native.className,
            classSource: native.classSource,
          },
        },
      ],
    }),
  ).toBeUndefined()

  const noBody = {
    ...data,
    subclassFeature: data.subclassFeature.filter((row: unknown) => row !== body),
  }
  const mixedOwner = {
    ...data,
    class: data.class.filter((row: Record<string, unknown>) => row.source === 'PHB'),
    subclass: data.subclass
      .filter((row: Record<string, unknown>) => row.source === 'PHB')
      .map((row: { subclassFeatures: string[] }) => ({
        ...row,
        subclassFeatures: [
          ...row.subclassFeatures,
          'Elemental Affinity|Sorcerer|XPHB|Draconic|XPHB|6',
        ],
      })),
  }
  expect(setup(noBody, mixedOwner)).toBeUndefined()
  expect(setup(noBody, mixedOwner, data)?.options).toHaveLength(5)
  expect(
    setup({
      ...data,
      subclassFeature: [
        ...data.subclassFeature.filter((row: unknown) => row !== body),
        importedFeature,
        {
          ...copyBody,
          _copy: {
            name: importedFeature.name,
            source: importedFeature.source,
            className: body.className,
            classSource: importedFeature.classSource,
            subclassShortName: body.subclassShortName,
            subclassSource: importedFeature.subclassSource,
            level: body.level,
          },
        },
      ],
    }),
  ).toBeUndefined()
})

test.each(stacks)(
  'exact Elemental Affinity choice, effects, recovery, and sheet (%s)',
  async (type, root) => {
    const data = composeGameDataLayers([
      await new FiveEToolsDataLoader(
        type === 'bundled'
          ? {
              type,
              path: 'srd/core',
              packId: 'tavern-born-srd-core',
              packVersion: '1.0.1',
              isValid: true,
            }
          : { type, path: resolve(root), isValid: true },
        { type, readJson: async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8')) },
      ).loadAllData(),
    ])
    const baseCatalog = buildClassChoiceFeatureCatalogs(data)
    type Catalog = ClassChoiceFeatureCatalogs & { classes: typeof data.classes }
    const baseLookup = buildGameDataLookups(data)
    const lookup = (catalog: Catalog = baseCatalog) => ({
      ...baseLookup,
      classChoiceClasses: catalog.classes,
      classChoiceFeatureCatalogs: catalog,
    })
    const calc = (actor: Character, catalog: Catalog = baseCatalog) =>
      createCharacterCalculationContext(actor, lookup(catalog), lookup())
    const cls = data.classes.find((row) => row.name === owner.name && row.source === owner.source)
    if (!cls) throw new Error('Expected the native revised Sorcerer')
    const subclass = getSelectedSubclassData(cls, owner)
    const choices = (catalog: Catalog = baseCatalog) =>
      getCharacterClassChoices(
        cls,
        subclass,
        createOptionalClassFeatureActivity(level6, catalog),
        catalog,
      )
    const warnings = (actor: Character, catalog: Catalog = baseCatalog) =>
      validateClassChoices(actor, calc(actor, catalog), createClassChoiceCatalogs(catalog))
        .filter((row) => /Elemental Affinity/.test(row.title))
        .map((row) => row.title)
    const level5 = reopen(
      makeCharacterFixture({
        originSystem: '2024',
        allowedSources: ['XPHB', 'PHB'],
        classProgression: [{ ...owner, levels: 5 }],
      }),
    )
    const advance = (actor: Character) =>
      reopen(
        actor,
        applyLevelUp(
          actor,
          actor.provenance,
          [{ ...owner, levels: 6 }],
          {
            className: owner.name,
            classSource: owner.source,
            classLevel: 6,
            hitDie: 6,
            dieResult: 4,
            method: 'average',
          },
          calc(actor),
        ),
      )
    const level6 = advance(level5)
    const choice = choices().find((row) => row.id === REVISED_AFFINITY_ID)
    if (!choice) throw new Error('Expected the exact authored choice')
    expect(choice.options.map((row) => row.name)).toEqual(optionNames)
    expect(choice.options.map((row) => JSON.parse(row.ref ?? 'null'))).toEqual(
      optionNames.map((name) => [
        'source-group',
        'subclassFeature',
        target.slice('subclass-feature|'.length),
        'elemental-affinity-damage-type',
        name.toLowerCase(),
      ]),
    )
    const options = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(baseCatalog),
      [],
      6,
    ).filter(isClassChoiceOptionEligible)
    expect(options.map((row) => row.reference.name)).toEqual(optionNames)
    const [acid, , fire] = options.map((row) => row.reference)
    const apply = (
      actor: Character,
      selected: typeof choice.options,
      catalog: Catalog = baseCatalog,
      expected?: string,
    ) =>
      reopen(
        actor,
        applyClassChoiceSelectionWithGrantsCommand(
          actor,
          actor.provenance,
          choice,
          selected,
          { classes: catalog.classes, catalogs: catalog },
          undefined,
          expected,
        ),
      )
    const state = (actor: Character, catalog: Catalog = baseCatalog) =>
      getFeatureOptionSelectionStates(actor, catalog.classes, catalog).find(
        (row) => row.selection.choiceId === choice.id,
      )
    const sheet = (actor: Character, catalog: Catalog = baseCatalog) =>
      createCharacterSheetViewModel(actor, lookup(), lookup(catalog))
    expect(warnings(level5)).toEqual([])
    expect(() => apply(level5, [acid])).toThrow()
    expect(warnings(level6)).toEqual(['Finish Elemental Affinity'])
    expect(() => apply(level6, [acid, fire])).toThrow()
    const saved = apply(level6, [acid], baseCatalog, '')
    const savedState = state(saved)
    if (!savedState) throw new Error('Expected saved choice state')
    const handle = getOptionalPoolSelectionHandle(savedState.selection)
    expect(warnings(saved)).toEqual([])
    expect(savedState.details[0].entries[0]).toMatch(
      /acid damage.*Charisma modifier to one damage roll/,
    )
    expect(sheet(saved).defensiveTraits).toContain('acid resistance')
    expect(sheet(saved).actions.some((row) => row.name === 'Elemental Affinity')).toBe(false)
    expect(() => apply(saved, [fire], baseCatalog, '')).toThrow(/changed/)
    const independent = reopen({
      ...saved,
      manualEffects: [
        {
          id: 'independent-acid',
          label: 'Independent acid protection',
          source: { kind: 'manual', name: 'Independent acid protection' },
          target: { kind: 'damage-resistance', damageType: 'acid' },
          operation: { kind: 'grant' },
        },
      ],
    })
    const replaced = apply(independent, [fire], baseCatalog, handle)
    expect(sheet(replaced).defensiveTraits).toEqual(
      expect.arrayContaining(['acid resistance', 'fire resistance']),
    )
    expect(sheet(apply(replaced, [])).defensiveTraits).toEqual(['acid resistance'])

    const missing = {
      ...baseCatalog,
      subclassTargets: undefined,
      subclassFeatureCandidates: new Map(
        [...baseCatalog.subclassFeatureCandidates].filter(([key]) => key !== target),
      ),
    }
    expect(choices(missing).some((row) => row.id === choice.id)).toBe(false)
    expect(warnings(level6, missing)).toEqual(['Review unresolved Elemental Affinity choice'])
    expect(warnings(independent, missing)).toEqual(['Restore or remove Elemental Affinity'])
    expect(state(independent, missing)?.recovery).toBe(true)
    expect(sheet(independent, missing).defensiveTraits).toEqual(['acid resistance'])
    expect(() => apply(independent, [fire], missing, handle)).toThrow(/Current source/)
    const removed = reopen(
      independent,
      retainSavedFeatureOptionsCommand(
        independent,
        independent.provenance,
        choice.id,
        [],
        { classes: missing.classes, catalogs: missing },
        handle,
      ),
    )
    expect(state(removed)).toBeUndefined()
    expect(sheet(removed).defensiveTraits).toEqual(['acid resistance'])
    expect(state(reopen(independent))?.recovery).toBe(false)
    expect(
      calc(reopen(independent)).effects.declarations.filter(
        (row) => row.source.provenance?.choiceId === choice.id,
      ),
    ).toHaveLength(1)

    const missingSubclass = buildClassChoiceFeatureCatalogs({
      ...data,
      classes: data.classes.map((row) =>
        row === cls
          ? {
              ...row,
              subclasses: row.subclasses?.filter((subclass) => subclass.name !== owner.subclass),
            }
          : row,
      ),
    })
    expect(state(saved, missingSubclass)).toMatchObject({ recovery: true, subclass: undefined })
    expect(warnings(saved, missingSubclass)).toEqual(['Restore or remove Elemental Affinity'])
    expect(sheet(saved, missingSubclass).defensiveTraits).toEqual([])
    expect(state(reopen(saved))?.recovery).toBe(false)

    const [candidate] = baseCatalog.subclassFeatureCandidates.get(target) ?? []
    if (!candidate) throw new Error('Expected the owner-scoped Elemental Affinity feature')
    const conflict = {
      ...missing,
      subclassFeatureCandidates: new Map(missing.subclassFeatureCandidates).set(target, [
        candidate,
        { ...candidate, entries: ['Changed damage rules.'] },
      ]),
    }
    expect(warnings(saved, conflict)).toEqual(['Restore or remove Elemental Affinity'])
    expect(sheet(saved, conflict).defensiveTraits).toEqual([])

    const down = reopen(saved, applyLevelDown(saved, saved.provenance, calc(saved)))
    expect(state(down)).toBeUndefined()
    expect(sheet(down).defensiveTraits).toEqual([])
    expect(warnings(advance(down))).toEqual(['Finish Elemental Affinity'])
    const noSubclass = reopen(
      saved,
      applyClassProgressionUpdate(saved, saved.provenance, [
        { name: owner.name, source: owner.source, levels: 6 },
      ]),
    )
    expect(state(noSubclass)).toBeUndefined()
    expect(sheet(noSubclass).defensiveTraits).toEqual([])

    for (const sorcerer of data.classes.filter((row) => row.name === owner.name)) {
      const classic = sorcerer.subclasses?.find(
        (row) => row.name === 'Draconic Bloodline' && row.source === 'PHB',
      )
      if (!classic) continue
      const classicActor = makeCharacterFixture({
        originSystem: sorcerer.source === 'PHB' ? '2014' : '2024',
        allowedSources: ['PHB', 'XPHB'],
        classProgression: [
          {
            name: sorcerer.name,
            source: sorcerer.source,
            levels: 6,
            subclass: classic.name,
            subclassSource: classic.source,
          },
        ],
      })
      const classicChoices = getCharacterClassChoices(
        sorcerer,
        classic,
        createOptionalClassFeatureActivity(classicActor, baseCatalog),
        baseCatalog,
      )
      expect(classicChoices.some((row) => row.id === choice.id)).toBe(false)
      expect(classicChoices.some((row) => row.label === 'Dragon Ancestor')).toBe(true)
    }

    const selection = savedState.selection
    for (const wrong of [
      { ...selection, classSource: 'PHB' },
      { ...selection, className: 'sorcerer' },
      { ...selection, inactive: true },
      { ...selection, subclassName: 'Draconic Bloodline' },
      { ...selection, selected: [{ ...selection.selected[0], slotLevel: 7 }] },
      { ...selection, selected: [{ ...selection.selected[0], source: '' }] },
      { ...selection, selected: [{ ...selection.selected[0], name: 'Radiant' }] },
    ])
      expect(() => reopen({ ...saved, classChoiceSelections: [wrong] })).toThrow()
    expect(() => reopen({ ...saved, classChoiceSelections: [selection, selection] })).toThrow()
    for (const progression of [
      [{ ...saved.classProgression[0], subclass: ' draconic sorcery ' }],
      [...saved.classProgression, { name: owner.name, source: owner.source, levels: 1 }],
    ])
      expect(() => reopen({ ...saved, classProgression: progression })).toThrow()
    const wrongTable = {
      ...acid,
      ref: JSON.stringify([
        'subclassFeature',
        target.slice('subclass-feature|'.length),
        'elemental-affinity-damage-type',
        'acid',
      ]),
    }
    expect(() =>
      reopen({
        ...saved,
        classChoiceSelections: [
          { ...selection, choiceId: 'fake', selected: [{ ...wrongTable, slotLevel: 6 }] },
        ],
      }),
    ).toThrow()

    expect(withoutSheetDescriptions(sheet(replaced)).featuresSummary).toMatch(
      /Elemental Affinity: Fire.*fire damage.*Charisma modifier to one damage roll/,
    )
    for (const template of ['2024-official', '2024-custom'] as const) {
      const pdf = await PDFDocument.load(
        await generateTestCharacterSheet(sheet(replaced), template),
      )
      const text = pdf
        .getForm()
        .getFields()
        .filter((field) => field instanceof PDFTextField)
        .map((field) => field.getText() ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
      expect(text).toContain('Elemental Affinity: Fire')
      expect(text).toMatch(/fire damage.*Charisma modifier to one damage roll/)
    }
  },
  30_000,
)
