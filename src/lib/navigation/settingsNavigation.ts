import { matchRoutes } from 'react-router-dom'

export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', search: '' },
  { id: 'appearance', label: 'Appearance', search: '?section=appearance' },
  { id: 'data', label: 'Game Data', search: '?section=data' },
  { id: 'about', label: 'About', search: '?section=about' },
] as const

const settingsRoute = [{ path: '/settings' }]

export function getSettingsSection(search: string) {
  const id = new URLSearchParams(search).get('section')
  return SETTINGS_SECTIONS.find((section) => section.id === id) ?? SETTINGS_SECTIONS[0]
}
export function isSettingsPath(pathname: string) {
  return matchRoutes(settingsRoute, pathname) !== null
}
