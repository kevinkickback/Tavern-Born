import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { BuildProficienciesDetailsPanel } from '@/pages/build/proficiencies/components/DetailsPanel'

describe('proficiency details panel colors', () => {
  test('uses readable foreground roles on light surfaces', () => {
    render(
      <BuildProficienciesDetailsPanel
        focused={{
          type: 'skill',
          name: 'Perception',
          ability: 'wisdom',
          proficient: true,
          expertise: true,
          modifierString: '+5',
        }}
        skillDescriptions={{ perception: ['Notice details in your surroundings.'] }}
        weaponItemsBase={[]}
      />,
    )

    const descriptionHeading = screen.getByRole('heading', { name: 'Description' })
    expect(descriptionHeading.className).toContain('text-foreground')
    expect(descriptionHeading.className).not.toContain('text-accent-foreground')

    for (const value of screen.getAllByText('Yes')) {
      expect(value.className).toContain('text-primary')
      expect(value.className).not.toContain('text-accent-foreground')
    }
  })
})
