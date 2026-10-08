import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { emptyProvenance } from '@/lib/character/createCharacter'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { SkillsPanel } from '@/pages/build/proficiencies/components/tabs/SkillsPanel'

describe('expertise ownership controls', () => {
  test.each([
    'feat',
    'manual',
  ] as const)('only independent manual expertise can be removed, owner=%s', (owner) => {
    const ledger = addGrant(
      emptyProvenance(),
      'expertise',
      'Arcana',
      makeSourceTag(owner, owner === 'manual' ? 'User Choice' : 'Training', 'choice', 'PHB'),
    )
    const toggle = vi.fn()
    render(
      <SkillsPanel
        ledger={ledger}
        groups={[
          {
            label: null,
            skills: [
              {
                name: 'arcana',
                ability: 'intelligence',
                proficient: true,
                expertise: true,
                modifierString: '+4',
              },
            ],
          },
        ]}
        sort="alpha"
        onSortChange={vi.fn()}
        onFocusChange={vi.fn()}
        onExpandDetails={vi.fn()}
        onResolveChoiceSelection={vi.fn()}
        onToggleExpertise={toggle}
        availableExpertiseSlots={2}
        usedExpertiseSlots={1}
      />,
    )
    const control = screen.getByTitle(
      owner === 'manual' ? 'Remove expertise: Arcana' : 'Expertise granted by another source',
    )
    expect(control.hasAttribute('disabled')).toBe(owner === 'feat')
    fireEvent.click(control)
    expect(toggle).toHaveBeenCalledTimes(owner === 'manual' ? 1 : 0)
  })
})
