import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  readBundledJsonFromRoot,
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
})
