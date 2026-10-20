import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { buildClassLookup, buildGameDataLookups } from '@/lib/5etools/lookups'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { deriveCurrentClassCasting } from '@/lib/calculations/currentClassCasting'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { mapOfficial2014SpellPage } from '@/lib/pdf/characterSheetMapping2014Official'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import { getOptionalCharacterSheetPages } from '@/lib/pdf/characterSheetPages'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { CharacterClassEntry } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  authorManagedClassSpellFixture,
  makeManagedClassSpellFixtures,
} from '../fixtures/managedClassSpellFixtures'

const fixture = makeManagedClassSpellFixtures()
const catalogs = fixture.context.catalogs
const owner = { name: 'Wizard', source: 'PHB', levels: 1 }
const wizard = () =>
  authorManagedClassSpellFixture(
    makeCharacterFixture({
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 14,
        wisdom: 10,
        charisma: 10,
      },
      classProgression: [owner],
    }),
    fixture,
    [
      {
        owner,
        domain: 'class-spellbook',
        gain: 1,
        targets: [
          { name: 'Shield', source: 'PHB', prepare: true },
          { name: 'Grease', source: 'PHB', prepare: true },
        ],
      },
    ],
  )
const cast = (entries: CharacterClassEntry[], current = catalogs) => {
  const character = makeCharacterFixture({ classProgression: entries })
  return deriveCurrentClassCasting(character, current, character.abilityScores)
}

afterEach(() => {
  cleanup()
  useGameDataStore.setState({ gameData: null })
  useCharacterStore.setState({ activeCharacter: null, activeCharacterId: null, characters: [] })
})

