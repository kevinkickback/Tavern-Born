import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import type { Feat5e } from '@/types/5etools'
import { makePrereqCharacterSnapshotFixture } from '../fixtures/characterFixtures'

afterEach(cleanup)

test('a picker confirms only the selected complete literal printing', () => {
  const first: Feat5e = { name: 'Training|HB', source: 'One', entries: [] }
  const second: Feat5e = { name: 'Training', source: 'HB|One', entries: [] }
  const onConfirm = vi.fn()
  render(
    <FeatSelectionModal
      open
      onOpenChange={vi.fn()}
      feats={[first, second]}
      maxSelections={1}
      initialSelectedIds={[getFeatSelectionKey(first)]}
      characterSnapshot={makePrereqCharacterSnapshotFixture()}
      onConfirm={onConfirm}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith([first])
})
