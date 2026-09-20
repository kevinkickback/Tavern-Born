import type { DataSourceConfig } from '@/types/5etools'

const APPROVED_DISTRIBUTION_STATUS = 'approved-for-distribution'
export type BundledDataSourceConfig = Extract<DataSourceConfig, { type: 'bundled' }>

export async function resolveDefaultBundledSource(): Promise<BundledDataSourceConfig | null> {
  const getBundledManifest = window.electronAPI?.getBundledManifest
  if (!getBundledManifest) return null

  try {
    const manifest = await getBundledManifest()
    if (manifest.distributionStatus !== APPROVED_DISTRIBUTION_STATUS) return null
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
