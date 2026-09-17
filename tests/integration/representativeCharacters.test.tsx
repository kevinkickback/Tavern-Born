import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AppHeader } from '@/components/layout/AppHeader'
import { useCharacterReadiness } from '@/hooks/character/useCharacterReadiness'
import { useEquipment } from '@/hooks/character/useEquipment'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { useTotalAbilityScores } from '@/hooks/character/useTotalAbilityScores'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildPrerequisiteSnapshot, checkPrerequisite } from '@/lib/calculations/prerequisites'
import { calculateCharacterSpellSlots } from '@/lib/calculations/spellProfiles'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import {
  buildCharacterSheetFieldMap,
  createCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { AbilityName, Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  REPRESENTATIVE_CHARACTER_FIXTURES,
  type RepresentativeCharacterFixture,
} from '../fixtures/representativeCharacters'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

interface ConsumerSnapshot {
  builderScores: ReturnType<typeof useTotalAbilityScores>['total']
  carryCapacity: number
  totalWeight: number
  readiness: ReturnType<typeof useCharacterReadiness>
  profileIds: string[]
  sharedSlots: Array<{ level: number; max: number; used: number }>
  pactSlots: Array<{ level: number; max: number; used: number }>
  spellcasting: Array<{
    profileId: string
    spellSaveDC: number | null
    spellAttackBonus: number | null
  }>
}

function ConsumerProbe({
  character,
  onSnapshot,
}: {
  character: Character
  onSnapshot: (snapshot: ConsumerSnapshot) => void
}) {
  const builderScores = useTotalAbilityScores(character).total
  const equipment = useEquipment()
  const spellSlots = useSpellSlots()
  const readiness = useCharacterReadiness(character)

  useEffect(() => {
    onSnapshot({
      builderScores,
      carryCapacity: equipment.carryCapacity,
      totalWeight: equipment.totalWeight,
      readiness,
      profileIds: spellSlots.spellProfiles.map((profile) => profile.id),
      sharedSlots: spellSlots.sharedSlots.map(({ level, max, used }) => ({ level, max, used })),
      pactSlots: spellSlots.pactSlots.map(({ level, max, used }) => ({ level, max, used })),
      spellcasting: spellSlots.spellcastingDetails.map(
        ({ profileId, spellSaveDC, spellAttackBonus }) => ({
          profileId,
          spellSaveDC,
          spellAttackBonus,
        }),
      ),
    })
  }, [builderScores, equipment, onSnapshot, readiness, spellSlots])

  return null
}

const PDF_2014_ABILITY_FIELDS: Record<AbilityName, string> = {
  strength: 'Str',
  dexterity: 'Dex',
  constitution: 'Con',
  intelligence: 'Int',
  wisdom: 'Wis',
  charisma: 'Cha',
}

const PDF_2024_ABILITY_FIELDS: Record<AbilityName, string> = {
  strength: 'Text_25',
  dexterity: 'Text_26',
  constitution: 'Text_27',
  intelligence: 'Text_30',
  wisdom: 'Text_28',
  charisma: 'Text_29',
}

function activateFixture(fixture: RepresentativeCharacterFixture) {
  useGameDataStore.setState({ gameData: fixture.gameData })
  useCharacterStore.setState({
    characters: [fixture.character],
    activeCharacterId: fixture.character.id,
    activeCharacter: fixture.character,
    isActiveCharacterDirty: false,
  })
}

function assertPdfAgreement(
  fixture: RepresentativeCharacterFixture,
  viewModel: ReturnType<typeof createCharacterSheetViewModel>,
) {
  const pdf2014 = buildCharacterSheetFieldMap(viewModel, '2014')
  const pdf2024 = buildCharacterSheetFieldMap(viewModel, '2024')
  for (const ability of Object.keys(PDF_2014_ABILITY_FIELDS) as AbilityName[]) {
    const expected = String(viewModel.effectiveAbilityScores[ability])
    expect(
      pdf2014.textFields[PDF_2014_ABILITY_FIELDS[ability]],
      `${fixture.id} 2014 ${ability}`,
    ).toBe(expected)
    expect(
      pdf2024.textFields[PDF_2024_ABILITY_FIELDS[ability]],
      `${fixture.id} 2024 ${ability}`,
    ).toBe(expected)
  }
  expect(pdf2014.textFields.AC).toBe(String(fixture.expected.armorClass))
  expect(pdf2024.textFields.Text_8).toBe(String(fixture.expected.armorClass))
  expect(pdf2014.textFields['HP Max']).toBe(String(fixture.expected.maxHitPoints))
  expect(pdf2024.textFields.Text_11).toBe(String(fixture.expected.maxHitPoints))
  expect(pdf2014.textFields.Speed).toBe(`${fixture.expected.walkingSpeed} ft`)
  expect(pdf2024.textFields.Text_17).toBe(`${fixture.expected.walkingSpeed} ft`)
  expect(pdf2014.textFields['Weight Carrying Capacity.Field']).toBe(
    String(fixture.expected.carryCapacity),
  )
  if (fixture.expected.spellcasting[0]) {
    expect(pdf2014.textFields['Spell save DC 1']).toBe(
      String(fixture.expected.spellcasting[0].spellSaveDC),
    )
    expect(pdf2024.textFields.Text_86).toBe(String(fixture.expected.spellcasting[0].spellSaveDC))
    expect(pdf2024.textFields.Text_87).toBe(`+${fixture.expected.spellcasting[0].spellAttackBonus}`)
  }
}

afterEach(() => {
  cleanup()
  useGameDataStore.setState({ gameData: null })
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
    isActiveCharacterDirty: false,
  })
  vi.clearAllMocks()
})

