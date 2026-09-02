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
      rendererProcessType: typeof globalThis.process,
      rendererRequireType: typeof globalThis.require,
    }))

    expect(runtime.platform).toBeTruthy()
    expect(runtime.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(runtime.rendererProcessType).toBe('undefined')
    expect(runtime.rendererRequireType).toBe('undefined')

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
