import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { chromium, expect } from '@playwright/test'

const [kind, installed, first, second, legacyFixture] = process.argv.slice(2)
assert(['setup', 'appimage', 'deb'].includes(kind))
assert(installed && first && second && legacyFixture)
const execute = promisify(execFile)
const root = await mkdtemp(join(tmpdir(), 'tb-staged-update-'))
const profile = join(root, 'profile')
await mkdir(profile)
const windows = kind === 'setup'
const manifest = windows ? 'latest.yml' : 'latest-linux.yml'
const timeout = 60_000
const port = 41937
let stage = resolve(first)

// Each upgrade uses electron-builder's own update manifest and real installer.
const served = new Set()
const feed = createServer(async (request, response) => {
  const name = new URL(request.url, 'http://127.0.0.1').pathname.slice(1)
  if (request.method !== 'GET' || basename(name) !== name || !/^[\w.-]+$/.test(name)) {
    response.writeHead(404).end()
    return
  }
  try {
    const path = join(stage, name)
    const file = await stat(path)
    if (!file.isFile()) {
      response.writeHead(404).end()
      return
    }
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d+)$/)
    const start = range ? Number(range[1]) : 0
    const end = range ? Number(range[2]) : file.size - 1
    if (start > end || end >= file.size) {
      response.writeHead(416).end()
      return
    }
    const headers = { 'Content-Length': end - start + 1 }
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${file.size}`
    response.writeHead(range ? 206 : 200, headers)
    served.add(name)
    const stream = createReadStream(path, { start, end })
    response.once('close', () => stream.destroy())
    stream.on('error', (error) => response.destroy(error)).pipe(response)
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(error)
    response.writeHead(404).end()
  }
})
await new Promise((done, fail) => {
  feed.once('error', fail)
  feed.listen(port, '127.0.0.1', done)
})

const legacyName = 'Legacy Upgrade Hero'
const currentName = 'Current Upgrade Hero'
const exe = resolve(installed)

async function closeDebianRelaunch() {
  // Electron's Debian relaunch reuses the test argv. Connect to that isolated profile and close it
  // before the test opens it again; NSIS and AppImage start a separate default profile.
  const portFile = join(profile, 'DevToolsActivePort')
  let browser
  await expect
    .poll(
      async () => {
        try {
          const port = Number((await readFile(portFile, 'utf8')).split('\n')[0])
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1_000 })
          return true
        } catch {
          return false
        }
      },
      { timeout },
    )
    .toBe(true)
  try {
    const page = browser.contexts()[0].pages()[0]
    await expect(page).toHaveTitle(/Tavern Born/i, { timeout })
    const session = await browser.newBrowserCDPSession()
    void session.send('Browser.close').catch(() => undefined)
    await expect.poll(() => browser.isConnected(), { timeout }).toBe(false)
  } finally {
    await browser?.close().catch(() => undefined)
  }
}

async function installedVersion(expectedVersion) {
  if (kind === 'appimage') {
    const image = join(dirname(exe), `Tavern-Born-${expectedVersion}.AppImage`)
    const info = await stat(image).catch(() => null)
    const expected = await stat(join(stage, basename(image)))
    return info?.size === expected.size ? expectedVersion : null
  }
  if (kind === 'deb') {
    const { stdout } = await execute('dpkg-query', [
      '-W',
      `-f=\${Version} \${Status}`,
      'tavern-born',
    ])
    return stdout.endsWith(' install ok installed') ? stdout.split(' ')[0] : null
  }
  const { stdout } = await execute(
    'pwsh',
    [
      '-NoProfile',
      '-Command',
      '(Get-Item -LiteralPath $env:TB_STAGED_EXE).VersionInfo.ProductVersion',
    ],
    { env: { ...process.env, TB_STAGED_EXE: exe }, windowsHide: true },
  )
  return /^\d+\.\d+\.\d+/.exec(stdout.trim())?.[0] ?? null
}

async function importCharacter(page, fixture, name) {
  const imported = JSON.parse(await readFile(fixture, 'utf8'))
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import' }).first().click()
  await (await chooser).setFiles({
    name: 'stage.tbc',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...imported, name, background: 'Acolyte', equipment: [] }),
    ),
  })
  await expect(page.getByRole('heading', { name, exact: true, level: 3 })).toBeVisible({ timeout })
}

async function configureLaunch(version) {
  let executable = exe
  let resources = join(dirname(executable), 'resources')
  const env = { ...process.env }
  if (kind === 'appimage') {
    const image = join(dirname(exe), `Tavern-Born-${version}.AppImage`)
    const appImageDirectory = join(root, 'image')
    await rm(appImageDirectory, { recursive: true, force: true })
    await mkdir(appImageDirectory)
    await execute(image, ['--appimage-extract'], { cwd: appImageDirectory, maxBuffer: 8_000_000 })
    executable = join(appImageDirectory, 'squashfs-root', 'AppRun')
    resources = join(dirname(executable), 'resources')
    env.APPIMAGE = image
    // Keep the real AppImage available for electron-updater to replace. Hosted CI does not use FUSE.
    env.APPIMAGE_EXTRACT_AND_RUN = '1'
  }
  const config = join(resources, 'app-update.yml')
  if (version === '0.6.0') {
    const original = await readFile(config, 'utf8')
    const cacheDirectory = original.match(/^updaterCacheDirName: (.+)$/m)?.[1].trim()
    assert(cacheDirectory)
    await writeFile(
      config,
      `provider: generic\nurl: http://127.0.0.1:${port}\nuseMultipleRangeRequest: false\nupdaterCacheDirName: ${cacheDirectory}\n`,
    )
  } else {
    const contents = await readFile(config, 'utf8')
    assert(contents.split(/\r?\n/).includes(`url: http://127.0.0.1:${port}`))
  }
  return { executable, env }
}

