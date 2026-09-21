import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  assertBundledManifestAllowed,
  readBundledJsonFromRoot,
  readBundledManifestFromRoot,
  resolveBundledPackRoot,
  validateBundledResourcePath,
} from '../../electron/bundledResources'

let roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  roots = []
})

describe('bundled resource boundary', () => {
  test('uses the committed bundle in development and packaged resources in release builds', async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'tavern-born-repository-'))
    roots.push(repositoryRoot)
    const managedRoot = join(repositoryRoot, 'resources', 'srd', 'core')
    await mkdir(managedRoot, { recursive: true })

    expect(
      resolveBundledPackRoot({
        isPackaged: false,
        resourcesPath: join(repositoryRoot, 'packaged-resources'),
        repositoryRoot,
      }),
    ).toBe(managedRoot)
    expect(
      resolveBundledPackRoot({
        isPackaged: true,
        resourcesPath: join(repositoryRoot, 'packaged-resources'),
        repositoryRoot,
      }),
    ).toBe(join(repositoryRoot, 'packaged-resources', 'srd', 'core'))
  })

  test('rejects a bundled manifest that has not been approved', () => {
    const manifest = {
      schemaVersion: 1,
      packId: 'tavern-born-srd-core',
      packVersion: '0.1.0-dev',
      distributionStatus: 'provenance-review-required',
      documents: [],
      license: { name: 'CC BY 4.0', identifier: 'CC-BY-4.0', url: 'https://example.com' },
      transformationNotice: 'Test transformation.',
    }

    expect(() => assertBundledManifestAllowed(manifest, { isPackaged: true })).toThrow(
      'Bundled SRD manifest is not approved for distribution',
    )
  })

  test('allows review snapshots only in unpackaged development', () => {
    const manifest = {
      schemaVersion: 1,
      packId: 'tavern-born-srd-core',
      packVersion: '0.1.0-dev',
      distributionStatus: 'provenance-review-required',
      documents: [],
      license: { name: 'CC BY 4.0', identifier: 'CC-BY-4.0', url: 'https://example.com' },
      transformationNotice: 'Test transformation.',
    }

    expect(() => assertBundledManifestAllowed(manifest, { isPackaged: false })).not.toThrow()
    expect(() => assertBundledManifestAllowed(manifest, { isPackaged: true })).toThrow(
      'Bundled SRD manifest is not approved for distribution',
    )
  })

  test('rejects a different pack identity in development and packaged builds', () => {
    const manifest = {
      schemaVersion: 1,
      packId: 'another-srd-pack',
      packVersion: '1.0.0',
      distributionStatus: 'approved-for-distribution',
      documents: [],
      license: { name: 'CC BY 4.0', identifier: 'CC-BY-4.0', url: 'https://example.com' },
      transformationNotice: 'Test transformation.',
    }

    expect(() => assertBundledManifestAllowed(manifest, { isPackaged: false })).toThrow(
      'Bundled SRD manifest has an unexpected pack identity',
    )
    expect(() => assertBundledManifestAllowed(manifest, { isPackaged: true })).toThrow(
      'Bundled SRD manifest has an unexpected pack identity',
    )
  })

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
        documents: [
          {
            version: '5.1',
            landingPage: 'https://example.com/srd',
            downloadUrl: 'https://example.com/srd-5.1.pdf',
            attribution: 'Test attribution.',
          },
        ],
        license: {
          name: 'Creative Commons Attribution 4.0 International',
          identifier: 'CC-BY-4.0',
          url: 'https://creativecommons.org/licenses/by/4.0/legalcode',
        },
        transformationNotice: 'Test transformation notice.',
        files: {},
      }),
      'utf8',
    )

    await expect(readBundledManifestFromRoot(root)).resolves.toEqual({
      schemaVersion: 1,
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      distributionStatus: 'approved-for-distribution',
      documents: [
        {
          version: '5.1',
          landingPage: 'https://example.com/srd',
          downloadUrl: 'https://example.com/srd-5.1.pdf',
          attribution: 'Test attribution.',
        },
      ],
      license: {
        name: 'Creative Commons Attribution 4.0 International',
        identifier: 'CC-BY-4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/legalcode',
      },
      transformationNotice: 'Test transformation notice.',
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

  test('rejects unsafe or incomplete notice metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tavern-born-bundled-'))
    roots.push(root)
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        distributionStatus: 'approved-for-distribution',
        documents: [
          {
            version: '5.1',
            landingPage: 'javascript:alert(1)',
            downloadUrl: 'https://example.com/srd.pdf',
            attribution: 'Test attribution.',
          },
        ],
        license: {
          name: 'Creative Commons Attribution 4.0 International',
          identifier: 'CC-BY-4.0',
          url: 'https://creativecommons.org/licenses/by/4.0/legalcode',
        },
        transformationNotice: 'Test transformation notice.',
      }),
      'utf8',
    )

    await expect(readBundledManifestFromRoot(root)).rejects.toThrow(
      'Bundled SRD manifest has invalid documents[0].landingPage',
    )
  })
})
