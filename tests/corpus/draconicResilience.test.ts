// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import type { EntityLookupSet } from '@/lib/5etools/entityResolvers'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  applyClassProgressionUpdate,
  applyLevelDown,
  applyLevelUp,
} from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { getEffectiveMaxHP } from '@/lib/characterUtils'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, ClassFeature, GameData, SubclassFeature } from '@/types/5etools'
import type { Character, Equipment } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const stacks: Array<['bundled' | 'local', string]> = [['bundled', 'resources/srd/core/data']]
if (existsSync('data/class/class-sorcerer.json')) stacks.push(['local', 'data'])

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

function lookups(data: GameData) {
  return {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
}

function makeSorcerer(originSystem: Character['originSystem']) {
  const classic = originSystem === '2014'
  const source = classic ? 'PHB' : 'XPHB'
  return reopen(
    makeCharacterFixture({
      name: 'Resilience verification',
      originSystem,
      race: '',
      background: '',
      allowedSources: [source],
      classProgression: [
        {
          name: 'Sorcerer',
          source,
          subclass: classic ? 'Draconic Bloodline' : 'Draconic Sorcery',
          subclassSource: source,
          levels: classic ? 1 : 3,
        },
      ],
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 16,
      },
    }),
  )
}

test.each(stacks)(
  'native Draconic Resilience totals, level changes, and PDFs (%s)',
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
    const raw = lookups(data)
    for (const edition of ['2014', '2024'] as const) {
      const actor = makeSorcerer(edition)
      const [sorcerer] = actor.classProgression
      const { source, levels } = sorcerer
      const primary = lookups({
        ...data,
        classes: DataFilter.filterClasses(data.classes, { sources: [source] }),
      })
      const sheet = (character: Character, current = primary) =>
        createCharacterSheetViewModel(character, raw, current)
      const calc = (character: Character) =>
        createCharacterCalculationContext(character, primary, raw)
      const stats = (character: Character, current = primary) => {
        const vm = sheet(character, current)
        return [vm.maxHP, vm.effectiveArmorClass]
      }
      const hp = edition === '2014' ? 9 : 23
      expect(stats(actor)).toEqual([hp, 15])

      const rolled = reopen(
        actor,
        applyLevelUp(
          actor,
          actor.provenance,
          [{ ...sorcerer, levels: levels + 1 }],
          {
            className: sorcerer.name,
            classSource: source,
            classLevel: levels + 1,
            hitDie: 6,
            dieResult: 3,
            method: 'rolled',
          },
          calc(actor),
        ),
      )
      expect(rolled.hitPoints.current).toBe(hp + 6)
      expect(stats(rolled)).toEqual([hp + 6, 15])
      expect(
        stats(reopen(rolled, applyLevelDown(rolled, rolled.provenance, calc(rolled)))),
      ).toEqual([hp, 15])

      const withoutSubclass = reopen(
        actor,
        applyClassProgressionUpdate(actor, actor.provenance, [
          { name: sorcerer.name, source, levels },
        ]),
      )
      expect(stats(withoutSubclass)).toEqual([hp - levels, 12])
      if (edition === '2024') {
        expect(stats({ ...actor, classProgression: [{ ...sorcerer, levels: 2 }] })).toEqual([
          14, 12,
        ])
        expect(
          stats(
            {
              ...actor,
              classProgression: [
                { ...sorcerer, subclass: 'Draconic Bloodline', subclassSource: 'PHB' },
              ],
            },
            raw,
          ),
        ).toEqual([20, 12])
      }
      const unavailable = lookups({
        ...data,
        classes: primary.classChoiceClasses.filter((cls) => cls.name !== 'Sorcerer'),
      })
      expect(stats(actor, unavailable)).toEqual([hp - levels, 12])
      expect(stats(reopen(actor))).toEqual([hp, 15])
      const duplicateOwner = reopen({
        ...actor,
        classProgression: [sorcerer, { name: sorcerer.name, source, levels: 1 }],
      })
      expect(stats(duplicateOwner)).toEqual([hp - levels + 6, 12])

      const shield: Equipment = {
        id: 'shield',
        name: 'Shield',
        type: 'S',
        quantity: 1,
        equipped: true,
        armorType: 'shield',
        ac: 2,
      }
      const chain: Equipment = {
        id: 'chain',
        name: 'Chain Mail',
        type: 'HA',
        quantity: 1,
        equipped: true,
        armorType: 'heavy',
        ac: 16,
      }
      const fighter = { name: 'Fighter', source, levels: 1 }
      const multiclass = reopen({
        ...actor,
        classProgression: [sorcerer, fighter],
        equipment: [shield],
      })
      expect(stats(multiclass)).toEqual([hp + 8, 17])
      expect(stats({ ...multiclass, equipment: [shield, chain] })).toEqual([hp + 8, 18])
      expect(stats({ ...multiclass, equipment: [shield, { ...chain, equipped: false }] })).toEqual([
        hp + 8,
        17,
      ])
      expect(
        stats({ ...actor, abilityScores: { ...actor.abilityScores, dexterity: 16, charisma: 8 } }),
      ).toEqual([hp, edition === '2014' ? 16 : 13])
      const adjustment = {
        id: 'independent',
        label: 'Independent bonus',
        amount: 2,
        sourceType: 'manual' as const,
        createdAt: actor.createdAt,
      }
      const adjusted = reopen({
        ...actor,
        armorClassAdjustments: [adjustment],
        hitPointAdjustments: [{ ...adjustment, mode: 'per-level' }],
      })
      expect(stats(adjusted)).toEqual([hp + 2 * levels, 17])
      expect(stats(adjusted, unavailable)).toEqual([hp + levels, 14])
      expect(
        stats(reopen({ ...adjusted, armorClassOverride: 11, maxHitPointsOverride: 31 })),
      ).toEqual([31, 11])
      const competing = reopen({
        ...adjusted,
        manualEffects: [
          {
            id: 'competing-base',
            label: 'Other base',
            target: { kind: 'armor-class' },
            source: { kind: 'manual', name: 'Other base' },
            operation: { kind: 'base', value: 18 },
          },
        ],
      })
      expect(stats(competing)).toEqual([hp + 2 * levels, 20])

      for (const printing of ['official', 'custom'] as const) {
        const pdf = await PDFDocument.load(
          await generateTestCharacterSheet(sheet(actor), `${edition}-${printing}`),
        )
        const form = pdf.getForm()
        const acField = edition === '2024' ? 'Text_8' : 'AC'
        const hpField =
          edition === '2024' ? 'Text_11' : printing === 'official' ? 'HPMax' : 'HP Max'
        expect(form.getTextField(acField).getText()).toBe('15')
        expect(form.getTextField(hpField).getText()).toBe(String(hp))
      }
    }
  },
  40_000,
)

