import { beforeEach, describe, expect, test, vi } from 'vitest'

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(),
  writeFile: vi.fn(async () => undefined),
}))

vi.mock('node:fs/promises', () => ({ ...fsMocks, default: fsMocks }))

vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:/Users/Test/AppData/Roaming/Tavern-Born',
  },
  screen: {
    getAllDisplays: () => [],
  },
}))

import {
  attachWindowStatePersistence,
  clampWindowStateToWorkArea,
  coerceWindowStateToVisibleArea,
  flushWindowStateWrites,
} from '../../electron/windowState'

describe('window state visibility coercion', () => {
  beforeEach(() => {
    fsMocks.mkdir.mockResolvedValue(undefined)
    fsMocks.writeFile.mockResolvedValue(undefined)
  })

  test('keeps bounds when they still intersect a display', () => {
    const state = coerceWindowStateToVisibleArea(
      {
        x: 50,
        y: 50,
        width: 1280,
        height: 800,
        isMaximized: false,
      },
      [{ x: 0, y: 0, width: 1920, height: 1080 }],
    )

    expect(state).toEqual({
      x: 50,
      y: 50,
      width: 1280,
      height: 800,
      isMaximized: false,
    })
  })

  test('drops off-screen coordinates while preserving size and maximized flag', () => {
    const state = coerceWindowStateToVisibleArea(
      {
        x: 5000,
        y: 5000,
        width: 1400,
        height: 900,
        isMaximized: true,
      },
      [{ x: 0, y: 0, width: 1920, height: 1080 }],
    )

    expect(state).toEqual({
      width: 1400,
      height: 900,
      isMaximized: true,
    })
  })

  test('clamps oversized windows to fit smaller work areas', () => {
    const state = clampWindowStateToWorkArea(
      {
        width: 1366,
        height: 850,
        isMaximized: false,
      },
      { x: 0, y: 0, width: 1280, height: 720 },
    )

    expect(state).toEqual({
      width: 1152,
      height: 648,
      isMaximized: false,
    })
  })

  test('settles and reports a close-time persistence failure', async () => {
    const listeners = new Map<string, () => void>()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    fsMocks.writeFile.mockRejectedValueOnce(new Error('disk full'))
    const window = {
      getBounds: () => ({ x: 10, y: 20, width: 1200, height: 800 }),
      getNormalBounds: () => ({ x: 10, y: 20, width: 1200, height: 800 }),
      isDestroyed: () => false,
      isFullScreen: () => false,
      isMaximized: () => false,
      isMinimized: () => false,
      on: (event: string, listener: () => void) => listeners.set(event, listener),
    } as unknown as Electron.BrowserWindow

    attachWindowStatePersistence(window)
    listeners.get('close')?.()
    await flushWindowStateWrites()

    expect(warning).toHaveBeenCalledWith('Unable to save window state:', 'disk full')
  })
})
