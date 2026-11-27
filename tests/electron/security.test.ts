import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import { parsePastedCatalogPath } from '../../electron/localCatalogResource'
import {
  isPathWithinRoot,
  isTrustedRendererUrl,
  rendererRootFileUrl,
} from '../../electron/security'

describe('Electron security boundaries', () => {
  test('accepts full clipboard paths and preserves path components for native confirmation', () => {
    expect(parsePastedCatalogPath('"C:\\My Rules\\data"', 'win32')).toBe('C:\\My Rules\\data')
    expect(parsePastedCatalogPath('C:/My Rules/data', 'win32')).toBe('C:/My Rules/data')
    expect(parsePastedCatalogPath('\\\\host\\share\\data', 'win32')).toBe('\\\\host\\share\\data')
    expect(parsePastedCatalogPath('"/home/Rules Data/../Other rules "', 'linux')).toBe(
      '/home/Rules Data/../Other rules ',
    )
    expect(parsePastedCatalogPath('/home/Rules Data ', 'linux')).toBe('/home/Rules Data ')
  })

  test.each([
    'relative\\data',
    'C:relative',
    '\\drive-relative',
    '\\\\host',
    '\\\\.\\pipe\\test',
    '\\\\?\\C:\\Data',
    'C:\\Data\\CON',
    'C:\\Data\\spells.json:stream',
    'C:\\Data\\ambiguous.',
    'C:\\Data\\hidden\u202e',
    'C:\\Data\\control\nname',
  ])('refuses ambiguous or unsafe Windows folder spelling %j', (path) => {
    expect(() => parsePastedCatalogPath(path, 'win32')).toThrow('Enter a full folder path.')
  })

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
    expect(isTrustedRendererUrl(`${rendererRoot}../secrets.html`, rendererRoot)).toBe(false)
    expect(
      isTrustedRendererUrl(`${rendererRoot.slice(0, -1)}-lookalike/index.html`, rendererRoot),
    ).toBe(false)
    expect(isTrustedRendererUrl('not a url', rendererRoot)).toBe(false)
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
    expect(
      isTrustedRendererUrl('http://127.0.0.1:5173@evil.example/', rendererRoot, devServer),
    ).toBe(false)
  })

  test('normalizes only the drive letter of Windows file URLs', () => {
    const rendererRoot = rendererRootFileUrl('c:/App/Resources/app.asar/dist/', 'win32')
    expect(rendererRoot).toBe('file:///C:/App/Resources/app.asar/dist/')
    expect(rendererRootFileUrl('/c:/App/Resources/app.asar/dist/', 'linux')).toBe(
      'file:///c:/App/Resources/app.asar/dist/',
    )

    expect(
      isTrustedRendererUrl('file:///C:/App/Resources/app.asar/dist/index.html', rendererRoot),
    ).toBe(true)
    expect(
      isTrustedRendererUrl('file:///D:/App/Resources/app.asar/dist/index.html', rendererRoot),
    ).toBe(false)
    expect(
      isTrustedRendererUrl('file:///C:/app/Resources/app.asar/dist/index.html', rendererRoot),
    ).toBe(false)
    expect(
      isTrustedRendererUrl(
        'file:///C:/App/Resources/app.asar/dist-sibling/index.html',
        rendererRoot,
      ),
    ).toBe(false)
  })
})
