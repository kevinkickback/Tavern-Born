import type { DataSourceConfig } from '@/types/5etools'

type ExternalSource = Exclude<DataSourceConfig, { type: 'bundled' }>

const HOUR_MS = 60 * 60 * 1000
const CHECK_INTERVAL_MS = 24 * HOUR_MS
const FIRST_RETRY_DELAY_MS = 15 * 60 * 1000
const MAX_RETRY_DELAY_MS = 8 * HOUR_MS

export interface CatalogRefreshCheck {
  source: Pick<ExternalSource, 'type' | 'path'>
  lastAttemptAt: number
  lastSuccessAt: number | null
  consecutiveFailures: number
  needsReview?: boolean
}

export function refreshCheckForSource(
  check: CatalogRefreshCheck | undefined,
  { type, path, lastLoaded }: ExternalSource,
  now: number,
): CatalogRefreshCheck | undefined {
  if (
    check?.source?.type === type &&
    check.source.path === path &&
    Number.isFinite(check.lastAttemptAt) &&
    check.lastAttemptAt <= now &&
    (check.lastSuccessAt === null ||
      (Number.isFinite(check.lastSuccessAt) && check.lastSuccessAt <= now)) &&
    Number.isSafeInteger(check.consecutiveFailures) &&
    check.consecutiveFailures >= 0 &&
    !(Date.parse(lastLoaded ?? '') > Math.max(check.lastAttemptAt, check.lastSuccessAt ?? 0))
  ) {
    return check
  }
}

export function isCatalogCheckDue(
  source: ExternalSource,
  check: CatalogRefreshCheck | undefined,
  lastCheckedAt: string | null,
  recovering: boolean,
  now: number,
): boolean {
  const latest = refreshCheckForSource(check, source, now)
  if (latest && latest.consecutiveFailures > 0) {
    const delay = Math.min(
      MAX_RETRY_DELAY_MS,
      FIRST_RETRY_DELAY_MS * 2 ** (latest.consecutiveFailures - 1),
    )
    return now - latest.lastAttemptAt >= delay
  }
  // The pending candidate lives in memory. Reopen it on the next launch if it was never applied.
  if (recovering || latest?.needsReview) return true

  const successfulChecks = [
    latest?.lastSuccessAt,
    Date.parse(lastCheckedAt ?? ''),
    Date.parse(source.lastLoaded ?? ''),
  ].filter((date): date is number => typeof date === 'number' && date <= now)
  return now - Math.max(...successfulChecks) >= CHECK_INTERVAL_MS
}
