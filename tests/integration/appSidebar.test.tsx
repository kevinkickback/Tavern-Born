import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

function renderSidebar(path = '/build/class') {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppSidebar />
      </MemoryRouter>
    </TooltipProvider>,
  )
}

describe('desktop workspace navigation', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('maps build routes to the Build workspace and active context page', () => {
    renderSidebar()

    expect(screen.getByRole('button', { name: 'Build' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('complementary', { name: 'Build navigation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Class' }).getAttribute('aria-current')).toBe('page')
  })

  test('keeps application settings in the Start context navigation', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(screen.getByRole('complementary', { name: 'Start navigation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Characters' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
  })

  test('keeps the context pane open without a collapse control', () => {
    renderSidebar()

    expect(screen.getByRole('complementary', { name: 'Build navigation' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /context pane/i })).toBeNull()
  })

  test('renders the permanent context pane for the compendium', () => {
    renderSidebar('/compendium')

    expect(screen.getByRole('complementary', { name: 'Compendium navigation' })).toBeTruthy()
  })

  test('renders the permanent Start context pane for the character collection', () => {
    renderSidebar('/')

    expect(screen.getByRole('complementary', { name: 'Start navigation' })).toBeTruthy()
  })
})
