// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { applyLevelDown, applyLevelUp } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { DEFAULT_SHEET_TEXT_OPTIONS } from '@/lib/pdf/types'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const capstone = (feature: ClassFeature) =>
  feature.name === 'Archdruid' && feature.classSource === 'PHB' && feature.source === 'PHB'

type ClassDocument = {
  class: Array<{ name: string; source: string; classFeatures: unknown[] }>
  classFeature: ClassFeature[]
}
function readCatalog(file: string, change?: (source: ClassDocument) => void) {
  const source = JSON.parse(readFileSync(file, 'utf8')) as ClassDocument
  change?.(source)
  const parsed = parseClassDocument(source)
  return composeGameDataLayers([
    makeGameDataFixture({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
      classCastingSources: parsed.classCastingSources,
    }),
  ])
}

function lookups(data: ReturnType<typeof readCatalog>) {
  return {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
}

const character = (source: 'PHB' | 'XPHB', levels: number) =>
  makeCharacterFixture({
    originSystem: source === 'PHB' ? '2014' : '2024',
    classProgression: [{ name: 'Druid', source, levels }],
    classResources: { 'druid-wild-shape': 1 },
    hitPointsInitialized: true,
  })

const apply = (saved: Character, result: CharacterCommandResult) =>
  characterPersistenceSchema.parse({
    ...saved,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })

const bundled = 'resources/srd/data/class/class-druid.json'
const configured = 'data/class/class-druid.json'
const note = 'Wild Shape (Archdruid): Unlimited uses.'

test.each([
  bundled,
  ...(existsSync(configured) ? [configured] : []),
])('projects the exact classic Archdruid through level changes and current-source restoration (%s)', (file) => {
  const data = readCatalog(file)
  const current = lookups(data)
  const at19 = character('PHB', 19)
  const levelUp = (saved: Character) =>
    apply(
      saved,
      applyLevelUp(
        saved,
        saved.provenance,
        [{ name: 'Druid', source: 'PHB', levels: 20 }],
        {
          className: 'Druid',
          classSource: 'PHB',
          classLevel: 20,
          hitDie: 8,
          dieResult: 5,
          method: 'average',
        },
        createCharacterCalculationContext(saved, current, current),
      ),
    )
  const at20 = levelUp(at19)
  const rolledBack = apply(
    at20,
    applyLevelDown(
      at20,
      at20.provenance,
      createCharacterCalculationContext(at20, current, current),
    ),
  )
  const restored = levelUp(rolledBack)
  const absent = lookups({
    ...data,
    classFeatures: data.classFeatures.filter((row) => !capstone(row)),
  })
  const archdruid = data.classFeatures.find(capstone)!
  const duplicate = lookups({ ...data, classFeatures: [...data.classFeatures, archdruid] })
  const changed = lookups({
    ...data,
    classFeatures: data.classFeatures.map((row) =>
      capstone(row) ? { ...row, entries: ['Wild Shape has two uses.'] } : row,
    ),
  })
  const rawOnly = lookups({ ...data, classes: [] })
  const verify = (saved: Character, active: typeof current, unlimited: boolean, max = 2) => {
    const view = createCharacterSheetViewModel(saved, current, active)
    const resource = view.classResourceRows.find((row) => row.label === 'Wild Shape')
    if (unlimited) expect(resource).toBeUndefined()
    else expect(resource?.max).toBe(max)
    for (const mode of [view, withoutSheetDescriptions(view)]) {
      expect(mode.featuresSummary.includes(note)).toBe(unlimited)
      expect(mode.classFeaturesSummary2014.includes(note)).toBe(unlimited)
    }
    const action = view.actions.find((row) => row.name === 'Wild Shape')
    if (active !== rawOnly) expect(action).toBeDefined()
    expect(action?.description.includes('an unlimited number of times') ?? false).toBe(unlimited)
    if (unlimited) expect(action?.description).not.toContain('You can use this feature twice')
    return action?.id
  }
  const actionId = verify(at19, current, false)
  expect(verify(at20, current, true)).toBe(actionId)
  expect(verify(rolledBack, current, false)).toBe(actionId)
  expect(verify(restored, current, true)).toBe(actionId)
  const variant = lookups(
    readCatalog(file, (source) => {
      source.classFeature = source.classFeature.map((row) =>
        capstone(row) ? { ...row, isClassFeatureVariant: true } : row,
      )
    }),
  )
  for (const rules of [absent, duplicate, changed, variant, rawOnly]) verify(at20, rules, false)
  verify(at20, current, true)
  for (const [qualifiers, unlimited] of [
    [{ tableDisplayName: 'Archdruid' }, true],
    [{ classSource: 'XPHB' }, false],
    [{ gainSubclassFeature: true }, false],
    [{ isClassFeatureVariant: true }, false],
  ] as const) {
    const wrapped = lookups(
      readCatalog(file, (source) => {
        const druid = source.class.find((row) => row.name === 'Druid' && row.source === 'PHB')!
        druid.classFeatures = druid.classFeatures.map((uid) =>
          uid === 'Archdruid|Druid||20'
            ? { classFeature: uid, ...qualifiers }
            : uid === 'Wild Shape|Druid||2'
              ? { classFeature: uid, tableDisplayName: 'Wild Shape' }
              : uid,
        )
      }),
    )
    verify(at20, wrapped, unlimited)
  }
  const reworded = lookups(
    readCatalog(file, (source) => {
      source.classFeature = source.classFeature.map((row) =>
        row.name === 'Wild Shape' && row.classSource === 'PHB' && row.source === 'PHB'
          ? {
              ...row,
              entries: row.entries?.map((entry) =>
                typeof entry === 'string'
                  ? entry.replace(
                      'You can use this feature twice.',
                      'You can use this ability two times.',
                    )
                  : entry,
              ),
            }
          : row,
      )
    }),
  )
  verify(at20, reworded, true)
  const rewordedAction = createCharacterSheetViewModel(at20, reworded, reworded).actions.find(
    (row) => row.name === 'Wild Shape',
  )
  expect(rewordedAction?.description).toMatch(
    /^Archdruid overrides the base use limit and recovery/,
  )
  expect(at20.classResources).toEqual(at19.classResources)
  expect(rolledBack.classResources).toEqual(at19.classResources)
  for (const level of [19, 20]) verify(character('XPHB', level), current, false, 4)
})

test.each([
  '2014-official',
  '2014-custom',
  '2024-official',
  '2024-custom',
] as const)('prints unlimited Wild Shape on the %s sheet in both description modes', async (template) => {
  const current = lookups(readCatalog(bundled))
  const view = createCharacterSheetViewModel(character('PHB', 20), current, current)
  for (const descriptions of ['full', 'names'] as const) {
    const bytes = await generateTestCharacterSheet(view, template, {
      text: { ...DEFAULT_SHEET_TEXT_OPTIONS, descriptions },
    })
    const fields = (await PDFDocument.load(bytes)).getForm().getFields()
    const text = fields
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
      .join(' ')
      .replace(/\s+/g, ' ')
    expect(text).toContain(note)
    expect(text).not.toContain('You can use this feature twice')
    expect(
      fields.some(
        (field) =>
          field instanceof PDFTextField &&
          /^Limited Feature \d+$/.test(field.getName()) &&
          field.getText() === 'Wild Shape',
      ),
    ).toBe(false)
  }
}, 20_000)
