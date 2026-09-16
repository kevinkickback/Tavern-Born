import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { BuildClassModals } from '@/pages/build/class/components/Modals'
import type { Spell5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/hooks/character/useTotalAbilityScores', () => ({
  useTotalAbilityScores: () => ({ total: makeCharacterFixture().abilityScores }),
}))

function makeSpell(name: string, className: string, school: string = 'A'): Spell5e {
  return {
    name,
    source: 'PHB',
    level: 1,
    school,
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'self' },
    duration: [{ type: 'instant' }],
    entries: [],
    classes: { fromClassList: [{ name: className, source: 'PHB' }] },
  }
}

function renderWarlockSwap(spellSwapDrop: string | null, includeFixedSpell = false) {
  const hex = makeSpell('Hex', 'Warlock', 'E')
  const armorOfAgathys = makeSpell('Armor of Agathys', 'Warlock', 'A')
  const bless = makeSpell('Bless', 'Cleric', 'E')
  const character = makeCharacterFixture({
    classProgression: [{ name: 'Warlock', source: 'PHB', levels: 2 }],
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
          spellsKnown: includeFixedSpell ? ['Hex', 'Armor of Agathys'] : ['Hex'],
          preparedSpells: [],
          fixedSpells: includeFixedSpell ? ['Armor of Agathys'] : undefined,
          alwaysPrepared: false,
        },
      ],
    },
    provenance: {
      ...makeCharacterFixture().provenance!,
      spells: {
        hex: [
          {
            sourceType: 'class',
            sourceName: 'Warlock',
            sourceRef: 'PHB',
            grantType: 'choice',
            label: 'Warlock',
            spellGrantedAtLevel: 1,
          },
        ],
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
      spellChoicesByLevel={
        new Map([[2, { cantrips: 0, spells: 1, maxSpellLevel: 1, canSwap: true }]])
      }
      classSpells={[armorOfAgathys, bless]}
      spellByName={new Map([hex, armorOfAgathys, bless].map((spell) => [spell.name, spell]))}
      viewingClass="Warlock"
      viewingClassSource="PHB"
      onSetClassSpellSelectionsAtLevel={vi.fn()}
      onSwapClassSpellAtLevel={vi.fn()}
      spellSwapLevel={2}
      spellSwapDrop={spellSwapDrop}
      onSpellSwapLevelChange={vi.fn()}
      onSpellSwapDropChange={vi.fn()}
      subclassPickerOpen={false}
      onSubclassPickerOpenChange={vi.fn()}
      subclassTitle="Patron"
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
    />,
  )
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
})
