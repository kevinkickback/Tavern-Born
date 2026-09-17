import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { BuildClassModals } from '@/pages/build/class/components/Modals'
import type { Spell5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/hooks/character/useTotalAbilityScores', () => ({
  useTotalAbilityScores: () => ({ total: makeCharacterFixture().abilityScores }),
}))

afterEach(cleanup)

type ModalProps = ComponentProps<typeof BuildClassModals>

function makeSpell(
  name: string,
  className: string,
  school: string = 'A',
  level: number = 1,
): Spell5e {
  return {
    name,
    source: 'PHB',
    level,
    school,
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'self' },
    duration: [{ type: 'instant' }],
    entries: [],
    classes: { fromClassList: [{ name: className, source: 'PHB' }] },
  }
}

function renderClassModals(
  character: ModalProps['character'],
  overrides: Partial<ModalProps> = {},
) {
  render(
    <BuildClassModals
      character={character}
      classes={[]}
      classPickerOpen={false}
      classPickerSearch=""
      onClassPickerOpenChange={vi.fn()}
      onClassPickerSearchChange={vi.fn()}
      onClassSelect={vi.fn()}
      spellPickerLevel={null}
      onSpellPickerLevelChange={vi.fn()}
      spellChoicesByLevel={new Map()}
      classSpells={[]}
      spellByReference={new Map()}
      onSetClassSpellSelectionsAtLevel={vi.fn()}
      onSwapClassSpellAtLevel={vi.fn()}
      spellSwapLevel={null}
      spellSwapDrop={null}
      onSpellSwapLevelChange={vi.fn()}
      onSpellSwapDropChange={vi.fn()}
      subclassPickerOpen={false}
      onSubclassPickerOpenChange={vi.fn()}
      subclassTitle="Subclass"
      subclasses={[]}
      onSubclassConfirm={vi.fn()}
      characterSnapshot={{} as never}
      asiPickerLevel={null}
      onAsiPickerLevelChange={vi.fn()}
      appliedAsiChoicesForClass={[]}
      onAsiApply={vi.fn()}
      featPickerOpen={false}
      onFeatPickerOpenChange={vi.fn()}
      featModalFeats={[]}
      featPickerInitialSelectedIds={[]}
      onFeatConfirm={vi.fn()}
      {...overrides}
    />,
  )
}

function renderWarlockSwap(
  spellSwapDrop: string | null,
  includeFixedSpell = false,
  includeChoiceTag = true,
  maxSpellLevel = 1,
  sourceQualified = false,
  progression: {
    characterLevel?: number
    spellGrantedAtLevel?: number
    swapAtLevel?: number
    replacementSpellLevel?: number
  } = {},
) {
  const characterLevel = progression.characterLevel ?? 2
  const spellGrantedAtLevel = progression.spellGrantedAtLevel ?? 1
  const swapAtLevel = progression.swapAtLevel ?? 2
  const hex = makeSpell('Hex', 'Warlock', 'E')
  const armorOfAgathys = makeSpell(
    'Armor of Agathys',
    'Warlock',
    'A',
    progression.replacementSpellLevel ?? 1,
  )
  const bless = makeSpell('Bless', 'Cleric', 'E')
  const hexReference = sourceQualified ? 'Hex|PHB' : 'Hex'
  const character = makeCharacterFixture({
    classProgression: [{ name: 'Warlock', source: 'PHB', levels: characterLevel }],
    spells: {
      ...makeCharacterFixture().spells,
      spellProfiles: [
        {
          id: 'class:Warlock|PHB',
          type: 'class',
          label: 'Warlock (Lv 2)',
          className: 'Warlock',
          classSource: 'PHB',
          cantrips: [],
          spellsKnown: includeFixedSpell ? [hexReference, 'Armor of Agathys'] : [hexReference],
          preparedSpells: [],
          fixedSpells: includeFixedSpell ? ['Armor of Agathys'] : undefined,
          alwaysPrepared: false,
        },
      ],
    },
    provenance: {
      ...makeCharacterFixture().provenance!,
      spells: {
        ...(includeChoiceTag
          ? {
              hex: [
                {
                  sourceType: 'class' as const,
                  sourceName: 'Warlock',
                  sourceRef: 'PHB',
                  grantType: 'choice' as const,
                  label: 'Warlock',
                  spellGrantedAtLevel,
                },
              ],
            }
          : {}),
        ...(includeFixedSpell
          ? {
              'armor of agathys': [
                {
                  sourceType: 'subclass' as const,
                  sourceName: 'Test Patron',
                  sourceRef: 'PHB',
                  grantType: 'fixed' as const,
                  label: 'Test Patron',
                },
              ],
            }
          : {}),
      },
    },
  })

  renderClassModals(character, {
    spellChoicesByLevel: new Map([
      [swapAtLevel, { cantrips: 0, spells: 1, maxSpellLevel, canSwap: true }],
    ]),
    classSpells: [armorOfAgathys, bless],
    spellByReference: new Map(
      [hex, armorOfAgathys, bless].map((spell) => [
        getSpellReferenceKey(spell.name, spell.source),
        spell,
      ]),
    ),
    viewingClass: 'Warlock',
    viewingClassSource: 'PHB',
    spellSwapLevel: swapAtLevel,
    spellSwapDrop,
    subclassTitle: 'Patron',
  })
}

