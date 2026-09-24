import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { CharacterSheetRoutes } from '@/pages/CharacterSheetRoutes'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/pages/CharacterSheetPage', () => ({
  CharacterSheetPage: ({ templateId }: { templateId: string }) => <div>{templateId}</div>,
}))

afterEach(cleanup)

test.each([
  ['2014', '/character-sheet', '2014-official'],
  ['2024', '/character-sheet', '2024-official'],
  ['2024', '/character-sheet/2014', '2014-official'],
  ['2014', '/character-sheet/2024', '2024-official'],
  ['2014', '/character-sheet/2014/custom', '2014-custom'],
  ['2024', '/character-sheet/2024/custom', '2024-custom'],
] as const)('opens %s character at %s with %s', (originSystem, path, templateId) => {
  useCharacterStore.setState({ activeCharacter: makeCharacterFixture({ originSystem }) })
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/character-sheet/*" element={<CharacterSheetRoutes />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByText(templateId)).toBeTruthy()
})
