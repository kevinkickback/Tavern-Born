import { _electron as electron, expect, test } from '@playwright/test'

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
  } finally {
    await electronApp.close()
  }
})
