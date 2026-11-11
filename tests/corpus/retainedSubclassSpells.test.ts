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
import { deriveWeaponActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getCharacterClassResources } from '@/lib/calculations/classResources'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { buildCompanionSheetData } from '@/lib/pdf/companionSheet'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import { SOURCE_PRESETS } from '@/lib/sourcePresets'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const hasCatalog = existsSync('data/class/class-bard.json')

async function loadStandardCatalog(edition: '2014' | '2024' = '2024') {
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
  const sources = getEffectiveSources(SOURCE_PRESETS[0].abbreviations, edition, data.sources)
  const suppressedKeys =
    edition === '2024'
      ? buildSuppressedKeys(collectReprintableEntities(data), new Set(sources))
      : undefined
  const filters = { sources, suppressedKeys }
  const current = {
    ...data,
    classes: DataFilter.filterClasses(data.classes, {
      ...filters,
      allowedSubclassKeys: edition === '2024' ? XPHB_LEGACY_SUBCLASS_KEYS : undefined,
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

test.skipIf(!hasCatalog).each(['2014', '2024'] as const)(
  'Standard projects Battle Ready attacks and earned TCE companions (%s)',
  async (edition) => {
    const { sources, primary, raw } = await loadStandardCatalog(edition)
    const source = edition === '2024' ? 'XPHB' : 'PHB'
    const actor = (name: string, subclass: string, levels: number) => {
      const character = makeCharacterFixture({
        originSystem: edition,
        allowedSources: sources,
        classProgression: [
          {
            name,
            source: name === 'Artificer' ? 'TCE' : source,
            levels,
            subclass,
            subclassSource: 'TCE',
          },
        ],
      })
      character.abilityScores.intelligence = 20
      character.abilityScores.strength = 10
      return character
    }
    const smith = actor('Artificer', 'Battle Smith', 3)
    smith.equipment = [
      {
        id: 'bloodaxe',
        name: 'Bloodaxe',
        source: 'EGW',
        type: 'M',
        quantity: 1,
        equipped: true,
        attuned: true,
        dmg1: '1d12',
        dmgType: 'S',
        weaponCategory: 'martial',
      },
      {
        id: 'axe',
        name: 'Greataxe',
        source,
        type: 'M',
        quantity: 1,
        equipped: true,
        dmg1: '1d12',
        dmgType: 'S',
        weaponCategory: 'martial',
      },
    ]
    const attacks = (character: typeof smith) => {
      const calculated = createCharacterCalculationContext(character, primary, raw)
      return deriveWeaponActions(calculated.character, {
        abilityModifiers: calculated.abilityScores.modifiers,
        proficiencyBonus: 2,
        itemLookup: primary.itemLookup,
        classChoiceFeatureCatalogs: primary.classChoiceFeatureCatalogs,
        effects: calculated.effects.declarations,
        effectContext: calculated.effects.resolutionContext,
      })
    }
    expect(attacks(smith).find((row) => row.name === 'Bloodaxe')).toMatchObject({
      ability: 'intelligence',
      attackBonus: 9,
      damage: [{ bonus: 7 }],
    })
    expect(attacks(smith).find((row) => row.name === 'Greataxe')).toMatchObject({
      ability: 'strength',
    })
    const rolledBack = { ...smith, classProgression: [{ ...smith.classProgression[0], levels: 2 }] }
    expect(attacks(rolledBack).find((row) => row.name === 'Bloodaxe')).toMatchObject({
      ability: 'strength',
    })
    expect(
      createCharacterSheetViewModel(smith, raw, primary).weaponRows.find(
        (row) => row.name === 'Bloodaxe',
      ),
    ).toMatchObject({ attackBonus: '+9' })
    for (const [name, subclass, companion, gain, hp] of [
      ['Artificer', 'Battle Smith', 'Steel Defender', 3, 22],
      [
        'Druid',
        'Circle of Wildfire',
        'Wildfire Spirit',
        edition === '2014' ? 2 : 3,
        edition === '2014' ? 15 : 20,
      ],
      ['Bard', 'College of Creation', 'Dancing Item', 6, 40],
    ] as const) {
      const sheet = (level: number) =>
        createCharacterSheetViewModel(actor(name, subclass, level), raw, primary)
      expect(sheet(gain - 1).companions).toEqual([])
      const earned = sheet(gain)
      expect(earned.companions.map((row) => row.name)).toEqual([companion])
      expect(buildCompanionSheetData(earned, earned.companions[0]).maxHp).toBe(String(hp))
      const max = sheet(20)
      const projected = buildCompanionSheetData(max, max.companions[0])
      expect(projected.actions[0].damage).toMatch(/\+ 6/)
      if (name === 'Artificer') {
        expect(projected).toMatchObject({ maxHp: '107', armorClass: '17', hitDice: '20d8' })
      }
    }
  },
  30_000,
)

test.skipIf(!hasCatalog).each(['2014', '2024'] as const)(
  'Standard computes the audited subclass resources (%s)',
  async (edition) => {
    const { sources, primary } = await loadStandardCatalog(edition)
    const revised = edition === '2024'
    const core = revised ? 'XPHB' : 'PHB'
    const cases = [
      [
        'Warlock',
        revised ? 'Celestial Patron' : 'The Celestial',
        revised ? core : 'XGE',
        'Healing Light',
        revised ? 3 : 1,
        21,
      ],
      ['Warlock', 'The Fathomless', 'TCE', 'Tentacle of the Deeps', revised ? 3 : 1, 6],
      ['Warlock', 'The Genie', 'TCE', 'Elemental Gift', 6, 6],
      ['Warlock', 'The Undead', 'VRGR', 'Form of Dread', revised ? 3 : 1, 6],
      ['Druid', 'Circle of Dreams', 'XGE', 'Balm of the Summer Court', revised ? 3 : 2, 20],
      ['Druid', 'Circle of Dreams', 'XGE', 'Hidden Paths', 10, 3],
      [
        'Druid',
        revised ? 'Circle of the Stars' : 'Circle of Stars',
        revised ? core : 'TCE',
        'Cosmic Omen',
        6,
        revised ? 3 : 6,
      ],
      ['Druid', 'Circle of Spores', 'TCE', 'Fungal Infestation', 6, 3],
      ['Druid', 'Circle of Wildfire', 'TCE', 'Cauterizing Flames', 10, 6],
      ['Cleric', 'Light Domain', core, 'Warding Flare', revised ? 3 : 1, 3],
      ['Cleric', 'Tempest Domain', 'PHB', 'Wrath of the Storm', revised ? 3 : 1, 3],
      ['Cleric', 'War Domain', core, 'War Priest', revised ? 3 : 1, 3],
      ['Cleric', 'Grave Domain', 'XGE', 'Eyes of the Grave', revised ? 3 : 1, 3],
      ['Cleric', 'Order Domain', 'TCE', 'Embodiment of the Law', 6, 3],
      ['Cleric', 'Peace Domain', 'TCE', 'Emboldening Bond', revised ? 3 : 1, 6],
      ['Cleric', 'Twilight Domain', 'TCE', 'Steps of Night', 6, 6],
      ['Wizard', 'Bladesinging', 'TCE', 'Bladesong', revised ? 3 : 2, 6],
      ['Wizard', 'Chronurgy Magic', 'EGW', 'Momentary Stasis', 6, 3],
      ['Wizard', 'Graviturgy Magic', 'EGW', 'Violent Attraction', 10, 3],
      ['Artificer', 'Battle Smith', 'TCE', 'Arcane Jolt', 9, 3],
      [
        'Sorcerer',
        revised ? 'Clockwork Sorcery' : 'Clockwork Soul',
        revised ? core : 'TCE',
        'Restore Balance',
        revised ? 3 : 1,
        revised ? 3 : 6,
      ],
      ['Bard', 'College of Eloquence', 'TCE', 'Infectious Inspiration', 14, 3],
    ] as const
    for (const [name, subclass, subclassSource, label, gain, maximum] of cases) {
      const source = name === 'Artificer' ? 'TCE' : core
      const currentClass = primary.classesByKey[`${name}|${source}`]
      const resources = (level: number) =>
        getCharacterClassResources(
          makeCharacterFixture({
            originSystem: edition,
            allowedSources: sources,
            classProgression: [{ name, source, levels: level, subclass, subclassSource }],
          }),
          () => currentClass,
          {
            catalogs: primary.classChoiceFeatureCatalogs,
            charismaModifier: 3,
            abilityModifiers: {
              strength: 3,
              dexterity: 3,
              constitution: 3,
              intelligence: 3,
              wisdom: 3,
              charisma: 3,
            },
            unlimitedWildShape: false,
          },
        ).filter((resource) => resource.label === label)
      if (gain > 1) expect(resources(gain - 1), label).toEqual([])
      expect(resources(gain), `${subclass} ${label} at ${gain}`).toHaveLength(1)
      expect(resources(20), `${subclass} ${label} at 20`).toMatchObject([
        {
          max: maximum,
          current: maximum,
          restType: revised && ['Warding Flare', 'War Priest'].includes(label) ? 'short' : 'long',
        },
      ])
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
