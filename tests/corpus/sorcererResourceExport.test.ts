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
import { getCharacterClassResources } from '@/lib/calculations/classResources'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getClassChoiceCandidates } from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetTemplateId } from '@/lib/pdf/types'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  makeOptionalPoolRecoveryFixture,
  optionalPoolRecoveryCases,
} from '../fixtures/optionalPoolRecoveryFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const stacks: Array<['bundled' | 'local', string]> = [['bundled', 'resources/srd/data']]
if (existsSync('data/class/class-sorcerer.json')) stacks.push(['local', 'data'])

const printings = [
  {
    source: 'PHB',
    origin: '2014',
    level: 20,
    restore: /4 points on a short rest/i,
    heightened: /3 sorcery points.*first saving throw/i,
    twinned: /points equal to the spell's level to target a second creature/i,
  },
  {
    source: 'XPHB',
    origin: '2024',
    level: 5,
    restore: /up to 2 points on a short rest \(once per long rest\)/i,
    heightened: /2 sorcery points.*disadvantage on saves/i,
    twinned: /1 sorcery point to increase the spell's effective level by 1/i,
  },
] as const

const lookups = (data: GameData) => ({
  ...buildGameDataLookups(data),
  classChoiceClasses: data.classes,
  classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
})

function selectMetamagic(
  character: Character,
  data: ReturnType<typeof lookups>,
  options: Array<{ name: string; source: string }>,
) {
  const owner = character.classProgression[0]
  const cls = data.classChoiceClasses.find(
    (row) => row.name === owner.name && row.source === owner.source,
  )
  if (!cls) throw new Error('Missing the native Sorcerer')
  const choice = getClassChoiceCandidates(cls, undefined, data.classChoiceFeatureCatalogs).find(
    (row) => row.label === 'Metamagic',
  )
  if (!choice) throw new Error('Missing the earned Metamagic choice')
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance,
    choice,
    options.map((option) => ({ entityType: 'optionalFeature', ...option })),
    { classes: data.classChoiceClasses, catalogs: data.classChoiceFeatureCatalogs },
  )
  const saved = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }),
    ),
  )
  expect(saved.classChoiceSelections?.find((row) => row.choiceId === choice.id)?.selected).toEqual(
    options.map((option) => expect.objectContaining(option)),
  )
  return saved
}