test('only a complete owning native intro and leaf authorize Resilience across layers', async () => {
  const original = JSON.parse(
    await readFile('resources/srd/core/data/class/class-sorcerer.json', 'utf8'),
  )
  const actor = makeSorcerer('2024')
  const layer = (document: unknown) => {
    const parsed = parseClassDocument(document)
    return makeGameDataFixture({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
    })
  }
  const features: SubclassFeature[] = original.subclassFeature
  const intro = features.find(
    (feature) => feature.name === 'Draconic Sorcery' && feature.source === 'XPHB',
  )
  const leaf = features.find(
    (feature) => feature.name === 'Draconic Resilience' && feature.source === 'XPHB',
  )
  if (!intro || !leaf) throw new Error('Expected the authored revised intro and leaf')
  const base = layer(original)
  const raw = lookups(base)
  const maximumWith = (current: EntityLookupSet) => {
    const context = createCharacterCalculationContext(actor, current, raw)
    return getEffectiveMaxHP(
      actor,
      context.classes,
      context.abilityScores.total,
      context.effects.sourceDeclarations,
    )
  }
  const maximum = (...layers: GameData[]) => maximumWith(lookups(composeGameDataLayers(layers)))
  const {
    subclassTargets,
    subclassFeatureCandidates: _candidateIndex,
    ...flat
  } = raw.classChoiceFeatureCatalogs
  expect(maximumWith({ ...raw, classChoiceFeatureCatalogs: flat })).toBe(23)
  expect(
    maximumWith({
      ...raw,
      classChoiceFeatureCatalogs: { ...flat, subclassFeatures: [] },
    }),
  ).toBe(20)
  expect(
    maximumWith({
      ...raw,
      classChoiceFeatureCatalogs: {
        ...flat,
        subclassTargets: { ...subclassTargets, candidatesByOwner: new Map() },
      },
    }),
  ).toBe(20)
  const forgedAttachment = {
    ...intro,
    entries: intro.entries?.map((entry) =>
      typeof entry === 'object' &&
      entry &&
      'subclassFeature' in entry &&
      typeof entry.subclassFeature === 'string' &&
      entry.subclassFeature.startsWith('Draconic Resilience|')
        ? { ...entry, feature: leaf }
        : entry,
    ),
  }
  expect(
    maximum(
      base,
      layer({
        ...original,
        subclassFeature: [
          ...features.filter((row) => row !== intro && row !== leaf),
          forgedAttachment,
        ],
      }),
    ),
  ).toBe(20)
  const alternateIntro = layer({
    ...original,
    subclass: original.subclass.map((row: { name: string; subclassFeatures: string[] }) =>
      row.name === 'Draconic Sorcery'
        ? {
            ...row,
            subclassFeatures: [
              'Draconic Sorcery|Sorcerer|XPHB|Draconic|XPHB|3|TCE',
              ...row.subclassFeatures,
            ],
          }
        : row,
    ),
    subclassFeature: [
      ...features,
      { ...intro, source: 'TCE', entries: ['Alternate introduction.'] },
    ],
  })
  expect(maximum(base, alternateIntro)).toBe(20)
  expect(
    maximum(base, {
      ...alternateIntro,
      classes: DataFilter.filterClasses(alternateIntro.classes, { sources: ['XPHB'] }),
    }),
  ).toBe(20)
  const delayedClassGain = layer({
    ...original,
    class: original.class.map((row: { source: string; classFeatures: unknown[] }) =>
      row.source === 'XPHB'
        ? {
            ...row,
            classFeatures: row.classFeatures.map((ref) =>
              typeof ref === 'object' &&
              ref &&
              'classFeature' in ref &&
              ref.classFeature === 'Sorcerer Subclass|Sorcerer|XPHB|3'
                ? { ...ref, classFeature: 'Sorcerer Subclass|Sorcerer|XPHB|4' }
                : ref,
            ),
          }
        : row,
    ),
  })
  expect(maximum(base, delayedClassGain)).toBe(20)
  for (const feature of [intro, leaf]) {
    const without = features.filter((row) => row !== feature)
    for (const source of [undefined, ' ', ' xphb ']) {
      const defaulted = layer({
        ...original,
        subclassFeature: [...without, { ...feature, source }],
      })
      expect(maximum(base, defaulted)).toBe(23)
    }
    for (const source of ['PHB', 123]) {
      const conflict = layer({ ...original, subclassFeature: [...without, { ...feature, source }] })
      expect(maximum(base, conflict)).toBe(20)
    }
    const missing = layer({ ...original, subclassFeature: without })
    const changed = layer({
      ...original,
      subclassFeature: [...without, { ...feature, entries: ['Different rules.'] }],
    })
    const duplicate = layer({ ...original, subclassFeature: [...features, feature] })
    const alternate = { ...feature, name: 'Copied rules' }
    const { entries: _entries, ...metadata } = feature
    const copied = layer({
      ...original,
      subclassFeature: [
        ...without,
        alternate,
        {
          ...metadata,
          _copy: {
            name: alternate.name,
            source: alternate.source,
            className: alternate.className,
            classSource: alternate.classSource,
            subclassShortName: alternate.subclassShortName,
            subclassSource: alternate.subclassSource,
            level: alternate.level,
          },
        },
      ],
    })
    for (const invalid of [missing, changed, duplicate, copied]) {
      expect(maximum(base, invalid)).toBe(20)
      expect(maximum(base, invalid, base)).toBe(23)
    }
  }
})
