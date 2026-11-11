// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { loadGameDataSourceStack } from '@/lib/5etools/contentLayers'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { buildSuppressedKeys, collectReprintableEntities } from '@/lib/5etools/reprints'
import { XPHB_LEGACY_SUBCLASS_KEYS } from '@/lib/5etools/rulesetMetadata'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import { SOURCE_PRESETS } from '@/lib/sourcePresets'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const hasCatalog = existsSync('data/class/class-bard.json')

async function loadStandardCatalog() {
  const readJson = (root: string) => async (file: string) =>
    JSON.parse(await readFile(resolve(root, file), 'utf8'))
  const data = await loadGameDataSourceStack(
    {
      base: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.1',
        isValid: true,
      },
      additional: { type: 'local', path: resolve('data'), isValid: true },
    },
    {
      baseReader: { type: 'bundled', readJson: readJson('resources/srd/data') },
      additionalReader: { type: 'local', readJson: readJson('data') },
    },
  )
  const sources = getEffectiveSources(SOURCE_PRESETS[0].abbreviations, '2024', data.sources)
  const suppressedKeys = buildSuppressedKeys(collectReprintableEntities(data), new Set(sources))
  const filters = { sources, suppressedKeys }
  const current = {
    ...data,
    classes: DataFilter.filterClasses(data.classes, {
      ...filters,
      allowedSubclassKeys: XPHB_LEGACY_SUBCLASS_KEYS,
    }),
    classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filters),
    spells: DataFilter.filterSpells(data.spells, filters),
  }
  const primary = {
    ...buildGameDataLookups(current),
    classChoiceClasses: current.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(current),
  }
  const raw = buildGameDataLookups(data)
  return { sources, primary, raw }
}

test.skipIf(!hasCatalog)(
  'Standard retains the 2024 College of Spirits and Shadow Magic spells',
  async () => {
    const { sources, primary, raw } = await loadStandardCatalog()
    for (const [name, subclass, subclassSource, spell, list, castingNote] of [
      ['Bard', 'College of Spirits', 'VRGR', 'Guidance', 'cantrips', '60 feet'],
      ['Sorcerer', 'Shadow Magic', 'XGE', 'Darkness', 'spellsKnown', '2 Sorcery Points'],
    ] as const) {
      const actor = (levels: number) =>
        makeCharacterFixture({
          originSystem: '2024',
          allowedSources: sources,
          classProgression: [{ name, source: 'XPHB', levels, subclass, subclassSource }],
        })
      const revised = `${spell}|XPHB`
      const classic = `${spell}|PHB`
      const calculate = (level: number) =>
        createCharacterCalculationContext(actor(level), primary, raw)
      const findSpell = (result: ReturnType<typeof calculate>) =>
        result.fixedClassSpellStatuses.find((row) => row.reference === revised)

      for (let level = 1; level <= 20; level++) {
        const result = calculate(level)
        const profile = result.character.spells.spellProfiles.find(
          (row) => row.id === `class:${name}|XPHB`,
        )
        if (level < 3) {
          expect(findSpell(result), `${subclass} level ${level}`).toBeUndefined()
        } else {
          expect(findSpell(result), `${subclass} level ${level}`).toMatchObject({
            active: true,
            castingNote: expect.stringContaining(castingNote),
          })
          expect(profile?.[list]).toContain(revised)
          expect(profile?.[list]).not.toContain(classic)
        }
      }

      const sheet = createCharacterSheetViewModel(actor(3), raw, primary)
      expect(sheet.spellRows.find((row) => row.name === spell)).toMatchObject({
        prepared: true,
        castingNote: expect.stringContaining(castingNote),
      })

      const withoutReprintProof = { ...raw.spellsByKey }
      delete withoutReprintProof[classic]
      const result = createCharacterCalculationContext(actor(3), primary, {
        ...raw,
        spellsByKey: withoutReprintProof,
      })
      expect(findSpell(result)?.active).not.toBe(true)

      const withoutVisibleSpell = { ...primary.spellsByKey }
      delete withoutVisibleSpell[revised]
      expect(
        findSpell(
          createCharacterCalculationContext(
            actor(3),
            {
              ...primary,
              spellsByKey: withoutVisibleSpell,
            },
            raw,
          ),
        )?.active,
      ).not.toBe(true)
    }
  },
  30_000,
)

test.skipIf(!hasCatalog)(
  'Standard retains the 2024 TCE Artificer spell list and specialty schedules',
  async () => {
    const { sources, primary, raw } = await loadStandardCatalog()
    const actor = (levels: number, subclass?: string) =>
      makeCharacterFixture({
        originSystem: '2024',
        allowedSources: sources,
        classProgression: [
          {
            name: 'Artificer',
            source: 'TCE',
            levels,
            subclass,
            subclassSource: subclass ? 'TCE' : undefined,
          },
        ],
      })
    const calculate = (character: ReturnType<typeof actor>) =>
      createCharacterCalculationContext(character, primary, raw)
    const current = actor(1)
    const entry = current.classProgression[0]
    const context = calculate(current).classChoices.spellContext
    const slot = getManagedClassSpellSlots(entry, current, primary.classChoiceFeatureCatalogs).find(
      (candidate) => candidate[1] === 'class-cantrip',
    )!
    const pool = getManagedClassSpellPool(current, slot, context)
    expect(pool.defaultReferences.has('fire bolt|xphb')).toBe(true)
    expect(pool.defaultReferences.has('fire bolt|phb')).toBe(false)
    expect(pool.defaultReferences.has('eldritch blast|xphb')).toBe(false)
    const result = setManagedClassSpellChoiceCommand(
      current,
      current.provenance,
      {
        slot,
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Fire Bolt', source: 'XPHB' },
        policy: 'default',
      },
      context,
    )
    const reopened = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...current,
          ...result.characterPatch,
          provenance: result.provenanceUpdate,
        }),
      ),
    )
    expect(calculate(reopened).managedClassSpellStatuses).toMatchObject([{ active: true }])
    const withoutTce = { ...reopened, allowedSources: sources.filter((source) => source !== 'TCE') }
    expect(calculate(withoutTce).managedClassSpellStatuses.some((status) => status.active)).toBe(
      false,
    )
    expect(calculate(reopened).managedClassSpellStatuses).toMatchObject([{ active: true }])
    for (const subclass of ['Alchemist', 'Armorer', 'Artillerist', 'Battle Smith']) {
      for (let level = 1; level <= 20; level++) {
        const profile = calculate(
          actor(level, level >= 3 ? subclass : undefined),
        ).character.spells.spellProfiles.find((row) => row.id === 'class:Artificer|TCE')
        const prepared = profile?.alwaysPreparedSpells ?? []
        expect(prepared, `${subclass} level ${level}`).toHaveLength(
          2 * [3, 5, 9, 13, 17].filter((gain) => gain <= level).length,
        )
        expect(prepared.every((spell) => spell.endsWith('|XPHB'))).toBe(true)
        if (subclass === 'Battle Smith' && level >= 5) {
          expect(prepared).toContain('Shining Smite|XPHB')
        }
      }
    }
  },
  30_000,
)