async function pdfText(
  view: ReturnType<typeof createCharacterSheetViewModel>,
  template: CharacterSheetTemplateId,
  descriptions: 'full' | 'names',
) {
  const pdf = await generateTestCharacterSheet(view, template, {
    text: { descriptions, overflow: 'notes' },
  })
  const form = (await PDFDocument.load(pdf)).getForm()
  const fields = form.getFields().filter((field) => field instanceof PDFTextField)
  const read = (rows: PDFTextField[]) =>
    rows
      .map((field) => field.getText() ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
  return {
    form,
    full: read(fields),
    notes: read(fields.filter((field) => /Notes\.(Left|Right)$/.test(field.getName()))),
  }
}

test.each(stacks)(
  'prints exact Sorcerer pools, earned recovery, and selected Metamagic in packaged sheets (%s)',
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
    const current = lookups(data)
    for (const spec of printings) {
      const { source, origin, level, restore, heightened, twinned } = spec
      const sorcerer = { name: 'Sorcerer', source, levels: level }
      const revised = source === 'XPHB'
      const actor = selectMetamagic(
        makeCharacterFixture({
          originSystem: origin,
          allowedSources: [source],
          classProgression: [
            sorcerer,
            ...(revised ? [{ name: 'Fighter', source, levels: 3 }] : []),
          ],
          classResources: { 'sorcerer-sorcery-points': 1, 'sorcerer-innate-sorcery': 1 },
          features: [
            {
              id: 'manual:heightened',
              name: 'Heightened Spell',
              source: 'Manual',
              description: 'Independent personal note.',
            },
            {
              id: 'manual:long-notes',
              name: 'Field Notes',
              source: 'Manual',
              description: 'Field notes with long independent details. '.repeat(175),
            },
            {
              id: 'manual:travel-notes',
              name: 'Travel Notes',
              source: 'Manual',
              description: 'Travel notes with independent details. '.repeat(125),
            },
          ],
        }),
        current,
        [
          'Heightened Spell',
          'Twinned Spell',
          ...(revised ? [] : ['Careful Spell', 'Distant Spell']),
        ].map((name) => ({ name, source })),
      )
      const view = (character = actor, primary = current) =>
        createCharacterSheetViewModel(character, current, primary)
      const vm = view()
      const progression = Array.from({ length: 20 }, (_, index) => {
        const levels = index + 1
        return (
          getCharacterClassResources(
            { ...actor, classProgression: [{ ...sorcerer, levels }] },
            () => undefined,
            {
              catalogs: current.classChoiceFeatureCatalogs,
              charismaModifier: 0,
              unlimitedWildShape: false,
            },
          ).find(({ id }) => id === 'sorcerer-sorcery-points')?.max ?? 0
        )
      })
      expect(progression).toEqual([
        0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      ])
      const points = (model: typeof vm) =>
        model.classResourceRows.find((row) => row.id === 'sorcerer-sorcery-points')
      const innate = (model: typeof vm) =>
        model.classResourceRows.find((row) => row.id === 'sorcerer-innate-sorcery')
      expect(points(vm)).toMatchObject({
        max: level,
        used: level - 1,
        recovery: expect.stringMatching(restore),
      })
      expect(points(vm)?.recovery).toMatch(/all points on a long rest/i)
      if (revised) {
        expect(innate(vm)).toMatchObject({
          max: 2,
          used: 1,
          recovery: expect.stringMatching(/all uses on a long rest/i),
        })
        expect(vm.featuresSummary).toMatch(/bonus action.*1 minute/i)
        expect(vm.featuresSummary).toMatch(/spell save DC of your Sorcerer spells increases by 1/i)
        const replace = selectMetamagic(actor, current, [
          { name: 'Heightened Spell', source },
          { name: 'Quickened Spell', source },
        ])
        expect(view(replace).featuresSummary).not.toContain('Twinned Spell')
        expect(view(replace).featuresSummary).toMatch(/Quickened Spell:.*2 sorcery points/i)
        const upgraded = (levels: number) =>
          view({ ...actor, classProgression: [{ ...sorcerer, levels }] })
        expect(vm.featuresSummary).not.toContain('Sorcery Incarnate')
        expect(upgraded(7).featuresSummary).toMatch(/Sorcery Incarnate:.*spend 2 sorcery points/i)
        expect(upgraded(7).featuresSummary).not.toContain('Arcane Apotheosis')
        expect(upgraded(20).featuresSummary).toMatch(
          /Arcane Apotheosis:.*without spending Sorcery Points/i,
        )
        expect(innate(upgraded(20))).toMatchObject({ max: 2, used: 1 })
      } else {
        expect(innate(vm)).toBeUndefined()
      }
      expect(vm.featuresSummary.match(heightened)).toHaveLength(1)
      expect(vm.featuresSummary).toMatch(twinned)
      expect(vm.featuresSummary).toContain('Heightened Spell: Independent personal note.')

      const suppressed = (...targets: string[]) => {
        const filter = { suppressedKeys: new Set(targets) }
        return lookups({
          ...data,
          classes: DataFilter.filterClasses(data.classes, filter),
          classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filter),
        })
      }
      const core = source.toLowerCase()
      const staleMirror = {
        ...actor,
        features: actor.features.map((row) =>
          row.name === 'Heightened Spell' && row.id.startsWith('class-choice:')
            ? { ...row, description: 'Stale copy of unavailable Metamagic.' }
            : row,
        ),
      }
      const metamagicGain = revised ? 2 : 3
      const noMetamagic = view(
        staleMirror,
        suppressed(`class-feature|metamagic|sorcerer|${core}|${metamagicGain}|${core}`),
      )
      expect(noMetamagic.featuresSummary).not.toMatch(
        /stale copy of unavailable|spend .* to give one target/i,
      )
      expect(noMetamagic.featuresSummary).toContain('Independent personal note.')
      const beforeRestoration = view({
        ...actor,
        classProgression: [{ ...sorcerer, levels: level - 1 }],
      })
      expect(points(beforeRestoration)).toMatchObject({
        max: level - 1,
        recovery: 'Restores all points on a long rest',
      })
      const noRestoration = view(
        actor,
        suppressed(`class-feature|sorcerous restoration|sorcerer|${core}|${level}|${core}`),
      )
      expect(points(noRestoration)).toMatchObject({
        max: level,
        recovery: 'Restores all points on a long rest',
      })
      expect(
        points(view(actor, suppressed(`class-feature|font of magic|sorcerer|${core}|2|${core}`))),
      ).toBeUndefined()
      if (revised) {
        const noInnate = view(
          actor,
          suppressed('class-feature|innate sorcery|sorcerer|xphb|1|xphb'),
        )
        expect(innate(noInnate)).toBeUndefined()
        expect(points(noInnate)).toEqual(points(vm))
        expect(noInnate.featuresSummary).not.toMatch(
          /spell save DC of your Sorcerer spells increases by 1/i,
        )
      } else {
        expect(
          points(view(actor, suppressed('class-feature|sorcery points|sorcerer|phb|2|phb'))),
        ).toBeUndefined()
      }
      const noTwinned = view(
        actor,
        lookups({
          ...data,
          optionalfeatures: data.optionalfeatures.filter(
            (row) =>
              !row ||
              typeof row !== 'object' ||
              !(
                'name' in row &&
                row.name === 'Twinned Spell' &&
                'source' in row &&
                row.source === source
              ),
          ),
        }),
      )
      expect(noTwinned.featuresSummary).toMatch(heightened)
      expect(noTwinned.featuresSummary).not.toContain('Twinned Spell')
      const duplicateTable = view(
        actor,
        lookups({
          ...data,
          classes: data.classes.map((row) =>
            row.name === sorcerer.name && row.source === sorcerer.source
              ? {
                  ...row,
                  classTableGroups: [
                    ...(row.classTableGroups ?? []),
                    { colLabels: ['Sorcery Points'], rows: [['invalid']] },
                  ],
                }
              : row,
          ),
        }),
      )
      expect(points(duplicateTable)).toBeUndefined()
      expect(innate(duplicateTable)).toEqual(innate(vm))
      expect(view().featuresSummary).toMatch(twinned)
      const atOne = view({ ...actor, classProgression: [{ ...sorcerer, levels: 1 }] })
      expect(points(atOne)).toBeUndefined()
      expect(atOne.featuresSummary).not.toMatch(heightened)

      for (const template of [`${origin}-official`, `${origin}-custom`] as const) {
        const full = await pdfText(vm, template, 'full')
        expect(full.full).toMatch(restore)
        expect(full.notes).toMatch(heightened)
        expect(full.notes).toMatch(twinned)
        if (template === '2014-custom') {
          expect(full.form.getTextField('Limited Feature 1').getText()).toBe('Sorcery Points')
          expect(full.form.getTextField('Limited Feature Max Usages 1').getText()).toBe('20')
          expect(full.form.getTextField('Limited Feature Used 1').getText()).toBe('19')
          expect(full.form.getDropdown('Limited Feature Recovery 1').getSelected()).toEqual(['S/L'])
        } else {
          expect(full.full).toContain(`1/${level} available`)
          if (revised) expect(full.full).toMatch(/Innate Sorcery\s*[—-]\s*1\/2 available/i)
        }
        const names = await pdfText(vm, template, 'names')
        expect(names.full).toContain('Twinned Spell')
        expect(names.full).not.toMatch(twinned)
        expect(names.full).not.toMatch(heightened)
      }
    }
  },
  90_000,
)

test('prints adopted TCE Metamagic only while its exact expansion is active', () => {
  const { character, data, catalogs } = makeOptionalPoolRecoveryFixture(
    optionalPoolRecoveryCases[0],
  )
  const current = { ...lookups(data), classChoiceFeatureCatalogs: catalogs }
  const summary = (actor: Character) =>
    createCharacterSheetViewModel(actor, current, current).featuresSummary
  expect(summary(character)).toMatch(/Seeking Spell:.*spend 2 sorcery points/i)
  expect(summary({ ...character, optionalClassFeatureAdoptions: [] })).not.toContain(
    'Seeking Spell',
  )
  expect(summary(character)).toMatch(/Seeking Spell:.*spend 2 sorcery points/i)
})
