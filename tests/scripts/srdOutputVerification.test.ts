import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { verifySnapshotFiles } from '../../scripts/srd/outputVerification.mjs'

let temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })))
  temporaryRoots = []
})

async function createOutputRoot() {
  const root = await mkdtemp(join(tmpdir(), 'tavern-born-srd-output-'))
  temporaryRoots.push(root)
  return root
}

async function writeOutput(root: string, relativePath: string, contents: string) {
  const path = join(root, ...relativePath.split('/'))
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents, 'utf8')
}

describe('bundled SRD output verification', () => {
  test('accepts byte-for-byte matching output', async () => {
    const root = await createOutputRoot()
    const files = new Map([
      ['data/example.json', '{"ok":true}\n'],
      ['manifest.json', '{"version":1}\n'],
    ])
    for (const [relativePath, contents] of files) {
      await writeOutput(root, relativePath, contents)
    }

    await expect(verifySnapshotFiles(root, files)).resolves.toBeUndefined()
  })

  test('reports missing, stale, and unexpected managed files together', async () => {
    const root = await createOutputRoot()
    const files = new Map([
      ['data/missing.json', '{}\n'],
      ['data/stale.json', '{"expected":true}\n'],
      ['manifest.json', '{"version":1}\n'],
    ])
    await writeOutput(root, 'data/stale.json', '{"stale":true}\n')
    await writeOutput(root, 'data/unexpected.json', '{}\n')
    await writeOutput(root, 'manifest.json', '{"version":1}\n')

    await expect(verifySnapshotFiles(root, files)).rejects.toThrow(
      [
        'data/missing.json is missing',
        'data/stale.json is stale',
        'data/unexpected.json is unexpected',
      ].join('\n- '),
    )
  })
})
