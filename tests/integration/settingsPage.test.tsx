import { cleanup, render, screen } from '@testing-library/react'
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

describe('settings workspace routes', () => {
  afterEach(cleanup)

  test.each([
    ['/settings/general', 'General settings panel'],
    ['/settings/appearance', 'Appearance settings panel'],
    ['/settings/data', 'Game data settings panel'],
    ['/settings/about', 'About settings panel'],
  ])('renders the panel selected by %s', (path, panelLabel) => {
    renderSettings(path)

    expect(screen.getByText(panelLabel)).toBeTruthy()
  })

  test('falls back to general settings for an unknown settings path', () => {
    renderSettings('/settings/unknown')

    expect(screen.getByText('General settings panel')).toBeTruthy()
  })
})
