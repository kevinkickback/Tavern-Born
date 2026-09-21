import type { BundledDataSourceConfig } from '@/types/5etools'

export type { BundledDataSourceConfig } from '@/types/5etools'

export async function resolveDefaultBundledSource(): Promise<BundledDataSourceConfig | null> {
  const getBundledManifest = window.electronAPI?.getBundledManifest
  if (!getBundledManifest) return null

  try {
    // Electron admits review-required snapshots only for unpackaged development. Packaged builds
    // reject them before the manifest or any bundled JSON reaches the renderer.
    const manifest = await getBundledManifest()
    return {
      type: 'bundled',
      path: 'srd/core',
      packId: manifest.packId,
      packVersion: manifest.packVersion,
      isValid: true,
    }
  } catch {
    return null
  }
}
