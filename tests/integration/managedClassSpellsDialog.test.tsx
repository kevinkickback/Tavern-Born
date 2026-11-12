import { existsSync, readFileSync } from 'node:fs'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useSpellProvenanceMutations } from '@/hooks/character/useSpellProvenanceMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import {
  setManagedClassSpellChoiceCommand,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import { ManagedClassSpellsDialog } from '@/pages/build/class/components/ManagedClassSpellsDialog'
import { useClassSpellChoiceController } from '@/pages/build/class/hooks/useClassSpellChoiceController'
import { SpellsPage } from '@/pages/spells/SpellsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, ClassFeature, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeBundledClassCastingLayer } from '../fixtures/classCastingFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'

const fixture = makeManagedClassSpellFixtures()
const gameData = { ...fixture.data, spells: fixture.spells }
gameData.lookups = buildGameDataLookups(gameData)
const initial = () =>
  makeCharacterFixture({
    allowedSources: ['PHB'],
    classProgression: [{ name: 'Bard', source: 'PHB', levels: 1 }],
  })
const install = (character: Character) => {
  useGameDataStore.setState({ gameData })
  useCharacterStore.setState({
    activeCharacter: character,
    activeCharacterId: character.id,
    characters: [character],
  })
}
function Flow({ level = 1 }: { level?: number }) {
  const character = useCharacterStore((state) => state.activeCharacter)!
  const calculation = useCharacterCalculationContext(character)
  const { finishClassSpellChoices } = useSpellProvenanceMutations()
  const [open, setOpen] = useState(true)
  return open ? (
    <ManagedClassSpellsDialog
      character={character}
      entry={character.classProgression[0]}
      level={level}
      context={calculation?.classChoices.spellContext}
      statuses={calculation?.managedClassSpellStatuses ?? []}
      onOpenChange={setOpen}
      onFinish={finishClassSpellChoices}
    />
  ) : (
    <button type="button" onClick={() => setOpen(true)}>
      Reopen spell choices
    </button>
  )
}
async function choose(index: number, name: string, kind = 'Cantrip') {
  const group = screen.getByRole('group', { name: `${kind} ${index}` })
  fireEvent.click(within(group).getByRole('button', { name: /Choose|Change/ }))
  const picker = within(screen.getByRole('dialog', { name: /^Choose/ }))
  fireEvent.change(picker.getByRole('textbox', { name: /Search/ }), { target: { value: name } })
  fireEvent.click(await picker.findByText(name, { exact: true }))
  fireEvent.click(picker.getByRole('button', { name: 'Confirm' }))
}

function installWizard(character: Character) {
  const data = {
    ...makeBundledClassCastingLayer('class/class-wizard.json'),
    spells: fixture.spells,
  }
  const wizard = { ...data, lookups: buildGameDataLookups(data) }
  install(character)
  useGameDataStore.setState({ gameData: wizard })
  return wizard
}

const classicWizard = () =>
  makeCharacterFixture({
    allowedSources: ['PHB'],
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 18 }],
  })

const evokerWizard = () =>
  makeCharacterFixture({
    originSystem: '2024',
    allowedSources: ['XPHB'],
    classProgression: [
      { name: 'Wizard', source: 'XPHB', levels: 5, subclass: 'Evoker', subclassSource: 'XPHB' },
    ],
  })

const wizardProfile = (character: Character) =>
  character.spells.spellProfiles.find((profile) => profile.className === 'Wizard')

function seedWizardBook(
  character: Character,
  spells: ReadonlyArray<readonly [ManagedClassSpellSlot, string]>,
) {
  const view = renderHook(() => useCharacterCalculationContext(character))
  const context = view.result.current?.classChoices.spellContext
  view.unmount()
  const { characterPatch, provenanceUpdate } = setManagedClassSpellChoicesCommand(
    character,
    character.provenance,
    spells.map(([slot, name]) => ({
      slot,
      expected: null,
      expectedEmptyRevision: 0,
      target: { name, source: character.classProgression[0].source },
      policy: 'default',
    })),
    context,
  )
  const saved = characterPersistenceSchema.parse({
    ...character,
    ...characterPatch,
    provenance: provenanceUpdate,
  })
  useCharacterStore.setState({ activeCharacter: saved, characters: [saved] })
  return saved
}

