// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { applyLevelDown, applyLevelUp } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetTemplateId } from '@/lib/pdf/types'
import type { Class5e, ClassFeature, GameData, Subclass5e, SubclassFeature } from '@/types/5etools'
import type { CharacterAction } from '@/types/actions'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const target = 'subclass-feature|dragon companion|sorcerer|xphb|draconic|xphb|18|xphb'
const gain = 'class-feature|subclass feature|sorcerer|xphb|18|xphb'
const firstGain = 'class-feature|sorcerer subclass|sorcerer|xphb|3|xphb'
const spellKey = getSpellReferenceKey('Summon Dragon', 'XPHB')
const revisedOwner = {
  name: 'Sorcerer',
  source: 'XPHB',
  subclass: 'Draconic Sorcery',
  subclassSource: 'XPHB',
}
const rules = [
  /Summon Dragon\s+without a Material component/i,
  /once without a spell slot.*finish a Long Rest/i,
  /doesn't require Concentration.*duration becomes 1 minute/i,
]

const stacks = ['bundled', ...(existsSync('data/class/class-sorcerer.json') ? ['composed'] : [])]

function loadLayer(type: 'bundled' | 'local') {
  const root = type === 'bundled' ? 'resources/srd/core/data' : 'data'
  return new FiveEToolsDataLoader(
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
  ).loadAllData()
}

