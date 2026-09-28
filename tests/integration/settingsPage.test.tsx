import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
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
      <SettingsPage />
    </MemoryRouter>,
  )
}

describe('settings page categories', () => {
  afterEach(cleanup)

  test('switches settings sections with the in-page tabs', async () => {
    const user = userEvent.setup()
    renderSettings('/settings')

    expect(screen.getByText('General settings panel')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Appearance' }))
    expect(screen.getByText('Appearance settings panel')).toBeTruthy()
    expect(screen.queryByText('General settings panel')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Game Data' }))
    expect(screen.getByText('Game data settings panel')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'About' }))
    expect(screen.getByText('About settings panel')).toBeTruthy()
  })

  test('moves focus and selection through the tab bar with arrow, Home, and End keys', async () => {
    const user = userEvent.setup()
    renderSettings('/settings')

    const general = screen.getByRole('tab', { name: 'General' })
    expect(screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1])
    general.focus()

    await user.keyboard('{ArrowRight}')
    const appearance = screen.getByRole('tab', { name: 'Appearance' })
    expect(document.activeElement).toBe(appearance)
    expect(appearance.getAttribute('aria-selected')).toBe('true')
    const panel = document.getElementById(appearance.getAttribute('aria-controls')!)
    expect(panel?.getAttribute('role')).toBe('tabpanel')
    expect(panel?.getAttribute('aria-labelledby')).toBe(appearance.id)
    expect(screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([-1, 0, -1, -1])

    await user.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'About' }))
    expect(screen.getByText('About settings panel')).toBeTruthy()

    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(general)
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'About' }))
  })

  test('supports direct links to a settings section', () => {
    renderSettings('/settings?section=appearance')

    expect(screen.getByText('Appearance settings panel')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Appearance' }).getAttribute('aria-selected')).toBe(
      'true',
    )
  })

  test('falls back to general settings for an unknown section', () => {
    renderSettings('/settings?section=unknown')

    expect(screen.getByText('General settings panel')).toBeTruthy()
  })
})
