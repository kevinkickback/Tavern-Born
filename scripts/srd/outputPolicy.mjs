import { isAbsolute, relative } from 'node:path'

export function isSameOrWithin(root, candidate) {
  const path = relative(root, candidate)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

export function assertSnapshotOutputLocation({
  sourceRoot,
  outputRoot,
  managedDataRoot,
  managedResourceRoot,
  distributionStatus,
}) {
  if (isSameOrWithin(sourceRoot, outputRoot)) {
    throw new Error('SRD snapshot output must be outside the source corpus.')
  }
  if (isSameOrWithin(managedDataRoot, outputRoot)) {
    throw new Error('SRD snapshot output must never be written under the managed data/ tree.')
  }
  if (
    distributionStatus !== 'approved-for-distribution' &&
    isSameOrWithin(managedResourceRoot, outputRoot)
  ) {
    throw new Error('A review-required SRD snapshot must be written outside resources/srd/core.')
  }
}