describe('BuildClassModals spell replacement', () => {
  test('limits replacement candidates to the selected class list', async () => {
    renderWarlockSwap('Hex')

    await waitFor(() =>
      expect(document.querySelector('[data-selection-list-size="1"]')).toBeTruthy(),
    )
    expect(screen.getByText('1 results')).toBeTruthy()
  })

  test('offers only class-choice-owned spells as replacement sources', () => {
    renderWarlockSwap(null, true)

    expect(screen.getByText('Hex')).toBeTruthy()
    expect(screen.queryByText('Armor of Agathys')).toBeNull()
  })

  test('opens the replacement chooser for a non-fixed class-profile spell without a tag', () => {
    renderWarlockSwap(null, false, false)

    expect(screen.getByText('Replace a Spell at Level 2')).toBeTruthy()
    expect(screen.getByText('Hex')).toBeTruthy()
  })

  test('uses the replacement level rather than the original spell-selection level', async () => {
    renderWarlockSwap('Hex', false, true, 4, false, {
      characterLevel: 7,
      spellGrantedAtLevel: 2,
      swapAtLevel: 7,
      replacementSpellLevel: 4,
    })

    await waitFor(() =>
      expect(document.querySelector('[data-selection-list-size="1"]')).toBeTruthy(),
    )
    expect(screen.getByText(/replacement \(up to 4th-level\)/)).toBeTruthy()
    expect(screen.getByText('1 results')).toBeTruthy()
  })

  test('hides source qualifiers and recovers a missing replacement level limit', async () => {
    renderWarlockSwap(null, false, true, 0, true)

    expect(screen.getByText('Hex')).toBeTruthy()
    expect(screen.queryByText('Hex|PHB')).toBeNull()

    cleanup()
    renderWarlockSwap('Hex|PHB', false, true, 0, true)

    await waitFor(() =>
      expect(document.querySelector('[data-selection-list-size="1"]')).toBeTruthy(),
    )
    expect(screen.getByText('Replace: Hex')).toBeTruthy()
    expect(screen.queryByText('Replace: Hex|PHB')).toBeNull()
    expect(screen.getByText(/replacement \(up to 1st-level\)/)).toBeTruthy()
    expect(screen.queryByText(/0th-level/)).toBeNull()
  })
})

describe('BuildClassModals spell-school guidance', () => {
  test('explains the Arcane Trickster level-three rule without a quota badge', () => {
    const character = makeCharacterFixture({
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

    renderClassModals(character, {
      spellPickerLevel: 3,
      spellChoicesByLevel: new Map([
        [3, { cantrips: 2, spells: 3, maxSpellLevel: 1, canSwap: true }],
      ]),
      viewingClass: 'Rogue',
      viewingClassSource: 'PHB',
      viewingSubclass: 'Arcane Trickster',
      viewingSubclassSource: 'PHB',
    })

    expect(
      screen.getByText(
        'At least 2 of your 3 spells must be Enchantment or Illusion spells. The remaining spell may be from any Wizard school.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/outside the usual schools/i)).toBeNull()
  })
})
