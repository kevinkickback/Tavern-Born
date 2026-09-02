import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import { isPathWithinRoot, isTrustedRendererUrl } from '../../electron/security'

describe('Electron security boundaries', () => {
  test('allows the selected root and descendants only', () => {
    const root = resolve('fixtures', 'data')

    expect(isPathWithinRoot(root, root)).toBe(true)
    expect(isPathWithinRoot(root, join(root, 'spells', 'index.json'))).toBe(true)
    expect(isPathWithinRoot(root, resolve(root, '..', 'secrets.json'))).toBe(false)
    expect(isPathWithinRoot(root, `${root}-lookalike`)).toBe(false)
  })

  test('trusts only files under the packaged renderer directory', () => {
    const rendererRoot = pathToFileURL(`${resolve('dist')}${sep}`).href

    expect(isTrustedRendererUrl(new URL('index.html', rendererRoot).href, rendererRoot)).toBe(true)
    expect(
      isTrustedRendererUrl(pathToFileURL(resolve('other', 'index.html')).href, rendererRoot),
    ).toBe(false)
    expect(isTrustedRendererUrl('https://example.com/index.html', rendererRoot)).toBe(false)
  })

  test('uses exact development origins', () => {
    const rendererRoot = pathToFileURL(`${resolve('dist')}${sep}`).href
    const devServer = 'http://127.0.0.1:5173'

    expect(isTrustedRendererUrl(`${devServer}/settings`, rendererRoot, devServer)).toBe(true)
    expect(isTrustedRendererUrl('http://127.0.0.1:5174/settings', rendererRoot, devServer)).toBe(
      false,
    )
    expect(isTrustedRendererUrl('https://127.0.0.1:5173/settings', rendererRoot, devServer)).toBe(
      false,
    )
  })
})
