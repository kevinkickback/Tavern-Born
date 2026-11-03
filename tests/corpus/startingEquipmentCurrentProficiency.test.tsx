// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { useCharacterGameDataParams } from '@/hooks/data/useFilteredGameData'
import {
  useStartingEquipmentAuthority,
  useStartingEquipmentPolicy,
} from '@/hooks/data/useStartingEquipment'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseBackgrounds } from '@/lib/5etools/parsers/basic'
import { resolveBackgroundEquipmentBlocks } from '@/lib/5etools/startingEquipment'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { applyManualProficiencyCommand } from '@/lib/character/commands/equipmentCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeLegacySubclassActor, makeLegacySubclassData } from '../fixtures/legacySubclassFixtures'

afterEach(() => {
  cleanup()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
test.runIf(
  [
    'data/backgrounds.json',
    'data/class/class-monk.json',
    'data/class/class-bard.json',
    'data/items-base.json',
    'data/optionalfeatures.json',
  ].every(existsSync),
)(
  'configured proficiency-dependent starting choices follow current providers, latest actor and exact restoration',
  () => {
    const data = makeLegacySubclassData()
    const background = (
      parseBackgrounds(JSON.parse(readFileSync('data/backgrounds.json', 'utf8'))) as Background5e[]
    ).find((row) => row.name === 'Clan Crafter' && row.source === 'SCAG')!
    data.backgrounds = [background]
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    let character = {
      ...makeLegacySubclassActor(data, '2014', 'Monk'),
      allowedSources: ['PHB', 'SCAG', 'XGE'],
    }
    const apply = (result: CharacterCommandResult) => {
      character = characterPersistenceSchema.parse({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    }
    const filtered = renderHook(() =>
      useCharacterGameDataParams({
        originSystem: '2014',
        allowedSources: character.allowedSources,
      }),
    ).result.current
    const catalogs = createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(filtered))
    const cls = filtered.classes.find((row) => row.name === 'Monk' && row.source === 'PHB')!
    const sub = cls.subclasses!.find(
      (row) => row.name === 'Way of the Kensei' && row.source === 'XGE',
    )!
    const choice = getCharacterClassChoices(
      cls,
      sub,
      createOptionalClassFeatureActivity(character, catalogs),
      catalogs,
    ).find((row) => row.label === 'Way of the Brush')!
    const option = resolveClassChoiceOptions(choice, catalogs, [], 3, character).find(
      (row) => row.reference.name === "Painter's Supplies",
    )!
    apply(
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [option.reference],
        { classes: filtered.classes, catalogs },
      ),
    )
    expect(character.proficiencies.tools.map((name) => name.toLowerCase())).toContain(
      "painter's supplies",
    )
    setActiveCharacter(character)
    const authority = renderHook(() => ({
      policy: useStartingEquipmentPolicy('background', background),
      getPolicy: useStartingEquipmentAuthority().getPolicy,
    }))
    const slot = () =>
      resolveBackgroundEquipmentBlocks(
        background.startingEquipment,
        data.lookups!.itemLookup,
        {},
        authority.result.current.policy,
      )[0].options._.genericChoices![0]
    const containsTool = () =>
      slot().candidates.some((item) => item.name === "Painter's Supplies" && item.source === 'PHB')
    expect(containsTool()).toBe(true)
    const key = slot().key
    const selections = { [key]: [{ name: "Painter's Supplies", source: 'PHB' }] }
    apply(
      applyBackgroundSelectionCommand(
        character,
        character.provenance,
        background,
        [],
        data.lookups.itemLookup,
        selections,
        authority.result.current.policy,
      ),
    )
    const issued = character.startingEquipmentGrants!.background!.items.find(
      (lot) => lot.reference.name === "Painter's Supplies",
    )!
    character = { ...character, allowedSources: ['PHB', 'SCAG'] }
    act(() => setActiveCharacter(character))
    expect(containsTool()).toBe(false)
    // Existing saved intent/snapshot survives; a new, unowned pick cannot use a dormant provider.
    const unselected = { ...character, backgroundEquipmentItemChoices: {} }
    expect(() =>
      applyBackgroundSelectionCommand(
        unselected,
        unselected.provenance,
        background,
        [],
        data.lookups!.itemLookup,
        selections,
        authority.result.current.getPolicy(unselected, 'background', background),
      ),
    ).toThrow()
    expect(character.equipment.find((item) => item.id === issued.equipmentId)).toBeDefined()
    apply(
      applyManualProficiencyCommand(
        character,
        character.provenance,
        'tools',
        "Painter's Supplies",
        true,
      ),
    )
    // The current callback must project the supplied latest actor even before the next render.
    const latest = authority.result.current.getPolicy(character, 'background', background)
    expect(
      resolveBackgroundEquipmentBlocks(
        background.startingEquipment,
        data.lookups.itemLookup,
        {},
        latest,
      )[0].options._.genericChoices![0].candidates.some(
        (item) => item.name === "Painter's Supplies",
      ),
    ).toBe(true)
    act(() => setActiveCharacter(character))
    expect(containsTool()).toBe(true)
    apply(
      applyManualProficiencyCommand(
        character,
        character.provenance,
        'tools',
        "Painter's Supplies",
        false,
      ),
    )
    act(() => setActiveCharacter(character))
    expect(containsTool()).toBe(false)
    character = { ...character, allowedSources: ['PHB', 'SCAG', 'XGE'] }
    act(() => setActiveCharacter(character))
    expect(containsTool()).toBe(true)
    apply(
      applyBackgroundSelectionCommand(
        character,
        character.provenance,
        background,
        [],
        data.lookups.itemLookup,
        selections,
        authority.result.current.policy,
      ),
    )
    expect(
      character.startingEquipmentGrants!.background!.items.find(
        (lot) => lot.reference.name === "Painter's Supplies",
      ),
    ).toEqual(issued)
  },
)
