import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

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
  beforeEach(() => {
    useAppPreferencesStore.setState({ sidebarOpen: true })
  })

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

  test('switches primary workspaces and their contextual navigation', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(screen.getByRole('complementary', { name: 'Settings navigation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'General' })).toBeTruthy()
  })

  test('persists context pane collapse state through preferences', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Collapse context pane' }))

    expect(useAppPreferencesStore.getState().sidebarOpen).toBe(false)
    expect(screen.getByRole('button', { name: 'Expand context pane' })).toBeTruthy()
  })

  test('does not render a redundant context pane for the compendium', () => {
    renderSidebar('/compendium')

    expect(screen.queryByRole('complementary', { name: 'Compendium navigation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Collapse context pane' })).toBeNull()
  })

  test('does not render a redundant context pane for the character collection', () => {
    renderSidebar('/')

    expect(screen.queryByRole('complementary', { name: 'Characters navigation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Collapse context pane' })).toBeNull()
  })
})
