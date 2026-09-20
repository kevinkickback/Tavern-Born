import { release } from 'node:os'

/**
 * Windows 11 build 26200+ can terminate Electron's sandboxed child processes with 0x80000003.
 * Skipping is safer than disabling the renderer sandbox that these tests are intended to verify.
 * https://github.com/electron/electron/issues/52098
 */
export const HAS_WINDOWS_ELECTRON_SANDBOX_REGRESSION = (() => {
  if (process.platform !== 'win32') return false
  const build = Number(release().split('.')[2])
  return Number.isFinite(build) && build >= 26200 && build < 26400
})()
