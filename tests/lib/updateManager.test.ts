import { describe, expect, test, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    isPackaged: false,
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  net: {
    fetch: vi.fn(),
  },
  shell: {},
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowDowngrade: false,
    forceDevUpdateConfig: false,
    on: vi.fn(),
  },
  CancellationToken: class {},
}))

import { compareSemver } from '../../electron/updateManager'

describe('compareSemver', () => {
  test('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
  })

  test('returns 1 when a is newer by patch', () => {
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1)
  })

  test('returns -1 when a is older by patch', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1)
  })

  test('returns 1 when a is newer by minor', () => {
    expect(compareSemver('1.1.0', '1.0.9')).toBe(1)
  })

  test('returns 1 when a is newer by major', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1)
  })

  test('release is newer than pre-release of same version', () => {
    // 1.0.0 > 1.0.0-beta.1
    expect(compareSemver('1.0.0', '1.0.0-beta.1')).toBe(1)
  })

  test('pre-release is older than stable release', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1)
  })

  test('later pre-release tag is greater than earlier one', () => {
    expect(compareSemver('1.0.0-beta', '1.0.0-alpha')).toBe(1)
  })

  test('handles missing patch component', () => {
    expect(compareSemver('1.1', '1.0.9')).toBe(1)
  })

  test('handles v-prefixed strings when stripped by caller', () => {
    const strip = (v: string) => v.replace(/^v/, '')
    expect(compareSemver(strip('v2.0.0'), strip('v1.9.0'))).toBe(1)
  })
})
