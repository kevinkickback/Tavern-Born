import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:/Users/Test/AppData/Roaming/Tavern-Born',
  },
  screen: {
    getAllDisplays: () => [],
  },
}));

import {
  clampWindowStateToWorkArea,
  coerceWindowStateToVisibleArea,
} from '../../electron/windowState';

describe('window state visibility coercion', () => {
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
    );

    expect(state).toEqual({
      x: 50,
      y: 50,
      width: 1280,
      height: 800,
      isMaximized: false,
    });
  });

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
    );

    expect(state).toEqual({
      width: 1400,
      height: 900,
      isMaximized: true,
    });
  });

  test('clamps oversized windows to fit smaller work areas', () => {
    const state = clampWindowStateToWorkArea(
      {
        width: 1366,
        height: 850,
        isMaximized: false,
      },
      { x: 0, y: 0, width: 1280, height: 720 },
    );

    expect(state).toEqual({
      width: 1152,
      height: 648,
      isMaximized: false,
    });
  });
});
