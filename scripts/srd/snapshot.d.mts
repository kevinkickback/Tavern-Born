export interface SrdSnapshotOptions {
  sourceRoot: string
  provenance: {
    packVersion: string
    distributionStatus: string
    snapshotGeneratedAt: string
    documents: Array<{
      version: string
      downloadUrl: string
      sha256: string
      attribution: string
    }>
    license: unknown
    transformationNotice: string
  }
  allowlist: {
    rootExclusions?: Record<
      string,
      {
        reason: string
        identities: string[]
      }
    >
    referenceExclusions?: Array<{
      collection: string
      source: string
      reason: string
    }>
    dependencies?: Array<{
      collection: string
      identities: string[]
      srdVersion: string
      officialSection: string
      reason: string
    }>
  }
  upstreamRevision: string
}

export interface SrdSnapshot {
  files: Map<string, string>
  manifest: {
    packVersion: string
    generatedAt: string
    coverage: {
      roots: Record<string, number>
      dependencies: Array<{
        collection: string
        identity: string
        reason: string
        reference: string
        srdVersion: string
        officialSection: string
      }>
      references: Record<string, { resolved: number; excluded: number }>
      referenceExclusions: Array<{
        collection: string
        reference: string
        owner: string
        reason: string
      }>
      exclusions: Record<string, number>
      exclusionReasons: Record<string, string>
    }
    files: Record<string, string>
  }
}

export const EXTRACTOR_VERSION: number
export function isSrdRoot(record: unknown): boolean
export function stableJson(value: unknown): string
export function sha256(contents: string): string
export function buildSrdSnapshot(options: SrdSnapshotOptions): Promise<SrdSnapshot>
export function describeSnapshot(snapshot: SrdSnapshot): {
  fileCount: number
  rootCount: number
  dependencyCount: number
  packVersion: string
  manifestFile: string
}
