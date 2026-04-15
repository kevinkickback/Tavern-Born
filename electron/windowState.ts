import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, type BrowserWindow, screen } from 'electron'

const DEFAULT_WIDTH = 1366
const DEFAULT_HEIGHT = 850
const MIN_WIDTH = 900
const MIN_HEIGHT = 600
const SAVE_DEBOUNCE_MS = 250
const MAX_WORKAREA_FRACTION = 0.9

type Bounds = Pick<Electron.Rectangle, 'x' | 'y' | 'width' | 'height'>

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

function getWindowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function defaultWindowState(): WindowState {
  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    isMaximized: false,
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeBounds(raw: unknown): WindowState {
  if (!raw || typeof raw !== 'object') {
    return defaultWindowState()
  }

  const candidate = raw as Partial<WindowState>
  const state: WindowState = {
    width: isFiniteNumber(candidate.width)
      ? Math.max(MIN_WIDTH, Math.round(candidate.width))
      : DEFAULT_WIDTH,
    height: isFiniteNumber(candidate.height)
      ? Math.max(MIN_HEIGHT, Math.round(candidate.height))
      : DEFAULT_HEIGHT,
    isMaximized: candidate.isMaximized === true,
  }

  if (isFiniteNumber(candidate.x)) {
    state.x = Math.round(candidate.x)
  }

  if (isFiniteNumber(candidate.y)) {
    state.y = Math.round(candidate.y)
  }

  return state
}

function rectanglesIntersect(a: Bounds, b: Bounds): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

export function coerceWindowStateToVisibleArea(
  state: WindowState,
  displayBounds: Bounds[],
): WindowState {
  if (state.x === undefined || state.y === undefined) {
    return state
  }

  const hasVisibleDisplay = displayBounds.some((display) =>
    rectanglesIntersect(
      {
        x: state.x ?? 0,
        y: state.y ?? 0,
        width: state.width,
        height: state.height,
      },
      display,
    ),
  )

  if (hasVisibleDisplay) {
    return state
  }

  return {
    width: state.width,
    height: state.height,
    isMaximized: state.isMaximized,
  }
}

export function clampWindowStateToWorkArea(state: WindowState, workArea?: Bounds): WindowState {
  if (!workArea) {
    return state
  }

  const maxWidth = Math.max(640, Math.floor(workArea.width * MAX_WORKAREA_FRACTION))
  const maxHeight = Math.max(480, Math.floor(workArea.height * MAX_WORKAREA_FRACTION))

  return {
    ...state,
    width: Math.min(state.width, maxWidth),
    height: Math.min(state.height, maxHeight),
  }
}

export async function loadWindowState(): Promise<WindowState> {
  try {
    const raw = await readFile(getWindowStatePath(), 'utf-8')
    const parsed = normalizeBounds(JSON.parse(raw))
    const displays = screen.getAllDisplays()
    const workAreas = displays.map((display) => display.workArea)
    const coerced = coerceWindowStateToVisibleArea(parsed, workAreas)
    const targetDisplay =
      displays.find(
        (d) =>
          coerced.x !== undefined &&
          coerced.y !== undefined &&
          coerced.x >= d.workArea.x &&
          coerced.x < d.workArea.x + d.workArea.width &&
          coerced.y >= d.workArea.y &&
          coerced.y < d.workArea.y + d.workArea.height,
      ) ?? displays[0]
    return clampWindowStateToWorkArea(coerced, targetDisplay?.workArea)
  } catch {
    const workArea = screen.getAllDisplays()[0]?.workArea
    return clampWindowStateToWorkArea(defaultWindowState(), workArea)
  }
}

function getCurrentWindowState(window: BrowserWindow): WindowState {
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds()

  return {
    ...bounds,
    isMaximized: window.isMaximized(),
  }
}

async function writeWindowState(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed()) {
    return
  }

  const state = getCurrentWindowState(window)
  const windowStatePath = getWindowStatePath()
  await mkdir(dirname(windowStatePath), { recursive: true })
  await writeFile(windowStatePath, JSON.stringify(state, null, 2), 'utf-8')
}

export function attachWindowStatePersistence(window: BrowserWindow): void {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null

  const scheduleSave = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
      return
    }

    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }

    saveTimeout = setTimeout(() => {
      saveTimeout = null
      void writeWindowState(window)
    }, SAVE_DEBOUNCE_MS)
  }

  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('close', () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
    void writeWindowState(window)
  })
}
