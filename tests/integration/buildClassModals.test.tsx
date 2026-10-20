import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { BuildClassModals } from '@/pages/build/class/components/Modals'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'

type Props = ComponentProps<typeof BuildClassModals>
const fixture = makeManagedClassSpellFixtures()
function setup(name = 'Wizard', subclass?: string) {
  const character = makeCharacterFixture({
    classProgression: [
      { name, source: 'PHB', levels: 3, ...(subclass ? { subclass, subclassSource: 'PHB' } : {}) },
    ],
  })
  const gameData = { ...fixture.data, spells: fixture.spells }
  gameData.lookups = buildGameDataLookups(gameData)
  useGameDataStore.setState({ gameData })
  useCharacterStore.setState({
    activeCharacter: character,
    activeCharacterId: character.id,
    characters: [character],
  })
  const props: Props = {
    character,
    classes: fixture.data.classes,
    classPickerOpen: false,
    classPickerSearch: '',
    onClassPickerOpenChange: vi.fn(),
    onClassPickerSearchChange: vi.fn(),
    onClassSelect: vi.fn(),
    spellPickerLevel: subclass ? 3 : 1,
    onSpellPickerLevelChange: vi.fn(),
    viewingEntry: character.classProgression[0],
    onFinishClassSpellChoices: vi.fn(),
    subclassPickerOpen: false,
    onSubclassPickerOpenChange: vi.fn(),
    subclassTitle: 'Subclass',
    subclasses: [],
    onSubclassConfirm: vi.fn(),
    characterSnapshot: {} as never,
    asiPickerLevel: null,
    onAsiPickerLevelChange: vi.fn(),
    appliedAsiChoicesForClass: [],
    onAsiApply: vi.fn(),
    featPickerOpen: false,
    onFeatPickerOpenChange: vi.fn(),
    featModalFeats: [],
    featPickerInitialSelectedIds: [],
    onFeatConfirm: vi.fn(),
  }
  render(<BuildClassModals {...props} />)
  return props
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useGameDataStore.setState({ gameData: null })
})

describe('Class modal uses addressed spell choices', () => {
  test('outer Class modal opens exact gain rows and Cancel closes without a write', () => {
    const props = setup()
    const before = JSON.stringify(props.character)
    expect(screen.getByRole('group', { name: 'Cantrip 1' })).toBeTruthy()
    expect(screen.getAllByRole('group', { name: /Spell/ })).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onSpellPickerLevelChange).toHaveBeenCalledWith(null)
    expect(props.onFinishClassSpellChoices).not.toHaveBeenCalled()
    expect(JSON.stringify(props.character)).toBe(before)
  })
  test('actual PHB Arcane Trickster offers two other cantrips and distinct privileged/school-constrained rows', () => {
    setup('Rogue', 'Arcane Trickster')
    expect(screen.getAllByRole('group', { name: /Cantrip/ })).toHaveLength(2)
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Cantrip 1' })).getByRole('button', {
        name: 'Choose',
      }),
    )
    fireEvent.change(screen.getByRole('textbox', { name: /Search/ }), {
      target: { value: 'Mage Hand' },
    })
    expect(screen.queryByText('Mage Hand')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Spell 2' })).getByRole('button', {
        name: 'Choose',
      }),
    )
    expect(screen.getByText(/Allowed schools: Enchantment, Illusion/)).toBeTruthy()
  })
})