const mastery = () => within(screen.getByRole('group', { name: 'Spell Mastery 1' }))
const savantRow = () => screen.getByRole('group', { name: 'Evocation Savant 1' })
const clearLearned = () =>
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Spell 1' })).getByRole('button', { name: 'Clear' }),
  )

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-selection-scroll-container') ? 600 : 160
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useGameDataStore.setState({ gameData: null })
  useCharacterStore.setState({ activeCharacter: null, activeCharacterId: null, characters: [] })
})

describe('Class spell Finish and current-state adapter', () => {
  test.skipIf(!existsSync('data/class/class-sorcerer.json'))(
    'classic Sorcerer replaces a bonus spell from the level dialog',
    async () => {
      const parsed = parseClassDocument(
        JSON.parse(readFileSync('data/class/class-sorcerer.json', 'utf8')),
      )
      const document = JSON.parse(readFileSync('data/spells/spells-phb.json', 'utf8'))
      const spells = parseSpells(
        document.spell.filter((spell: Spell5e) =>
          ['Charm Person', 'Arms of Hadar', 'Dissonant Whispers'].includes(spell.name),
        ),
        {
          sourceLookup: JSON.parse(
            readFileSync('data/generated/gendata-spell-source-lookup.json', 'utf8'),
          ),
        },
      ) as Spell5e[]
      const data = makeGameDataFixture({
        classes: parsed.classes as Class5e[],
        classFeatures: parsed.classFeatures as ClassFeature[],
        classCastingSources: parsed.classCastingSources,
        spells,
      })
      data.lookups = buildGameDataLookups(data)
      const original = makeCharacterFixture({
        allowedSources: ['PHB', 'TCE'],
        classProgression: [
          {
            name: 'Sorcerer',
            source: 'PHB',
            levels: 2,
            subclass: 'Aberrant Mind',
            subclassSource: 'TCE',
          },
        ],
      })
      install(original)
      useGameDataStore.setState({ gameData: data })
      render(<Flow level={2} />)
      fireEvent.change(screen.getByLabelText('Psionic Spells replacement'), {
        target: { value: '0' },
      })
      const row = screen.getByRole('group', { name: /Psionic Spells/ })
      fireEvent.click(within(row).getByRole('button', { name: 'Choose' }))
      expect(screen.getByRole('dialog', { name: 'Choose a replacement spell' })).toBeTruthy()
      expect(screen.queryByRole('switch', { name: 'Ignore class restrictions' })).toBeNull()
      fireEvent.click(await screen.findByText('Charm Person', { exact: true }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
      fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
      const saved = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
      expect(saved.managedClassSpellChoices?.map((choice) => choice.slot[1])).toEqual([
        'subclass-spell-replacement',
      ])
      expect(saved.spells.spellProfiles[0].spellsKnown).toContain('Charm Person|PHB')
      expect(
        saved.spells.spellProfiles[0].spellsKnown.map((ref) => ref.toLowerCase()),
      ).not.toContain('arms of hadar|phb')
      fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
      fireEvent.change(screen.getByLabelText('Psionic Spells replacement'), {
        target: { value: '' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
      const restored = characterPersistenceSchema.parse(
        useCharacterStore.getState().activeCharacter,
      )
      expect(restored.managedClassSpellChoices).toEqual([])
      expect(
        restored.spells.spellProfiles[0].spellsKnown.map((ref) => ref.toLowerCase()),
      ).toContain('arms of hadar|phb')
    },
  )

  test('Evocation Savant learns into the shared Wizard book without preparing spells', async () => {
    const data = installWizard(evokerWizard())
    const wizard = data.classes.find((row) => row.source === 'XPHB')!
    const evoker = wizard.subclasses?.find((row) => row.name === 'Evoker')
    expect(evoker).toBeDefined()
    const summary = renderHook(
      ({ subclass }: { subclass?: typeof evoker }) =>
        useClassSpellChoiceController(wizard, subclass),
      { initialProps: { subclass: evoker } },
    )
    expect(summary.result.current.choicesByLevel.get(3)).toMatchObject({
      spells: 2,
      savantSpellbook: { name: 'Evocation Savant', count: 2, maxSpellLevel: 2 },
    })
    expect(summary.result.current.choicesByLevel.get(5)).toMatchObject({
      spells: 2,
      savantSpellbook: { name: 'Evocation Savant', count: 1, maxSpellLevel: 3 },
    })
    const earned = summary.result.current.choicesByLevel.get(3)?.savantSpellbook
    summary.rerender({ subclass: undefined })
    expect(summary.result.current.choicesByLevel.get(3)?.savantSpellbook).toEqual(earned)
    summary.unmount()
    render(<Flow level={3} />)
    await choose(1, 'Magic Missile', 'Spell')

    fireEvent.click(within(savantRow()).getByRole('button', { name: 'Choose' }))
    const picker = screen.getByRole('dialog', { name: 'Choose Evocation Savant 1' })
    expect(picker.textContent).toContain('Evocation spell of up to 2nd level')
    expect(screen.queryByRole('switch', { name: 'Ignore class restrictions' })).toBeNull()
    const search = screen.getByRole('textbox', { name: /Search/ })
    for (const name of ['Magic Missile', 'Shield', 'Fireball']) {
      fireEvent.change(search, { target: { value: name } })
      expect(screen.queryByText(name)).toBeNull()
    }
    fireEvent.change(search, { target: { value: 'Scorching Ray' } })
    fireEvent.click(await screen.findByText('Scorching Ray'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.queryByRole('checkbox', { name: 'Prepare this spell' })).toBeNull()

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Spell 2' })).getByRole('button', {
        name: 'Choose',
      }),
    )
    expect(screen.getByRole('switch', { name: 'Ignore class restrictions' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /Search/ }), {
      target: { value: 'Scorching Ray' },
    })
    expect(screen.queryByText('Scorching Ray')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(
      saved.managedClassSpellChoices?.map(({ slot, target, prepare }) => [
        slot[0][0],
        target,
        prepare,
      ]),
    ).toEqual([
      ['class', { name: 'Magic Missile', source: 'XPHB' }, undefined],
      ['subclass', { name: 'Scorching Ray', source: 'XPHB' }, undefined],
    ])
    expect(wizardProfile(saved)?.spellsKnown).toEqual(
      expect.arrayContaining(['Magic Missile|XPHB', 'Scorching Ray|XPHB']),
    )
    expect(wizardProfile(saved)?.preparedSpells).toEqual([])

    const view = renderHook(() => useCharacterCalculationContext(saved))
    const readiness = validateSpells(saved, view.result.current!, data.lookups.spellsByKey)
    expect(readiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Finish Wizard Evocation Savant spellbook choices at level 3',
          explanation: '2 extra spellbook choices are earned here. 1 of 2 complete.',
        }),
        expect.objectContaining({ title: 'Finish Wizard spell choices at level 3' }),
      ]),
    )
  })

  test('preparing on Spells survives reopening the Wizard book and replacing a different choice', async () => {
    const character = evokerWizard()
    installWizard(character)
    seedWizardBook(character, [
      [
        [
          ['class', 'wizard', 'xphb'],
          'class-spellbook',
          'class-feature|spellcasting|wizard|xphb|1|xphb',
          3,
          0,
        ],
        'Magic Missile',
      ],
      [
        [
          ['subclass', 'wizard', 'xphb', 'evoker', 'xphb'],
          'class-spellbook',
          'subclass-feature|evocation savant|wizard|xphb|evoker|xphb|3|xphb',
          3,
          0,
        ],
        'Scorching Ray',
      ],
    ])
    const spells = render(
      <TooltipProvider>
        <MemoryRouter>
          <SpellsPage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    fireEvent.click(await screen.findByRole('tab', { name: /Wizard/ }))
    const prepareButtons = screen.getAllByTitle('Not prepared', { exact: true })
    expect(prepareButtons).toHaveLength(2)
    for (const button of prepareButtons) fireEvent.click(button)
    const prepared = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(wizardProfile(prepared)?.preparedSpells).toHaveLength(2)
    expect(wizardProfile(prepared)?.preparedSpells).toEqual(
      expect.arrayContaining(['Magic Missile|XPHB', 'Scorching Ray|XPHB']),
    )

    spells.unmount()
    render(<Flow level={3} />)
    expect(within(savantRow()).getByText('Scorching Ray (XPHB)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(useCharacterStore.getState().activeCharacter?.managedClassSpellChoices).toEqual(
      prepared.managedClassSpellChoices,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    clearLearned()
    await choose(1, 'Shield', 'Spell')
    expect(screen.getByText('Shield (XPHB)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const replaced = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(wizardProfile(replaced)?.spellsKnown).toContain('Shield|XPHB')
    expect(wizardProfile(replaced)?.spellsKnown).not.toContain('Magic Missile|XPHB')
    expect(wizardProfile(replaced)?.preparedSpells).toEqual(['Scorching Ray|XPHB'])
  })

  test('Spell Mastery uses same-dialog draft learning and removal without saving the preview', async () => {
    const character = classicWizard()
    installWizard(character)
    const before = JSON.stringify(character)
    render(<Flow level={18} />)

    await choose(1, 'Shield', 'Spell')
    await choose(1, 'Shield', 'Spell Mastery')
    expect(mastery().getByText('Chosen')).toBeTruthy()
    clearLearned()
    expect(mastery().queryByText('Chosen')).toBeNull()
    expect(mastery().getByText(/restore this spell in the draft spellbook/i)).toBeTruthy()
    await choose(1, 'Shield', 'Spell')
    expect(mastery().getByText('Chosen')).toBeTruthy()
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(saved.managedClassSpellChoices?.map(({ slot, target }) => [slot[1], target])).toEqual([
      ['class-spellbook', { name: 'Shield', source: 'PHB' }],
      ['class-spellbook-specialty', { name: 'Shield', source: 'PHB' }],
    ])
  })

  test('saved Spell Mastery distinguishes draft removal from a persisted unavailable spell', async () => {
    const character = classicWizard()
    installWizard(character)
    const saved = seedWizardBook(character, [
      [
        [
          ['class', 'wizard', 'phb'],
          'class-spellbook',
          'class-feature|spellcasting|wizard|phb|1|phb',
          18,
          0,
        ],
        'Shield',
      ],
      [
        [
          ['class', 'wizard', 'phb'],
          'class-spellbook-specialty',
          'class-feature|spell mastery|wizard|phb|18|phb',
          18,
          0,
        ],
        'Shield',
      ],
    ])

    render(<Flow level={18} />)
    clearLearned()
    expect(mastery().queryByText('Chosen')).toBeNull()
    expect(mastery().getByText(/restore this spell in the draft spellbook/i)).toBeTruthy()
    expect(mastery().queryByText(/the choice is saved/i)).toBeNull()
    fireEvent.click(mastery().getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('dialog', { name: 'Choose Spell Mastery 1' })).toBeTruthy()
    expect(screen.queryByText('Shield')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(useCharacterStore.getState().activeCharacter?.managedClassSpellChoices).toEqual(
      saved.managedClassSpellChoices,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    clearLearned()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    expect(mastery().getByText(/the choice is saved/i)).toBeTruthy()
    await choose(1, 'Shield', 'Spell')
    expect(mastery().getByText('Chosen')).toBeTruthy()
    expect(mastery().queryByText(/the choice is saved/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    expect(mastery().getByText('Chosen')).toBeTruthy()
  })

  test('Spells Sources shows a current fixed subclass grant once', async () => {
    const saved = makeCharacterFixture({
      allowedSources: ['PHB'],
      classProgression: [
        {
          name: 'Rogue',
          source: 'PHB',
          levels: 3,
          subclass: 'Arcane Trickster',
          subclassSource: 'PHB',
        },
      ],
    })
    install(saved)
    render(
      <TooltipProvider>
        <MemoryRouter>
          <SpellsPage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    fireEvent.click(await screen.findByRole('tab', { name: /Rogue/ }))
    const sources = screen.getByRole('button', { name: /^Sources/ })
    expect(sources.textContent).toBe('Sources1')
    if (sources.getAttribute('data-state') !== 'open') fireEvent.click(sources)
    const section = sources.closest('[data-slot="accordion-item"]') as HTMLElement
    expect(within(section).getAllByText('Mage Hand (PHB)')).toHaveLength(1)
    expect(useCharacterStore.getState().activeCharacter).toBe(saved)
  })

  test('Spells recovery clears an exact dormant I without a saved parent profile', async () => {
    const original = initial()
    const selected = setManagedClassSpellChoiceCommand(
      original,
      original.provenance,
      {
        slot: [
          ['class', 'bard', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|bard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Light', source: 'PHB' },
        policy: 'default',
      },
      fixture.context,
    )
    const projected = projectManagedClassSpellState(
      { ...original, ...selected.characterPatch, provenance: selected.provenanceUpdate },
      { ...fixture.context, spellsByKey: {} },
    ).character
    projected.spells.spellProfiles = projected.spells.spellProfiles.filter(
      (profile) => profile.type !== 'class',
    )
    const saved = characterPersistenceSchema.parse(projected)
    install(saved)
    await act(async () => {
      await useGameDataStore.setState({ gameData: { ...gameData, spells: [] } })
    })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <SpellsPage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    fireEvent.click(await screen.findByRole('tab', { name: /Bard/ }))
    expect(screen.getByText(/Light\|PHB — saved choice unavailable/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved choice' }))
    const cleared = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(cleared.managedClassSpellChoices).toEqual([])
    expect(cleared.managedClassSpellRevision).toBe(1)
    expect(cleared.provenance.spells.light).toBeUndefined()
  })
  test('draft Cancel is byte-pure; one Finish saves both addressed choices and reopens them', async () => {
    const original = initial()
    install(original)
    const before = JSON.stringify(original)
    render(<Flow />)
    const row = () => within(screen.getByRole('group', { name: 'Cantrip 1' }))
    expect(row().queryByText('Chosen')).toBeNull()
    await choose(1, 'Light')
    expect(row().getByText('Chosen')).toBeTruthy()
    fireEvent.click(row().getByRole('button', { name: 'Clear' }))
    expect(row().queryByText('Chosen')).toBeNull()
    await choose(1, 'Light')
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    await choose(1, 'Light')
    await choose(2, 'Message')
    await act(async () => {
      await useCharacterStore.getState().updateCharacter(original.id, { name: 'Latest name' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = useCharacterStore.getState().activeCharacter!
    expect(saved.name).toBe('Latest name')
    expect(
      saved.managedClassSpellChoices?.map((choice) => [choice.target.name, choice.revision]),
    ).toEqual([
      ['Light', 1],
      ['Message', 2],
    ])
    expect(characterPersistenceSchema.safeParse(saved).success).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    expect(row().getByText('Chosen')).toBeTruthy()
    expect(screen.getByText('Light (PHB)')).toBeTruthy()
    expect(screen.getByText('Message (PHB)')).toBeTruthy()
    const reopened = JSON.stringify(saved)
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(reopened)
  })

  test('shows a level 15 Sorcerer spell as chosen after picking, changing, and reopening', async () => {
    const original = makeCharacterFixture({
      originSystem: '2014',
      allowedSources: ['PHB'],
      classProgression: [{ name: 'Sorcerer', source: 'PHB', levels: 15 }],
    })
    const data = makeBundledClassCastingLayer('class/class-sorcerer.json')
    data.spells = fixture.spells
    data.lookups = buildGameDataLookups(data)
    install(original)
    useGameDataStore.setState({ gameData: data })
    render(<Flow level={15} />)
    const row = () => within(screen.getByRole('group', { name: 'Spell 1' }))
    expect(row().queryByText('Chosen')).toBeNull()
    await choose(1, 'Fireball', 'Spell')
    expect(row().getByText('Chosen')).toBeTruthy()
    fireEvent.click(row().getByRole('button', { name: 'Clear' }))
    expect(row().queryByText('Chosen')).toBeNull()
    await choose(1, 'Haste', 'Spell')
    expect(row().getByText('Haste (PHB)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(saved.managedClassSpellChoices?.[0]?.target).toEqual({ name: 'Haste', source: 'PHB' })
    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    expect(row().getByText('Chosen')).toBeTruthy()
    expect(row().getByText('Haste (PHB)')).toBeTruthy()
  })

  test('a stale opening cannot overwrite an intervening choice or a refreshed source catalog', async () => {
    const errors = vi.spyOn(toast, 'error')
    const original = initial()
    install(original)
    render(<Flow />)
    await choose(1, 'Light')
    const result = setManagedClassSpellChoiceCommand(
      original,
      original.provenance,
      {
        slot: [
          ['class', 'bard', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|bard|phb|1|phb',
          1,
          1,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Message', source: 'PHB' },
        policy: 'default',
      },
      fixture.context,
    )
    await act(async () => {
      await useCharacterStore.getState().updateCharacter(original.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    })
    const newer = JSON.stringify(useCharacterStore.getState().activeCharacter)
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(errors).toHaveBeenLastCalledWith(expect.stringContaining('changed'))
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(newer)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    await choose(1, 'Light')
    await act(async () => {
      await useGameDataStore.setState({ gameData: { ...gameData } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(errors).toHaveBeenLastCalledWith(expect.stringContaining('sources changed'))
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(newer)
  })

  test('a valid same-spell policy change replaces the old unavailable status', async () => {
    const original = initial()
    install(original)
    const result = setManagedClassSpellChoiceCommand(
      original,
      original.provenance,
      {
        slot: [
          ['class', 'bard', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|bard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Light', source: 'PHB' },
        policy: 'default',
      },
      fixture.context,
    )
    install({ ...original, ...result.characterPatch, provenance: result.provenanceUpdate })
    const revised = {
      ...gameData,
      spells: gameData.spells.map((spell) =>
        spell.name === 'Light' && spell.source === 'PHB'
          ? { ...spell, classes: {}, classSpellRouteSource: undefined, classSpellRoutes: [] }
          : spell,
      ),
    }
    revised.lookups = buildGameDataLookups(revised)
    useGameDataStore.setState({ gameData: revised })
    render(<Flow />)
    const row = () => within(screen.getByRole('group', { name: 'Cantrip 1' }))
    expect(await screen.findByText(/choice is saved/)).toBeTruthy()
    fireEvent.click(row().getByRole('button', { name: 'Change' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Ignore class restrictions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(row().getByText('Chosen')).toBeTruthy())
    expect(row().queryByText(/choice is saved/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(
      useCharacterStore.getState().activeCharacter?.managedClassSpellChoices?.[0]?.policy,
    ).toBe('ignore-class-list')
  })

  test('unavailable saved choices can be cleared without sources while retaining the allocator', async () => {
    const original = initial()
    const result = setManagedClassSpellChoiceCommand(
      original,
      original.provenance,
      {
        slot: [
          ['class', 'bard', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|bard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Light', source: 'PHB' },
        policy: 'default',
      },
      fixture.context,
    )
    install({ ...original, ...result.characterPatch, provenance: result.provenanceUpdate })
    useGameDataStore.setState({ gameData: { ...gameData, spells: [] } })
    render(<Flow />)
    expect(await screen.findByText(/choice is saved/)).toBeTruthy()
    expect(
      within(screen.getByRole('group', { name: 'Cantrip 1' })).queryByText('Chosen'),
    ).toBeNull()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Cantrip 1' })).getByRole('button', {
        name: 'Clear',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const cleared = useCharacterStore.getState().activeCharacter!
    expect(cleared.managedClassSpellChoices).toEqual([])
    expect(cleared.managedClassSpellRevision).toBe(1)
    expect(characterPersistenceSchema.safeParse(cleared).success).toBe(true)
  })

  test('Finish rejects an empty draft from a removed class lifetime and reopening captures the new one', async () => {
    const errors = vi.spyOn(toast, 'error')
    const bard = { name: 'Bard', source: 'PHB', levels: 1 }
    const fighter = { name: 'Fighter', source: 'PHB', levels: 1 }
    const original = { ...initial(), classProgression: [bard, fighter] }
    install(original)
    render(<Flow />)
    await choose(1, 'Light')
    await act(async () => {
      for (const next of [[fighter], [bard, fighter]]) {
        const latest = useCharacterStore.getState().activeCharacter!
        const result = applyClassProgressionUpdate(latest, latest.provenance, next)
        await useCharacterStore.getState().updateCharacter(latest.id, {
          ...result.characterPatch,
          provenance: result.provenanceUpdate,
        })
      }
    })
    const restored = JSON.stringify(useCharacterStore.getState().activeCharacter)
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(errors).toHaveBeenLastCalledWith(expect.stringContaining('changed'))
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(restored)
    expect(screen.getByText('Light (PHB)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    await choose(1, 'Light')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(saved.managedClassSpellChoices?.[0].target).toEqual({ name: 'Light', source: 'PHB' })
    expect(saved.managedClassSpellChoices?.[0].revision).toBe(2)
    expect(saved.managedClassSpellRevision).toBe(2)
  })
})
