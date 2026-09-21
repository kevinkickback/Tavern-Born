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

    const rejectedPathMessage = await page.evaluate(async () => {
      try {
        await window.electronAPI.readLocalJson('relative.json')
        return null
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })
    expect(rejectedPathMessage).toContain('Path must be absolute')

    const bundledBoundaryMessages = await page.evaluate(() => {
      const readError = async (relativePath: string) => {
        try {
          await window.electronAPI.readBundledJson(relativePath)
          return null
        } catch (error) {
          return error instanceof Error ? error.message : String(error)
        }
      }
      return Promise.all([readError('../manifest.json'), readError('THIRD_PARTY_NOTICES.md')])
    })
    expect(bundledBoundaryMessages[0]).toContain('invalid segment')
    expect(bundledBoundaryMessages[1]).toContain('Only bundled JSON files may be read')

    if (HAS_DEVELOPMENT_SRD) {
      const bundledRuntime = await page.evaluate(async () => ({
        manifest: await window.electronAPI.getBundledManifest(),
        classIndex: await window.electronAPI.readBundledJson('class/index.json'),
      }))
      expect(bundledRuntime.manifest.packId).toBe('tavern-born-srd-core')
      expect(bundledRuntime.manifest.packVersion).toBeTruthy()
      expect(bundledRuntime.classIndex).toEqual(
        expect.objectContaining({ wizard: expect.any(String) }),
      )
    }
  } finally {
    if (electronApp.process().exitCode === null) {
      await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    }
  }
})
