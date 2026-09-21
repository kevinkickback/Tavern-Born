import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

// @ts-expect-error The one-time verifier intentionally stays native ESM for direct CI use.
import { verifyPackagedSrdPackage } from '../scripts/verify-packaged-srd.mjs'

const temporaryRoots: string[] = []
const ASAR_CLI = resolve('node_modules/@electron/asar/bin/asar.js')

async function createFixture(options: { includeDevelopmentData?: boolean; tamper?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'tavern-born-packaged-srd-'))
  temporaryRoots.push(root)
  const sourceRoot = join(root, 'source')
  const resourcesDirectory = join(root, 'resources')
  const packagedRoot = join(resourcesDirectory, 'srd', 'core')
  const appSource = join(root, 'app')
  const relativeDataPath = 'data/items.json'
  const approvedData = Buffer.from('{"item":[]}\n')
  const packagedData = options.tamper ? Buffer.from('{"item":["changed"]}\n') : approvedData
  const manifest = {
    distributionStatus: 'approved-for-distribution',
    files: {
      [relativeDataPath]: createHash('sha256').update(approvedData).digest('hex'),
    },
    packId: 'tavern-born-srd-core',
    packVersion: 'test',
  }
  const notices = 'Test notices\n'

  await Promise.all([
    mkdir(join(sourceRoot, 'data'), { recursive: true }),
    mkdir(join(packagedRoot, 'data'), { recursive: true }),
    mkdir(join(appSource, 'dist'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(sourceRoot, relativeDataPath), approvedData),
    writeFile(join(sourceRoot, 'manifest.json'), `${JSON.stringify(manifest)}\n`),
    writeFile(join(sourceRoot, 'THIRD_PARTY_NOTICES.md'), notices),
    writeFile(join(packagedRoot, relativeDataPath), packagedData),
    writeFile(join(packagedRoot, 'manifest.json'), `${JSON.stringify(manifest)}\n`),
    writeFile(join(packagedRoot, 'THIRD_PARTY_NOTICES.md'), notices),
    writeFile(join(appSource, 'package.json'), '{"name":"test"}\n'),
    writeFile(join(appSource, 'dist', 'index.html'), '<!doctype html>\n'),
  ])
  if (options.includeDevelopmentData) {
    await mkdir(join(appSource, 'data'), { recursive: true })
    await writeFile(join(appSource, 'data', 'items.json'), '{}\n')
  }
  execFileSync(process.execPath, [
    ASAR_CLI,
    'pack',
    appSource,
    join(resourcesDirectory, 'app.asar'),
  ])

  return { resourcesDirectory, sourceRoot }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  )
})

describe('one-time packaged SRD verifier', () => {
  test('accepts an exact packaged copy without development data', async () => {
    const fixture = await createFixture()

    await expect(
      verifyPackagedSrdPackage(fixture.resourcesDirectory, fixture.sourceRoot),
    ).resolves.toEqual({
      dataFileCount: 1,
      packId: 'tavern-born-srd-core',
      packVersion: 'test',
    })
  })

  test('rejects changed packaged SRD bytes', async () => {
    const fixture = await createFixture({ tamper: true })

    await expect(
      verifyPackagedSrdPackage(fixture.resourcesDirectory, fixture.sourceRoot),
    ).rejects.toThrow('checksum mismatch')
  })

  test('rejects the development-only game data tree inside the application archive', async () => {
    const fixture = await createFixture({ includeDevelopmentData: true })

    await expect(
      verifyPackagedSrdPackage(fixture.resourcesDirectory, fixture.sourceRoot),
    ).rejects.toThrow('Development-only game data')
  })
})
