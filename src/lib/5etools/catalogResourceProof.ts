import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { mapWithConcurrency } from '@/lib/async'
import type { CatalogResourceProof, DataSourceConfig } from '@/types/5etools'
import {
  createJsonResourceReader,
  isMissingCatalogResource,
  type JsonResourceReader,
  type ReadSourceJson,
  type ResourceObservation,
} from './resourceReader'

type External = Exclude<DataSourceConfig, { type: 'bundled' }>
const MAX_RESOURCES = 4096
const BODY_HASH = /#([a-f\d]{64})$/

function bodyHash(stamp: unknown) {
  return typeof stamp === 'string' ? stamp.match(BODY_HASH)?.[1] : undefined
}

function hasBodyHashes({ entries }: CatalogResourceProof) {
  return entries.every(([, stamp]) => stamp === null || bodyHash(stamp))
}

function isObservation(value: unknown): value is ResourceObservation {
  return !!value && typeof value === 'object' && 'observed' in value && value.observed === true
}

function usableProof(
  proof: CatalogResourceProof | undefined,
  type: External['type'],
): proof is CatalogResourceProof {
  if (proof?.kind !== type || !Array.isArray(proof.entries)) return false
  const { entries } = proof
  if (!entries.length || entries.length > MAX_RESOURCES) return false
  const paths = new Set<string>()
  let present = false
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) return false
    const [path, stamp] = entry
    if (typeof path !== 'string' || path.length > 1024 || paths.has(path)) return false
    if (stamp !== null) {
      if (typeof stamp !== 'string' || !stamp.length || stamp.length > 1090) return false
      present = true
    }
    paths.add(path)
  }
  return present
}

export function canCompareHashlessRebuild(before: External, after: External) {
  const prior = before.resourceProof
  const candidate = after.resourceProof
  if (before.acceptedRevision || !usableProof(candidate, after.type) || !hasBodyHashes(candidate))
    return false
  if (prior === undefined) return true
  if (!usableProof(prior, before.type)) return false
  const current = new Map(candidate.entries)
  return prior.entries.every(([path, stamp]) => {
    const observed = current.get(path)
    return stamp === null
      ? observed === null
      : !bodyHash(stamp) && observed?.replace(BODY_HASH, '') === stamp
  })
}

/** Undefined means older settings lack enough evidence to compare the source inputs. */
export function compareAcceptedSource(before: External, after: External, revision?: string) {
  if (before.type !== after.type || before.path !== after.path) return false
  if (revision || before.acceptedRevision) {
    if (before.acceptedRevision && revision && /^[a-f\d]{40}$/i.test(revision))
      return revision === before.acceptedRevision
    return undefined
  }
  const prior = before.resourceProof
  const candidate = after.resourceProof
  if (
    !usableProof(prior, before.type) ||
    !usableProof(candidate, after.type) ||
    !hasBodyHashes(prior) ||
    !hasBodyHashes(candidate)
  )
    return undefined
  const hashes = new Map(
    prior.entries.map(([path, stamp]) => [path, stamp === null ? null : bodyHash(stamp)]),
  )
  return (
    hashes.size === candidate.entries.length &&
    candidate.entries.every(
      ([path, stamp]) => hashes.get(path) === (stamp === null ? null : bodyHash(stamp)),
    )
  )
}

/** Observe precisely the resources the catalog inventory and parser read. */
export function observeCatalogResources(
  config: External,
  read: ReadSourceJson | undefined,
  signal: AbortSignal,
) {
  type Attempt = { value: unknown } | { error: unknown }
  const reusable = new Map<string, Attempt>()
  const observed = new Map<string, string | null>()
  const source = createJsonResourceReader(config, read, () => ({}))
  let complete = true

  return {
    async matches(proof?: CatalogResourceProof): Promise<boolean> {
      if (!proof || !usableProof(proof, config.type)) return false
      // Read legacy HTTPS inputs once to record evidence for future parser upgrades.
      if (config.type === 'remote' && !hasBodyHashes(proof)) return false
      const stamps = new Map(proof.entries)
      const probe = createJsonResourceReader(config, read, (path) => ({
        probe: true,
        stamp: stamps.get(path)?.replace(BODY_HASH, '') || undefined,
      }))
      let changed = false
      await mapWithConcurrency(proof.entries, 6, async ([path, stamp]) => {
        if (changed) return
        signal.throwIfAborted()
        try {
          const value = await probe.readJson(path, signal)
          const same =
            stamp !== null &&
            isObservation(value) &&
            ('unchanged' in value ||
              (config.type === 'local' &&
                /#[a-f\d]{64}$/.test(stamp) &&
                value.stamp === stamp.split('#')[0]))
          if (same) return
          changed = true
          if (config.type === 'remote' && isObservation(value) && 'data' in value)
            reusable.set(path, { value })
        } catch (error) {
          signal.throwIfAborted()
          const missing = isMissingCatalogResource(config.type, error)
          if (stamp !== null || !missing) changed = true
          if (config.type === 'remote' && missing) reusable.set(path, { error })
        }
      })
      return !changed
    },

    reader: {
      type: config.type,
      async readJson(path, readSignal) {
        try {
          const prior = reusable.get(path)
          reusable.delete(path)
          if (prior && 'error' in prior) throw prior.error
          const value = prior ? prior.value : await source.readJson(path, readSignal)
          if (isObservation(value) && 'data' in value) {
            if (config.type === 'remote') {
              const hash = bytesToHex(sha256(utf8ToBytes(JSON.stringify(value.data))))
              observed.set(path, `${value.stamp ?? ''}#${hash}`)
            } else if (value.stamp) observed.set(path, value.stamp)
            else complete = false
            return value.data
          }
          // Injected readers may return plain JSON and cannot supply reusable evidence.
          complete = false
          return value
        } catch (error) {
          if (isMissingCatalogResource(config.type, error)) observed.set(path, null)
          else complete = false
          throw error
        }
      },
    } satisfies JsonResourceReader,

    proof(): CatalogResourceProof | undefined {
      if (!complete || observed.size > MAX_RESOURCES) return
      return { kind: config.type, entries: [...observed] }
    },
  }
}