describe('representative character consumers', () => {
  test.each(REPRESENTATIVE_CHARACTER_FIXTURES)('$label', async (fixture) => {
    const user = userEvent.setup()
    expect(characterPersistenceSchema.safeParse(fixture.character).success).toBe(true)
    activateFixture(fixture)
    let consumerSnapshot: ConsumerSnapshot | undefined
    const onSnapshot = (snapshot: ConsumerSnapshot) => {
      consumerSnapshot = snapshot
    }

    render(
      <MemoryRouter initialEntries={['/build/review?section=overview']}>
        <AppHeader />
        <BuildReviewPage />
        <ConsumerProbe character={fixture.character} onSnapshot={onSnapshot} />
      </MemoryRouter>,
    )

    await waitFor(() => expect(consumerSnapshot).toBeDefined())
    const snapshot = consumerSnapshot as ConsumerSnapshot
    const lookups = fixture.gameData.lookups!
    const calculation = createCharacterCalculationContext(fixture.character, lookups)
    const viewModel = createCharacterSheetViewModel(fixture.character, lookups)
    const prerequisiteSnapshot = buildPrerequisiteSnapshot({
      character: fixture.character,
      effectiveAbilityScores: calculation.abilityScores.total,
    })
    const readiness = getCharacterReadiness(fixture.character, {
      calculation,
      featsByKey: lookups.featsByKey,
      spellsByKey: lookups.spellsByKey,
    })

    expect(
      checkPrerequisite(fixture.prerequisite, prerequisiteSnapshot, fixture.prerequisiteOptions)
        .met,
    ).toBe(true)
    expect(readiness.blockingIssues).toEqual([])
    expect(readiness.status).toBe('ready')
    expect(snapshot.readiness?.status).toBe(readiness.status)

    for (const [ability, expected] of Object.entries(fixture.expected.abilityScores)) {
      const abilityName = ability as AbilityName
      expect(calculation.abilityScores.total[abilityName]).toBe(expected)
      expect(viewModel.effectiveAbilityScores[abilityName]).toBe(expected)
      expect(snapshot.builderScores[abilityName]).toBe(expected)
      expect(screen.getByTestId(`review-ability-${abilityName}`).textContent).toContain(
        String(expected),
      )
    }

    expect(viewModel.effectiveArmorClass).toBe(fixture.expected.armorClass)
    expect(viewModel.maxHP).toBe(fixture.expected.maxHitPoints)
    expect(viewModel.walkingSpeed).toBe(fixture.expected.walkingSpeed)
    expect(viewModel.carryingCapacity).toBe(fixture.expected.carryCapacity)
    expect(Number(viewModel.carriedWeight)).toBe(fixture.expected.totalWeight)
    expect(snapshot.carryCapacity).toBe(fixture.expected.carryCapacity)
    expect(snapshot.totalWeight).toBe(fixture.expected.totalWeight)
    expect(screen.getByTestId('header-ac-badge').getAttribute('aria-label')).toContain(
      String(fixture.expected.armorClass),
    )
    expect(screen.getByTestId('header-hp-badge').getAttribute('aria-label')).toContain(
      String(fixture.expected.maxHitPoints),
    )
    expect(screen.getByTestId('review-movement-walk').textContent).toContain(
      String(fixture.expected.walkingSpeed),
    )
    await user.click(screen.getByRole('tab', { name: /Needs attention/i }))
    expect(screen.getByText('Character is ready')).toBeTruthy()

    expect(snapshot.profileIds).toEqual(fixture.expected.profileIds)
    expect(snapshot.sharedSlots).toEqual(fixture.expected.sharedSlots)
    expect(snapshot.pactSlots).toEqual(fixture.expected.pactSlots)
    expect(snapshot.spellcasting).toEqual(fixture.expected.spellcasting)
    expect(
      viewModel.spellcastingDetails.map(({ profileId, spellSaveDC, spellAttackBonus }) => ({
        profileId,
        spellSaveDC,
        spellAttackBonus,
      })),
    ).toEqual(fixture.expected.spellcasting)

    if (fixture.expected.skill) {
      expect(viewModel.skillByName.get(fixture.expected.skill.name)?.modifier).toBe(
        fixture.expected.skill.modifier,
      )
    }
    if (fixture.expected.savingThrow) {
      expect(
        viewModel.savingThrowByAbility.get(fixture.expected.savingThrow.ability)?.modifier,
      ).toBe(fixture.expected.savingThrow.modifier)
    }
    if (fixture.expected.mastery) {
      const action = viewModel.actions.find(
        (candidate) => candidate.name === fixture.expected.mastery?.weapon,
      )
      expect(action?.mastery?.map((mastery) => mastery.name)).toContain(
        fixture.expected.mastery.name,
      )
      expect(
        viewModel.weaponRows.find((row) => row.name === fixture.expected.mastery?.weapon)?.notes,
      ).toContain(fixture.expected.mastery.name)
    }

    assertPdfAgreement(fixture, viewModel)
  })

  test('recalculates the multiclass fixture and retracts its ASI after a level decrease', () => {
    const fixture = REPRESENTATIVE_CHARACTER_FIXTURES.find(
      (candidate) => candidate.id === 'multiclass-spellcaster',
    )
    expect(fixture).toBeDefined()
    if (!fixture) return

    const result = applyClassProgressionUpdate(fixture.character, fixture.character.provenance!, [
      { name: 'Wizard', source: 'PHB', levels: 3 },
      { name: 'Warlock', source: 'PHB', levels: 2 },
    ])
    const changed = {
      ...fixture.character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    }
    const lookups = fixture.gameData.lookups!
    const calculation = createCharacterCalculationContext(changed, lookups)
    const viewModel = createCharacterSheetViewModel(changed, lookups)
    const slots = calculateCharacterSpellSlots(
      changed,
      new Map(
        fixture.gameData.classes.map((classData) => [
          `class:${classData.name}|${classData.source}`,
          classData,
        ]),
      ),
    )
    const readiness = getCharacterReadiness(changed, {
      calculation,
      featsByKey: lookups.featsByKey,
      spellsByKey: lookups.spellsByKey,
    })
    const pdf2014 = buildCharacterSheetFieldMap(viewModel, '2014')
    const pdf2024 = buildCharacterSheetFieldMap(viewModel, '2024')

    expect(changed.classProgression.reduce((sum, entry) => sum + entry.levels, 0)).toBe(5)
    expect(changed.asiChoices).toEqual([])
    expect(changed.spells.spellProfiles.map((profile) => profile.id)).toEqual(
      fixture.expected.profileIds,
    )
    expect(calculation.abilityScores.total.intelligence).toBe(16)
    expect(viewModel.maxHP).toBe(34)
    expect(viewModel.effectiveArmorClass).toBe(15)
    expect(viewModel.carryingCapacity).toBe(330)
    expect(slots.mergedSharedWithUsage).toMatchObject({
      1: { max: 4, used: 1 },
      2: { max: 2, used: 1 },
    })
    expect(slots.mergedPactWithUsage).toMatchObject({ 1: { max: 2, used: 1 } })
    expect(readiness.status).toBe('ready')
    expect(viewModel.spellcastingDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profileId: 'class:Wizard|PHB',
          spellSaveDC: 15,
          spellAttackBonus: 7,
        }),
        expect.objectContaining({
          profileId: 'class:Warlock|PHB',
          spellSaveDC: 14,
          spellAttackBonus: 6,
        }),
      ]),
    )
    expect(pdf2014.textFields.Int).toBe('16')
    expect(pdf2024.textFields.Text_30).toBe('16')
    expect(pdf2014.textFields['HP Max']).toBe('34')
    expect(pdf2024.textFields.Text_11).toBe('34')
  })
})
