import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { assertSnapshotOutputLocation, isSameOrWithin } from '../../scripts/srd/outputPolicy.mjs'

const projectRoot = resolve('project')
const sourceRoot = resolve(projectRoot, 'data')
const managedResourceRoot = resolve(projectRoot, 'resources/srd/core')

function assertLocation(outputRoot: string, distributionStatus = 'provenance-review-required') {
  return () =>
    assertSnapshotOutputLocation({
      sourceRoot,
      outputRoot,
      managedDataRoot: sourceRoot,
      managedResourceRoot,
      distributionStatus,
    })
}

describe('SRD snapshot output policy', () => {
  test('recognizes a path only within the requested root', () => {
    expect(isSameOrWithin(sourceRoot, sourceRoot)).toBe(true)
    expect(isSameOrWithin(sourceRoot, resolve(sourceRoot, 'nested/output'))).toBe(true)
    expect(isSameOrWithin(sourceRoot, resolve(projectRoot, 'data-copy'))).toBe(false)
  })

  test('allows an ignored review directory outside managed inputs and resources', () => {
    expect(assertLocation(resolve(projectRoot, '.tmp/srd-review'))).not.toThrow()
  })

  test('rejects output inside the source corpus', () => {
    expect(assertLocation(resolve(sourceRoot, 'generated'))).toThrow(
      'output must be outside the source corpus',
    )
  })

  test('rejects review-required output inside managed release resources', () => {
    expect(assertLocation(managedResourceRoot)).toThrow(
      'must be written outside resources/srd/core',
    )
  })

  test('allows approved output at the managed release root', () => {
    expect(assertLocation(managedResourceRoot, 'approved-for-distribution')).not.toThrow()
  })
})
