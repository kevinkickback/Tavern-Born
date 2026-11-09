// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { decodeClassFeatureReference } from '@/lib/5etools/classFeatureIdentity'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import {
  decodeFixedProficiencyId,
  getFixedProficiencyId,
} from '@/lib/5etools/fixedProficiencyIdentity'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getClassChoiceCandidates } from '@/lib/character/classChoiceOptions'
import { projectOwnedProficiencies } from '@/lib/character/classProficiencyFoundation'
import { selectSubclass } from '@/lib/character/commands/classCommands'
import { deriveConditionalProficiencyNotes } from '@/lib/character/conditionalProficiencyNotes'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, ClassFeature, GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const bundled = 'resources/srd/data'
const stacks: Array<['bundled' | 'local', string]> = [['bundled', bundled]]
if (existsSync('data/class/class-sorcerer.json')) stacks.push(['local', 'data'])

const subclassName = 'Draconic Bloodline'
const relation = {
  owner: ['sorcerer', 'phb', 'draconic bloodline', 'phb'] as [string, string, string, string],
  target: 'subclass-feature|dragon ancestor|sorcerer|phb|draconic|phb|1|phb',
  level: 1,
}

const reopen = (character: Character) =>
  characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))

function select(character: Character, data: GameData, name = subclassName, source = 'PHB') {
  const result = selectSubclass(character, character.provenance, name, source, undefined, {
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  })
  return reopen({ ...character, ...result.characterPatch, provenance: result.provenanceUpdate })
}

function project(character: Character, data: GameData) {
  return projectOwnedProficiencies(character, buildClassChoiceFeatureCatalogs(data)).effective
}

function sorcerer(source = 'PHB', levels = 1) {
  return createEmptyCharacter({
    name: 'Dragon Ancestor verification',
    originSystem: source === 'PHB' ? '2014' : '2024',
    classProgression: [{ name: 'Sorcerer', source, levels }],
    allowedSources: [source],
  })
}

const dragonLanguage = (character: Character) => character.proficiencies.languages
const ancestry = (data: GameData, source: string) => {
  const cls = data.classes.find((row) => row.name === 'Sorcerer' && row.source === source)
  const subclass = cls?.subclasses?.find((row) => row.name === subclassName && row.source === 'PHB')
  if (!cls || !subclass) throw new Error('Missing exact Dragon Ancestor owner')
  return getClassChoiceCandidates(cls, subclass, buildClassChoiceFeatureCatalogs(data)).find(
    (choice) => choice.label === 'Dragon Ancestor',
  )
}