async function withVersion(version, doWork) {
  const { executable, env } = await configureLaunch(version)
  const portFile = join(profile, 'DevToolsActivePort')
  await rm(portFile, { force: true })
  const child = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0'], {
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  })
  const exited = new Promise((done, fail) => {
    child.once('error', fail)
    child.once('exit', (code, signal) => done({ code, signal }))
  })
  let browser
  try {
    let debuggingPort
    await expect
      .poll(
        async () => {
          try {
            debuggingPort = Number((await readFile(portFile, 'utf8')).split('\n')[0])
            return debuggingPort
          } catch (error) {
            if (error.code !== 'ENOENT' && error.code !== 'EBUSY') throw error
            if (child.exitCode !== null)
              throw new Error(`App exited during startup: ${child.exitCode}`)
            return 0
          }
        },
        { timeout },
      )
      .toBeGreaterThan(0)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`, { timeout })
    const context = browser.contexts()[0]
    const page = context.pages()[0] ?? (await context.waitForEvent('page', { timeout }))
    page.setDefaultTimeout(timeout)
    await expect
      .poll(() => page.evaluate(() => window.electronAPI.getAppVersion()), { timeout })
      .toBe(version)
    await page.evaluate(() => window.electronAPI.setAutoCheck(false))
    const installing = await doWork(page)
    if (!installing) {
      const session = await browser.newBrowserCDPSession()
      void session.send('Browser.close').catch(() => undefined)
    }
    const result = await Promise.race([exited, delay(timeout, null, { ref: false })])
    assert.deepEqual(result, { code: 0, signal: null }, `App ${version} did not quit cleanly.`)
  } finally {
    await browser?.close().catch(() => undefined)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await Promise.race([exited, delay(3000, null, { ref: false })])
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
  }
}

async function install(page, version, legacy) {
  const result = await page.evaluate(() => window.electronAPI.checkForUpdate())
  assert.equal(result.data?.version, version, JSON.stringify(result))
  await page
    .getByRole('button', { name: legacy ? 'View' : 'App update available', exact: true })
    .click()
  await page.getByRole('button', { name: 'Install Now' }).click()
  await expect(page.getByRole('heading', { name: 'Update Ready' })).toBeVisible({ timeout })
  return true
}

function assertFeedServed(version) {
  const asset =
    kind === 'appimage'
      ? `Tavern-Born-${version}.AppImage`
      : kind === 'deb'
        ? `tavern-born_${version}_amd64.deb`
        : `Tavern-Born-Setup-${version}.exe`
  assert(
    served.has(manifest) && served.has(asset),
    `Expected the native updater to request ${asset}.`,
  )
  served.clear()
}

try {
  await withVersion('0.6.0', async (page) => {
    await page.getByRole('button', { name: 'Get Started', exact: true }).click()
    await importCharacter(page, legacyFixture, legacyName)
  })
  await withVersion('0.6.0', async (page) => {
    await expect(
      page.getByRole('heading', { name: legacyName, exact: true, level: 3 }),
    ).toBeVisible({ timeout })
    return install(page, '0.7.0', true)
  })
  assertFeedServed('0.7.0')
  await expect.poll(() => installedVersion('0.7.0'), { timeout }).toBe('0.7.0')
  if (kind === 'deb') await closeDebianRelaunch()
  console.log(`${kind}: updater replaced the published package with v0.7.0.`)
  stage = resolve(second)
  await withVersion('0.7.0', async (page) => {
    const recovery = page.getByRole('alertdialog', { name: 'Character compatibility issue' })
    await expect(recovery).toBeVisible({ timeout })
    const download = page.waitForEvent('download')
    await recovery.getByRole('button', { name: 'Download Backup' }).click()
    const backup = JSON.parse(await readFile(await (await download).path(), 'utf8'))
    assert.equal(backup.name, legacyName)
    assert.equal(backup.schemaVersion, 2)
    await recovery.getByRole('button', { name: 'Continue' }).click()
    await importCharacter(
      page,
      new URL('../../tests/fixtures/equipment-e2e.tbc', import.meta.url),
      currentName,
    )
  })
  await withVersion('0.7.0', async (page) => {
    await expect(
      page.getByRole('heading', { name: currentName, exact: true, level: 3 }),
    ).toBeVisible({ timeout })
    return install(page, '0.7.1', false)
  })
  assertFeedServed('0.7.1')
  await expect.poll(() => installedVersion('0.7.1'), { timeout }).toBe('0.7.1')
  if (kind === 'deb') await closeDebianRelaunch()
  await withVersion('0.7.1', async (page) => {
    await page.getByRole('heading', { name: currentName, exact: true, level: 3 }).click()
    await expect(page.getByRole('banner').getByText(currentName, { exact: true })).toBeVisible({
      timeout,
    })
  })
  console.log(
    `${kind}: published v0.6.0 → staged v0.7.0 → staged v0.7.1, legacy backup and compatible reopen passed.`,
  )
} finally {
  feed.closeAllConnections()
  await new Promise((done) => feed.close(done))
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
