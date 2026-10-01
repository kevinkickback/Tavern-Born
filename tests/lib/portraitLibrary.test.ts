import { del } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  deleteSavedPortrait,
  listSavedPortraits,
  MAX_SAVED_PORTRAITS,
  PORTRAIT_LIBRARY_STORAGE_KEY,
  savePortrait,
} from '@/lib/portraitLibrary'

const image = (suffix: string) => `data:image/png;base64,${suffix}`

describe('saved portrait library', () => {
  beforeEach(async () => {
    await del(PORTRAIT_LIBRARY_STORAGE_KEY)
  })

  afterEach(async () => {
    await del(PORTRAIT_LIBRARY_STORAGE_KEY)
  })

  test('persists, deduplicates, and removes uploads independently', async () => {
    const first = await savePortrait(image('one'))
    expect(first).toHaveLength(1)
    expect(await savePortrait(image('one'))).toEqual(first)

    const [second, third] = await Promise.all([
      savePortrait(image('two')),
      savePortrait(image('three')),
    ])
    expect(second).toHaveLength(2)
    expect(third).toHaveLength(3)
    expect(await listSavedPortraits()).toEqual(third)

    expect(await deleteSavedPortrait(first[0].id)).toHaveLength(2)
    expect((await listSavedPortraits()).map((entry) => entry.src)).toEqual([
      image('three'),
      image('two'),
    ])
  })

  test('enforces gallery and individual image limits without changing saved images', async () => {
    for (let index = 0; index < MAX_SAVED_PORTRAITS; index += 1) {
      await savePortrait(image(`image-${index}`))
    }
    await expect(savePortrait(image('extra'))).rejects.toThrow('library is full')
    await expect(savePortrait(image('x'.repeat(5 * 1024 * 1024)))).rejects.toThrow(
      'smaller than 5 MB',
    )
    expect(await listSavedPortraits()).toHaveLength(MAX_SAVED_PORTRAITS)
  })
})
