import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { chromium, expect } from '@playwright/test'

const [application, stageDirectory, fromVersion, toVersion] = process.argv.slice(2)
assert.equal(process.platform, 'darwin')
assert(application && stageDirectory && fromVersion && toVersion)

const app = resolve(application)
const executable = join(app, 'Contents', 'MacOS', 'Tavern-Born')
const port = Number(process.env.TB_STAGING_PORT)
assert(Number.isInteger(port) && port > 0 && port < 65536)
const zipName = `Tavern-Born-${toVersion}-arm64-mac.zip`
const files = new Map()
for (const name of ['latest-mac.yml', zipName]) {
  const path = resolve(stageDirectory, name)
  files.set(`/${name}`, { path, size: (await stat(path)).size })
}
const served = new Set()
const server = createServer((request, response) => {
  const file = files.get(request.url?.split('?')[0])
  if (request.method !== 'GET' || !file) {
    response.writeHead(404).end()
    return
  }
  served.add(file.path)
  response.writeHead(200, { 'Content-Length': file.size })
  const stream = createReadStream(file.path)
  response.once('close', () => stream.destroy())
  stream.on('error', (error) => response.destroy(error)).pipe(response)
})
await new Promise((done, fail) => {
  server.once('error', fail)
  server.listen(port, '127.0.0.1', done)
})

const profile = await mkdtemp(join(tmpdir(), 'tavern-born-upgrade-'))
const run = promisify(execFile)
const timeout = 45_000
const characterName = 'Staged Update Hero'

async function expectCleanExit(exited) {
  const result = await Promise.race([exited, delay(10_000, null, { ref: false })])
  assert.deepEqual(result, { code: 0, signal: null }, 'The staged app did not exit cleanly.')
}

async function bundleVersion() {
  const { stdout } = await run('/usr/bin/plutil', [
    '-extract',
    'CFBundleShortVersionString',
    'raw',
    join(app, 'Contents', 'Info.plist'),
  ])
  return stdout.trim()
}

async function launch(use) {
  const portPath = join(profile, 'DevToolsActivePort')
  await rm(portPath, { force: true })
  const child = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const exited = new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
    child.once('error', reject)
  })
  let browser
  try {
    let debuggingPort
    await Promise.race([
      expect
        .poll(
          async () => {
            const contents = await readFile(portPath, 'utf8').catch((error) => {
              if (error.code !== 'ENOENT') throw error
              return ''
            })
            debuggingPort = Number(contents.split('\n')[0])
            return debuggingPort
          },
          { timeout },
        )
        .toBeGreaterThan(0),
      exited.then(({ code, signal }) => {
        throw new Error(`App exited before starting (${code ?? signal}).`)
      }),
    ])
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`, { timeout })
    const context = browser.contexts()[0]
    const page = context.pages()[0] ?? (await context.waitForEvent('page', { timeout }))
    page.setDefaultTimeout(timeout)
    const session = await browser.newBrowserCDPSession()
    await use(page, exited, session)
  } finally {
    await browser?.close().catch(() => undefined)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await Promise.race([exited, delay(2000, null, { ref: false })])
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
  }
}

function appVersion(page) {
  return page.evaluate(() => window.electronAPI?.getAppVersion())
}

async function runningApp() {
  const { stdout } = await run('/bin/ps', ['-axww', '-o', 'pid=,comm='])
  for (const line of stdout.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/)
    if (match?.[2] === executable) return Number(match[1])
  }
  return null
}

try {
  const sourceFeed = await readFile(join(app, 'Contents', 'Resources', 'app-update.yml'), 'utf8')
  const feedUrl = `http://127.0.0.1:${port}`
  assert(sourceFeed.split('\n').includes(`url: ${feedUrl}`), 'Expected the sealed staging feed.')
  assert.equal(await bundleVersion(), fromVersion)
  await launch(async (page, exited) => {
    await expect.poll(() => appVersion(page), { timeout }).toBe(fromVersion)
    await page.getByRole('button', { name: 'Get Started', exact: true }).click()
    const imported = JSON.parse(
      await readFile(new URL('../../tests/fixtures/equipment-e2e.tbc', import.meta.url), 'utf8'),
    )
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import' }).first().click(),
    ])
    await chooser.setFiles({
      name: 'staged-update.tbc',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ ...imported, name: characterName, background: 'Acolyte', equipment: [] }),
      ),
    })
    const character = page.getByRole('heading', { level: 3, name: characterName, exact: true })
    await expect(character).toBeVisible({ timeout })
    const check = await page.evaluate(() => window.electronAPI.checkForUpdate())
    assert(check.success, JSON.stringify(check))
    assert.equal(check.data?.status, 'available', JSON.stringify(check))
    assert.equal(check.data.version, toVersion, JSON.stringify(check))
    await page.getByRole('button', { name: 'App update available' }).click()
    await page.getByRole('button', { name: 'Install Now' }).click()
    await expect(page.getByRole('heading', { name: 'Update Ready' })).toBeVisible({ timeout })
    await expect.poll(() => bundleVersion().catch(() => ''), { timeout: 120_000 }).toBe(toVersion)
    await expectCleanExit(exited)
  })

  assert(served.has(files.get(`/${zipName}`).path), 'The app did not fetch the staged ZIP.')
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app])
  // Squirrel relaunches with LaunchServices, which does not restore the test-only launch flags.
  // Observe that process, then reopen the same installation with the original test profile.
  let relaunchedPid
  await expect
    .poll(
      async () => {
        relaunchedPid = await runningApp()
        return relaunchedPid
      },
      { timeout },
    )
    .not.toBeNull()
  process.kill(relaunchedPid, 'SIGTERM')
  await expect.poll(runningApp, { timeout }).toBeNull()
  await launch(async (page, exited, session) => {
    await expect.poll(() => appVersion(page), { timeout }).toBe(toVersion)
    await page.getByRole('heading', { level: 3, name: characterName, exact: true }).click()
    await expect(page.getByRole('banner').getByText(characterName, { exact: true })).toBeVisible({
      timeout,
    })
    void session.send('Browser.close').catch(() => undefined)
    await expectCleanExit(exited)
  })
  console.log(`In-app macOS update ${fromVersion} → ${toVersion} and character reopen passed.`)
} finally {
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
