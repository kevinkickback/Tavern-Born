export interface BundleFile {
  path: string
  size: number
}

export interface BundleMeasurements {
  totalDistribution: number
  bundledSrdPack: number
  applicationBundle: number
  staticAssets: number
  rendererCode: number
  initialRendererScript: number
  initialStylesheet: number
  largestLazyScript: number
  pdfWorker: number
}

export interface BundleBudgetViolation {
  name: keyof BundleMeasurements
  actual: number
  limit: number
}

export const BUNDLE_BUDGETS: Readonly<BundleMeasurements>

export function measureBundle(
  files: readonly BundleFile[],
  bundledSrdFiles?: readonly BundleFile[],
): BundleMeasurements

export function validateBundledSrdPack(resourceDirectory?: string): Promise<BundleFile[]>

export function evaluateBundleBudgets(
  measurements: BundleMeasurements,
  budgets?: Readonly<BundleMeasurements>,
): BundleBudgetViolation[]

export function checkBundleBudget(
  distDirectory?: string,
  options?: {
    requireBundledSrd?: boolean
    resourceDirectory?: string
  },
): Promise<BundleMeasurements>