function lookups(data: GameData) {
  return {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
}

function reopen(character: Character, result?: CharacterCommandResult) {
  const saved = result
    ? { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
    : character
  return characterPersistenceSchema.parse(JSON.parse(JSON.stringify(saved)))
}

test.each(
  stacks,
)('the exact earned Dragon Companion rules print in both revised layouts (%s)', async (stack) => {
  const bundled = await loadLayer('bundled')
  const data = composeGameDataLayers(
    stack === 'composed' ? [bundled, await loadLayer('local')] : [bundled],
  )
  const raw = lookups(data)
  const filtered = (...keys: string[]) => {
    const filter = { sources: ['XPHB'], suppressedKeys: new Set(keys) }
    return lookups({
      ...data,
      classes: DataFilter.filterClasses(data.classes, filter),
      classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filter),
    })
  }
  const current = filtered()
  const withoutCompanion = filtered(target)
  const withoutGain = filtered(gain)
  const sheet = (actor: Character, primary = current) =>
    createCharacterSheetViewModel(actor, raw, primary)
  const calc = (actor: Character) => createCharacterCalculationContext(actor, current, raw)
  const owner = { ...revisedOwner, levels: 17 }
  const before = reopen(
    createEmptyCharacter({
      name: 'Revised Draconic verification',
      originSystem: '2024',
      allowedSources: ['XPHB'],
      classProgression: [owner],
    }),
  )

  const advance = (actor: Character) =>
    reopen(
      actor,
      applyLevelUp(
        actor,
        actor.provenance,
        [{ ...owner, levels: 18 }],
        {
          className: owner.name,
          classSource: owner.source,
          classLevel: 18,
          hitDie: 6,
          dieResult: 4,
          method: 'average',
        },
        calc(actor),
      ),
    )
  const earned = advance(before)
  const dropped = reopen(earned, applyLevelDown(earned, earned.provenance, calc(earned)))
  const view = sheet(earned)
  expect(view.classFeaturesSummary2014.match(/Dragon Companion:/g)).toHaveLength(1)
  for (const rule of rules) expect(view.classFeaturesSummary2014).toMatch(rule)
  expect(sheet(advance(dropped)).classFeaturesSummary2014).toBe(view.classFeaturesSummary2014)
  expect(earned.features).toEqual(before.features)

  for (const variant of [
    sheet(before),
    sheet(dropped),
    sheet(earned, withoutCompanion),
    sheet(earned, withoutGain),
    sheet(earned, filtered(firstGain)),
    sheet({
      ...earned,
      classProgression: [
        { ...owner, levels: 17 },
        { name: 'Fighter', source: 'XPHB', levels: 3 },
      ],
    }),
    sheet({ ...earned, classProgression: [{ ...owner, levels: 18, subclassSource: 'PHB' }] }),
  ]) {
    expect(variant.classFeaturesSummary2014).not.toContain('Dragon Companion')
  }
  for (const actor of [before, earned, dropped]) {
    for (const primary of [current, withoutCompanion, withoutGain]) {
      expect(
        sheet(actor, primary).spellRows.some((row) => row.id === spellKey && row.prepared),
      ).toBe(true)
    }
  }
  expect(
    sheet(earned, filtered('class-feature|innate sorcery|sorcerer|xphb|1|xphb'))
      .classFeaturesSummary2014,
  ).toContain('Dragon Companion')
  const manual = sheet({
    ...earned,
    features: [
      {
        id: 'manual',
        name: 'Dragon Companion',
        source: 'Manual',
        description: 'Personal field note.',
      },
    ],
  })
  expect(manual.classFeaturesSummary2014).toContain('Dragon Companion: Personal field note.')
  expect(manual.classFeaturesSummary2014).toMatch(rules[0])

  const catalog = current.classChoiceFeatureCatalogs
  const conflicted = new Map(catalog.subclassTargets.candidatesByOwner)
  const key = JSON.stringify(['sorcerer|xphb', 'draconic sorcery|xphb'])
  const byTarget = new Map(conflicted.get(key))
  const candidates = byTarget.get(target) ?? []
  expect(candidates.length).toBeGreaterThan(0)
  byTarget.set(target, [...candidates, { ...candidates[0], entries: ['Conflicting rules.'] }])
  conflicted.set(key, byTarget)
  expect(
    sheet(earned, {
      ...current,
      classChoiceFeatureCatalogs: {
        ...catalog,
        subclassTargets: { ...catalog.subclassTargets, candidatesByOwner: conflicted },
      },
    }).classFeaturesSummary2014,
  ).not.toContain('Dragon Companion')

  for (const layout of ['2024-official', '2024-custom'] as const) {
    const read = async (description: 'full' | 'names', input = view) => {
      const bytes = await generateTestCharacterSheet(input, layout, {
        text: { descriptions: description, overflow: 'notes' },
      })
      const fields = (await PDFDocument.load(bytes)).getForm().getFields()
      return fields.flatMap((field) =>
        field instanceof PDFTextField
          ? [{ name: field.getName(), value: field.getText() ?? '' }]
          : [],
      )
    }
    const text = (rows: { value: string }[]) =>
      rows
        .map((row) => row.value)
        .join(' ')
        .replace(/\s+/g, ' ')
    const full = text(await read('full'))
    expect(full.match(/Dragon Companion:/g)).toHaveLength(1)
    for (const rule of rules) expect(full).toMatch(rule)
    const names = text(await read('names'))
    expect(names.match(/Dragon Companion/g)).toHaveLength(1)
    for (const rule of rules) expect(names).not.toMatch(rule)
    const overflow = await read('full', {
      ...view,
      classFeaturesSummary2014: [
        'Long field journal. '.repeat(340),
        'Long travel journal. '.repeat(230),
        view.classFeaturesSummary2014,
      ].join('\n\n'),
    })
    const notes = text(overflow.filter((row) => /Notes\.(Left|Right)$/.test(row.name)))
    expect(notes.match(/Dragon Companion:/g)).toHaveLength(1)
    for (const rule of rules) expect(notes).toMatch(rule)
  }
}, 120_000)

test('a malformed parsed subclass short name leaves the sheet exportable', async () => {
  const path = 'class/class-sorcerer.json'
  const raw = JSON.parse(await readFile(`resources/srd/core/data/${path}`, 'utf8'))
  const parsed = parseClassDocument(
    {
      ...raw,
      subclass: raw.subclass.map((row: Subclass5e) =>
        row.name === 'Draconic Sorcery' && row.classSource === 'XPHB' && row.source === 'XPHB'
          ? { ...row, shortName: 3 }
          : row,
      ),
    },
    path,
  )
  const current = lookups(
    makeGameDataFixture({
      classes: DataFilter.filterClasses(parsed.classes as Class5e[], { sources: ['XPHB'] }),
      classFeatures: DataFilter.filterClassFeatures(parsed.classFeatures as ClassFeature[], {
        sources: ['XPHB'],
      }),
    }),
  )
  const actor = reopen(
    createEmptyCharacter({
      name: 'Malformed source verification',
      originSystem: '2024',
      allowedSources: ['XPHB'],
      classProgression: [{ ...revisedOwner, levels: 18 }],
    }),
  )
  const sheet = createCharacterSheetViewModel(actor, current, current)
  expect(sheet.classFeaturesSummary2014).not.toContain('Dragon Companion')
  expect(sheet.classFeaturesSummary2014).toContain('Innate Sorcery')
})

const wingPrintings = [
  {
    source: 'PHB',
    originSystem: '2014',
    subclass: 'Draconic Bloodline',
    first: 'class-feature|sorcerous origin|sorcerer|phb|1|phb',
    gain: 'class-feature|sorcerous origin feature|sorcerer|phb|14|phb',
    leaf: 'subclass-feature|dragon wings|sorcerer|phb|draconic|phb|14|phb',
    layouts: ['2014-official', '2014-custom'],
    rules: [
      /flying speed equal to your current speed/i,
      /create these wings as a bonus action.*dismiss them as a bonus action/i,
      /while wearing armor unless the armor is made to accommodate them.*clothing.*might be destroyed/i,
    ],
  },
  {
    source: 'XPHB',
    originSystem: '2024',
    subclass: 'Draconic Sorcery',
    first: 'class-feature|sorcerer subclass|sorcerer|xphb|3|xphb',
    gain: 'class-feature|subclass feature|sorcerer|xphb|14|xphb',
    leaf: 'subclass-feature|dragon wings|sorcerer|xphb|draconic|xphb|14|xphb',
    layouts: ['2024-official', '2024-custom'],
    rules: [
      /as a Bonus Action.*wings last for 1 hour.*dismiss them \(no action required\)/i,
      /Fly Speed of 60 feet/i,
      /finish a Long Rest unless you spend 3 Sorcery Points \(no action required\)/i,
    ],
  },
] as const

test('native Wings fallback uses its own direct producer across parsed layers', async () => {
  const path = 'class/class-sorcerer.json'
  const raw: { class: Class5e[]; subclass: Subclass5e[]; subclassFeature: SubclassFeature[] } =
    JSON.parse(await readFile(`resources/srd/core/data/${path}`, 'utf8'))
  const parse = (document: typeof raw, layer: string) => {
    const parsed = parseClassDocument(document, `${layer}/${path}`)
    return makeGameDataFixture({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
    })
  }
  const direct = parse(raw, 'direct')
  for (const { source, originSystem, subclass, rules } of wingPrintings) {
    const cls = raw.class.find((row) => row.name === 'Sorcerer' && row.source === source)
    const owner = raw.subclass.find((row) => row.name === subclass && row.classSource === source)
    const wings = raw.subclassFeature.find(
      (row) => row.name === 'Dragon Wings' && row.classSource === source && row.source === source,
    )
    const uid = owner?.subclassFeatures?.find(
      (row) => typeof row === 'string' && row.startsWith('Dragon Wings|'),
    )
    if (!cls || !owner || !wings || typeof uid !== 'string') throw new Error('Missing native Wings')
    const replace = (row?: SubclassFeature) => ({
      ...raw,
      subclassFeature: raw.subclassFeature.flatMap((entry) =>
        entry !== wings ? [entry] : row ? [row] : [],
      ),
    })
    const missing = parse(replace(), 'missing-body')
    const changed = parse(replace({ ...wings, entries: ['Replacement Wings rules.'] }), 'changed')
    const { entries: _entries, ...identity } = wings
    const copyParent = { ...wings, name: 'Wings Copy Parent' }
    const copied = parse(
      {
        ...raw,
        subclassFeature: [
          ...replace().subclassFeature,
          copyParent,
          { ...identity, _copy: { ...identity, name: copyParent.name } } as SubclassFeature,
        ],
      },
      'copied',
    )
    const duplicate = parse(
      {
        ...raw,
        subclass: raw.subclass.map((row) =>
          row === owner
            ? {
                ...row,
                subclassFeatures: [
                  ...(row.subclassFeatures ?? []),
                  { subclassFeature: uid },
                ] as Subclass5e['subclassFeatures'],
              }
            : row,
        ),
      },
      'duplicate-declaration',
    )
    const foreign = parse(
      {
        ...raw,
        class: [{ ...cls, name: 'Foreign Wings Class', source: 'TCE' }],
        subclass: [
          {
            ...owner,
            name: 'Foreign Wings Owner',
            source: 'TCE',
            className: 'Foreign Wings Class',
            classSource: 'TCE',
            subclassFeatures: [uid],
          },
        ],
        subclassFeature: [wings],
      },
      'foreign',
    )
    const actor = reopen(
      createEmptyCharacter({
        name: 'Existing Wings owner',
        originSystem,
        allowedSources: [source, 'TCE'],
        classProgression: [
          { name: cls.name, source, subclass, subclassSource: source, levels: 14 },
        ],
      }),
    )
    const sheet = (...layers: GameData[]) => {
      const data = composeGameDataLayers(layers)
      const filter = { sources: [source, 'TCE'] }
      const filtered = lookups({
        ...data,
        classes: DataFilter.filterClasses(data.classes, filter),
        classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filter),
      })
      return createCharacterSheetViewModel(actor, lookups(data), filtered)
    }
    for (const view of [sheet(direct), sheet(direct, missing), sheet(copied, direct)]) {
      for (const rule of rules) expect(view.classFeaturesSummary2014).toMatch(rule)
    }
    for (const view of [
      sheet(copied),
      sheet(direct, copied, missing),
      sheet(direct, duplicate, missing),
      sheet(direct, changed, foreign),
      sheet(missing, foreign),
    ]) {
      expect(view.classFeaturesSummary2014).not.toContain('Dragon Wings')
    }
    const copiedAction = sheet(copied).actions.find((action) => action.name === 'Dragon Wings')
    for (const rule of rules) expect(copiedAction?.description).toMatch(rule)
  }
})

