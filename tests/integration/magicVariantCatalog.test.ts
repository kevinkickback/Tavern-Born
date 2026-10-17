import { clear, get } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import {
  composeGameDataLayers,
  findLayerDependencyIssues,
  loadGameDataSourceStack,
} from '@/lib/5etools/contentLayers'
import {
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { addManualEquipmentBatchCommand } from '@/lib/character/commands/equipmentCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { readGameDataCache, writeGameDataCache } from '@/lib/storage/dataCache'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { DataSourceConfig, GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { loadMagicTemplates, shieldTemplate } from '../fixtures/magicVariantFixtures'

vi.unmock('@/lib/storage/idb-storage')

describe('raw template cache and concrete character persistence', () => {
  beforeEach(async () => {
    await clear()
    await useCharacterStore.persist.rehydrate()
    await useCharacterStore.getState().setCharacters([])
    useCharacterStore.getState().setActiveCharacter(null)
    useGameDataStore.setState({ gameData: null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    useGameDataStore.setState({ gameData: null })
  })

  test('loads and refreshes optional exact item-choice gaps without resource failures or stale cache', async () => {
    const payloads: Record<string, unknown> = {
      'class/index.json': { TST: 'class-maker.json' },
      'class/class-maker.json': {
        class: [
          {
            name: 'Maker',
            source: 'TST',
            classFeatures: ['Replicate Magic Item|Maker|TST|1'],
            classTableGroups: [{ colLabels: ['Replicate Magic Item'], rows: [[1]] }],
          },
        ],
        classFeature: [
          {
            name: 'Replicate Magic Item',
            source: 'TST',
            className: 'Maker',
            classSource: 'TST',
            level: 1,
            entries: [
              'Choose one {@filter magic item|items|rarity=uncommon}.',
              {
                type: 'table',
                caption: 'Replicate Magic Item',
                colLabels: ['Item'],
                rows: [['{@item +1 Shield|XDMG}']],
              },
            ],
          },
        ],
      },
      'items.json': { item: [{ name: 'Other Shield', source: 'XDMG', type: 'S' }] },
      'magicvariants.json': {
        magicvariant: [
          { ...shieldTemplate, inherits: { ...shieldTemplate.inherits, source: 'XDMG' } },
        ],
      },
    }
    vi.stubGlobal('electronAPI', {
      getBundledManifest: async () => ({ packId: 'tavern-born-srd-core', packVersion: 'test' }),
      readBundledJson: async () => ({}),
      readLocalJson: async (path: string) =>
        structuredClone(payloads[path.slice('/additional/'.length)] ?? {}),
    })
    const additional: DataSourceConfig = {
      type: 'local',
      path: '/additional',
      isValid: true,
      availableResources: Object.keys(payloads),
    }
    const base: DataSourceConfig = {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: 'test',
      isValid: true,
    }
    const failures = vi.fn()
    const first = await loadGameDataSourceStack(
      { base, additional },
      { onResourceFailure: failures },
    )
    expect(failures).not.toHaveBeenCalled()
    expect(findLayerDependencyIssues(first, first)).toEqual([
      {
        owner: 'Maker|TST',
        path: 'normalizedRules.choices[0].options[0]',
        reference: '+1 Shield|XDMG',
        required: false,
      },
    ])
    const choice = first.classes[0].normalizedRules!.choices[0]
    expect(choice.options).toEqual([
      { entityType: 'item', name: '+1 Shield', source: 'XDMG', minimumClassLevel: 1 },
    ])
    for (const scope of ['class', 'subclass']) {
      for (const entityType of [
        'item',
        'feat',
        'creature',
        'optionalFeature',
        'classFeature',
        'subclassFeature',
      ] as const) {
        const data = structuredClone(first)
        const rules = data.classes[0].normalizedRules!
        rules.choices[0].options = [
          {
            entityType,
            name: 'Missing',
            source: 'TST',
            ...(entityType === 'classFeature'
              ? { ref: 'Missing|Maker|TST|1|TST' }
              : entityType === 'subclassFeature'
                ? { ref: 'Missing|Maker|TST|Special|TST|1|TST' }
                : {}),
          },
        ]
        if (scope === 'subclass') {
          data.classes[0].subclasses = [
            {
              name: 'Special',
              shortName: 'Special',
              source: 'TST',
              className: 'Maker',
              classSource: 'TST',
              subclassFeatures: [],
              normalizedRules: rules,
            },
          ]
          data.classes[0].normalizedRules = { ...rules, choices: [] }
        }
        const issues = findLayerDependencyIssues(data, data)
        expect(issues).toHaveLength(1)
        expect(issues[0].required !== false).toBe(entityType !== 'item')
        expect(issues[0].path).toBe(
          `${scope === 'subclass' ? 'subclasses[0].' : ''}normalizedRules.choices[0].options[0]`,
        )
      }
    }
    const option = (data: GameData) =>
      resolveClassChoiceOptions(choice, {
        classFeatures: [],
        subclassFeatures: [],
        creatures: [],
        feats: [],
        items: data.items,
        itemsBase: data.itemsBase,
        itemMasteries: [],
        optionalFeatures: [],
        itemPropertyByAbbr: {},
        itemTypeByAbbr: {},
        weaponProficiencies: [],
      }).find(
        (candidate) =>
          candidate.reference.name === '+1 Shield' && candidate.reference.source === 'XDMG',
      )!
    expect(isClassChoiceOptionEligible(option(first))).toBe(false)
    expect(option(first).reference).toMatchObject({ name: '+1 Shield', source: 'XDMG' })
    const character = await useCharacterStore.getState().addCharacter(
      makeCharacterFixture({
        id: 'item-choice-metadata',
        classProgression: [{ name: 'Maker', source: 'TST', levels: 1 }],
        classChoiceSelections: [
          {
            choiceId: choice.id,
            label: choice.label,
            kind: 'item',
            className: 'Maker',
            classSource: 'TST',
            classLevel: 1,
            selected: [{ entityType: 'item', name: '+1 Shield', source: 'XDMG', slotLevel: 1 }],
          },
        ],
      }),
    )
    useCharacterStore.getState().setActiveCharacter(character.id)
    await useCharacterStore.getState().saveActiveCharacter()
    const original = structuredClone(useCharacterStore.getState().activeCharacter!)

    useGameDataStore.setState({ gameData: first, lastContentFingerprint: 'old-content' })
    payloads['items.json'] = { item: [{ name: 'Changed Shield', source: 'XDMG', type: 'S' }] }
    expect(await useGameDataStore.getState().loadGameData(additional, true)).toBe(true)
    const refreshed = useGameDataStore.getState().gameData!
    expect(useGameDataStore.getState().error).toBeNull()
    expect(refreshed.items.some((item) => item.name === 'Changed Shield')).toBe(true)
    expect(
      createCorpusCapabilityReport(refreshed).issues.some(
        (issue) => issue.code === 'unresolved-reference',
      ),
    ).toBe(true)
    expect((await readGameDataCache())?.data.magicVariants).toEqual(first.magicVariants)

    for (const source of ['DMG', 'XDMG', undefined]) {
      payloads['items.json'] = {
        item: source ? [{ name: '+1 Shield', source, type: 'S', rarity: 'uncommon' }] : [],
      }
      await useGameDataStore.getState().loadGameData(additional, true)
      expect(useGameDataStore.getState().error).toBeNull()
      expect(isClassChoiceOptionEligible(option(useGameDataStore.getState().gameData!))).toBe(
        source === 'XDMG',
      )
      expect(useCharacterStore.getState().activeCharacter!.classChoiceSelections).toEqual(
        original.classChoiceSelections,
      )
      expect(useCharacterStore.getState().activeCharacter!.provenance).toEqual(original.provenance)
    }
    const featurePayload = payloads['class/class-maker.json'] as {
      class: Array<{ classFeatures: string[] }>
    }
    featurePayload.class[0].classFeatures.push('Missing|Maker|TST|2')
    await expect(
      loadGameDataSourceStack({ base, additional }, { onResourceFailure: failures }),
    ).rejects.toThrow('unresolved required')
    expect(failures).toHaveBeenCalledWith('Additional content: Missing|Maker|TST|2', {
      required: true,
    })
    useCharacterStore.getState().setActiveCharacter(null)
    await useCharacterStore.persist.rehydrate()
    useCharacterStore.getState().setActiveCharacter(character.id)
    expect(useCharacterStore.getState().activeCharacter!.classChoiceSelections).toEqual(
      original.classChoiceSelections,
    )
  })

  test('restores raw copy authority through IndexedDB without rewriting concrete saved equipment or prose', async () => {
    const child = {
      name: 'Child Shield',
      source: 'AU',
      _copy: { name: '+1 Shield (*)', source: 'DMG' },
    }
    const concrete = {
      name: '+1 Shield',
      source: 'DMG',
      type: 'S',
      ac: 3,
      rarity: 'uncommon',
      entries: ['Concrete shield.'],
    }
    const loaded = await loadMagicTemplates([shieldTemplate, child], [concrete])
    await writeGameDataCache(loaded, { type: 'local', path: '/fixture', isValid: true })
    const cached = await readGameDataCache()
    expect(cached?.cacheSchemaVersion).toBe(36)
    expect(cached?.data.magicVariants).toEqual([shieldTemplate, child])
    const replaced = await loadMagicTemplates([
      { ...shieldTemplate, entries: ['Replacement rules.'] },
    ])
    const composed = composeGameDataLayers([cached!.data, replaced])
    expect(composed.items.find((row) => row.name === 'Child Shield')?.entries).toEqual([
      'Replacement rules.',
    ])
    expect(composed.items.filter((row) => row.name === 'Child Shield')).toHaveLength(1)

    const added = await useCharacterStore
      .getState()
      .addCharacter(makeCharacterFixture({ id: 'template-isolation', equipment: [] }))
    useCharacterStore.getState().setActiveCharacter(added.id)
    const original = useCharacterStore.getState().activeCharacter!
    const command = addManualEquipmentBatchCommand(original, original.provenance!, [concrete])
    useCharacterStore.getState().updateCharacter(added.id, {
      ...command.characterPatch,
      provenance: command.provenanceUpdate,
    })
    const current = useCharacterStore.getState().activeCharacter!
    const equipment = current.equipment.map((item) => ({
      ...item,
      quantity: 2,
      equipped: true,
      attuned: true,
      description: 'Player shield notes.',
    }))
    useCharacterStore.getState().updateCharacter(added.id, { equipment })
    await useCharacterStore.getState().saveActiveCharacter()
    const stored = await get<{ state: { characters: Character[] } }>('character-storage')
    const ledger = stored!.state.characters[0].provenance
    expect(stored!.state.characters[0].equipment).toEqual(equipment)
    expect(JSON.stringify(stored)).not.toContain('magicVariantReference')
    useCharacterStore.getState().setActiveCharacter(null)
    await useCharacterStore.persist.rehydrate()
    useCharacterStore.getState().setActiveCharacter(added.id)
    for (const templates of [[], [shieldTemplate]]) {
      const refreshed = await loadMagicTemplates(templates, [concrete])
      useGameDataStore.setState({ gameData: refreshed })
      const reopened = useCharacterStore.getState().activeCharacter!
      expect(reopened.equipment).toEqual(equipment)
      expect(reopened.provenance).toEqual(ledger)
      expect(reopened.schemaVersion).toBe(11)
      expect(
        createCharacterSheetViewModel(reopened, refreshed.lookups!).magicItems[0]?.description,
      ).toBe('Player shield notes.')
      expect(refreshed.lookups?.itemLookup.get('+1 shield|dmg')).toMatchObject({ type: 'S', ac: 3 })
    }
    useGameDataStore.setState({ gameData: null })
  })
})