test.each(stacks)(
  'native Dragon Ancestor grants one owned language through Class, save and PDFs (%s)',
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
    const current = {
      ...data,
      classes: DataFilter.filterClasses(data.classes, { sources: ['PHB'] }),
    }
    const actor = sorcerer()
    expect(dragonLanguage(project(actor, current))).toEqual([])
    const saved = select(actor, current)
    const id = getFixedProficiencyId(relation)
    expect(decodeFixedProficiencyId(id)).toEqual(relation)
    expect(dragonLanguage(saved)).toEqual(['draconic'])
    expect(saved.provenance.proficiencies.languages.draconic).toEqual([
      expect.objectContaining({
        sourceType: 'subclass',
        sourceName: subclassName,
        sourceRef: 'PHB',
        grantType: 'fixed',
        grantVariant: id,
      }),
    ])
    expect(
      dragonLanguage(
        project(reopen({ ...actor, classProgression: saved.classProgression }), current),
      ),
    ).toEqual(['draconic'])
    expect(ancestry(current, 'PHB')?.options).toHaveLength(10)
    const conditional = (character: Character, catalog: GameData) =>
      deriveConditionalProficiencyNotes(character, buildClassChoiceFeatureCatalogs(catalog)).filter(
        (effect) => effect.label.includes('Dragon Ancestor'),
      )
    expect(conditional(saved, current)).toHaveLength(type === 'local' ? 1 : 0)

    const exact = current.languages?.find((row) => row.name === 'Draconic' && row.source === 'PHB')
    if (!exact) throw new Error('Missing the PHB language printing')
    const unavailable = {
      ...current,
      languages: current.languages?.filter((row) => row !== exact),
    }
    const duplicate = { ...current, languages: [...(current.languages ?? []), { ...exact }] }
    const unrelated = {
      ...current,
      classes: current.classes.filter((row) => row.name !== 'Sorcerer'),
    }
    const manual = select(
      {
        ...actor,
        proficiencies: { ...actor.proficiencies, languages: ['draconic'] },
      },
      current,
    )
    for (const removed of [unavailable, duplicate, unrelated]) {
      expect(dragonLanguage(project(saved, removed))).toEqual([])
      expect(dragonLanguage(project(reopen(project(saved, removed)), current))).toEqual([
        'draconic',
      ])
      const retained = project(manual, removed)
      expect(dragonLanguage(retained)).toEqual(['draconic'])
      expect(retained.provenance.proficiencies.languages.draconic).toEqual([
        expect.objectContaining({ sourceType: 'manual' }),
      ])
    }
    expect(dragonLanguage(select(saved, current, '', ''))).toEqual([])
    expect(dragonLanguage(select(manual, current, '', ''))).toEqual(['draconic'])

    const mixedId = getFixedProficiencyId({
      ...relation,
      owner: ['sorcerer', 'xphb', 'draconic bloodline', 'phb'],
      level: 3,
    })
    expect(decodeFixedProficiencyId(mixedId)).toBeUndefined()
    if (type === 'local') {
      const mixed = select(sorcerer('XPHB', 3), data)
      expect(dragonLanguage(mixed)).toEqual([])
      expect(ancestry(data, 'XPHB')).toMatchObject({ level: 3 })
      expect(conditional(mixed, data)).toHaveLength(1)
      const copied = {
        ...current,
        classes: current.classes.map((row) =>
          row.name === 'Sorcerer' && row.source === 'PHB'
            ? { ...row, _copy: { name: 'Sorcerer', source: 'XPHB' } }
            : row,
        ),
      }
      expect(dragonLanguage(project(saved, copied))).toEqual([])
    }

    const sheet = createCharacterSheetViewModel(saved, buildGameDataLookups(data), {
      ...buildGameDataLookups(current),
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(current),
    })
    expect(sheet.languagesSummary).toBe('draconic')
    for (const [template, field] of [
      ['2014-official', 'ProficienciesLang'],
      ['2014-custom', 'Language 1'],
    ] as const) {
      const pdf = await PDFDocument.load(await generateTestCharacterSheet(sheet, template))
      expect(pdf.getForm().getTextField(field).getText()).toMatch(/\bdraconic\b/i)
    }
  },
  30_000,
)

