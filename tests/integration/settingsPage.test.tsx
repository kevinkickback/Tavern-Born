import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SettingsPage } from '@/pages/SettingsPage'

vi.mock('@/components/settings/GeneralPanel', () => ({
  GeneralPanel: () => <div>General settings panel</div>,
}))

vi.mock('@/components/settings/AppearancePanel', () => ({
  AppearancePanel: () => <div>Appearance settings panel</div>,
}))

vi.mock('@/components/settings/DataSourceConfigurator', () => ({
  DataSourceConfigurator: () => <div>Game data settings panel</div>,
}))

vi.mock('@/components/settings/AboutPanel', () => ({
  AboutPanel: () => <div>About settings panel</div>,
}))

function renderSettings(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <AppSidebar />
        <main>
          <SettingsPage />
        </main>
      </TooltipProvider>
    </MemoryRouter>,
  )
}

describe('settings page categories', () => {
  afterEach(cleanup)

  test('switches settings sections from sidebar links', async () => {
    const user = userEvent.setup()
    renderSettings('/settings')

    expect(screen.getByText('General settings panel')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('link', { name: 'General' }).getAttribute('aria-current')).toBe('page')

    await user.click(screen.getByRole('link', { name: 'Appearance' }))
    expect(screen.getByText('Appearance settings panel')).toBeTruthy()
    expect(screen.queryByText('General settings panel')).toBeNull()

    await user.click(screen.getByRole('link', { name: 'Game Data' }))
    expect(screen.getByText('Game data settings panel')).toBeTruthy()

    await user.click(screen.getByRole('link', { name: 'About' }))
    expect(screen.getByText('About settings panel')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'About' }).getAttribute('aria-current')).toBe('page')
  })

  test('navigates the sidebar with Tab and activates the focused link with Enter', async () => {
    const user = userEvent.setup()
    renderSettings('/settings')

    const general = screen.getByRole('link', { name: 'General' })
    general.focus()

    await user.tab()
    const appearance = screen.getByRole('link', { name: 'Appearance' })
    expect(document.activeElement).toBe(appearance)
    expect(appearance.getAttribute('aria-current')).toBeNull()
    await user.keyboard('{Enter}')
    expect(appearance.getAttribute('aria-current')).toBe('page')
    expect(general.getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('region', { name: 'Appearance' }).textContent).toContain(
      'Appearance settings panel',
    )
  })

  test('supports direct links to a settings section', () => {
    renderSettings('/settings?section=appearance')

    expect(screen.getByText('Appearance settings panel')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Appearance' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })

  test('falls back to general settings for an unknown section', () => {
    renderSettings('/settings?section=unknown')

    expect(screen.getByText('General settings panel')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'General' }).getAttribute('aria-current')).toBe('page')
  })
})