describe('certified current casting shared by Spells and PDF', () => {
  test('readiness uses current casting quotas and retains unavailable daily-intent recovery', () => {
    const owner = { name: 'Cleric', source: 'PHB', levels: 1 }
    const saved = makeCharacterFixture({ classProgression: [owner] })
    const missing = {
      ...fixture.lookups,
      classChoiceFeatureCatalogs: { ...catalogs, classCastingSources: [] },
    }
    for (const primary of [fixture.lookups, missing, {}, fixture.lookups]) {
      const calculation = createCharacterCalculationContext(saved, primary, fixture.lookups)
      const issues = validateSpells(saved, calculation, fixture.lookups.spellsByKey)
      expect(issues.some((issue) => issue.title === 'Prepare Cleric spells')).toBe(
        primary === fixture.lookups,
      )
    }
    const prepared = authorManagedClassSpellFixture(
      saved,
      fixture,
      [],
      [{ profileId: 'class:Cleric|PHB', reference: 'Bless|PHB' }],
    )
    const before = JSON.stringify(prepared)
    for (const primary of [fixture.lookups, missing, fixture.lookups]) {
      const calculation = createCharacterCalculationContext(prepared, primary, fixture.lookups)
      const issues = validateSpells(prepared, calculation, fixture.lookups.spellsByKey)
      expect(issues.some((issue) => issue.title === 'Review unavailable prepared spells')).toBe(
        primary === missing,
      )
      expect(issues.some((issue) => issue.title === 'Prepare Cleric spells')).toBe(false)
    }
    expect(JSON.stringify(prepared)).toBe(before)
  })

  test('empty verified future casters omit spell pages while unavailable and retained intent still recover', () => {
    const ranger = { name: 'Ranger', source: 'PHB', levels: 1 }
    const saved = makeCharacterFixture({ classProgression: [ranger] })
    const view = (character = saved, current = fixture.lookups) =>
      createCharacterSheetViewModel(character, fixture.lookups, current)
    const included = (vm: ReturnType<typeof view>) =>
      getOptionalCharacterSheetPages(vm, '2014-official')[0].included
    const first = view()
    expect(first.spellcastingDetails).toEqual([])
    expect(first.spellSlots.shared).toEqual({})
    expect(first.unearnedClassSpellProfiles).toEqual(['class:Ranger|PHB'])
    expect(included(first)).toBe(false)
    expect(
      getOptionalCharacterSheetPages(first, '2014-official', { spells: true })[0].included,
    ).toBe(true)
    expect(included(view({ ...saved, classProgression: [{ ...ranger, levels: 2 }] }))).toBe(true)
    expect(
      included(
        view(saved, {
          ...fixture.lookups,
          classChoiceFeatureCatalogs: { ...catalogs, classCastingSources: [] },
        }),
      ),
    ).toBe(true)
    expect(included(view())).toBe(false)

    const paladin = makeCharacterFixture({
      classProgression: [{ name: 'Paladin', source: 'PHB', levels: 1 }],
    })
    paladin.spells.spellProfiles.push({
      id: 'class:Paladin|PHB',
      type: 'class',
      label: 'Paladin',
      className: 'Paladin',
      classSource: 'PHB',
      cantrips: [],
      spellsKnown: [],
      preparedSpells: ['Bless|PHB'],
    })
    characterPersistenceSchema.parse(paladin)
    const daily = view(paladin)
    expect(
      daily.character.spells.spellProfiles.find((row) => row.type === 'class')?.preparedSpells,
    ).toEqual([])
    expect(included(daily)).toBe(true)
    expect(
      paladin.spells.spellProfiles.find((profile) => profile.id === 'class:Paladin|PHB')
        ?.preparedSpells,
    ).toEqual(['Bless|PHB'])

    const earned = { ...ranger, levels: 2 }
    const retained = authorManagedClassSpellFixture(
      makeCharacterFixture({ classProgression: [earned] }),
      fixture,
      [
        {
          owner: earned,
          domain: 'class-known',
          gain: 2,
          targets: [{ name: 'Cure Wounds', source: 'PHB' }],
        },
      ],
    )
    const unearned = { ...retained, classProgression: [ranger] }
    expect(included(view(unearned))).toBe(true)
    expect(view(unearned).character.managedClassSpellChoices).toEqual(
      retained.managedClassSpellChoices,
    )
    const options = {
      ...saved,
      spells: {
        ...saved.spells,
        spellProfiles: [
          ...saved.spells.spellProfiles,
          {
            id: 'class:Ranger|PHB',
            type: 'class' as const,
            label: 'Ranger',
            className: 'Ranger',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            castingAbilityOptions: ['wis', 'cha'],
          },
        ],
      },
    }
    expect(included(view(options))).toBe(true)
  })

  test('fresh calculations observe nested proof, declaration and route changes without stale authority', () => {
    const saved = wizard()
    const before = JSON.stringify(saved)
    const original = catalogs.classes!.find((row) => row.name === 'Wizard' && row.source === 'PHB')!
    const refreshed = { ...original, name: ' WIZARD ', source: ' phb ' }
    const classes = catalogs.classes!.map((row) => (row === original ? refreshed : row))
    const current = {
      ...fixture.lookups,
      classesByKey: buildClassLookup(classes),
      classChoiceClasses: classes,
      classChoiceFeatureCatalogs: { ...catalogs, classes },
    }
    const calculate = () => createCharacterCalculationContext(saved, current, fixture.lookups)
    const baseline = calculate()
    expect(baseline.classCasting.slots.shared[1]?.max).toBe(2)
    const parent = catalogs.classCastingSources!.find(
      (row) => row.kind === 'casting-parent' && row.target === '["class","wizard","phb"]',
    )!
    const declaration = catalogs.classFeatures.find(
      (row) =>
        row.name === 'Spellcasting' && row.className === 'Wizard' && row.classSource === 'PHB',
    )!
    const entries = declaration.entries
    const shield = fixture.lookups.spellsByKey['Shield|PHB']
    const routes = shield.classSpellRoutes
    const routeProof = shield.classSpellRouteSource
    const sourceCatalog = current.classChoiceFeatureCatalogs
    const proofRows = sourceCatalog.classCastingSources
    const featureRows = sourceCatalog.classFeatures
    const featureCandidates = sourceCatalog.classFeatureCandidates
    try {
      for (const field of ['classCastingSources', 'classes', 'classFeatures'] as const) {
        sourceCatalog[field] = []
        if (field === 'classFeatures') sourceCatalog.classFeatureCandidates = new Map()
        const unavailable = calculate()
        expect(unavailable.managedClassSpellStatuses.every((row) => !row.active)).toBe(true)
        expect(unavailable.classCasting.slots.shared).toEqual({})
        expect(unavailable.classCasting.details).toEqual([])
        expect(
          getManagedClassSpellPool(saved, saved.managedClassSpellChoices![0].slot, {
            ...fixture.context,
            catalogs: sourceCatalog,
          }).spells,
        ).toEqual([])
        Object.assign(sourceCatalog, {
          classCastingSources: proofRows,
          classes,
          classFeatures: featureRows,
          classFeatureCandidates: featureCandidates,
        })
        expect(calculate()).toEqual(baseline)
        expect(
          getManagedClassSpellPool(saved, saved.managedClassSpellChoices![0].slot, {
            ...fixture.context,
            catalogs: sourceCatalog,
          }).spells.length,
        ).toBeGreaterThan(0)
      }
      for (const identity of [
        { name: 'Sorcerer', source: refreshed.source },
        { name: refreshed.name, source: 'XPHB' },
      ]) {
        Object.assign(refreshed, identity)
        expect(calculate().classCasting.details).toEqual([])
        Object.assign(refreshed, { name: ' WIZARD ', source: ' phb ' })
        expect(calculate()).toEqual(baseline)
      }
      refreshed.spellSlotProgression = Array(20).fill([99])
      expect(calculate().classCasting.slots.shared).toEqual({})
      refreshed.spellSlotProgression = original.spellSlotProgression
      expect(calculate()).toEqual(baseline)
      parent.verified = false
      expect(calculate().managedClassSpellStatuses.every((row) => !row.active)).toBe(true)
      expect(calculate().classCasting.slots.shared).toEqual({})
      parent.verified = true
      expect(calculate()).toEqual(baseline)
      declaration.entries = [...(entries ?? []), 'Changed current declaration']
      expect(calculate().managedClassSpellStatuses.every((row) => !row.active)).toBe(true)
      declaration.entries = entries
      expect(calculate()).toEqual(baseline)
      shield.classSpellRoutes = []
      shield.classSpellRouteSource = undefined
      const unavailable = calculate()
      expect(
        unavailable.managedClassSpellStatuses.find((row) => row.choice.target.name === 'Shield')
          ?.active,
      ).toBe(false)
      expect(
        unavailable.managedClassSpellStatuses.find((row) => row.choice.target.name === 'Grease')
          ?.active,
      ).toBe(true)
      shield.classSpellRoutes = routes
      shield.classSpellRouteSource = routeProof
      expect(calculate()).toEqual(baseline)
      expect(JSON.stringify(saved)).toBe(before)
    } finally {
      Object.assign(sourceCatalog, {
        classCastingSources: proofRows,
        classes,
        classFeatures: featureRows,
        classFeatureCandidates: featureCandidates,
      })
      Object.assign(refreshed, {
        name: ' WIZARD ',
        source: ' phb ',
        spellSlotProgression: original.spellSlotProgression,
      })
      parent.verified = true
      declaration.entries = entries
      shield.classSpellRoutes = routes
      shield.classSpellRouteSource = routeProof
    }
  })

  test('retained raw dictionaries cannot restore absent or unproven mechanics; exact recovery preserves intent', () => {
    const saved = wizard()
    const before = JSON.stringify(saved)
    const proof = catalogs.classCastingSources!.find(
      (row) => row.kind === 'casting-parent' && row.target === '["class","wizard","phb"]',
    )!
    const changedParent = {
      ...catalogs,
      classes: catalogs.classes!.map((row) =>
        row.name === 'Wizard' && row.source === 'PHB'
          ? { ...row, spellSlotProgression: Array(20).fill([99]) }
          : row,
      ),
    }
    const unavailable = [
      undefined,
      { ...catalogs, classes: [] },
      { ...catalogs, classCastingSources: [] },
      { ...catalogs, classCastingSources: [...catalogs.classCastingSources!, { ...proof }] },
      {
        ...catalogs,
        classCastingSources: catalogs.classCastingSources!.map((row) =>
          row === proof ? { ...row, origin: '' } : row,
        ),
      },
      changedParent,
    ]
    for (const current of [catalogs, ...unavailable, catalogs]) {
      const primary = current ? { ...fixture.lookups, classChoiceFeatureCatalogs: current } : {}
      const calculation = createCharacterCalculationContext(saved, primary, fixture.lookups)
      const vm = createCharacterSheetViewModel(saved, fixture.lookups, primary)
      const active = current === catalogs
      expect(vm.spellcastingDetails).toEqual(calculation.classCasting.details)
      expect(vm.spellSlots).toEqual(calculation.classCasting.slots)
      expect(vm.spellcastingDetails).toHaveLength(active ? 1 : 0)
      expect(vm.spellSlots.shared[1]?.max).toBe(active ? 2 : undefined)
      expect(vm.spellRows.map((row) => row.name).sort()).toEqual(active ? ['Grease', 'Shield'] : [])
      const legacy = mapOfficial2014SpellPage(vm).textFields
      expect(legacy['SpellSaveDC  2']).toBe(active ? '12' : '')
      expect(legacy['SpellAtkBonus 2']).toBe(active ? '+4' : '')
      expect(legacy['SlotsTotal 19']).toBe(active ? '2' : '')
      const revised = mapCharacterSheet2024(vm).textFields
      expect(revised.Text_86).toBe(active ? '12' : '')
      expect(revised.Text_87).toBe(active ? '+4' : '')
      expect(characterPersistenceSchema.safeParse(calculation.character).success).toBe(true)
      expect(calculation.character.managedClassSpellChoices).toEqual(saved.managedClassSpellChoices)
      expect(calculation.character.managedClassSpellRevision).toBe(saved.managedClassSpellRevision)
    }
    expect(JSON.stringify(saved)).toBe(before)
  })

  test('combined slots validate the actual full-catalog winner while own tables and Pact stay independent', () => {
    const cleric = { name: 'Cleric', source: 'PHB', levels: 2 }
    const druid = { name: 'Druid', source: 'PHB', levels: 2 }
    expect(cast([cleric, druid]).slots.shared).toEqual({
      1: { max: 4, used: 0 },
      2: { max: 3, used: 0 },
    })
    const wizardProof = catalogs.classCastingSources!.find(
      (row) => row.kind === 'casting-parent' && row.target === '["class","wizard","phb"]',
    )!
    const withoutWinner = {
      ...catalogs,
      classCastingSources: catalogs.classCastingSources!.filter((row) => row !== wizardProof),
    }
    expect(cast([cleric, druid], withoutWinner).slots.shared).toEqual({})
    expect(cast([cleric], withoutWinner).slots.shared[1]?.max).toBe(3)
    const pact = { name: 'Warlock', source: 'PHB', levels: 3 }
    expect(cast([cleric, druid, pact], withoutWinner).slots.pact).toEqual({
      2: { max: 2, used: 0, isPactMagic: true },
    })
    expect(cast([cleric, druid]).slots.shared[2]?.max).toBe(3)
    const trickster = {
      name: 'Rogue',
      source: 'PHB',
      subclass: 'Arcane Trickster',
      subclassSource: 'PHB',
      levels: 7,
    }
    const own = { 1: { max: 4, used: 0 }, 2: { max: 2, used: 0 } }
    expect(cast([trickster], withoutWinner).slots.shared).toEqual(own)
    expect(cast([trickster, { name: 'Fighter', source: 'PHB', levels: 1 }]).slots.shared).toEqual(
      own,
    )
    expect(cast([trickster, { name: 'Ranger', source: 'PHB', levels: 1 }]).slots.shared).toEqual(
      own,
    )
    expect(cast([trickster, { name: 'Ranger', source: 'PHB', levels: 2 }]).slots.shared).toEqual({
      1: { max: 4, used: 0 },
      2: { max: 2, used: 0 },
    })
    const altered = {
      ...catalogs,
      classes: catalogs.classes!.map((row) =>
        row.name === 'Rogue' && row.source === 'PHB'
          ? {
              ...row,
              subclasses: row.subclasses!.map((sub) =>
                sub.name === 'Arcane Trickster'
                  ? { ...sub, spellSlotProgression: Array(20).fill([99]) }
                  : sub,
              ),
            }
          : row,
      ),
    }
    expect(cast([trickster], altered).details).toEqual([])
    expect(cast([trickster]).slots.shared).toEqual(own)
    const revisedOnlyProvider = {
      ...catalogs,
      classes: catalogs.classes!.filter(
        (row) => row.source !== 'PHB' || row.casterProgression !== 'full',
      ),
    }
    const mixed = [
      trickster,
      { name: 'Ranger', source: 'PHB', levels: 2 },
      { name: 'Fighter', source: 'XPHB', levels: 1 },
    ]
    expect(cast(mixed, revisedOnlyProvider).slots.shared).toEqual(own)
    const missingRevisedParent = {
      ...revisedOnlyProvider,
      classCastingSources: revisedOnlyProvider.classCastingSources!.filter(
        (row) => row.kind !== 'casting-parent' || row.target !== '["class","fighter","xphb"]',
      ),
    }
    expect(cast(mixed, missingRevisedParent).slots.shared).toEqual({})
  })

  test('the real hook follows current proof and source changes with populated retained lookup data', async () => {
    const saved = wizard()
    const before = JSON.stringify(saved)
    const data = { ...fixture.data, spells: fixture.spells }
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    useCharacterStore.setState({
      activeCharacter: saved,
      activeCharacterId: saved.id,
      characters: [saved],
    })
    const { result } = renderHook(() => useSpellSlots())
    expect(result.current.sharedSlots[0]?.max).toBe(2)
    expect(result.current.spellcastingDetails[0]?.spellAttackBonus).toBe(4)
    for (const identity of [
      { name: 'WIZARD', source: 'phb' },
      { name: ' Wizard ', source: ' PHB ' },
    ]) {
      const classes = data.classes.map((row) =>
        row.name === 'Wizard' && row.source === 'PHB' ? { ...row, ...identity } : row,
      )
      const refreshed = { ...data, classes }
      refreshed.lookups = buildGameDataLookups(refreshed)
      const lookups = {
        ...fixture.lookups,
        classesByKey: buildClassLookup(classes),
        classChoiceClasses: classes,
        classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(refreshed),
      }
      const view = createCharacterSheetViewModel(saved, fixture.lookups, lookups)
      expect(view.spellSlots.shared[1]?.max).toBe(2)
      expect(view.spellcastingDetails[0]).toMatchObject({
        profileId: 'class:Wizard|PHB',
        spellSaveDC: 12,
        spellAttackBonus: 4,
        preparedSpellLimit: 3,
      })
      await act(() => useGameDataStore.setState({ gameData: refreshed }))
      expect(result.current.sharedSlots[0]?.max).toBe(2)
      expect(result.current.spellcastingDetails[0]?.spellAttackBonus).toBe(4)
      expect(result.current.preparedSpells.sort()).toEqual(['Grease|PHB', 'Shield|PHB'])
    }
    await act(() => useGameDataStore.setState({ gameData: { ...data, classCastingSources: [] } }))
    expect(result.current.sharedSlots).toEqual([])
    expect(result.current.spellcastingDetails).toEqual([])
    expect(result.current.spellsKnown).toEqual([])
    await act(() => useGameDataStore.setState({ gameData: data }))
    expect(result.current.sharedSlots[0]?.max).toBe(2)
    expect(result.current.preparedSpells.sort()).toEqual(['Grease|PHB', 'Shield|PHB'])
    await act(() =>
      useCharacterStore.setState({
        activeCharacter: { ...saved, originSystem: '2024', allowedSources: ['XPHB'] },
      }),
    )
    expect(result.current.sharedSlots).toEqual([])
    expect(result.current.spellcastingDetails).toEqual([])
    await act(() => useCharacterStore.setState({ activeCharacter: saved }))
    expect(result.current.sharedSlots[0]?.max).toBe(2)
    expect(JSON.stringify(saved)).toBe(before)
    expect(buildClassChoiceFeatureCatalogs(data).classCastingSources).toEqual(
      catalogs.classCastingSources,
    )
  })
})
