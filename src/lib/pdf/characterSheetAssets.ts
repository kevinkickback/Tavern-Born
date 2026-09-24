import { getOptionalCharacterSheetPages } from './characterSheetPages'
import { getCharacterSheetTemplate } from './characterSheetTemplates'
import type { CharacterSheetViewModel } from './characterSheetViewModel'
import type { CharacterSheetPageOptions, CharacterSheetTemplateId } from './types'

export const PDF_2014_ASSETS = {
  spells: 'pdf/2014/wotc-spells.pdf',
  notes: 'pdf/2014/mpmb-notes.pdf',
  wotcCompanion: 'pdf/2014/wotc-companion.pdf',
  mpmbCompanion: 'pdf/2014/mpmb-companion.pdf',
} as const

export type CharacterSheetSupplementBytes = Partial<
  Record<'spells' | 'companion' | 'notes', Uint8Array | ArrayBuffer>
>

/** The same plan drives loading and composition; omitted modules are never requested. */
export function getCharacterSheetAssetPlan(
  vm: CharacterSheetViewModel,
  id: CharacterSheetTemplateId,
  choices: CharacterSheetPageOptions = {},
) {
  const template = getCharacterSheetTemplate(id)
  const included = new Set(
    getOptionalCharacterSheetPages(vm, id, choices)
      .filter((page) => page.included)
      .map((page) => page.id),
  )
  return [
    { id: 'main' as const, path: template.assetPath },
    ...(included.has('companion')
      ? [
          {
            id: 'companion' as const,
            path:
              template.id === '2014-custom'
                ? PDF_2014_ASSETS.mpmbCompanion
                : PDF_2014_ASSETS.wotcCompanion,
          },
        ]
      : []),
    ...(included.has('spells') ? [{ id: 'spells' as const, path: PDF_2014_ASSETS.spells }] : []),
    ...(included.has('notes') ? [{ id: 'notes' as const, path: PDF_2014_ASSETS.notes }] : []),
  ]
}

/** Cache immutable source bytes, including concurrent requests; failed loads remain retryable. */
export function createPdfAssetLoader(fetchBytes: (path: string) => Promise<Uint8Array>) {
  const cache = new Map<string, Promise<Uint8Array>>()
  return (path: string) => {
    let promise = cache.get(path)
    if (!promise) {
      promise = fetchBytes(path).catch((error) => {
        cache.delete(path)
        throw error
      })
      cache.set(path, promise)
    }
    return promise.then((bytes) => bytes.slice())
  }
}
