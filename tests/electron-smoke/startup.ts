import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { HAS_WINDOWS_ELECTRON_SANDBOX_REGRESSION } from '../helpers/electronEnvironment'

const HAS_DEVELOPMENT_SRD = existsSync(resolve('resources/srd/core/manifest.json'))

test.skip(
  HAS_WINDOWS_ELECTRON_SANDBOX_REGRESSION,
  'Windows build has upstream Electron sandbox crash 0x80000003',
)

test('starts the compiled desktop shell with a sandboxed renderer and working bridge', async ({
  browserName: _browserName,
}, testInfo) => {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0] !== 'ELECTRON_RUN_AS_NODE' && entry[1] !== undefined,
    ),
  )
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${testInfo.outputPath('user-data')}`],
    env: environment,
  })

  try {
    const page = await electronApp.firstWindow()
    await expect(page).toHaveTitle(/Tavern Born/i)

    const runtime = await page.evaluate(async () => ({
      platform: window.electronAPI.platform,
      version: await window.electronAPI.getAppVersion(),
      portableDownloadPageBridgeType: typeof window.electronAPI.openPortableUpdatePage,
      rendererProcessType: typeof globalThis.process,
      rendererRequireType: typeof globalThis.require,
    }))

    expect(runtime.platform).toBeTruthy()
    expect(runtime.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(runtime.portableDownloadPageBridgeType).toBe('function')
    expect(runtime.rendererProcessType).toBe('undefined')
    expect(runtime.rendererRequireType).toBe('undefined')

    await page.evaluate(() => sessionStorage.setItem('electron-smoke-reload', 'preserved'))
    const trustedReload = page.waitForEvent('framenavigated', {
      predicate: (frame) => frame === page.mainFrame(),
    })
    await page.evaluate(() => window.location.reload())
    await trustedReload
    await expect(page).toHaveTitle(/Tavern Born/i)
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('electron-smoke-reload')))
      .toBe('preserved')

    const bundledClassIcon = await page.evaluate(async () => {
      const image = new Image()
      const loaded = new Promise<boolean>((resolve) => {
        image.addEventListener('load', () => resolve(true), { once: true })
        image.addEventListener('error', () => resolve(false), { once: true })
      })
      image.src = './assets/images/ui/icons/wizard.svg'
      return { loaded: await loaded, src: image.src }
    })
    expect(bundledClassIcon.loaded).toBe(true)
    expect(bundledClassIcon.src).toMatch(/^file:.*\/assets\/images\/ui\/icons\/wizard\.svg$/i)

    const directFileReads = await page.evaluate(() => {
      return ['readLocalJson', 'readBundledJson'].filter((key) =>
        Reflect.has(window.electronAPI, key),
      )
    })
    expect(directFileReads).toEqual([])

    if (HAS_DEVELOPMENT_SRD) {
      const manifest = await page.evaluate(() => window.electronAPI.getBundledManifest())
      expect(manifest.packId).toBe('tavern-born-srd-core')
      expect(manifest.packVersion).toBeTruthy()
    }
  } finally {
    if (electronApp.process().exitCode === null) {
      await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    }
  }
})
