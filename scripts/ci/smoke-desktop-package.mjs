import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium, expect } from '@playwright/test'

const [packageExecutable, checkMode] = process.argv.slice(2)
assert(packageExecutable, 'Provide the packaged executable to launch.')
const executable = resolve(packageExecutable)
const projectFile = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url))
const expectedElectron = JSON.parse(await readFile(projectFile('package-lock.json'), 'utf8'))
  .packages['node_modules/electron'].version
const temp = await realpath(tmpdir())
const profile = await mkdtemp(join(temp, 'tavern-born-package-'))
const timeout = 30_000

async function withPackage(use) {
  const child = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  })
  const exited = new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
    child.once('error', reject)
  })
  let browser
  let session
  let polling = true
  try {
    const port = await Promise.race([
      (async () => {
        const deadline = Date.now() + timeout
        while (polling && Date.now() < deadline) {
          try {
            const [portLine] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(
              '\n',
            )
            if (/^\d+$/.test(portLine.trim())) return Number(portLine)
          } catch (error) {
            // Windows can temporarily lock the file while Chromium writes it.
            if (error.code !== 'ENOENT' && error.code !== 'EBUSY') throw error
          }
          await delay(100)
        }
        throw new Error('Packaged app did not start its local smoke-test connection.')
      })(),
      exited.then(({ code, signal }) => {
        throw new Error(`Packaged app exited during startup (${code ?? signal}).`)
      }),
    ])
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout })
    const verificationDeadline = new AbortController()
    try {
      await Promise.race([
        (async () => {
          session = await browser.newBrowserCDPSession()
          const context = browser.contexts()[0]
          const page = context.pages()[0] ?? (await context.waitForEvent('page', { timeout }))
          page.setDefaultTimeout(timeout)
          await expect(page).toHaveTitle(/Tavern Born/i, { timeout })
          const rendererUrl = await page.evaluate(() => location.href)
          assert.match(rendererUrl, /\/resources\/app\.asar\/dist\//i)
          console.log(`Packaged renderer: ${rendererUrl}`)
          await expect
            .poll(() => page.evaluate(() => window.electronAPI?.getBundledManifest()), { timeout })
            .toMatchObject({ packId: 'tavern-born-srd-core' })
          assert.equal(await page.evaluate(() => typeof globalThis.require), 'undefined')
          const { userAgent } = await session.send('Browser.getVersion')
          assert.equal(userAgent.match(/\bElectron\/(\S+)/)?.[1], expectedElectron, userAgent)
          await use(page)
        })(),
        exited.then(({ code, signal }) => {
          throw new Error(`Packaged app exited during verification (${code ?? signal}).`)
        }),
        delay(120_000, null, { signal: verificationDeadline.signal }).then(() => {
          throw new Error('Packaged app verification timed out.')
        }),
      ])
    } finally {
      verificationDeadline.abort()
    }
    // Browser.close quits the browser process, including on macOS.
    void session.send('Browser.close').catch(() => undefined)
    const result = await Promise.race([exited, delay(timeout, null, { ref: false })])
    assert.deepEqual(result, { code: 0, signal: null }, 'Packaged app did not close cleanly.')
  } finally {
    polling = false
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      void session?.send('Browser.close').catch(() => undefined)
      await Promise.race([exited.catch(() => undefined), delay(2_000)])
      if (child.exitCode === null && child.signalCode === null) {
        if (process.platform === 'win32') {
          // The portable launcher owns an Electron child process.
          await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            timeout: 5_000,
            windowsHide: true,
          }).catch((error) => {
            if (child.exitCode === null && child.signalCode === null) throw error
          })
        } else {
          child.kill('SIGKILL')
        }
        await Promise.race([exited, delay(5_000)])
      }
    }
    await browser?.close().catch(() => undefined)
    // The next launch reuses IndexedDB and must wait for its own debugging port.
    await rm(join(profile, 'DevToolsActivePort'), { force: true })
  }
}

const characterName = 'Packaged Smoke Hero'
async function openCharacter(page) {
  await page.getByRole('heading', { level: 3, name: characterName, exact: true }).click()
  await expect(page.getByRole('banner').getByText(characterName, { exact: true })).toBeVisible({
    timeout,
  })
}

try {
  if (checkMode === '--release-page') {
    await withPackage(async (page) => {
      const start = page.getByRole('button', { name: 'Get Started', exact: true })
      const notification = page.getByRole('button', { name: 'App update available' })
      console.log('Checking the public release from the packaged Mac app.')
      const result = await page.evaluate(() => window.electronAPI.checkForUpdate())
      assert.equal(result.data?.status, 'available', JSON.stringify(result))
      console.log(`The public feed returned v${result.data.version}.`)
      await expect(start.or(notification).first()).toBeVisible()
      if (await start.isVisible()) await start.click()
      await notification.click()
      await expect(page.getByRole('button', { name: 'Open Download Page' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Install Now' })).toHaveCount(0)
      console.log(`Packaged app offered the release-page update to v${result.data.version}.`)
    })
  } else {
    await withPackage(async (page) => {
      await page.getByRole('button', { name: 'Get Started', exact: true }).click()
      const imported = JSON.parse(
        await readFile(projectFile('tests/fixtures/equipment-e2e.tbc'), 'utf8'),
      )
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'Import' }).first().click(),
      ])
      await fileChooser.setFiles({
        name: 'packaged-smoke.tbc',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            ...imported,
            name: characterName,
            background: 'Acolyte',
            equipment: [],
          }),
        ),
      })
      await openCharacter(page)
      await page.getByRole('button', { name: 'Character Sheet' }).click()
      await page.getByRole('button', { name: 'Generate Preview' }).click()
      await expect(page.locator('canvas').first()).toBeVisible({ timeout })
    })
    await withPackage(openCharacter)
  }
} finally {
  const resolvedProfile = await realpath(profile)
  assert.equal(dirname(resolvedProfile), temp)
  await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
if (checkMode !== '--release-page') {
  console.log(
    `Electron ${expectedElectron} packaged launch, Included SRD, PDF, and saved reopen passed: ${executable}`,
  )
}