test.each(
  stacks,
)('earned Dragon Wings print with their native rules and existing action notes (%s)', async (stack) => {
  const bundled = await loadLayer('bundled')
  const data = composeGameDataLayers(
    stack === 'composed' ? [bundled, await loadLayer('local')] : [bundled],
  )
  const raw = lookups(data)
  for (const {
    source,
    originSystem,
    subclass,
    first,
    gain,
    leaf,
    layouts,
    rules,
  } of wingPrintings) {
    const filtered = (...keys: string[]) => {
      const filter = { sources: [source], suppressedKeys: new Set(keys) }
      return lookups({
        ...data,
        classes: DataFilter.filterClasses(data.classes, filter),
        classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filter),
      })
    }
    const current = filtered()
    const sheet = (actor: Character, primary = current) =>
      createCharacterSheetViewModel(actor, raw, primary)
    const calc = (actor: Character) => createCharacterCalculationContext(actor, current, raw)
    const owner = { name: 'Sorcerer', source, subclass, subclassSource: source, levels: 13 }
    const before = reopen(
      createEmptyCharacter({
        name: `${subclass} Dragon Wings verification`,
        originSystem,
        allowedSources: [source],
        classProgression: [owner],
      }),
    )
    const advance = (actor: Character) =>
      reopen(
        actor,
        applyLevelUp(
          actor,
          actor.provenance,
          [{ ...owner, levels: 14 }],
          {
            className: owner.name,
            classSource: source,
            classLevel: 14,
            hitDie: 6,
            dieResult: 4,
            method: 'average',
          },
          calc(actor),
        ),
      )
    const earned = advance(before)
    const dropped = reopen(earned, applyLevelDown(earned, earned.provenance, calc(earned)))
    const view = sheet(earned)
    for (const rule of rules) expect(view.classFeaturesSummary2014).toMatch(rule)
    expect(earned.features).toEqual(before.features)
    expect(sheet(advance(dropped)).classFeaturesSummary2014).toBe(view.classFeaturesSummary2014)
    for (const variant of [
      sheet(before),
      sheet(dropped),
      sheet(earned, filtered(first)),
      sheet(earned, filtered(gain)),
      sheet(earned, filtered(leaf)),
      sheet(earned, filtered(`${subclass}|${source}`)),
      sheet({ ...earned, classProgression: [owner, { name: 'Fighter', source, levels: 2 }] }),
      sheet({
        ...earned,
        classProgression: [
          { ...owner, levels: 14, subclassSource: source === 'PHB' ? 'XPHB' : 'PHB' },
        ],
      }),
    ]) {
      expect(variant.classFeaturesSummary2014).not.toContain('Dragon Wings')
    }
    const manualFeature = sheet({
      ...earned,
      features: [
        {
          id: 'manual-feature',
          name: 'Dragon Wings',
          source: 'Manual',
          description: 'Personal wing pattern.',
        },
      ],
    })
    expect(manualFeature.classFeaturesSummary2014).toContain('Dragon Wings: Personal wing pattern.')
    for (const rule of rules) expect(manualFeature.classFeaturesSummary2014).toMatch(rule)
    const native = view.actions.find((action) => action.name === 'Dragon Wings')
    expect(native).toMatchObject({ kind: 'bonus-action', source: { kind: 'subclass', source } })
    const action: CharacterAction = {
      id: 'manual-wings',
      name: 'Dragon Wings',
      kind: 'bonus-action',
      description: 'Independent glider note.',
      source: { kind: 'manual', name: 'Dragon Wings' },
      active: true,
    }
    const read = async (
      layout: CharacterSheetTemplateId,
      input = view,
      options: Parameters<typeof generateTestCharacterSheet>[2] = {},
    ) => {
      const bytes = await generateTestCharacterSheet(input, layout, options)
      const fields = (await PDFDocument.load(bytes)).getForm().getFields()
      const text = (rows: PDFTextField[]) =>
        rows
          .map((row) => row.getText() ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
      const rows = fields.filter((field) => field instanceof PDFTextField)
      return {
        full: text(rows),
        notes: text(rows.filter((row) => /Notes\.(Left|Right)$/.test(row.getName()))),
        core: text(rows.filter((row) => !/Notes\.(Left|Right)$/.test(row.getName()))),
      }
    }
    for (const layout of layouts) {
      const full = await read(layout, view, { text: { overflow: 'notes' } })
      for (const rule of rules) expect(full.full).toMatch(rule)
      const names = await read(layout, view, { text: { descriptions: 'names', overflow: 'notes' } })
      expect(names.full).toContain('Dragon Wings')
      for (const rule of rules) expect(names.full).not.toMatch(rule)
      if (layout !== '2014-custom') {
        const crowded = [
          'Long field journal. '.repeat(340),
          'Long travel journal. '.repeat(230),
          view.classFeaturesSummary2014,
        ].join('\n\n')
        const continuation = await read(
          layout,
          { ...view, classFeaturesSummary2014: crowded, featuresSummary: crowded },
          { text: { overflow: 'notes' } },
        )
        for (const rule of rules) expect(continuation.notes).toMatch(rule)
        continue
      }
      const manual = sheet({ ...earned, manualActions: [action] })
      const defaults = await read(layout, manual)
      expect(defaults.notes).toContain('Independent glider note')
      expect(defaults.core).toContain('Dragon Wings')
      const deselected = { 'bonus-action': [action.id] }
      const actionOverflow = await read(layout, manual, {
        content: deselected,
        text: { overflow: 'notes' },
      })
      expect(actionOverflow.notes).toContain('Independent glider note')
      for (const output of [full, defaults, actionOverflow]) {
        for (const rule of rules) expect(output.notes).toMatch(rule)
        expect(output.full.match(/flying speed equal to your current speed/gi)).toHaveLength(1)
      }
      const withoutActionNotes = await read(layout, manual, {
        content: deselected,
        pages: { notes: false },
      })
      for (const rule of rules) expect(withoutActionNotes.core).toMatch(rule)
      const ellipsis = await read(layout, manual, { content: deselected })
      for (const rule of rules) expect(ellipsis.core).toMatch(rule)
      if (!native) throw new Error('Missing the earned native bonus action')
      const sameId = await read(
        layout,
        sheet({ ...earned, manualActions: [{ ...action, id: native.id }] }),
      )
      expect(sameId.notes).toContain('Independent glider note')
      for (const rule of rules) expect(sameId.core).toMatch(rule)
    }
  }
}, 120_000)
