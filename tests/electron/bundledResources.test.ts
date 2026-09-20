import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  readBundledJsonFromRoot,
  readBundledManifestFromRoot,
  validateBundledResourcePath,
} from '../../electron/bundledResources'

let roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  roots = []
})

describe('bundled resource boundary', () => {
  test('reads JSON below the configured immutable root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tavern-born-bundled-'))
    roots.push(root)
    await mkdir(join(root, 'class'))
    await writeFile(join(root, 'class', 'index.json'), '{"wizard":"class-wizard.json"}', 'utf8')

    await expect(readBundledJsonFromRoot(root, 'class/index.json')).resolves.toEqual({
      wizard: 'class-wizard.json',
    })
  })

  test.each([
    '../outside.json',
    'class/../outside.json',
    '/absolute.json',
    'C:\\absolute.json',
    'class\\index.json',
    'class//index.json',
    'class/index.txt',
  ])('rejects unsafe path %s', (path) => {
    expect(() => validateBundledResourcePath(path)).toThrow()
  })

  test('reads and validates the fixed bundled manifest identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tavern-born-bundled-'))
    roots.push(root)
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        distributionStatus: 'approved-for-distribution',
        files: {},
      }),
      'utf8',
    )

    await expect(readBundledManifestFromRoot(root)).resolves.toEqual({
      schemaVersion: 1,
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      distributionStatus: 'approved-for-distribution',
    })
  })

  test('rejects a bundled manifest without stable pack identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tavern-born-bundled-'))
    roots.push(root)
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({ schemaVersion: 1, distributionStatus: 'approved-for-distribution' }),
      'utf8',
    )

    await expect(readBundledManifestFromRoot(root)).rejects.toThrow(
      'Bundled SRD manifest has incomplete pack identity',
    )
  })
})