test('bundled language proof requires the owning raw path even across layers', async () => {
  const source = JSON.parse(await readFile(`${bundled}/class/class-sorcerer.json`, 'utf8'))
  const languages = JSON.parse(await readFile(`${bundled}/languages.json`, 'utf8')).language
  const layer = (document: unknown) => {
    const parsed = parseClassDocument(document, 'class/class-sorcerer.json')
    return makeGameDataFixture({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
      languages,
    })
  }
  const features: Record<string, unknown>[] = source.subclassFeature
  const intro = features.find((row) => row.name === subclassName && row.source === 'PHB')
  const leaf = features.find((row) => row.name === 'Dragon Ancestor' && row.source === 'PHB')
  if (!intro || !leaf) throw new Error('Missing the exact raw native path')
  const base = layer(source)
  const saved = select(sorcerer(), base)
  expect(dragonLanguage(saved)).toEqual(['draconic'])
  const cleric = JSON.parse(await readFile(`${bundled}/class/class-cleric.json`, 'utf8'))
  const combined = layer(
    Object.fromEntries(
      ['class', 'classFeature', 'subclass', 'subclassFeature'].map((field) => [
        field,
        [...source[field], ...cleric[field]],
      ]),
    ),
  )
  const lifeCleric = createEmptyCharacter({
    name: 'Life Domain verification',
    originSystem: '2014',
    classProgression: [{ name: 'Cleric', source: 'PHB', levels: 1 }],
  })
  expect(dragonLanguage(select(sorcerer(), combined))).toEqual(['draconic'])
  expect(select(lifeCleric, combined, 'Life Domain').proficiencies.armor).toContain('heavy')
  const without = features.filter((row) => row !== leaf)
  for (const invalid of [
    { ...source, subclassFeature: features.filter((row) => row !== intro) },
    { ...source, subclassFeature: without },
    {
      ...source,
      subclassFeature: [...without, { ...leaf, entries: ['You might learn Draconic.'] }],
    },
    { ...source, subclassFeature: [...features, leaf] },
  ]) {
    const lost = composeGameDataLayers([base, layer(invalid)])
    expect(dragonLanguage(project(saved, lost))).toEqual([])
    expect(dragonLanguage(project(saved, composeGameDataLayers([lost, base])))).toEqual([
      'draconic',
    ])
  }
  const nativeGain = 'Sorcerous Origin|Sorcerer||1'
  const malformedGains = layer({
    ...source,
    class: source.class.map((row: { source: string }) =>
      row.source === 'PHB' ? { ...row, classFeatures: nativeGain } : row,
    ),
  })
  expect(dragonLanguage(project(saved, malformedGains))).toEqual([])
  const withClassGains = (uids: unknown[], metadata: Record<string, unknown> = {}) =>
    layer({
      ...source,
      class: source.class.map((row: { source: string; classFeatures: unknown[] }) =>
        row.source !== 'PHB'
          ? row
          : {
              ...row,
              classFeatures: row.classFeatures.flatMap((ref) =>
                typeof ref === 'object' &&
                ref &&
                'classFeature' in ref &&
                ref.classFeature === nativeGain
                  ? uids.map((classFeature) => ({ ...ref, classFeature, ...metadata }))
                  : [ref],
              ),
            },
      ),
    })
  for (const invalid of [
    ['Sorcerous Origin|Sorcerer||2'],
    ['Spellcasting|Sorcerer||1'],
    ['Sorcerous Origin|Sorcerer|XPHB|1'],
    [nativeGain, nativeGain],
    [nativeGain, 1],
    [nativeGain, 'Sorcerous Origin feature|Sorcerer||invalid'],
    [nativeGain, 'Sorcerous Origin feature|Sorcerer||6|PHB|extra'],
    [nativeGain, 'Sorcerous Origin feature|Wizard||6'],
  ]) {
    expect(dragonLanguage(project(saved, withClassGains(invalid)))).toEqual([])
  }
  for (const conflict of [
    { source: 'XPHB' },
    { classSource: 'XPHB' },
    { className: 'Wizard' },
    { name: 'Spellcasting' },
    { level: 2 },
    { sourceIdentityConflict: true },
    { condition: 'Only outdoors' },
  ]) {
    expect(dragonLanguage(project(saved, withClassGains([nativeGain], conflict)))).toEqual([])
  }
  expect(
    dragonLanguage(
      project(
        saved,
        withClassGains([' Sorcerous Origin | sorcerer | PHB | 1 | PHB '], {
          source: 'phb',
          classSource: ' PHB ',
          className: 'sorcerer',
          name: 'Sorcerous Origin',
          level: 1,
        }),
      ),
    ),
  ).toEqual(['draconic'])
  // The structured gain remains authoritative when only its display text is absent.
  const noGainBody = layer({
    ...source,
    classFeature: source.classFeature.filter(
      (row: ClassFeature) =>
        !(row.name === 'Sorcerous Origin' && row.source === 'PHB' && row.level === 1),
    ),
  })
  expect(dragonLanguage(project(saved, noGainBody))).toEqual(['draconic'])
  const invalidParsedGain = {
    ...base,
    classes: base.classes.map((row) =>
      row.name === 'Sorcerer' && row.source === 'PHB'
        ? {
            ...row,
            classFeatureRefs: [
              ...(row.classFeatureRefs ?? []),
              {
                ...decodeClassFeatureReference('Sorcerous Origin feature|Sorcerer||6'),
                level: 14,
                gainSubclassFeature: true,
              },
            ],
          }
        : row,
    ),
  }
  expect(dragonLanguage(project(saved, invalidParsedGain))).toEqual([])
})
